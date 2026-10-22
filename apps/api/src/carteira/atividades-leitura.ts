import { alias, and, eq, isNull, schema, sql, type SQL } from '@leadtogo/db'
import { type Atividade, estaAtrasada } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { condicaoDeResponsaveis, type EscopoDaCarteira } from './regras-de-carteira.js'

const { atividades, contatos, empresas, membros, oportunidades, tiposAtividade } = schema
const responsavel = alias(membros, 'responsavel')

/**
 * Ela vê a atividade: a da empresa no alcance de `atividades.ver`; a Tarefa sem empresa, pelo
 * responsável no alcance de `atividades.editar` (como antes: o vendedor que "vê todas" via só as
 * Tarefas soltas dele).
 */
export const condicaoDeVisibilidadeDaAtividade = (escopo: EscopoDaCarteira): SQL | undefined => {
  const { ver, editar } = escopo.atividades
  if (ver === null && editar === null) return undefined
  return sql`(CASE WHEN ${atividades.empresaId} IS NULL
    THEN ${condicaoDeResponsaveis(editar, atividades.responsavelId) ?? sql`true`}
    ELSE ${condicaoDeResponsaveis(ver, empresas.vendedorId) ?? sql`true`} END)`
}

/**
 * Ela edita (e conclui, cancela, exclui): a da empresa no alcance de `atividades.editar`, ou a Tarefa
 * sem empresa cujo responsável está nesse alcance.
 */
export const condicaoDeEdicaoDaAtividade = (escopo: EscopoDaCarteira): SQL | undefined => {
  const { editar } = escopo.atividades
  if (editar === null) return undefined
  return sql`(CASE WHEN ${atividades.empresaId} IS NULL
    THEN ${condicaoDeResponsaveis(editar, atividades.responsavelId) ?? sql`true`}
    ELSE ${condicaoDeResponsaveis(editar, empresas.vendedorId) ?? sql`true`} END)`
}

/** As colunas lidas (com os joins de `selecionarAtividades`). */
export const colunasDaAtividade = {
  id: atividades.id,
  tipoId: tiposAtividade.id,
  tipoNome: tiposAtividade.nome,
  tipoIcone: tiposAtividade.icone,
  tipoCor: tiposAtividade.cor,
  tipoContaComo: tiposAtividade.contaComo,
  titulo: atividades.titulo,
  empresaId: atividades.empresaId,
  empresaRazaoSocial: empresas.razaoSocial,
  empresaNomeFantasia: empresas.nomeFantasia,
  contatoId: atividades.contatoId,
  contatoNome: contatos.nome,
  oportunidadeId: oportunidades.id,
  oportunidadeTitulo: oportunidades.titulo,
  responsavelId: atividades.responsavelId,
  responsavelNome: responsavel.nome,
  dataInicio: atividades.dataInicio,
  dataFim: atividades.dataFim,
  diaInteiro: atividades.diaInteiro,
  situacao: atividades.situacao,
  realizadaEm: atividades.realizadaEm,
  resultado: atividades.resultado,
  importante: atividades.importante,
  urgente: atividades.urgente,
  observacoes: atividades.observacoes,
  origem: atividades.origem,
  criadaEm: atividades.criadoEm,
}

/** Os joins que as consultas de atividade compartilham (o dono da empresa, o tipo, o contato, o responsável). */
export function selecionarAtividades(db: Transacao, escopo: EscopoDaCarteira) {
  return db
    .select({
      ...colunasDaAtividade,
      editavel: sql<boolean>`${condicaoDeEdicaoDaAtividade(escopo) ?? sql`true`}`,
    })
    .from(atividades)
    .innerJoin(tiposAtividade, eq(tiposAtividade.id, atividades.tipoAtividadeId))
    .innerJoin(responsavel, eq(responsavel.id, atividades.responsavelId))
    .leftJoin(empresas, eq(empresas.id, atividades.empresaId))
    .leftJoin(contatos, eq(contatos.id, atividades.contatoId))
    .leftJoin(
      oportunidades,
      and(eq(oportunidades.id, atividades.oportunidadeId), isNull(oportunidades.excluidoEm)),
    )
}

export type LinhaDeAtividade = Awaited<ReturnType<typeof selecionarAtividades>>[number]

const iso = (d: Date | string | null): string | null =>
  d === null ? null : new Date(d).toISOString()

export function paraAtividade(l: LinhaDeAtividade, agora: Date, fuso: string): Atividade {
  return {
    id: l.id,
    tipo: {
      id: l.tipoId,
      nome: l.tipoNome,
      icone: l.tipoIcone,
      cor: l.tipoCor,
      contaComo: l.tipoContaComo,
    },
    titulo: l.titulo,
    empresa:
      l.empresaId !== null
        ? { id: l.empresaId, nome: l.empresaNomeFantasia ?? l.empresaRazaoSocial ?? '' }
        : null,
    contato: l.contatoId !== null ? { id: l.contatoId, nome: l.contatoNome ?? '' } : null,
    oportunidade:
      l.oportunidadeId !== null ? { id: l.oportunidadeId, nome: l.oportunidadeTitulo ?? '' } : null,
    responsavel: { id: l.responsavelId, nome: l.responsavelNome },
    dataInicio: new Date(l.dataInicio).toISOString(),
    dataFim: iso(l.dataFim),
    diaInteiro: l.diaInteiro,
    situacao: l.situacao,
    atrasada: estaAtrasada(l, agora, fuso),
    realizadaEm: iso(l.realizadaEm),
    resultado: l.resultado,
    importante: l.importante,
    urgente: l.urgente,
    observacoes: l.observacoes,
    origem: l.origem,
    criadaEm: new Date(l.criadaEm).toISOString(),
    editavel: l.editavel,
  }
}

/** O fuso da empresa ativa (padrão America/Sao_Paulo). */
export async function fusoDaEmpresa(db: Transacao, tenantId: string): Promise<string> {
  const [c] = await db
    .select({ fuso: schema.tenantConfiguracoes.fusoHorario })
    .from(schema.tenantConfiguracoes)
    .where(eq(schema.tenantConfiguracoes.tenantId, tenantId))
  return c?.fuso ?? 'America/Sao_Paulo'
}

/** Uma atividade que o usuário vê, ou `undefined`. */
export async function lerAtividade(
  db: Transacao,
  escopo: EscopoDaCarteira,
  id: string,
  agora: Date,
  fuso: string,
): Promise<Atividade | undefined> {
  const [linha] = await selecionarAtividades(db, escopo).where(
    and(
      eq(atividades.id, id),
      isNull(atividades.excluidoEm),
      condicaoDeVisibilidadeDaAtividade(escopo),
    ),
  )
  return linha ? paraAtividade(linha, agora, fuso) : undefined
}
