import { novoId, sql } from '@leadtogo/db'
import type {
  ConsultaDeLotesGeo,
  CriarLoteGeo,
  ListaDeLotesGeo,
  LoteGeo,
  PreviaDoLote,
  EscopoDoLote,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { agendarExecucaoDoLote } from './evento-lote.js'
import { arraySql } from '../importacao/sql-array.js'
import { RegioesGeoService } from './regioes.service.js'
import { inteirosSql } from './sql-inteiros.js'

const TAMANHO_DO_INSERT = 1000

/** Quem roda lotes de geocodificação: administrador e gestor. */
export function exigirQuemGeocodifica(ctx: ContextoTenantService): void {
  if (ctx.membro.papel !== 'admin' && ctx.membro.papel !== 'gestor') {
    throw new ErroApi('acesso_negado', 'Só administradores e gestores geocodificam em lote.', 403)
  }
}

type LinhaDoLote = {
  id: string
  nome: string
  escopo: string
  municipios: number[]
  refazer_com_coordenada: boolean
  situacao: LoteGeo['situacao']
  total_empresas: number
  iniciado_em: Date | null
  concluido_em: Date | null
  criado_em: Date
  criado_por: string | null
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)

/** Lotes de geocodificação por cidade ou região (admin e gestor): prévia, criar, listar, cancelar, retomar. */
@Injectable()
export class LotesGeoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly regioes: RegioesGeoService,
  ) {}

  /** Empresas do escopo: ativas, no Brasil e sem a posição ajustada à mão (essas nunca mudam). */
  private selecionarEmpresas(municipios: number[]) {
    return sql`
      FROM empresas e
      WHERE e.municipio_codigo = ANY(${inteirosSql(municipios)}) AND e.excluido_em IS NULL
        AND e.pais_codigo IS NULL`
  }

  async previa(escopo: EscopoDoLote): Promise<PreviaDoLote> {
    exigirQuemGeocodifica(this.ctx)
    const r = await this.regioes.resolverEscopo(escopo)
    const [c] = await this.ctx.db().execute<{
      total: number
      com_coordenada: number
      ajustadas: number
    }>(sql`
      SELECT count(*) FILTER (WHERE NOT e.geo_ajuste_manual)::int AS total,
             count(*) FILTER (WHERE NOT e.geo_ajuste_manual AND e.localizacao IS NOT NULL)::int AS com_coordenada,
             count(*) FILTER (WHERE e.geo_ajuste_manual)::int AS ajustadas
      ${this.selecionarEmpresas(r.municipios)}`)
    const total = c?.total ?? 0
    const com = c?.com_coordenada ?? 0
    return {
      escopo: r.nome,
      municipios: r.municipios.length,
      total,
      comCoordenada: com,
      aProcessar: total - com,
      ajustadasAMao: c?.ajustadas ?? 0,
    }
  }

  async criar(dados: CriarLoteGeo): Promise<LoteGeo> {
    exigirQuemGeocodifica(this.ctx)
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const r = await this.regioes.resolverEscopo(dados.escopo)
    const empresas = await db.execute<{ id: string }>(sql`
      SELECT e.id ${this.selecionarEmpresas(r.municipios)}
        AND NOT e.geo_ajuste_manual
        ${dados.refazerComCoordenada ? sql`` : sql`AND e.localizacao IS NULL`}
      ORDER BY e.id`)
    if (empresas.length === 0) {
      throw new ErroApi(
        'lote_vazio',
        'Não há empresas para geocodificar nesse escopo (todas já têm coordenada ou foram ajustadas à mão).',
        409,
      )
    }
    const [ativo] = await db.execute(
      sql`SELECT 1 FROM geo_lotes WHERE situacao = 'em_andamento' AND excluido_em IS NULL LIMIT 1`,
    )
    if (ativo) {
      throw new ErroApi(
        'lote_em_andamento',
        'Já existe um lote em andamento. Espere terminar ou cancele.',
        409,
      )
    }
    const id = novoId()
    const nome = `${r.nome} (${new Date().toLocaleDateString('pt-BR')})`
    await db.execute(sql`
      INSERT INTO geo_lotes (id, tenant_id, nome, municipios, escopo, refazer_com_coordenada, situacao,
        total_empresas, iniciado_em, ultimo_progresso_em, criado_por, atualizado_por)
      VALUES (${id}, ${tenantId}, ${nome}, ${inteirosSql(r.municipios)}, ${r.nome}, ${dados.refazerComCoordenada},
        'em_andamento', ${empresas.length}, now(), now(), ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    for (let i = 0; i < empresas.length; i += TAMANHO_DO_INSERT) {
      const fatia = empresas.slice(i, i + TAMANHO_DO_INSERT)
      await db.execute(sql`
        INSERT INTO geo_lote_empresas (id, tenant_id, lote_id, empresa_id)
        SELECT x.id, ${tenantId}, ${id}, x.empresa_id
        FROM unnest(${arraySql(
          fatia.map(() => novoId()),
          'uuid',
        )}, ${arraySql(
          fatia.map((e) => e.id),
          'uuid',
        )}) AS x(id, empresa_id)`)
    }
    await agendarExecucaoDoLote(db, tenantId, id)
    await this.auditoria.registrar({
      entidade: 'geo_lote',
      entidadeId: id,
      acao: 'iniciar',
      alteracoes: {
        escopo: r.nome,
        empresas: empresas.length,
        refazer: dados.refazerComCoordenada,
      },
    })
    return this.detalhar(id)
  }

  private async montar(db: Transacao, l: LinhaDoLote): Promise<LoteGeo> {
    const contagem = await db.execute<{ resultado: string; n: number }>(sql`
      SELECT resultado, count(*)::int AS n FROM geo_lote_empresas WHERE lote_id = ${l.id} GROUP BY resultado`)
    const porResultado = Object.fromEntries(contagem.map((c) => [c.resultado, c.n]))
    const pendentes = porResultado['pendente'] ?? 0
    return {
      id: l.id,
      nome: l.nome,
      escopo: l.escopo,
      municipios: l.municipios.length,
      refazerComCoordenada: l.refazer_com_coordenada,
      situacao: l.situacao,
      totalEmpresas: l.total_empresas,
      processadas: l.total_empresas - pendentes,
      porResultado,
      iniciadoEm: iso(l.iniciado_em),
      concluidoEm: iso(l.concluido_em),
      criadoEm: new Date(l.criado_em).toISOString(),
      criadoPor: l.criado_por,
    }
  }

  async detalhar(id: string): Promise<LoteGeo> {
    exigirQuemGeocodifica(this.ctx)
    const db = this.ctx.db()
    const [l] = await db.execute<LinhaDoLote>(
      sql`SELECT * FROM geo_lotes WHERE id = ${id} AND excluido_em IS NULL`,
    )
    if (!l) throw new ErroApi('lote_nao_encontrado', 'Lote não encontrado.', 404)
    return this.montar(db, l)
  }

  async listar(consulta: ConsultaDeLotesGeo): Promise<ListaDeLotesGeo> {
    exigirQuemGeocodifica(this.ctx)
    const db = this.ctx.db()
    const [t] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM geo_lotes WHERE excluido_em IS NULL`,
    )
    const linhas = await db.execute<LinhaDoLote>(sql`
      SELECT * FROM geo_lotes WHERE excluido_em IS NULL
      ORDER BY criado_em DESC, id DESC LIMIT ${consulta.porPagina} OFFSET ${(consulta.pagina - 1) * consulta.porPagina}`)
    const itens: LoteGeo[] = []
    for (const l of linhas) itens.push(await this.montar(db, l))
    return { itens, total: t?.n ?? 0, pagina: consulta.pagina, porPagina: consulta.porPagina }
  }

  async cancelar(id: string): Promise<LoteGeo> {
    exigirQuemGeocodifica(this.ctx)
    const l = await this.ctx.db().execute(sql`
      UPDATE geo_lotes SET situacao = 'cancelado', atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${id} AND situacao = 'em_andamento' AND excluido_em IS NULL RETURNING id`)
    if (l.length === 0) {
      await this.detalhar(id)
      throw new ErroApi('lote_nao_cancelavel', 'Só dá para cancelar um lote em andamento.', 409)
    }
    await this.auditoria.registrar({ entidade: 'geo_lote', entidadeId: id, acao: 'cancelar' })
    return this.detalhar(id)
  }

  /** Retoma um lote cancelado ou que falhou: as que falharam voltam a pendentes; as feitas ficam. */
  async retomar(id: string): Promise<LoteGeo> {
    exigirQuemGeocodifica(this.ctx)
    const db = this.ctx.db()
    const [ativo] = await db.execute(
      sql`SELECT 1 FROM geo_lotes WHERE situacao = 'em_andamento' AND excluido_em IS NULL LIMIT 1`,
    )
    if (ativo) {
      throw new ErroApi('lote_em_andamento', 'Já existe um lote em andamento.', 409)
    }
    const l = await db.execute(sql`
      UPDATE geo_lotes SET situacao = 'em_andamento', concluido_em = NULL, ultimo_progresso_em = now(),
        atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${id} AND situacao IN ('cancelado', 'falhou') AND excluido_em IS NULL RETURNING id`)
    if (l.length === 0) {
      await this.detalhar(id)
      throw new ErroApi(
        'lote_nao_retomavel',
        'Só dá para retomar um lote cancelado ou que falhou.',
        409,
      )
    }
    await db.execute(sql`
      UPDATE geo_lote_empresas SET resultado = 'pendente', motivo = NULL, processada_em = NULL, atualizado_em = now()
      WHERE lote_id = ${id} AND resultado = 'falhou'`)
    await agendarExecucaoDoLote(db, this.ctx.tenantId, id)
    await this.auditoria.registrar({ entidade: 'geo_lote', entidadeId: id, acao: 'retomar' })
    return this.detalhar(id)
  }
}
