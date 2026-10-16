import { alias, and, eq, isNull, schema, sql, type SQL } from '@leadtogo/db'
import type { Oportunidade } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { EscopoDaCarteira } from './regras-de-carteira.js'

const {
  atividades,
  contatos,
  empresas,
  funilFases,
  funis,
  membros,
  motivos,
  oportunidades,
  origens,
  solucoes,
  tiposAtividade,
} = schema
const fase = alias(funilFases, 'fase')
const faseParou = alias(funilFases, 'fase_parou')
const responsavel = alias(membros, 'responsavel')
const proxima = alias(atividades, 'proxima')
const tipoDaProxima = alias(tiposAtividade, 'tipo_da_proxima')

/** Ela vê a oportunidade: admin e gestor, todas; o vendedor a das empresas que vê (a própria carteira, ou todas). */
export const condicaoDeVisibilidadeDaOportunidade = (e: EscopoDaCarteira): SQL | undefined =>
  e.papel !== 'vendedor' || e.veTodas ? undefined : sql`${empresas.vendedorId} = ${e.membroId}`

/** Ela edita (move, fecha, reabre): admin e gestor, todas; o vendedor a das empresas dele. */
export const condicaoDeEdicaoDaOportunidade = (e: EscopoDaCarteira): SQL | undefined =>
  e.papel !== 'vendedor' ? undefined : sql`${empresas.vendedorId} = ${e.membroId}`

const MS_POR_DIA = 86_400_000
const iso = (d: Date | string | null): string | null =>
  d === null ? null : new Date(d).toISOString()

/** As colunas lidas (com os joins de `selecionarOportunidades`). */
export const colunasDaOportunidade = {
  id: oportunidades.id,
  titulo: oportunidades.titulo,
  empresaId: oportunidades.empresaId,
  empresaRazaoSocial: empresas.razaoSocial,
  empresaNomeFantasia: empresas.nomeFantasia,
  contatoId: oportunidades.contatoId,
  contatoNome: contatos.nome,
  solucaoId: oportunidades.solucaoId,
  solucaoNome: solucoes.nome,
  origemId: oportunidades.origemId,
  origemNome: origens.nome,
  funilId: oportunidades.funilId,
  funilNome: funis.nome,
  faseId: oportunidades.faseId,
  faseNome: fase.nome,
  faseCor: fase.cor,
  faseDiasAlerta: fase.diasAlertaParada,
  status: oportunidades.status,
  faseParouId: oportunidades.faseParouEmId,
  faseParouNome: faseParou.nome,
  faseParouCor: faseParou.cor,
  motivoId: oportunidades.motivoId,
  motivoNome: motivos.nome,
  motivoDetalhe: oportunidades.motivoDetalhe,
  suspensaAte: oportunidades.suspensaAte,
  responsavelId: oportunidades.responsavelId,
  responsavelNome: responsavel.nome,
  valorUnico: oportunidades.valorUnico,
  valorMensal: oportunidades.valorMensal,
  meses: oportunidades.meses,
  valorTotal: oportunidades.valorTotal,
  valorPonderado: oportunidades.valorPonderado,
  probabilidade: oportunidades.probabilidade,
  probabilidadeManual: oportunidades.probabilidadeManual,
  dataPrevista: oportunidades.dataPrevistaFechamento,
  dataFechamento: oportunidades.dataFechamento,
  faseDesde: oportunidades.faseDesde,
  ultimaAtividadeEm: oportunidades.ultimaAtividadeEm,
  proximaId: proxima.id,
  proximaTitulo: proxima.titulo,
  proximaEm: proxima.dataInicio,
  proximaDiaInteiro: proxima.diaInteiro,
  proximaTipoIcone: tipoDaProxima.icone,
  proximaTipoCor: tipoDaProxima.cor,
  observacoes: oportunidades.observacoes,
  criadaEm: oportunidades.criadoEm,
}

