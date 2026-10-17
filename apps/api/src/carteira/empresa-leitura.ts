import { and, asc, eq, isNull, schema, sql } from '@leadtogo/db'
import { type EmpresaCarteira, normalizarRespostaDaReceita } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { CHAVE_TAG_ENDERECO_A_CONFIRMAR } from '@leadtogo/db'
import { coordenadasDaEmpresa, montarPosicao } from '../geolocalizacao/posicao.js'
import {
  condicaoDeVisibilidade,
  type EscopoDaCarteira,
  podeEditar,
  podeExcluir,
  podeTransferir,
} from './regras-de-carteira.js'

const {
  empresas,
  empresaTelefones,
  empresaCnaes,
  empresaSocios,
  empresaTags,
  membros,
  verticais,
  municipios,
  portes,
  cnaes,
  qualificacoesSocio,
  tags,
} = schema

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)
const nomeDe = (e: { nomeFantasia: string | null; razaoSocial: string }): string =>
  e.nomeFantasia ?? e.razaoSocial

/** A situação da última consulta guardada na Receita (nunca é um campo da empresa). */
export async function situacaoDaReceita(
  tx: Transacao,
  cnpj: string,
): Promise<EmpresaCarteira['receita']> {
  const [linha] = await tx.execute<{ dados: unknown; consultado_em: Date | string }>(
    sql`SELECT dados, consultado_em FROM receita_consultas WHERE cnpj = ${cnpj}`,
  )
  if (!linha) return null
  try {
    const bruto: unknown = typeof linha.dados === 'string' ? JSON.parse(linha.dados) : linha.dados
    const { situacao } = normalizarRespostaDaReceita(bruto)
    return {
      situacao: situacao.descricao,
      motivo: situacao.motivo,
      ativa: situacao.ativa,
      desde: situacao.desde,
      consultadoEm: new Date(linha.consultado_em).toISOString(),
    }
  } catch {
    return null // cache em formato que não lê mais: como se não houvesse
  }
}

