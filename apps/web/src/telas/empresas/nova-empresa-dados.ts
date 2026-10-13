import type { DadosDaReceita } from '@leadtogo/api-client'
import {
  type CriarEmpresaCarteiraEntrada,
  normalizarCnpj,
  normalizarTelefone,
  type RegimeTributario,
} from '@leadtogo/shared'

/** Porte pelo código da Receita (a tabela `portes` do sistema). */
export const PORTES: Record<number, string> = {
  0: 'Não informado',
  1: 'Micro Empresa',
  3: 'Empresa de Pequeno Porte',
  5: 'Demais',
}

export type TipoDeDocumento = 'cnpj' | 'cpf' | 'nenhum'

export interface TelefoneDoFormulario {
  /** Chave estável da linha */
  chave: string
  numero: string
  e164: string
  tipo: 'fixo' | 'celular' | 'outro'
  incluir: boolean
  whatsapp: boolean
  daReceita: boolean
}

export interface Formulario {
  razaoSocial: string
  nomeFantasia: string
  regimeTributario: RegimeTributario
  dataInicio: string
  mei: boolean
  porteCodigo: number | null
  cep: string
  tipoLogradouro: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipioCodigo: number | null
  municipioTexto: string
  paisCodigo: number | null
  telefones: TelefoneDoFormulario[]
  cnaes: { codigo: number; descricao: string; principal: boolean }[]
  socios: { nome: string; qualificacao: string | null }[]
  vendedorId: string
  verticalId: string
  statusTagId: string
  website: string
  observacoes: string
}

export const formularioVazio = (): Formulario => ({
  razaoSocial: '',
  nomeFantasia: '',
  regimeTributario: 'nao_informado',
  dataInicio: '',
  mei: false,
  porteCodigo: null,
  cep: '',
  tipoLogradouro: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  municipioCodigo: null,
  municipioTexto: '',
  paisCodigo: null,
  telefones: [],
  cnaes: [],
  socios: [],
  vendedorId: '',
  verticalId: '',
  statusTagId: '',
  website: '',
  observacoes: '',
})

/** Máscara do CNPJ, que aceita letras (CNPJ alfanumérico): 00.000.000/0000-00 */
export function mascararCnpj(valor: string): string {
  const s = valor
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 14)
  let o = s.slice(0, 2)
  if (s.length > 2) o += `.${s.slice(2, 5)}`
  if (s.length > 5) o += `.${s.slice(5, 8)}`
  if (s.length > 8) o += `/${s.slice(8, 12)}`
  if (s.length > 12) o += `-${s.slice(12)}`
  return o
}

/** 000.000.000-00 */
export function mascararCpf(valor: string): string {
  const s = valor.replace(/\D/g, '').slice(0, 11)
  let o = s.slice(0, 3)
  if (s.length > 3) o += `.${s.slice(3, 6)}`
  if (s.length > 6) o += `.${s.slice(6, 9)}`
  if (s.length > 9) o += `-${s.slice(9)}`
  return o
}

/** 00000-000 */
export function mascararCep(valor: string): string {
  const s = valor.replace(/\D/g, '').slice(0, 8)
  return s.length > 5 ? `${s.slice(0, 5)}-${s.slice(5)}` : s
}

/** Os dados da Receita viram o formulário (tudo editável, menos a cidade). */
export function formularioDaReceita(d: DadosDaReceita): Formulario {
  const e = d.endereco
  return {
    ...formularioVazio(),
    razaoSocial: d.razaoSocial,
    nomeFantasia: d.nomeFantasia ?? '',
    regimeTributario: d.regimeTributario,
    dataInicio: d.dataInicioAtividades ?? '',
    mei: d.mei,
    porteCodigo: d.porteCodigo,
    cep: e.cep ? mascararCep(e.cep) : '',
    tipoLogradouro: e.tipoLogradouro ?? '',
    logradouro: e.logradouro ?? '',
    numero: e.numero ?? '',
    complemento: e.complemento ?? '',
    bairro: e.bairro ?? '',
    municipioCodigo: e.municipioCodigoIbge,
    municipioTexto: e.municipioNome ? `${e.municipioNome}${e.uf ? `/${e.uf}` : ''}` : '',
    paisCodigo: e.paisCodigo,
    telefones: d.telefones.map((t, i) => ({
      chave: `receita-${i}`,
      numero: t.numero,
      e164: t.e164,
      tipo: t.tipo,
      incluir: true,
      whatsapp: false,
      daReceita: true,
    })),
    cnaes: [
      ...(d.cnaes.principal ? [{ ...d.cnaes.principal, principal: true }] : []),
      ...d.cnaes.secundarios.map((c) => ({ ...c, principal: false })),
    ],
    socios: d.socios.map((s) => ({ nome: s.nome, qualificacao: s.qualificacaoTexto })),
  }
}

/** Telefone digitado à mão, se for um número reconhecível. */
export function telefoneManual(texto: string, chave: string): TelefoneDoFormulario | null {
  const n = normalizarTelefone(texto)
  if (!n) return null
  return {
    chave,
    numero: n.numero,
    e164: n.e164,
    tipo: n.tipo,
    incluir: true,
    whatsapp: false,
    daReceita: false,
  }
}

/** O que a API recebe. Texto vazio vira "sem valor". */
export function corpoDoCadastro(
  tipo: TipoDeDocumento,
  documento: string,
  f: Formulario,
): CriarEmpresaCarteiraEntrada {
  const cnaePrincipal = f.cnaes.find((c) => c.principal)?.codigo ?? null
  return {
    tipoDocumento: tipo,
    ...(tipo === 'cnpj' ? { documento: normalizarCnpj(documento) } : {}),
    ...(tipo === 'cpf' ? { documento: documento.replace(/\D/g, '') } : {}),
    razaoSocial: f.razaoSocial.trim(),
    nomeFantasia: f.nomeFantasia,
    mei: f.mei,
    ...(f.dataInicio ? { dataInicioAtividades: f.dataInicio } : {}),
    ...(f.porteCodigo !== null ? { porteCodigo: f.porteCodigo } : {}),
    regimeTributario: f.regimeTributario,
    ...(f.vendedorId ? { vendedorId: f.vendedorId } : {}),
    ...(f.verticalId ? { verticalId: f.verticalId } : {}),
    ...(f.statusTagId ? { statusTagId: f.statusTagId } : {}),
    website: f.website,
    observacoes: f.observacoes,
    endereco: {
      cep: f.cep,
      tipoLogradouro: f.tipoLogradouro,
      logradouro: f.logradouro,
      numero: f.numero,
      complemento: f.complemento,
      bairro: f.bairro,
      municipioCodigo: f.municipioCodigo,
      paisCodigo: f.paisCodigo,
    },
    telefones: f.telefones
      .filter((t) => t.incluir)
      .map((t) => ({ numero: t.numero, tipo: t.whatsapp ? ('whatsapp' as const) : t.tipo })),
    ...(f.cnaes.length > 0
      ? {
          cnaes: {
            principal: cnaePrincipal,
            secundarios: f.cnaes.filter((c) => !c.principal).map((c) => c.codigo),
          },
        }
      : {}),
  }
}
