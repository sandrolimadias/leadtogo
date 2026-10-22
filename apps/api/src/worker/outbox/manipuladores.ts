import { randomBytes } from 'node:crypto'

import { type Conexao, sql } from '@leadtogo/db'

import type { Configuracao } from '../../configuracao/configuracao.js'
import { hashDoToken } from '../../convites/token.js'
import type { EnviadorSmtp } from '../../email/enviador.js'
import { emailConvite } from '../../email/modelos.js'
import { FILAS } from '../filas.js'
import type { JobDeNotificacao } from '../processadores.js'
import type { ReceitaService } from '../../receita/receita.service.js'
import { EVENTO_VERIFICAR_SITUACAO } from '../../carteira/situacao-evento.js'
import { EVENTO_EXECUTAR_IMPORTACAO } from '../../importacao/evento.js'
import { enfileirarBloco } from '../../importacao/fila.js'
import { EVENTO_GEOCODIFICAR_EMPRESA } from '../../geolocalizacao/evento.js'
import { EVENTO_EXECUTAR_LOTE_GEO } from '../../geolocalizacao/evento-lote.js'
import { enfileirarBlocoDoLote, enfileirarEmpresa } from '../../geolocalizacao/fila.js'
import { manipuladorDaSituacao } from './empresa-situacao.js'
import type { ManipuladorDeEvento } from './relay.js'

/** Id do job de um evento: o BullMQ descarta repetição enquanto o job existir. */
export const jobIdDoEvento = (eventoId: string) => `evento-${eventoId}`

/**
 * Tipos de evento entregues pelo relay. Os `teste.*` só existem fora de produção e servem aos testes
 * do relay.
 */
