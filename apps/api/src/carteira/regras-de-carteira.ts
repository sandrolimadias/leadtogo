import { eq, schema, type SQL, sql } from '@leadtogo/db'
import type { Alcance } from '@leadtogo/shared'

import type { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'

/**
 * Regra de carteira (docs/funcionalidades.md, "Perfis de acesso"): cada empresa tem um responsável (o
 * vendedor), e o perfil de acesso diz, por AÇÃO, de quem é a carteira que a pessoa alcança:
 *  - `propria`: só as empresas em que ela é a responsável;
 *  - `equipe`: as dela e as dos subordinados (diretos e indiretos, pelo `gestor_id`);
 *  - `todas`: todas.
 * O RLS isola as empresas (tenants); esta regra isola as carteiras dentro da empresa, na API.
 */

/** Responsáveis no alcance: `null` = todos (sem restrição); `[]` = ninguém (sem a permissão). */
export type Responsaveis = readonly string[] | null

export interface EscopoDaCarteira {
  membroId: string
  empresas: { ver: Responsaveis; editar: Responsaveis; excluir: Responsaveis }
  contatos: { ver: Responsaveis; editar: Responsaveis; excluir: Responsaveis }
  oportunidades: { ver: Responsaveis; editar: Responsaveis; excluir: Responsaveis }
  /** Atividades: excluir, concluir e cancelar seguem o `editar` (como antes dos perfis) */
  atividades: { ver: Responsaveis; editar: Responsaveis }
  /** Passar a carteira para outro responsável (e cadastrar em nome de outro) */
  transferir: boolean
  /** Cadastrar contato sem empresa vinculada */
  contatoSemEmpresa: boolean
  /** Escolher outro responsável na oportunidade / na atividade */
  atribuirOportunidade: boolean
  atribuirAtividade: boolean
  /** Escolher o dia do fechamento da oportunidade (sem a permissão, vale o momento do fechamento) */
  dataDeFechamento: boolean
  /** Alterar o dia da criação da oportunidade */
  dataDeCriacao: boolean
  /**
   * A requisição é de uma chave de API (o membro de integração nunca é o responsável): pode cadastrar empresa,
   * oportunidade e atividade em nome de qualquer membro ativo. Mudar o responsável de uma empresa que já existe
   * continua exigindo `empresas.transferir`.
   */
  integracao: boolean
  /** Bloqueia o cadastro de CNPJ que não esteja ativo na Receita */
  bloquearNaoAtiva: boolean
  /** Conquistar uma oportunidade muda a empresa para Cliente, salvo se a pessoa desligar no fechamento */
  clienteAoConquistar: boolean
}

export async function escopoDaCarteira(ctx: ContextoTenantService): Promise<EscopoDaCarteira> {
  const permissao = new PermissaoService(ctx)
  const [config] = await ctx
    .db()
    .select({
      bloquear: schema.tenantConfiguracoes.bloquearEmpresaNaoAtiva,
      clienteAoConquistar: schema.tenantConfiguracoes.statusClienteAoConquistar,
    })
    .from(schema.tenantConfiguracoes)
    .where(eq(schema.tenantConfiguracoes.tenantId, ctx.tenantId))
  const membroId = ctx.membro.id
  const integracao = ctx.chaveApi !== undefined
  const alcances = (chave: string): Alcance | undefined => permissao.alcance(chave)
  const precisaEquipe = Object.values(ctx.membro.permissoes).includes('equipe')
  const equipe = precisaEquipe ? await permissao.equipe() : []
  const responsaveis = (chave: string): Responsaveis => {
    const alcance = alcances(chave)
    if (alcance === 'todas') return null
    if (alcance === 'equipe') return equipe
    if (alcance === 'propria') return [membroId]
    return []
  }
  return {
    membroId,
    empresas: {
      ver: responsaveis('empresas.ver'),
      editar: responsaveis('empresas.editar'),
      excluir: responsaveis('empresas.excluir'),
    },
    contatos: {
      ver: responsaveis('contatos.ver'),
      editar: responsaveis('contatos.editar'),
      excluir: responsaveis('contatos.excluir'),
    },
    oportunidades: {
      ver: responsaveis('oportunidades.ver'),
      editar: responsaveis('oportunidades.editar'),
      excluir: responsaveis('oportunidades.excluir'),
    },
    atividades: {
      ver: responsaveis('atividades.ver'),
      editar: responsaveis('atividades.editar'),
    },
    transferir: permissao.pode('empresas.transferir'),
    contatoSemEmpresa: permissao.pode('contatos.criar_sem_empresa'),
    atribuirOportunidade: integracao || permissao.pode('oportunidades.atribuir_responsavel'),
    atribuirAtividade: integracao || permissao.pode('atividades.atribuir_responsavel'),
    dataDeFechamento: permissao.pode('oportunidades.data_fechamento'),
    dataDeCriacao: permissao.pode('oportunidades.data_criacao'),
    integracao,
    bloquearNaoAtiva: config?.bloquear ?? true,
    clienteAoConquistar: config?.clienteAoConquistar ?? true,
  }
}

/** O responsável está no alcance? */
export const alcanca = (r: Responsaveis, responsavelId: string | null): boolean =>
  r === null || (responsavelId !== null && r.includes(responsavelId))

/** Condição SQL sobre a coluna do responsável: `undefined` = sem restrição; ninguém = `false`. */
export const condicaoDeResponsaveis = (r: Responsaveis, coluna: unknown): SQL | undefined => {
  if (r === null) return undefined
  if (r.length === 0) return sql`false`
  return sql`${coluna} = ANY (${`{${r.join(',')}}`}::uuid[])`
}

export const podeVer = (e: EscopoDaCarteira, vendedorId: string): boolean =>
  alcanca(e.empresas.ver, vendedorId)

export const podeEditar = (e: EscopoDaCarteira, vendedorId: string): boolean =>
  alcanca(e.empresas.editar, vendedorId)

/** Excluir a empresa deste responsável. */
export const podeExcluir = (e: EscopoDaCarteira, vendedorId: string): boolean =>
  alcanca(e.empresas.excluir, vendedorId)

/** Passar a carteira para outro vendedor (e cadastrar em nome de outro). */
export const podeTransferir = (e: EscopoDaCarteira): boolean => e.transferir

/** Condição SQL das empresas que o usuário vê (`undefined` = todas). Para as listagens. */
export const condicaoDeVisibilidade = (e: EscopoDaCarteira) =>
  condicaoDeResponsaveis(e.empresas.ver, schema.empresas.vendedorId)