/** Os joins que as consultas de oportunidade compartilham. */
export function selecionarOportunidades(db: Transacao, escopo: EscopoDaCarteira) {
  return db
    .select({
      ...colunasDaOportunidade,
      editavel: sql<boolean>`${condicaoDeEdicaoDaOportunidade(escopo) ?? sql`true`}`,
    })
    .from(oportunidades)
    .innerJoin(empresas, eq(empresas.id, oportunidades.empresaId))
    .innerJoin(funis, eq(funis.id, oportunidades.funilId))
    .innerJoin(fase, eq(fase.id, oportunidades.faseId))
    .innerJoin(responsavel, eq(responsavel.id, oportunidades.responsavelId))
    .leftJoin(faseParou, eq(faseParou.id, oportunidades.faseParouEmId))
    .leftJoin(contatos, eq(contatos.id, oportunidades.contatoId))
    .leftJoin(solucoes, eq(solucoes.id, oportunidades.solucaoId))
    .leftJoin(origens, eq(origens.id, oportunidades.origemId))
    .leftJoin(motivos, eq(motivos.id, oportunidades.motivoId))
    .leftJoin(
      proxima,
      and(eq(proxima.id, oportunidades.proximaAtividadeId), isNull(proxima.excluidoEm)),
    )
    .leftJoin(tipoDaProxima, eq(tipoDaProxima.id, proxima.tipoAtividadeId))
}

export type LinhaDeOportunidade = Awaited<ReturnType<typeof selecionarOportunidades>>[number]

const numero = (v: string): number => Number(v)

export function paraOportunidade(
  l: LinhaDeOportunidade,
  escopo: EscopoDaCarteira,
  agora: Date,
): Oportunidade {
  const referencia = Math.max(
    new Date(l.faseDesde).getTime(),
    l.ultimaAtividadeEm ? new Date(l.ultimaAtividadeEm).getTime() : 0,
  )
  const diasParada = Math.max(0, Math.floor((agora.getTime() - referencia) / MS_POR_DIA))
  return {
    id: l.id,
    titulo: l.titulo,
    empresa: { id: l.empresaId, nome: l.empresaNomeFantasia ?? l.empresaRazaoSocial },
    contato: l.contatoId !== null ? { id: l.contatoId, nome: l.contatoNome ?? '' } : null,
    solucao: l.solucaoId !== null ? { id: l.solucaoId, nome: l.solucaoNome ?? '' } : null,
    origem: l.origemId !== null ? { id: l.origemId, nome: l.origemNome ?? '' } : null,
    funil: { id: l.funilId, nome: l.funilNome },
    fase: { id: l.faseId, nome: l.faseNome, cor: l.faseCor },
    status: l.status,
    faseParouEm:
      l.faseParouId !== null && l.faseParouNome !== null && l.faseParouCor !== null
        ? { id: l.faseParouId, nome: l.faseParouNome, cor: l.faseParouCor }
        : null,
    motivo: l.motivoId !== null ? { id: l.motivoId, nome: l.motivoNome ?? '' } : null,
    motivoDetalhe: l.motivoDetalhe,
    suspensaAte: l.suspensaAte,
    responsavel: { id: l.responsavelId, nome: l.responsavelNome },
    valorUnico: numero(l.valorUnico),
    valorMensal: numero(l.valorMensal),
    meses: l.meses,
    valorTotal: numero(l.valorTotal),
    valorPonderado: numero(l.valorPonderado),
    probabilidade: l.probabilidade,
    probabilidadeManual: l.probabilidadeManual,
    dataPrevistaFechamento: l.dataPrevista,
    dataFechamento: iso(l.dataFechamento),
    faseDesde: new Date(l.faseDesde).toISOString(),
    diasParada,
    parada: l.status === 'ativo' && l.faseDiasAlerta !== null && diasParada >= l.faseDiasAlerta,
    ultimaAtividadeEm: iso(l.ultimaAtividadeEm),
    proximaAtividade:
      l.proximaId !== null && l.proximaEm !== null
        ? {
            id: l.proximaId,
            titulo: l.proximaTitulo ?? '',
            em: new Date(l.proximaEm).toISOString(),
            diaInteiro: l.proximaDiaInteiro ?? false,
            tipoIcone: l.proximaTipoIcone ?? 'calendar',
            tipoCor: l.proximaTipoCor ?? 'gray',
          }
        : null,
    observacoes: l.observacoes,
    criadaEm: new Date(l.criadaEm).toISOString(),
    editavel: l.editavel,
    excluivel: escopo.papel !== 'vendedor',
    empresaViraClientePadrao: escopo.clienteAoConquistar,
  }
}

/** Uma oportunidade que o usuário vê, ou `undefined`. */
export async function lerOportunidade(
  db: Transacao,
  escopo: EscopoDaCarteira,
  id: string,
  agora: Date,
): Promise<Oportunidade | undefined> {
  const [linha] = await selecionarOportunidades(db, escopo).where(
    and(
      eq(oportunidades.id, id),
      isNull(oportunidades.excluidoEm),
      condicaoDeVisibilidadeDaOportunidade(escopo),
    ),
  )
  return linha ? paraOportunidade(linha, escopo, agora) : undefined
}