export function manipuladoresPadrao(
  config: Configuracao,
  enviador: EnviadorSmtp,
  /** Banco e consulta da Receita: habilitam a reconsulta da situação das empresas salvas sem verificar */
  receita?: { banco: Conexao; servico: ReceitaService },
): Record<string, ManipuladorDeEvento> {
  const manipuladores: Record<string, ManipuladorDeEvento> = {}

  /**
   * Convite: o TOKEN nasce aqui, na hora do envio, e só o hash vai para o banco. O token não passa pelo
   * outbox, pelo Valkey nem por log. Em três passos:
   *  (a) esta transação gera o token e grava o hash, e o relay faz o COMMIT;
   *  (b) só depois, fora da transação, o e-mail é enviado (quando o link chega à caixa de entrada, o
   *      hash já está visível: clicar logo em seguida nunca dá "convite inválido");
   *  (c) o relay marca o evento como entregue.
   * Se o envio falhar, o evento volta com espera progressiva e a nova tentativa gera um token NOVO: o
   * hash anterior nunca foi entregue a ninguém e é substituído. Se o processo cair entre (b) e (c), a
   * nova tentativa reenvia com outro token e o link do primeiro e-mail deixa de valer (entrega pelo
   * menos uma vez; vale o link do e-mail mais recente).
   */
  manipuladores['convite.enviar'] = async (evento, { tx }) => {
    const { conviteId } = evento.payload as { conviteId: string }
    const [convite] = await tx.execute<{
      email: string
      papel: string
      perfil: string | null
      convidado_por: string
      razao_social: string
      nome_fantasia: string | null
      convidante: string | null
    }>(sql`
      SELECT c.email, c.papel, p.nome AS perfil, c.convidado_por, t.razao_social, t.nome_fantasia,
        m.nome AS convidante
      FROM convites c
      JOIN tenants t ON t.id = c.tenant_id
      LEFT JOIN membros m ON m.id = c.convidado_por
      LEFT JOIN perfis_acesso p ON p.id = c.perfil_id AND p.tenant_id = c.tenant_id
      WHERE c.id = ${conviteId} AND c.aceito_em IS NULL AND c.revogado_em IS NULL AND c.expira_em > now()
      FOR UPDATE OF c`)
    if (!convite) return // cancelado, aceito, substituído ou vencido antes do envio: nada a enviar

    const token = randomBytes(32).toString('base64url')
    await tx.execute(sql`
      UPDATE convites SET token_hash = ${hashDoToken(token)}, atualizado_em = now() WHERE id = ${conviteId}`)
    const link = `${new URL(config.APP_URL).origin}/convite?token=${token}`
    return () =>
      enviador.enviar(
        convite.email,
        emailConvite({
          empresa: convite.nome_fantasia ?? convite.razao_social,
          convidadoPor: convite.convidante ?? 'Um administrador',
          papel: convite.papel,
          perfil: convite.perfil,
          link,
        }),
      )
  }

  /** Notificação para um membro: vira um job na fila `notificacoes`, com o id do evento como jobId. */
  manipuladores['notificacao.criar'] = async (evento, { filas }) => {
    const dados = evento.payload as Omit<JobDeNotificacao, 'tenantId' | 'eventoId'>
    await filas
      .fila(FILAS.notificacoes)
      .add(
        'criar',
        { ...dados, tenantId: evento.tenantId, eventoId: evento.id } satisfies JobDeNotificacao,
        { jobId: jobIdDoEvento(evento.id) },
      )
  }

  /**
   * Importação de planilha: o "Iniciar" grava o evento junto do estado do lote; só depois do commit o
   * relay entrega e este manipulador enfileira a execução (o worker nunca lê o lote antes de ele existir
   * como em andamento). Um job por vez na fila: a Receita não tem SLA.
   */
  manipuladores[EVENTO_EXECUTAR_IMPORTACAO] = async (evento, { filas }) => {
    const { importacaoId } = evento.payload as { importacaoId: string }
    // Primeiro bloco da cadeia; cada bloco agenda o seguinte (id determinístico: reentrega não duplica)
    await enfileirarBloco(filas.fila(FILAS.importacao), {
      tenantId: evento.tenantId,
      importacaoId,
      raiz: evento.id,
      bloco: 0,
    })
  }

  /**
   * Geocodificação automática (empresa nova ou endereço alterado): vira um job na fila `geocodificacao`,
   * que tem concorrência baixa e limite por minuto. O id do job vem do evento: reentrega não duplica.
   */
  manipuladores[EVENTO_GEOCODIFICAR_EMPRESA] = async (evento, { filas }) => {
    // Desligado por configuração (testes): o evento é dado como entregue sem fazer nada
    if (!config.GEO_AUTOMATICA) return
    const { empresaId } = evento.payload as { empresaId: string }
    await enfileirarEmpresa(filas.fila(FILAS.geocodificacao), {
      tipo: 'empresa',
      tenantId: evento.tenantId,
      empresaId,
      eventoId: evento.id,
    })
  }

  /** Lote de geocodificação por cidade ou região: o primeiro bloco da cadeia (cada bloco agenda o seguinte). */
  manipuladores[EVENTO_EXECUTAR_LOTE_GEO] = async (evento, { filas }) => {
    const { loteId } = evento.payload as { loteId: string }
    await enfileirarBlocoDoLote(filas.fila(FILAS.geocodificacao), {
      tipo: 'lote',
      tenantId: evento.tenantId,
      loteId,
      raiz: evento.id,
      bloco: 0,
    })
  }

  if (receita) {
    manipuladores[EVENTO_VERIFICAR_SITUACAO] = manipuladorDaSituacao(receita.banco, receita.servico)
  }

  if (config.NODE_ENV !== 'production') {
    manipuladores['teste.evento'] = async (evento, { tx, filas }) => {
      // Registra o tenant que o banco enxergava ao entregar: prova que o evento rodou no tenant dele
      const [cfg] = await tx.execute<{ tenant: string }>(
        sql`SELECT current_setting('app.tenant_id', true) AS tenant`,
      )
      const dados = (evento.payload ?? {}) as Record<string, unknown>
      await filas
        .fila(FILAS.teste)
        .add(
          'espera',
          { ...dados, eventoId: evento.id, tenantVisto: cfg?.tenant },
          { jobId: jobIdDoEvento(evento.id) },
        )
    }
    manipuladores['teste.falha'] = () =>
      Promise.reject(new Error('falha de teste ao entregar o evento'))
  }
  return manipuladores
}
