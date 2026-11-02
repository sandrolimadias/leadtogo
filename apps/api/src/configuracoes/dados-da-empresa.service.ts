import { eq, schema, sql } from '@leadtogo/db'
import type { AlterarDadosDaEmpresa, DadosDaEmpresa, MunicipiosDaUf, Uf } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

const { tenants, municipios } = schema

/** Coluna do banco de cada campo do endereço (as que o PATCH pode mudar). */
const COLUNAS_DO_ENDERECO = {
  cep: 'cep',
  tipoLogradouro: 'tipo_logradouro',
  logradouro: 'logradouro',
  numero: 'numero',
  complemento: 'complemento',
  bairro: 'bairro',
  municipioCodigo: 'municipio_codigo',
} as const
const COLUNAS_DA_EMPRESA = {
  razaoSocial: 'razao_social',
  nomeFantasia: 'nome_fantasia',
  email: 'email',
  telefone: 'telefone',
  website: 'website',
} as const

/**
 * Configurações → Empresa: os dados e o endereço da empresa ativa (a linha de `tenants`, isolada pelo RLS
 * na própria linha). O endereço diz o estado dos mapas do Dashboard. O CNPJ não muda aqui.
 */
@Injectable()
export class DadosDaEmpresaService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async obter(): Promise<DadosDaEmpresa> {
    const [t] = await this.ctx
      .db()
      .select({
        razaoSocial: tenants.razaoSocial,
        nomeFantasia: tenants.nomeFantasia,
        cnpj: tenants.cnpj,
        email: tenants.email,
        telefone: tenants.telefone,
        website: tenants.website,
        cep: tenants.cep,
        tipoLogradouro: tenants.tipoLogradouro,
        logradouro: tenants.logradouro,
        numero: tenants.numero,
        complemento: tenants.complemento,
        bairro: tenants.bairro,
        municipioCodigo: tenants.municipioCodigo,
        municipioNome: municipios.nome,
        uf: municipios.uf,
      })
      .from(tenants)
      .leftJoin(municipios, eq(municipios.codigoIbge, tenants.municipioCodigo))
      .where(eq(tenants.id, this.ctx.tenantId))
    if (!t) throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    return {
      razaoSocial: t.razaoSocial,
      nomeFantasia: t.nomeFantasia,
      cnpj: t.cnpj,
      email: t.email,
      telefone: t.telefone,
      website: t.website,
      endereco: {
        cep: t.cep,
        tipoLogradouro: t.tipoLogradouro,
        logradouro: t.logradouro,
        numero: t.numero,
        complemento: t.complemento,
        bairro: t.bairro,
        municipio:
          t.municipioCodigo !== null && t.municipioNome && t.uf
            ? { codigo: t.municipioCodigo, nome: t.municipioNome, uf: t.uf }
            : null,
      },
    }
  }

  /** `empresa.configurar` (na rota). Só os campos enviados mudam. Registra na auditoria o antes e o depois. */
  async alterar(patch: AlterarDadosDaEmpresa): Promise<DadosDaEmpresa> {
    const antes = await this.obter()
    const plano: { coluna: string; valor: string | number | null; campo: string; de: unknown }[] =
      []
    for (const [campo, coluna] of Object.entries(COLUNAS_DA_EMPRESA)) {
      const valor = patch[campo as keyof typeof COLUNAS_DA_EMPRESA]
      if (valor === undefined) continue
      const de = antes[campo as keyof typeof COLUNAS_DA_EMPRESA]
      if (de !== valor) plano.push({ coluna, valor, campo, de })
    }
    if (patch.endereco) {
      for (const [campo, coluna] of Object.entries(COLUNAS_DO_ENDERECO)) {
        const valor = patch.endereco[campo as keyof typeof COLUNAS_DO_ENDERECO]
        if (valor === undefined) continue
        const de =
          campo === 'municipioCodigo'
            ? (antes.endereco.municipio?.codigo ?? null)
            : antes.endereco[campo as Exclude<keyof typeof COLUNAS_DO_ENDERECO, 'municipioCodigo'>]
        if (de !== valor) plano.push({ coluna, valor, campo, de })
      }
      const codigo = patch.endereco.municipioCodigo
      if (codigo !== undefined && codigo !== null) {
        const [m] = await this.ctx
          .db()
          .select({ codigo: municipios.codigoIbge })
          .from(municipios)
          .where(eq(municipios.codigoIbge, codigo))
        if (!m) throw new ErroApi('municipio_invalido', 'Cidade não encontrada.', 400)
      }
    }
    if (plano.length === 0) return antes

    const sets = sql.join(
      plano.map((p) => sql`${sql.identifier(p.coluna)} = ${p.valor}`),
      sql`, `,
    )
    await this.ctx.db().execute(sql`
      UPDATE tenants SET ${sets}, atualizado_em = now()
      WHERE id = ${this.ctx.tenantId}`)
    await this.auditoria.registrar({
      entidade: 'empresa_da_conta',
      entidadeId: this.ctx.tenantId,
      acao: 'alterar',
      alteracoes: Object.fromEntries(plano.map((p) => [p.campo, { de: p.de, para: p.valor }])),
    })
    return this.obter()
  }

  /** Os municípios da UF, em ordem alfabética (o seletor de cidade). Referência igual para toda empresa. */
  async municipios(uf: Uf): Promise<MunicipiosDaUf> {
    const linhas = await this.ctx
      .db()
      .select({ codigo: municipios.codigoIbge, nome: municipios.nome })
      .from(municipios)
      .where(eq(municipios.uf, uf))
    return linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }
}
