import { novoId, sql } from '@leadtogo/db'
import type { ConsultaDeRegioes, EscopoDoLote, RegiaoGeo, SalvarRegiao } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { inteirosSql } from './sql-inteiros.js'

type LinhaDeMunicipio = {
  regiao_id: string
  regiao_nome: string
  uf: string | null
  codigo_ibge: number
  municipio: string
  municipio_uf: string
}

const PREFIXO_MICRO = 'micro:'

/** Regiões da geolocalização: as microrregiões oficiais do IBGE (só leitura) e as do admin. */
@Injectable()
export class RegioesGeoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private exigirAdmin(): void {
    if (this.ctx.membro.papel !== 'admin') {
      throw new ErroApi('acesso_negado', 'Só administradores criam regiões.', 403)
    }
  }

  private agrupar(linhas: LinhaDeMunicipio[], tipo: RegiaoGeo['tipo'], prefixo = ''): RegiaoGeo[] {
    const porRegiao = new Map<string, RegiaoGeo>()
    for (const l of linhas) {
      const id = `${prefixo}${l.regiao_id}`
      let r = porRegiao.get(id)
      if (!r) {
        r = { id, tipo, nome: l.regiao_nome, uf: l.uf, municipios: [] }
        porRegiao.set(id, r)
      }
      r.municipios.push({ codigoIbge: l.codigo_ibge, nome: l.municipio, uf: l.municipio_uf })
    }
    return [...porRegiao.values()]
  }

  /** As microrregiões da UF (padrão: todas) e as regiões do admin. */
  async listar(consulta: ConsultaDeRegioes): Promise<RegiaoGeo[]> {
    const db = this.ctx.db()
    const oficiais = await db.execute<LinhaDeMunicipio>(sql`
      SELECT r.codigo::text AS regiao_id, r.nome AS regiao_nome, r.uf,
             m.codigo_ibge, m.nome AS municipio, m.uf AS municipio_uf
      FROM microrregioes r JOIN municipios m ON m.microrregiao_codigo = r.codigo
      ${consulta.uf ? sql`WHERE r.uf = ${consulta.uf.toUpperCase()}` : sql``}
      ORDER BY r.nome, m.nome`)
    const proprias = await db.execute<LinhaDeMunicipio>(sql`
      SELECT g.id::text AS regiao_id, g.nome AS regiao_nome, NULL::text AS uf,
             m.codigo_ibge, m.nome AS municipio, m.uf AS municipio_uf
      FROM geo_regioes g
      JOIN geo_regiao_municipios gm ON gm.regiao_id = g.id AND gm.excluido_em IS NULL
      JOIN municipios m ON m.codigo_ibge = gm.municipio_codigo
      WHERE g.excluido_em IS NULL
      ORDER BY g.nome, m.nome`)
    return [
      ...this.agrupar(proprias, 'personalizada'),
      ...this.agrupar(oficiais, 'microrregiao', PREFIXO_MICRO),
    ]
  }

  private async exigirMunicipios(codigos: number[]): Promise<number[]> {
    const unicos = [...new Set(codigos)]
    const achados = await this.ctx
      .db()
      .execute<{ codigo_ibge: number }>(
        sql`SELECT codigo_ibge FROM municipios WHERE codigo_ibge = ANY(${inteirosSql(unicos)})`,
      )
    if (achados.length !== unicos.length) {
      throw new ErroApi('municipio_invalido', 'Há município que não existe.', 400, [
        { campo: 'municipios', mensagem: 'Escolha só municípios da lista.' },
      ])
    }
    return unicos
  }

  private async gravarMunicipios(regiaoId: string, municipios: number[]): Promise<void> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    await db.execute(sql`DELETE FROM geo_regiao_municipios WHERE regiao_id = ${regiaoId}`)
    for (const m of municipios) {
      await db.execute(sql`
        INSERT INTO geo_regiao_municipios (id, tenant_id, regiao_id, municipio_codigo, criado_por, atualizado_por)
        VALUES (${novoId()}, ${tenantId}, ${regiaoId}, ${m}, ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    }
  }

  private async exigirNomeLivre(nome: string, exceto?: string): Promise<void> {
    const l = await this.ctx.db().execute(sql`
      SELECT 1 FROM geo_regioes WHERE lower(nome) = lower(${nome}) AND excluido_em IS NULL
        ${exceto ? sql`AND id <> ${exceto}` : sql``}`)
    if (l.length > 0) {
      throw new ErroApi('regiao_repetida', 'Já existe uma região com esse nome.', 409, [
        { campo: 'nome', mensagem: 'Já existe uma região com esse nome.' },
      ])
    }
  }

  async criar(dados: SalvarRegiao): Promise<RegiaoGeo> {
    this.exigirAdmin()
    const municipios = await this.exigirMunicipios(dados.municipios)
    await this.exigirNomeLivre(dados.nome)
    const id = novoId()
    await this.ctx.db().execute(sql`
      INSERT INTO geo_regioes (id, tenant_id, nome, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${dados.nome}, ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    await this.gravarMunicipios(id, municipios)
    await this.auditoria.registrar({
      entidade: 'geo_regiao',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { nome: dados.nome, municipios: municipios.length },
    })
    return this.detalhar(id)
  }

  async alterar(id: string, dados: SalvarRegiao): Promise<RegiaoGeo> {
    this.exigirAdmin()
    await this.detalhar(id)
    const municipios = await this.exigirMunicipios(dados.municipios)
    await this.exigirNomeLivre(dados.nome, id)
    await this.ctx.db().execute(sql`
      UPDATE geo_regioes SET nome = ${dados.nome}, atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${id}`)
    await this.gravarMunicipios(id, municipios)
    await this.auditoria.registrar({
      entidade: 'geo_regiao',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: { nome: dados.nome, municipios: municipios.length },
    })
    return this.detalhar(id)
  }

  async excluir(id: string): Promise<void> {
    this.exigirAdmin()
    await this.detalhar(id)
    await this.ctx.db().execute(sql`
      UPDATE geo_regioes SET excluido_em = now(), atualizado_por = ${this.ctx.membro.id} WHERE id = ${id}`)
    await this.auditoria.registrar({ entidade: 'geo_regiao', entidadeId: id, acao: 'excluir' })
  }

  async detalhar(id: string): Promise<RegiaoGeo> {
    const r = (await this.listar({})).find((x) => x.id === id)
    if (!r || r.tipo !== 'personalizada') {
      throw new ErroApi('regiao_nao_encontrada', 'Região não encontrada.', 404)
    }
    return r
  }

  /** Os municípios (e o nome) de um escopo de lote: cidade, microrregião oficial ou região do admin. */
  async resolverEscopo(escopo: EscopoDoLote): Promise<{ nome: string; municipios: number[] }> {
    const db = this.ctx.db()
    const invalido = () =>
      new ErroApi('escopo_invalido', 'Escolha uma cidade ou região da lista.', 400)
    if (escopo.tipo === 'municipio') {
      if (!/^\d{7}$/.test(escopo.id)) throw invalido()
      const [m] = await db.execute<{ codigo_ibge: number; nome: string }>(
        sql`SELECT codigo_ibge, nome FROM municipios WHERE codigo_ibge = ${Number(escopo.id)}`,
      )
      if (!m) throw new ErroApi('escopo_invalido', 'Município não encontrado.', 400)
      return { nome: m.nome, municipios: [m.codigo_ibge] }
    }
    if (escopo.id.startsWith(PREFIXO_MICRO)) {
      const codigo = Number(escopo.id.slice(PREFIXO_MICRO.length))
      if (!Number.isInteger(codigo)) throw invalido()
      const linhas = await db.execute<{ codigo_ibge: number; nome: string }>(sql`
        SELECT m.codigo_ibge, r.nome FROM microrregioes r
        JOIN municipios m ON m.microrregiao_codigo = r.codigo WHERE r.codigo = ${codigo}`)
      if (linhas.length === 0) throw new ErroApi('escopo_invalido', 'Região não encontrada.', 400)
      return { nome: `${linhas[0]?.nome ?? ''}`, municipios: linhas.map((l) => l.codigo_ibge) }
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(escopo.id)) {
      throw invalido()
    }
    const linhas = await db.execute<{ municipio_codigo: number; nome: string }>(sql`
      SELECT gm.municipio_codigo, g.nome FROM geo_regioes g
      JOIN geo_regiao_municipios gm ON gm.regiao_id = g.id AND gm.excluido_em IS NULL
      WHERE g.id = ${escopo.id}::uuid AND g.excluido_em IS NULL`)
    if (linhas.length === 0) throw new ErroApi('escopo_invalido', 'Região não encontrada.', 400)
    return { nome: linhas[0]?.nome ?? '', municipios: linhas.map((l) => l.municipio_codigo) }
  }
}
