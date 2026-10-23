import { gerarFeriadosMoveis, novoId, sql } from '@leadtogo/db'
import type {
  CalendarioUtil,
  CriarFeriadoEntrada,
  DefinirExpedienteEntrada,
  Expediente,
  Feriado,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

const hhmm = (hora: string) => hora.slice(0, 5)

/**
 * Expediente da empresa (faixas por dia da semana) e feriados: a base das metas em horas úteis. Padrão
 * (criado com a empresa): segunda a sexta, 8h às 18h, e os feriados nacionais. Tudo editável por quem tem
 * `chamados.gerir_areas`.
 */
@Injectable()
export class ExpedienteService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async obter(): Promise<Expediente> {
    const db = this.ctx.db()
    const faixas = await db.execute<{ dia_semana: number; inicio: string; fim: string }>(sql`
      SELECT dia_semana, inicio::text AS inicio, fim::text AS fim FROM calendario_expediente
      ORDER BY dia_semana, inicio`)
    const feriados = await db.execute<{
      id: string
      data: string
      nome: string
      recorrente: boolean
    }>(sql`
      SELECT id, data::text AS data, nome, recorrente FROM feriados WHERE excluido_em IS NULL
      ORDER BY extract(month FROM data), extract(day FROM data), data`)
    const [c] = await db.execute<{ fuso: string }>(sql`
      SELECT fuso_horario AS fuso FROM tenant_configuracoes WHERE tenant_id = ${this.ctx.tenantId}`)
    return {
      faixas: faixas.map((f) => ({
        diaSemana: f.dia_semana,
        inicio: hhmm(f.inicio),
        fim: hhmm(f.fim),
      })),
      feriados: feriados.map((f): Feriado => ({
        id: f.id,
        data: f.data,
        nome: f.nome,
        recorrente: f.recorrente,
      })),
      fusoHorario: c?.fuso ?? 'America/Sao_Paulo',
    }
  }

  /** O calendário no formato das funções de horas úteis. */
  async calendario(): Promise<CalendarioUtil> {
    const e = await this.obter()
    return {
      faixas: e.faixas,
      feriados: e.feriados.map((f) => ({ data: f.data, recorrente: f.recorrente })),
      fusoHorario: e.fusoHorario,
    }
  }

  private exigirGerir() {
    new PermissaoService(this.ctx).exigir('chamados.gerir_areas')
  }

  /** Troca o expediente inteiro (lista vazia = sem expediente: as metas deixam de contar prazo). */
  async definir(dados: DefinirExpedienteEntrada): Promise<Expediente> {
    this.exigirGerir()
    const db = this.ctx.db()
    const antes = await this.obter()
    await db.execute(sql`DELETE FROM calendario_expediente WHERE tenant_id = ${this.ctx.tenantId}`)
    for (const f of dados.faixas) {
      await db.execute(sql`
        INSERT INTO calendario_expediente (id, tenant_id, dia_semana, inicio, fim, atualizado_por)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${f.diaSemana}, ${f.inicio}::time, ${f.fim}::time, ${this.ctx.membro.id})`)
    }
    await this.auditoria.registrar({
      entidade: 'chamado_expediente',
      acao: 'alterar',
      alteracoes: { faixas: { antes: antes.faixas, depois: dados.faixas } },
    })
    return this.obter()
  }

  async criarFeriado(dados: CriarFeriadoEntrada): Promise<Feriado> {
    this.exigirGerir()
    const id = novoId()
    try {
      await this.ctx.db().execute(sql`
        INSERT INTO feriados (id, tenant_id, data, nome, recorrente, criado_por, atualizado_por)
        VALUES (${id}, ${this.ctx.tenantId}, ${dados.data}::date, ${dados.nome}, ${dados.recorrente},
          ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    } catch (e) {
      if (e instanceof Error && /feriados_data_uq/.test(`${e.message} ${String(e.cause)}`)) {
        throw new ErroApi('feriado_repetido', 'Já existe um feriado nessa data.', 409)
      }
      throw e
    }
    await this.auditoria.registrar({
      entidade: 'chamado_feriado',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { data: dados.data, nome: dados.nome, recorrente: dados.recorrente },
    })
    const feriado = (await this.obter()).feriados.find((f) => f.id === id)
    if (!feriado) throw new Error('feriado sem registro')
    return feriado
  }

  async excluirFeriado(id: string): Promise<void> {
    this.exigirGerir()
    const [f] = await this.ctx.db().execute<{ nome: string; data: string }>(sql`
      UPDATE feriados SET excluido_em = now(), atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id} AND excluido_em IS NULL RETURNING nome, data::text AS data`)
    if (!f) throw new ErroApi('feriado_nao_encontrado', 'Feriado não encontrado.', 404)
    await this.auditoria.registrar({
      entidade: 'chamado_feriado',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { data: f.data, nome: f.nome },
    })
  }

  /** Acrescenta os feriados nacionais móveis do ano que ainda não estão no cadastro. */
  async gerarMoveis(ano: number): Promise<{ criados: number }> {
    this.exigirGerir()
    const criados = await gerarFeriadosMoveis(
      this.ctx.db(),
      this.ctx.tenantId,
      ano,
      this.ctx.membro.id,
    )
    await this.auditoria.registrar({
      entidade: 'chamado_feriado',
      acao: 'gerar_moveis',
      alteracoes: { ano, criados },
    })
    return { criados }
  }
}
