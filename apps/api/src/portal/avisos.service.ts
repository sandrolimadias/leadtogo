import { novoId, sql } from '@leadtogo/db'
import {
  type Aviso,
  type ConsultaDeAvisos,
  type CriarAvisoEntrada,
  LIMITE_SEMANAL_PADRAO_DE_AVISOS,
  type ListaDeAvisos,
  type SituacaoDoAviso,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { agendarEnvioDoAviso } from './notificar-aviso.js'

type LinhaDoAviso = {
  id: string
  mensagem: string
  link: string | null
  urgencia: 'normal' | 'urgente'
  alcance: 'todos' | 'empresas'
  situacao: SituacaoDoAviso
  enviar_em: string | Date
  enviado_em: string | Date | null
  cancelado_em: string | Date | null
  destinatarios: number
  entregues: number
  lidos: number
  push_enviados: number
  emails: number
  criado_em: string | Date
}

const iso = (v: string | Date | null): string | null =>
  v === null ? null : new Date(v).toISOString()
const FUSO = 'America/Sao_Paulo'

/** Avisos do portal pela EQUIPE (`portal.avisos`): criar (agora ou agendado), acompanhar e cancelar. */
@Injectable()
export class AvisosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async limiteSemanal(): Promise<number> {
    const [c] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT portal_avisos_limite_semanal AS n FROM tenant_configuracoes`)
    return c?.n ?? LIMITE_SEMANAL_PADRAO_DE_AVISOS
  }

  /**
   * Quantos avisos NORMAIS a empresa mais atingida já tem na semana (segunda a domingo, Brasília) do instante
   * `alvo`: os de alcance "todos" mais os do segmento que incluem a empresa. Cancelados e urgentes não contam.
   * `empresas` limita a conta às empresas do aviso novo (nulo = qualquer empresa).
   */
  private async usadosNaSemana(alvo: Date, empresas: string[] | null): Promise<number> {
    const [r] = await this.ctx.db().execute<{ n: number }>(sql`
      WITH semana AS (
        SELECT a.id, a.alcance
        FROM avisos a
        WHERE a.excluido_em IS NULL AND a.situacao <> 'cancelado' AND a.urgencia = 'normal'
          AND date_trunc('week', a.enviar_em AT TIME ZONE ${FUSO})
              = date_trunc('week', ${alvo.toISOString()}::timestamptz AT TIME ZONE ${FUSO})),
      por_empresa AS (
        SELECT ae.empresa_id, count(*)::int AS n
        FROM semana s JOIN aviso_empresas ae ON ae.aviso_id = s.id
        WHERE s.alcance = 'empresas'
          AND (${empresas === null} OR ae.empresa_id = ANY (${`{${(empresas ?? []).join(',')}}`}::uuid[]))
        GROUP BY ae.empresa_id)
      SELECT (SELECT count(*)::int FROM semana WHERE alcance = 'todos')
             + coalesce((SELECT max(n) FROM por_empresa), 0) AS n`)
    return r?.n ?? 0
  }

  private async montar(linhas: LinhaDoAviso[]): Promise<Aviso[]> {
    if (linhas.length === 0) return []
    const ids = linhas.map((l) => l.id)
    const empresas = await this.ctx.db().execute<{
      aviso_id: string
      id: string
      nome: string
    }>(sql`
      SELECT ae.aviso_id, e.id, coalesce(e.nome_fantasia, e.razao_social) AS nome
      FROM aviso_empresas ae JOIN empresas e ON e.id = ae.empresa_id
      WHERE ae.aviso_id = ANY (${`{${ids.join(',')}}`}::uuid[])
      ORDER BY nome`)
    return linhas.map((l) => ({
      id: l.id,
      mensagem: l.mensagem,
      link: l.link,
      urgencia: l.urgencia,
      alcance: l.alcance,
      situacao: l.situacao,
      enviarEm: new Date(l.enviar_em).toISOString(),
      enviadoEm: iso(l.enviado_em),
      canceladoEm: iso(l.cancelado_em),
      destinatarios: l.destinatarios,
      entregues: l.entregues,
      lidos: l.lidos,
      pushEnviados: l.push_enviados,
      emailsEnfileirados: l.emails,
      criadoEm: new Date(l.criado_em).toISOString(),
      empresas: [...empresas]
        .filter((e) => e.aviso_id === l.id)
        .map((e) => ({ id: e.id, nome: e.nome })),
    }))
  }

  private readonly COLUNAS = sql`
    a.id, a.mensagem, a.link, a.urgencia::text AS urgencia, a.alcance::text AS alcance, a.situacao::text AS situacao,
    a.enviar_em, a.enviado_em, a.cancelado_em, a.destinatarios, a.criado_em,
    (SELECT count(*)::int FROM aviso_entregas x WHERE x.aviso_id = a.id) AS entregues,
    (SELECT count(*)::int FROM aviso_entregas x WHERE x.aviso_id = a.id AND x.lido_em IS NOT NULL) AS lidos,
    (SELECT coalesce(sum(x.push_aceitos), 0)::int FROM aviso_entregas x WHERE x.aviso_id = a.id) AS push_enviados,
    (SELECT count(*)::int FROM aviso_entregas x WHERE x.aviso_id = a.id AND x.email_enfileirado_em IS NOT NULL) AS emails`

  async listar(c: ConsultaDeAvisos): Promise<ListaDeAvisos> {
    const db = this.ctx.db()
    const linhas = await db.execute<LinhaDoAviso>(sql`
      SELECT ${this.COLUNAS} FROM avisos a WHERE a.excluido_em IS NULL
      ORDER BY a.enviar_em DESC, a.id DESC
      LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    const [t] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM avisos WHERE excluido_em IS NULL`,
    )
    return {
      itens: await this.montar([...linhas]),
      total: t?.n ?? 0,
      semana: {
        usados: await this.usadosNaSemana(new Date(), null),
        limite: await this.limiteSemanal(),
      },
    }
  }

  async obter(id: string): Promise<Aviso> {
    const [l] = await this.ctx.db().execute<LinhaDoAviso>(sql`
      SELECT ${this.COLUNAS} FROM avisos a WHERE a.id = ${id} AND a.excluido_em IS NULL`)
    if (!l) throw new ErroApi('aviso_nao_encontrado', 'Aviso não encontrado.', 404)
    const [aviso] = await this.montar([l])
    return aviso as Aviso
  }

  async criar(d: CriarAvisoEntrada): Promise<Aviso> {
    const db = this.ctx.db()
    const [portal] = await db.execute<{ ativo: boolean }>(
      sql`SELECT portal_ativo AS ativo FROM tenant_configuracoes`,
    )
    if (!portal?.ativo) {
      throw new ErroApi('portal_desligado', 'Ligue o portal do cliente para enviar avisos.', 409)
    }
    const agora = new Date()
    const quando = d.enviarEm ? new Date(d.enviarEm) : agora
    if (d.enviarEm && quando.getTime() <= agora.getTime() + 30_000) {
      throw new ErroApi('horario_no_passado', 'Escolha um horário no futuro.', 422)
    }
    const empresaIds = [...new Set(d.empresaIds)]
    if (d.alcance === 'empresas') {
      const validas = await db.execute<{ id: string }>(sql`
        SELECT id FROM empresas WHERE id = ANY (${`{${empresaIds.join(',')}}`}::uuid[]) AND excluido_em IS NULL`)
      if (validas.length !== empresaIds.length) {
        throw new ErroApi('empresa_invalida', 'Alguma empresa escolhida não existe.', 422)
      }
    }
    // Duas pessoas criando ao mesmo tempo não passam do limite: a trava vale até o fim da transação
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`avisos:${this.ctx.tenantId}`}))`)
    if (d.urgencia === 'normal') {
      const limite = await this.limiteSemanal()
      const usados = await this.usadosNaSemana(quando, d.alcance === 'empresas' ? empresaIds : null)
      if (usados + 1 > limite) {
        throw new ErroApi(
          'limite_semanal',
          `Já há ${usados} de ${limite} avisos normais nesta semana para essas empresas. Use "Urgente" só se for mesmo urgente, ou escolha outra semana.`,
          409,
        )
      }
    }
    const id = novoId()
    const eu = this.ctx.membro.id
    await db.execute(sql`
      INSERT INTO avisos (id, tenant_id, mensagem, link, urgencia, alcance, situacao, enviar_em, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${d.mensagem}, ${d.link}, ${d.urgencia}::urgencia_aviso,
              ${d.alcance}::alcance_aviso, 'agendado', ${quando.toISOString()}::timestamptz, ${eu}, ${eu})`)
    if (d.alcance === 'empresas') {
      for (const empresaId of empresaIds) {
        await db.execute(sql`
          INSERT INTO aviso_empresas (id, tenant_id, aviso_id, empresa_id)
          VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${empresaId})`)
      }
    }
    // "Agora" entra no outbox na mesma transação; o agendado é achado pela varredura de cada minuto
    if (!d.enviarEm) await agendarEnvioDoAviso(db, this.ctx.tenantId, id)
    await this.auditoria.registrar({
      entidade: 'aviso',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { urgencia: d.urgencia, alcance: d.alcance, agendado: d.enviarEm !== null },
    })
    return this.obter(id)
  }

  /** Cancela um aviso ainda agendado (o que já saiu não volta). */
  async cancelar(id: string): Promise<Aviso> {
    const db = this.ctx.db()
    const [atual] = await db.execute<{ situacao: SituacaoDoAviso }>(sql`
      SELECT situacao::text AS situacao FROM avisos WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`)
    if (!atual) throw new ErroApi('aviso_nao_encontrado', 'Aviso não encontrado.', 404)
    if (atual.situacao !== 'agendado') {
      throw new ErroApi(
        'aviso_ja_enviado',
        atual.situacao === 'cancelado'
          ? 'Este aviso já foi cancelado.'
          : 'Este aviso já foi enviado.',
        409,
      )
    }
    await db.execute(sql`
      UPDATE avisos SET situacao = 'cancelado', cancelado_em = now(), atualizado_em = now(),
                        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({ entidade: 'aviso', entidadeId: id, acao: 'cancelar' })
    return this.obter(id)
  }
}
