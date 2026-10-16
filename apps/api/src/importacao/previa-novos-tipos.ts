import { type schema, sql } from '@leadtogo/db'
import {
  decidirAtividade,
  documentoDaPlanilha,
  lerLinhaDeAtividade,
  lerLinhaDeContato,
  paraComparar,
  PROBLEMAS_NA_PREVIA,
  type PreviaDaImportacao,
} from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { arraySql } from './sql-array.js'

type Lote = typeof schema.importacoes.$inferSelect
export interface LinhaDaPlanilha {
  numero: number
  dados: Record<string, string>
}

/** Acumula as contagens e os primeiros problemas da prévia de contatos ou de atividades. */
export class Acumulador {
  readonly previsao: Record<string, number> = {}
  readonly problemas: PreviaDaImportacao['problemas'] = []
  comAviso = 0
  semCnpjValido = 0
  conta(resultado: string) {
    this.previsao[resultado] = (this.previsao[resultado] ?? 0) + 1
  }
  anota(numero: number, motivo: string) {
    if (this.problemas.length < PROBLEMAS_NA_PREVIA) this.problemas.push({ numero, motivo })
  }
  paraPrevia(totalLinhas: number, aImportar: number): PreviaDaImportacao {
    return {
      totalLinhas,
      aImportar,
      semCnpjValido: this.semCnpjValido,
      repetidasNaPlanilha: 0,
      jaNaCarteira: 0,
      consultaAReceita: false,
      consultasNecessarias: 0,
      estimativaSegundos: 0,
      problemas: this.problemas,
      previsao: this.previsao,
      comAviso: this.comAviso,
    }
  }
}

/** Empresa (id) de cada CNPJ da planilha que está na carteira. */
export async function empresasPorDocumento(
  db: Transacao,
  documentos: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(documentos)]
  for (let i = 0; i < unicos.length; i += 2000) {
    const rs = await db.execute<{ id: string; documento: string }>(sql`
      SELECT id, documento FROM empresas
      WHERE documento = ANY(${arraySql(unicos.slice(i, i + 2000), 'text')}) AND excluido_em IS NULL`)
    for (const r of rs) mapa.set(r.documento, r.id)
  }
  return mapa
}

/**
 * Prévia da importação de contatos: lê cada linha pelo MESMO código do worker (`lerLinhaDeContato`),
 * cruza com a carteira e com os contatos que já existem (e-mail e telefone) e diz quantas linhas terão
 * cada resultado. Nada é gravado. Contato repetido na própria planilha vale como "já existe" a partir
 * da segunda linha, como o worker fará.
 */
