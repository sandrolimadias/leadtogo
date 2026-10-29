import { or, schema, sql, type SQL } from '@leadtogo/db'

/**
 * Busca por texto da carteira, compartilhada pelas listas (empresas, contatos, oportunidades) e pela busca global:
 * sem acento e sem diferença de caixa, do mesmo jeito que os índices trigram (`lower(f_unaccent(...))`).
 */

const { contatoEmails, contatoTelefones, contatos, empresas, municipios, oportunidades } = schema

/** Texto sem acento e em minúsculas, do mesmo jeito que os índices de busca (`f_unaccent`). */
export const semAcento = (valor: unknown) => sql`lower(f_unaccent(${valor}))`

/** Escapa `%`, `_` e `\` para o texto digitado valer literalmente no LIKE. */
export const literalParaLike = (texto: string): string => texto.replace(/[\\%_]/g, (c) => `\\${c}`)

/** O termo como pedaço (`%termo%`) ou como começo (`termo%`), já escapado para o LIKE. */
export const padraoContem = (texto: string): string => `%${literalParaLike(texto)}%`
export const padraoComeca = (texto: string): string => `${literalParaLike(texto)}%`

/**
 * Empresa: fantasia, razão social, cidade (exige o `LEFT JOIN municipios`) e documento, com ou sem máscara
 * (só quando o texto é um documento: dígitos e letras, com ou sem pontuação).
 */
export function buscaDaEmpresa(texto: string): SQL {
  const padrao = padraoContem(texto)
  const alternativas = [
    sql`${semAcento(empresas.razaoSocial)} LIKE ${semAcento(padrao)}`,
    sql`${semAcento(empresas.nomeFantasia)} LIKE ${semAcento(padrao)}`,
    sql`${semAcento(municipios.nome)} LIKE ${semAcento(padrao)}`,
  ]
  const documento = texto.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (documento.length >= 3 && documento === texto.replace(/[.\-/\s]/g, '').toUpperCase()) {
    alternativas.push(sql`${empresas.documento} LIKE ${`%${documento}%`}`)
  }
  return or(...alternativas) as SQL
}

/** Contato: nome, e-mail e telefone (só quando o texto é um telefone: dígitos, espaços, parênteses, + e -). */
export function buscaDoContato(texto: string): SQL {
  const padrao = padraoContem(texto)
  const alternativas = [
    sql`${semAcento(contatos.nome)} LIKE ${semAcento(padrao)}`,
    sql`EXISTS (SELECT 1 FROM ${contatoEmails} ce
      WHERE ce.contato_id = ${contatos.id} AND ce.email::text ILIKE ${padrao})`,
  ]
  const digitos = texto.replace(/\D/g, '')
  if (digitos.length >= 3 && digitos === texto.replace(/[\s()+-]/g, '')) {
    alternativas.push(sql`EXISTS (SELECT 1 FROM ${contatoTelefones} ct
      WHERE ct.contato_id = ${contatos.id} AND ct.numero_e164 LIKE ${`%${digitos}%`})`)
  }
  return or(...alternativas) as SQL
}

/** Oportunidade: título e nome da empresa (exige o `JOIN empresas`). */
export function buscaDaOportunidade(texto: string): SQL {
  const termo = padraoContem(texto.toLowerCase())
  return sql`(${semAcento(oportunidades.titulo)} LIKE ${semAcento(termo)} ESCAPE '\\'
    OR ${semAcento(empresas.razaoSocial)} LIKE ${semAcento(termo)} ESCAPE '\\'
    OR ${semAcento(sql`coalesce(${empresas.nomeFantasia}, '')`)} LIKE ${semAcento(termo)} ESCAPE '\\')`
}
