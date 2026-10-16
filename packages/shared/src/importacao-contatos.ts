import { z } from 'zod'

import { aniversarioSchema } from './carteira-contatos.js'
import { INVALIDO, lerAniversario, lerLinkedin, lerSimNao } from './importacao-leitura.js'
import { type TipoDeTelefone, normalizarTelefone } from './telefone.js'

// Importação de contatos por planilha (docs/funcionalidades.md, "Importação de contatos e de atividades").
// Funções puras: a prévia e o executor leem a linha pelo MESMO código, então a prévia prevê o que o worker faz.

/** Os campos que o mapeamento aceita para contatos; `*` = obrigatório. */
export const CAMPOS_DO_CONTATO_NA_IMPORTACAO = [
  { chave: 'documento', rotulo: 'CNPJ da empresa', obrigatorio: true },
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
  { chave: 'cargo', rotulo: 'Cargo', obrigatorio: false },
  { chave: 'email', rotulo: 'E-mail', obrigatorio: false },
  { chave: 'telefone', rotulo: 'Telefone', obrigatorio: false },
  { chave: 'celular', rotulo: 'Celular/WhatsApp', obrigatorio: false },
  { chave: 'papel', rotulo: 'Papel na decisão', obrigatorio: false },
  { chave: 'aniversario', rotulo: 'Aniversário (dia/mês)', obrigatorio: false },
  { chave: 'linkedin', rotulo: 'LinkedIn', obrigatorio: false },
  { chave: 'principal', rotulo: 'Principal (sim/não)', obrigatorio: false },
  { chave: 'naoQuerContato', rotulo: 'Não quer contato (sim/não)', obrigatorio: false },
  { chave: 'observacoes', rotulo: 'Observações', obrigatorio: false },
] as const

/** O contato como a linha o descreve (ainda sem o banco: o papel é só o nome que veio). */
export interface ContatoDaLinha {
  nome: string
  cargo: string | null
  email: string | null
  /** Telefone e celular, sem repetir o mesmo número; o primeiro é o principal */
  telefones: { numero: string; e164: string; tipo: TipoDeTelefone }[]
  /** O nome do papel como veio; a busca no cadastro é do executor */
  papel: string | null
  aniversario: { dia: number; mes: number } | null
  linkedin: string | null
  principal: boolean
  naoQuerContato: boolean
  observacoes: string | null
}

export type LeituraDoContato =
  { ok: true; contato: ContatoDaLinha; avisos: string[] } | { ok: false; motivo: string }

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
const celula = (dados: Record<string, string>, campos: Record<string, string>, campo: string) =>
  (campos[campo] ? (dados[campos[campo]] ?? '') : '').trim()
const vazioParaNulo = (v: string): string | null => (v === '' ? null : v)

/**
 * Lê uma linha da planilha de contatos. E-mail ou telefone inválido PULA a linha (servem para achar
 * duplicados); aniversário ou LinkedIn inválido entra sem o campo, com aviso; "Não quer contato" que não é
 * sim nem não PULA (é dado de privacidade: na dúvida, não se importa).
 */
export function lerLinhaDeContato(
  dados: Record<string, string>,
  campos: Record<string, string>,
): LeituraDoContato {
  const nome = celula(dados, campos, 'nome').replace(/\s+/g, ' ')
  if (nome.length < 2) {
    return { ok: false, motivo: nome === '' ? 'Nome em branco.' : 'Nome com menos de 2 letras.' }
  }
  if (nome.length > 200) return { ok: false, motivo: 'Nome com mais de 200 letras.' }

  const avisos: string[] = []
  const emailBruto = celula(dados, campos, 'email')
  let email: string | null = null
  if (emailBruto !== '') {
    const r = emailSchema.safeParse(emailBruto)
    if (!r.success) return { ok: false, motivo: `E-mail inválido: ${emailBruto.slice(0, 60)}.` }
    email = r.data
  }

  const telefones: ContatoDaLinha['telefones'] = []
  for (const [campo, rotulo] of [
    ['telefone', 'Telefone'],
    ['celular', 'Celular'],
  ] as const) {
    const bruto = celula(dados, campos, campo)
    if (bruto === '') continue
    const t = normalizarTelefone(bruto)
    if (!t) return { ok: false, motivo: `${rotulo} inválido: ${bruto.slice(0, 40)}.` }
    if (!telefones.some((x) => x.e164 === t.e164)) telefones.push(t)
  }

  const aniversario = lerAniversario(celula(dados, campos, 'aniversario'))
  if (aniversario === INVALIDO) {
    avisos.push(
      `Aniversário inválido (${celula(dados, campos, 'aniversario').slice(0, 20)}): o contato entrou sem ele.`,
    )
  }
  const linkedin = lerLinkedin(celula(dados, campos, 'linkedin'))
  if (linkedin === INVALIDO) {
    avisos.push('LinkedIn inválido (use o endereço do perfil): o contato entrou sem ele.')
  }

  const principal = lerSimNao(celula(dados, campos, 'principal'))
  if (principal === INVALIDO) {
    avisos.push(
      `Principal: "${celula(dados, campos, 'principal').slice(0, 20)}" não é sim nem não; tratado como não.`,
    )
  }
  const naoQuer = lerSimNao(celula(dados, campos, 'naoQuerContato'))
  if (naoQuer === INVALIDO) {
    return {
      ok: false,
      motivo: `Não quer contato: "${celula(dados, campos, 'naoQuerContato').slice(0, 20)}" não é sim nem não. Corrija para não importar uma pessoa que pediu para não ser contatada.`,
    }
  }

  const observacoes = celula(dados, campos, 'observacoes')
  return {
    ok: true,
    contato: {
      nome,
      cargo: vazioParaNulo(celula(dados, campos, 'cargo').slice(0, 100)),
      email,
      telefones,
      papel: vazioParaNulo(celula(dados, campos, 'papel')),
      aniversario:
        aniversario === INVALIDO || aniversario === null
          ? null
          : aniversarioSchema.parse(aniversario),
      linkedin: linkedin === INVALIDO ? null : linkedin,
      principal: principal === true,
      naoQuerContato: naoQuer === true,
      observacoes: vazioParaNulo(observacoes.slice(0, 5000)),
    },
    avisos,
  }
}