export async function preverContatos(
  db: Transacao,
  lote: Lote,
  linhas: LinhaDaPlanilha[],
): Promise<PreviaDaImportacao> {
  const campos = (lote.mapeamento as { campos?: Record<string, string> }).campos ?? {}
  const colunaDoCnpj = campos['documento'] as string
  const acc = new Acumulador()

  const lidas = linhas.map((l) => ({
    numero: l.numero,
    documento: documentoDaPlanilha(l.dados[colunaDoCnpj] ?? ''),
    leitura: lerLinhaDeContato(l.dados, campos),
  }))
  const empresas = await empresasPorDocumento(
    db,
    lidas.flatMap((l) => (l.documento ? [l.documento] : [])),
  )
  const emails = [
    ...new Set(
      lidas.flatMap((l) =>
        l.leitura.ok && l.leitura.contato.email ? [l.leitura.contato.email] : [],
      ),
    ),
  ]
  const telefones = [
    ...new Set(
      lidas.flatMap((l) => (l.leitura.ok ? l.leitura.contato.telefones.map((t) => t.e164) : [])),
    ),
  ]
  // contato existente por e-mail e por telefone (o mais antigo)
  const porEmail = new Map<string, string>()
  const porTelefone = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 2000) {
    const rs = await db.execute<{ email: string; id: string }>(sql`
      SELECT DISTINCT ON (e.email) e.email::text AS email, c.id
      FROM contato_emails e JOIN contatos c ON c.id = e.contato_id
      WHERE e.email = ANY(${arraySql(emails.slice(i, i + 2000), 'citext')}) AND c.excluido_em IS NULL
      ORDER BY e.email, c.criado_em, c.id`)
    for (const r of rs) porEmail.set(r.email.toLowerCase(), r.id)
  }
  for (let i = 0; i < telefones.length; i += 2000) {
    const rs = await db.execute<{ numero: string; id: string }>(sql`
      SELECT DISTINCT ON (t.numero_e164) t.numero_e164 AS numero, c.id
      FROM contato_telefones t JOIN contatos c ON c.id = t.contato_id
      WHERE t.numero_e164 = ANY(${arraySql(telefones.slice(i, i + 2000), 'text')}) AND c.excluido_em IS NULL
      ORDER BY t.numero_e164, c.criado_em, c.id`)
    for (const r of rs) porTelefone.set(r.numero, r.id)
  }
  // vínculos ativos que já existem entre esses contatos e as empresas da planilha
  const vinculados = new Set<string>()
  const idsDeContatos = [...new Set([...porEmail.values(), ...porTelefone.values()])]
  for (let i = 0; i < idsDeContatos.length; i += 2000) {
    const rs = await db.execute<{ empresa_id: string; contato_id: string }>(sql`
      SELECT empresa_id, contato_id FROM empresa_contatos
      WHERE contato_id = ANY(${arraySql(idsDeContatos.slice(i, i + 2000), 'uuid')}) AND ativo`)
    for (const r of rs) vinculados.add(`${r.empresa_id}:${r.contato_id}`)
  }
  const papeis = new Set(
    (
      await db.execute<{ nome: string }>(
        sql`SELECT nome FROM papeis_decisao WHERE ativo AND excluido_em IS NULL`,
      )
    ).map((p) => paraComparar(p.nome)),
  )

  // Contatos que a própria planilha criaria (id virtual), para a segunda linha do mesmo e-mail ou telefone
  let virtual = 0
  const virtualPorChave = new Map<string, string>()
  let aImportar = 0
  for (const l of lidas) {
    if (!l.documento) {
      acc.semCnpjValido += 1
      acc.conta('pulada_sem_cnpj')
      acc.anota(l.numero, 'CNPJ em branco ou inválido')
      continue
    }
    if (!l.leitura.ok) {
      acc.conta('pulada_invalida')
      acc.anota(l.numero, l.leitura.motivo)
      continue
    }
    const empresaId = empresas.get(l.documento)
    if (!empresaId) {
      acc.conta('pulada_empresa_inexistente')
      acc.anota(l.numero, `O CNPJ ${l.documento} não está na carteira`)
      continue
    }
    const c = l.leitura.contato
    const chaves = [...(c.email ? [`e:${c.email}`] : []), ...c.telefones.map((t) => `t:${t.e164}`)]
    const existente =
      (c.email ? porEmail.get(c.email) : undefined) ??
      c.telefones.map((t) => porTelefone.get(t.e164)).find((x) => x !== undefined) ??
      chaves.map((k) => virtualPorChave.get(k)).find((x) => x !== undefined)
    let avisos = l.leitura.avisos.length
    if (c.papel && !papeis.has(paraComparar(c.papel))) avisos += 1
    if (existente) {
      const ja = vinculados.has(`${empresaId}:${existente}`)
      vinculados.add(`${empresaId}:${existente}`)
      if (ja) acc.conta('ja_vinculada')
      else {
        acc.conta('vinculada')
        aImportar += 1
      }
      if (c.naoQuerContato) avisos += 1
    } else {
      const id = `virtual-${(virtual += 1)}`
      for (const k of chaves) virtualPorChave.set(k, id)
      vinculados.add(`${empresaId}:${id}`)
      acc.conta('criada')
      aImportar += 1
    }
    if (avisos > 0) acc.comAviso += 1
  }
  return acc.paraPrevia(linhas.length, aImportar)
}

/** O valor da coluna Tipo (sem acento e em minúsculas) → tipo cadastrado; `null` = pular essas linhas. */
export type MapaDeTipos = Map<string, { id: string; nome: string } | null>

/**
 * O que a pessoa apontou no mapeamento vale; o resto casa pelo nome do tipo cadastrado (sem maiúsculas,
 * acento nem pontuação). Quem monta o mapa é o worker e a prévia, para os dois lerem igual.
 */
export function montarMapaDeTipos(
  cadastrados: { id: string; nome: string }[],
  escolhidos: Record<string, string | null>,
): MapaDeTipos {
  const mapa: MapaDeTipos = new Map()
  for (const t of cadastrados) mapa.set(paraComparar(t.nome), { id: t.id, nome: t.nome })
  for (const [chave, id] of Object.entries(escolhidos)) {
    mapa.set(chave, id === null ? null : (cadastrados.find((t) => t.id === id) ?? null))
  }
  return mapa
}