/** A empresa completa (ficha), ou `null` se não existe, foi excluída ou o usuário não a vê. */
export async function lerEmpresa(
  tx: Transacao,
  escopo: EscopoDaCarteira,
  id: string,
): Promise<EmpresaCarteira | null> {
  const [e] = await tx
    .select({
      e: empresas,
      vendedorNome: membros.nome,
      verticalNome: verticais.nome,
      verticalCor: verticais.cor,
      porteDescricao: portes.descricao,
      municipioNome: municipios.nome,
      municipioUf: municipios.uf,
    })
    .from(empresas)
    .innerJoin(membros, eq(membros.id, empresas.vendedorId))
    .leftJoin(verticais, eq(verticais.id, empresas.verticalId))
    .leftJoin(portes, eq(portes.codigo, empresas.porteCodigo))
    .leftJoin(municipios, eq(municipios.codigoIbge, empresas.municipioCodigo))
    .where(and(eq(empresas.id, id), isNull(empresas.excluidoEm), condicaoDeVisibilidade(escopo)))
  if (!e) return null
  const r = e.e

  const [telefones, cnaesDaEmpresa, socios, tagsDaEmpresa, matrizes, filiais, receita] =
    await Promise.all([
      tx
        .select()
        .from(empresaTelefones)
        .where(eq(empresaTelefones.empresaId, id))
        .orderBy(asc(empresaTelefones.criadoEm), asc(empresaTelefones.id)),
      tx
        .select({
          codigo: empresaCnaes.cnaeCodigo,
          descricao: cnaes.descricao,
          principal: empresaCnaes.principal,
        })
        .from(empresaCnaes)
        .innerJoin(cnaes, eq(cnaes.codigo, empresaCnaes.cnaeCodigo))
        .where(eq(empresaCnaes.empresaId, id))
        .orderBy(asc(empresaCnaes.cnaeCodigo)),
      tx
        .select({
          id: empresaSocios.id,
          nome: empresaSocios.nome,
          qualificacaoTexto: empresaSocios.qualificacaoTexto,
          contatoId: empresaSocios.contatoId,
          qualificacaoDescricao: qualificacoesSocio.descricao,
        })
        .from(empresaSocios)
        .leftJoin(
          qualificacoesSocio,
          eq(qualificacoesSocio.codigo, empresaSocios.qualificacaoCodigo),
        )
        .where(eq(empresaSocios.empresaId, id))
        .orderBy(asc(empresaSocios.criadoEm), asc(empresaSocios.id)),
      tx
        .select({
          id: tags.id,
          nome: tags.nome,
          cor: tags.cor,
          tagGrupoId: tags.tagGrupoId,
          automatica: empresaTags.automatica,
        })
        .from(empresaTags)
        .innerJoin(tags, eq(tags.id, empresaTags.tagId))
        .where(eq(empresaTags.empresaId, id))
        .orderBy(asc(tags.ordem), asc(tags.nome)),
      r.matrizId
        ? tx
            .select({
              id: empresas.id,
              razaoSocial: empresas.razaoSocial,
              nomeFantasia: empresas.nomeFantasia,
            })
            .from(empresas)
            .where(
              and(
                eq(empresas.id, r.matrizId),
                isNull(empresas.excluidoEm),
                condicaoDeVisibilidade(escopo),
              ),
            )
        : Promise.resolve([]),
      r.matrizFilial === 'matriz'
        ? tx
            .select({
              id: empresas.id,
              razaoSocial: empresas.razaoSocial,
              nomeFantasia: empresas.nomeFantasia,
              documento: empresas.documento,
            })
            .from(empresas)
            .where(
              and(
                eq(empresas.matrizId, id),
                isNull(empresas.excluidoEm),
                condicaoDeVisibilidade(escopo),
              ),
            )
            .orderBy(asc(empresas.documento))
        : Promise.resolve([]),
      r.tipoDocumento === 'cnpj' && r.documento ? situacaoDaReceita(tx, r.documento) : null,
    ])

  const coordenadas = r.localizacao ? await coordenadasDaEmpresa(tx, id) : null
  const comTagAConfirmar =
    (
      await tx.execute<{ id: string }>(sql`
    SELECT t.id FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
    WHERE et.empresa_id = ${id} AND t.chave_sistema = ${CHAVE_TAG_ENDERECO_A_CONFIRMAR}`)
    ).length > 0
  const matriz = matrizes[0]
  return {
    id: r.id,
    tipoDocumento: r.tipoDocumento,
    documento: r.documento,
    matrizFilial: r.matrizFilial,
    matriz: matriz ? { id: matriz.id, nome: nomeDe(matriz) } : null,
    filiais: filiais.map((f) => ({ id: f.id, nome: nomeDe(f), documento: f.documento })),
    razaoSocial: r.razaoSocial,
    nomeFantasia: r.nomeFantasia,
    nome: nomeDe(r),
    mei: r.mei,
    dataInicioAtividades: r.dataInicioAtividades,
    porte:
      r.porteCodigo !== null && e.porteDescricao !== null
        ? { codigo: r.porteCodigo, descricao: e.porteDescricao }
        : null,
    regimeTributario: r.regimeTributario,
    vendedor: { id: r.vendedorId, nome: e.vendedorNome },
    vertical:
      r.verticalId !== null && e.verticalNome !== null && e.verticalCor !== null
        ? { id: r.verticalId, nome: e.verticalNome, cor: e.verticalCor }
        : null,
    website: r.website,
    endereco: {
      cep: r.cep,
      tipoLogradouro: r.tipoLogradouro,
      logradouro: r.logradouro,
      numero: r.numero,
      complemento: r.complemento,
      bairro: r.bairro,
      municipio:
        r.municipioCodigo !== null && e.municipioNome !== null && e.municipioUf !== null
          ? { codigoIbge: r.municipioCodigo, nome: e.municipioNome, uf: e.municipioUf }
          : null,
      paisCodigo: r.paisCodigo,
    },
    posicao: montarPosicao({ ...r, municipioNome: e.municipioNome }, coordenadas, comTagAConfirmar),
    observacoes: r.observacoes,
    origemCadastro: r.origemCadastro,
    telefones: telefones.map((t) => ({
      id: t.id,
      numero: t.numero,
      e164: t.numeroE164,
      tipo: t.tipo,
      descricao: t.descricao,
      principal: t.principal,
    })),
    cnaes: cnaesDaEmpresa,
    socios: socios.map((s) => ({
      id: s.id,
      nome: s.nome,
      qualificacao: s.qualificacaoDescricao ?? s.qualificacaoTexto,
      contatoId: s.contatoId,
    })),
    tags: tagsDaEmpresa,
    receita,
    situacaoNaoVerificada: r.situacaoNaoVerificada,
    receitaAtualizadoEm: iso(r.receitaAtualizadoEm),
    ultimaVisitaEm: iso(r.ultimaVisitaEm),
    ultimoContatoEm: iso(r.ultimoContatoEm),
    proximaAtividadeEm: iso(r.proximaAtividadeEm),
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
    permissoes: {
      editar: podeEditar(escopo, r.vendedorId),
      excluir: podeExcluir(escopo),
      transferir: podeTransferir(escopo),
    },
  }
}
