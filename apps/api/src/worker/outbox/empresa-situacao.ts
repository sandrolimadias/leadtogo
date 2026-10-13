import { type Conexao, sql } from '@leadtogo/db'

import {
  agendarVerificacaoDaSituacao,
  ESPERA_ENTRE_TENTATIVAS_DA_SITUACAO_S,
  MAX_TENTATIVAS_DA_SITUACAO,
} from '../../carteira/situacao-evento.js'
import { ErroApi } from '../../http/erro-api.js'
import type { ReceitaService } from '../../receita/receita.service.js'
import type { ManipuladorDeEvento } from './relay.js'

/**
 * `empresa.verificar_situacao`: a empresa foi salva sem poder consultar a Receita (as duas fontes
 * fora do ar). Reconsulta, ignorando o cache:
 *  - respondeu e está ativa: tira o selo "situação não verificada";
 *  - respondeu e NÃO está ativa (ou o CNPJ não existe): tira o selo e avisa o vendedor responsável
 *    (notificação). A empresa NUNCA é excluída nem alterada além do selo;
 *  - Receita ainda fora do ar: agenda a próxima tentativa daqui a 1 h, até 24 vezes; esgotadas, avisa
 *    que não foi possível verificar (o selo continua).
 * A consulta de rede roda DEPOIS do commit (sem segurar conexão do banco). A notificação usa o id do
 * evento como id, então repetir o evento não duplica o aviso.
 */
export function manipuladorDaSituacao(
  banco: Conexao,
  receita: ReceitaService,
): ManipuladorDeEvento {
  return async (evento, { tx }) => {
    const { empresaId, tentativa } = evento.payload as { empresaId: string; tentativa?: number }
    const [empresa] = await tx.execute<{
      documento: string
      nome: string
      vendedor_id: string
    }>(sql`
      SELECT documento, coalesce(nome_fantasia, razao_social) AS nome, vendedor_id
      FROM empresas
      WHERE id = ${empresaId} AND tipo_documento = 'cnpj' AND situacao_nao_verificada
        AND excluido_em IS NULL`)
    if (!empresa) return // excluída, já verificada ou sem CNPJ: nada a fazer

    return async () => {
      const noTenant = <T>(
        fn: (tx: Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]) => Promise<T>,
      ) =>
        banco.db.transaction(async (t) => {
          await t.execute(sql`SELECT set_config('app.tenant_id', ${evento.tenantId}, true)`)
          return fn(t)
        })
      const avisar = (
        t: Parameters<Parameters<typeof noTenant>[0]>[0],
        titulo: string,
        mensagem: string,
      ) =>
        t.execute(sql`
          INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo, mensagem, link)
          VALUES (${evento.id}, ${evento.tenantId}, ${empresa.vendedor_id}, 'empresa.situacao',
                  ${titulo}, ${mensagem}, ${`/empresas/${empresaId}`})
          ON CONFLICT (id) DO NOTHING`)
      const liberar = (t: Parameters<Parameters<typeof noTenant>[0]>[0]) =>
        t.execute(sql`
          UPDATE empresas SET situacao_nao_verificada = false, receita_atualizado_em = now()
          WHERE id = ${empresaId}`)

      try {
        const r = await receita.consultar(empresa.documento, { forcar: true })
        await noTenant(async (t) => {
          await liberar(t)
          if (!r.dados.situacao.ativa) {
            const motivo = r.dados.situacao.motivo ? ` (${r.dados.situacao.motivo})` : ''
            await avisar(
              t,
              `${empresa.nome} não está ativa na Receita`,
              `Situação: ${r.dados.situacao.descricao}${motivo}. A empresa continua na carteira.`,
            )
          }
        })
      } catch (erro) {
        if (!(erro instanceof ErroApi)) throw erro // erro inesperado: o relay tenta de novo com espera
        if (erro.codigo === 'cnpj_nao_encontrado') {
          await noTenant(async (t) => {
            await liberar(t)
            await avisar(
              t,
              `${empresa.nome}: CNPJ não encontrado na Receita`,
              'A Receita não tem este CNPJ. A empresa continua na carteira; confira o número.',
            )
          })
        } else if (erro.codigo === 'receita_indisponivel') {
          const proxima = (tentativa ?? 1) + 1
          await noTenant(async (t) => {
            if (proxima <= MAX_TENTATIVAS_DA_SITUACAO) {
              await agendarVerificacaoDaSituacao(
                t,
                evento.tenantId,
                empresaId,
                proxima,
                ESPERA_ENTRE_TENTATIVAS_DA_SITUACAO_S,
              )
            } else {
              await avisar(
                t,
                `${empresa.nome}: situação na Receita não verificada`,
                'Não foi possível consultar a Receita depois de várias tentativas. Confira a situação da empresa.',
              )
            }
          })
        } else {
          throw erro
        }
      }
    }
  }
}