/** Prévia da importação de atividades: o mesmo código do worker (`lerLinhaDeAtividade` e `decidirAtividade`). */
export async function preverAtividades(
  db: Transacao,
  lote: Lote,
  linhas: LinhaDaPlanilha[],
  tenantId: string,
  fuso: string,
): Promise<PreviaDaImportacao> {
  const mapeamento = lote.mapeamento as {
    campos?: Record<string, string>
    tipos?: Record<string, string | null>
  }
  const campos = mapeamento.campos ?? {}
  const colunaDoCnpj = campos['documento'] as string
  const acc = new Acumulador()
  const agora = new Date()

  const cadastrados = await db.execute<{ id: string; nome: string }>(
    sql`SELECT id, nome FROM tipos_atividade WHERE ativo AND excluido_em IS NULL`,
  )
  const tipos = montarMapaDeTipos(cadastrados, mapeamento.tipos ?? {})
  const lidas = linhas.map((l) => ({
    numero: l.numero,
    documento: documentoDaPlanilha(l.dados[colunaDoCnpj] ?? ''),
    leitura: lerLinhaDeAtividade(l.dados, campos),
  }))
  const empresas = await empresasPorDocumento(
    db,
    lidas.flatMap((l) => (l.documento ? [l.documento] : [])),
  )
  // Atividades que já existem com a mesma empresa, tipo, data e título (para o "já existe")
  const existentes = new Set<string>()
  const idsDeEmpresas = [...new Set(empresas.values())]
  for (let i = 0; i < idsDeEmpresas.length; i += 2000) {
    const rs = await db.execute<{
      empresa_id: string
      tipo_atividade_id: string
      inicio: string
      titulo: string
    }>(sql`
      SELECT empresa_id, tipo_atividade_id, data_inicio::text AS inicio, titulo FROM atividades
      WHERE empresa_id = ANY(${arraySql(idsDeEmpresas.slice(i, i + 2000), 'uuid')}) AND excluido_em IS NULL
        AND importacao_id IS DISTINCT FROM ${lote.id}::uuid`)
    for (const r of rs) {
      existentes.add(
        `${r.empresa_id}|${r.tipo_atividade_id}|${new Date(r.inicio).toISOString()}|${r.titulo}`,
      )
    }
  }
  const vistas = new Set<string>()
  let aImportar = 0
  let comoVoce = 0
  void tenantId
  for (const l of lidas) {
    if (!l.documento) {
      acc.semCnpjValido += 1
      acc.conta('pulada_sem_cnpj')
      acc.anota(l.numero, 'CNPJ em branco ou inválido')
      continue
    }
    if (!l.leitura.ok) {
      acc.conta('pulada_invalida')
      acc.anota(l.numero, l.leitura.motivo)
      continue
    }
    const a = l.leitura.atividade
    const tipo = tipos.get(paraComparar(a.tipo))
    if (!tipo) {
      acc.conta('pulada_tipo_inexistente')
      acc.anota(l.numero, `Tipo "${a.tipo.slice(0, 40)}" sem correspondência`)
      continue
    }
    const decisao = decidirAtividade(a, agora, fuso)
    if (!decisao.ok) {
      acc.conta(decisao.resultado)
      acc.anota(l.numero, decisao.motivo)
      continue
    }
    const empresaId = empresas.get(l.documento)
    if (!empresaId) {
      acc.conta('pulada_empresa_inexistente')
      acc.anota(l.numero, `O CNPJ ${l.documento} não está na carteira`)
      continue
    }
    const chave = `${empresaId}|${tipo.id}|${decisao.dataInicio.toISOString()}|${a.titulo ?? tipo.nome}`
    if (existentes.has(chave) || vistas.has(chave)) {
      acc.conta('pulada_duplicada')
      acc.anota(l.numero, 'Já existe uma atividade igual')
      continue
    }
    vistas.add(chave)
    acc.conta('criada')
    aImportar += 1
    if (l.leitura.avisos.length + decisao.avisos.length > 0) acc.comAviso += 1
    if (!a.emailResponsavel) comoVoce += 1
  }
  const previa = acc.paraPrevia(linhas.length, aImportar)
  // quantas ficarão com quem importa como responsável (sem o e-mail do responsável)
  previa.previsao = { ...previa.previsao, ficam_com_voce: comoVoce }
  return previa
}
