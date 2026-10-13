import type { Contato } from '@leadtogo/api-client'
import type { AlterarContatoEntrada, CriarContatoEntrada, TipoEmail } from '@leadtogo/shared'

/** Tipo do telefone na tela: vazio = "automático" (a API decide pelo número: fixo ou celular). */
export type TipoDoTelefoneNaTela = '' | 'celular' | 'fixo' | 'whatsapp' | 'outro'

export interface TelefoneDoFormulario {
  chave: string
  numero: string
  tipo: TipoDoTelefoneNaTela
  principal: boolean
}
export interface EmailDoFormulario {
  chave: string
  email: string
  tipo: TipoEmail
  principal: boolean
}

export interface FormularioDeContato {
  nome: string
  papelDecisaoId: string
  dia: string
  mes: string
  linkedin: string
  observacoes: string
  telefones: TelefoneDoFormulario[]
  emails: EmailDoFormulario[]
  /** "Pediu para não receber contato": desliga WhatsApp e e-mail juntos */
  naoQuerContato: boolean
  /** A pessoa mexeu na chave do consentimento (senão o consentimento não vai no corpo) */
  consentimentoMexido: boolean
  // O primeiro vínculo (só no cadastro)
  empresaId: string
  empresaNome: string
  cargo: string
  principal: boolean
}

let sequencia = 0
export const novaChave = (prefixo: string) => `${prefixo}-${(sequencia += 1)}`

export const formularioVazio = (): FormularioDeContato => ({
  nome: '',
  papelDecisaoId: '',
  dia: '',
  mes: '',
  linkedin: '',
  observacoes: '',
  telefones: [],
  emails: [],
  naoQuerContato: false,
  consentimentoMexido: false,
  empresaId: '',
  empresaNome: '',
  cargo: '',
  principal: false,
})

/** O contato vira o formulário da edição. */
export function formularioDoContato(c: Contato): FormularioDeContato {
  return {
    ...formularioVazio(),
    nome: c.nome,
    papelDecisaoId: c.papelDecisao?.id ?? '',
    dia: c.aniversario ? String(c.aniversario.dia) : '',
    mes: c.aniversario ? String(c.aniversario.mes) : '',
    linkedin: c.linkedinUrl ?? '',
    observacoes: c.observacoes ?? '',
    telefones: c.telefones.map((t) => ({
      chave: t.id,
      numero: t.numero,
      tipo: t.tipo,
      principal: t.principal,
    })),
    emails: c.emails.map((e) => ({
      chave: e.id,
      email: e.email,
      tipo: e.tipo,
      principal: e.principal,
    })),
    naoQuerContato: !c.aceitaWhatsapp && !c.aceitaEmail,
  }
}

const aniversarioDoFormulario = (f: FormularioDeContato) =>
  f.dia && f.mes ? { dia: Number(f.dia), mes: Number(f.mes) } : null

/** Erro de preenchimento que dá para dizer antes de enviar. */
export function validarContato(f: FormularioDeContato): Record<string, string> {
  const erros: Record<string, string> = {}
  if (f.nome.trim().length < 2) erros['nome'] = 'Informe o nome do contato.'
  if (Boolean(f.dia) !== Boolean(f.mes)) {
    erros['aniversario'] = 'Informe o dia e o mês do aniversário, ou deixe os dois em branco.'
  }
  return erros
}

const telefonesParaEnviar = (f: FormularioDeContato) =>
  f.telefones
    .filter((t) => t.numero.trim() !== '')
    .map((t) => ({
      numero: t.numero,
      ...(t.tipo ? { tipo: t.tipo } : {}),
      principal: t.principal,
    }))
const emailsParaEnviar = (f: FormularioDeContato) =>
  f.emails
    .filter((e) => e.email.trim() !== '')
    .map((e) => ({ email: e.email, tipo: e.tipo, principal: e.principal }))

/** O que a API recebe no cadastro. */
export function corpoDoCadastroDeContato(
  f: FormularioDeContato,
  ignorarDuplicado: boolean,
): CriarContatoEntrada {
  return {
    nome: f.nome.trim(),
    ...(f.papelDecisaoId ? { papelDecisaoId: f.papelDecisaoId } : {}),
    aniversario: aniversarioDoFormulario(f),
    linkedinUrl: f.linkedin,
    observacoes: f.observacoes,
    telefones: telefonesParaEnviar(f),
    emails: emailsParaEnviar(f),
    ...(f.consentimentoMexido
      ? { aceitaWhatsapp: !f.naoQuerContato, aceitaEmail: !f.naoQuerContato }
      : {}),
    ...(f.empresaId
      ? { vinculo: { empresaId: f.empresaId, cargo: f.cargo, principal: f.principal } }
      : {}),
    ...(ignorarDuplicado ? { ignorarDuplicado: true } : {}),
  }
}

/** O que a API recebe na edição (tudo da pessoa; o vínculo não entra). */
export function corpoDaEdicaoDeContato(
  f: FormularioDeContato,
  ignorarDuplicado: boolean,
): AlterarContatoEntrada {
  return {
    nome: f.nome.trim(),
    papelDecisaoId: f.papelDecisaoId === '' ? null : f.papelDecisaoId,
    aniversario: aniversarioDoFormulario(f),
    linkedinUrl: f.linkedin,
    observacoes: f.observacoes,
    telefones: telefonesParaEnviar(f),
    emails: emailsParaEnviar(f),
    ...(f.consentimentoMexido
      ? { aceitaWhatsapp: !f.naoQuerContato, aceitaEmail: !f.naoQuerContato }
      : {}),
    ...(ignorarDuplicado ? { ignorarDuplicado: true } : {}),
  }
}
