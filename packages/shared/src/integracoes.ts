import { z } from 'zod'

import { PERMISSOES_DE_INTEGRACAO } from './permissoes.js'

// API aberta (docs/plano_api_aberta.md): gestão das chaves de API pela equipe (rotas internas do CRM,
// Configurações → Integrações). As rotas da API pública têm schemas próprios (`publica.ts`).

const instante = z.iso.datetime({ offset: true })

export const MAXIMO_DE_IPS_POR_CHAVE = 20
/** Prazo máximo em que a chave antiga continua valendo depois de rotacionada */
export const PRAZO_MAXIMO_DA_ROTACAO_DIAS = 7

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const IPV6 = /^[0-9a-f:]*:[0-9a-f:.]*$/i

/** IP ou faixa (CIDR): `200.1.2.3`, `10.0.0.0/8`, `2001:db8::/32`. O servidor confere de novo. */
export function ipOuFaixaValido(valor: string): boolean {
  const [ip, prefixo, sobra] = valor.split('/')
  if (sobra !== undefined || !ip) return false
  const v4 = IPV4.test(ip)
  if (!v4 && !IPV6.test(ip)) return false
  if (prefixo === undefined) return true
  if (!/^\d{1,3}$/.test(prefixo)) return false
  return Number(prefixo) <= (v4 ? 32 : 128)
}

export const permissaoDeIntegracaoSchema = z
  .string()
  .refine((c) => PERMISSOES_DE_INTEGRACAO.includes(c), {
    message: 'permissão não liberada para chaves de API',
  })

const ipsSchema = z
  .array(
    z
      .string()
      .trim()
      .refine(ipOuFaixaValido, { message: 'use um IP (200.1.2.3) ou uma faixa (10.0.0.0/8)' }),
  )
  .max(MAXIMO_DE_IPS_POR_CHAVE)

export const SITUACOES_DA_CHAVE = ['ativa', 'substituida', 'vencida', 'revogada'] as const
export const situacaoDaChaveSchema = z.enum(SITUACOES_DA_CHAVE).meta({ id: 'SituacaoDaChave' })
export type SituacaoDaChave = z.infer<typeof situacaoDaChaveSchema>
export const ROTULO_DA_SITUACAO_DA_CHAVE: Record<SituacaoDaChave, string> = {
  ativa: 'Ativa',
  substituida: 'Substituída (vale até o prazo)',
  vencida: 'Vencida',
  revogada: 'Revogada',
}

const pessoa = z.object({ id: z.uuid(), nome: z.string() })

export const chaveDeApiSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    /** `ltg_live_` + os 8 primeiros caracteres do segredo, para reconhecer a chave */
    prefixo: z.string(),
    ambiente: z.enum(['live', 'test']),
    permissoes: z.array(z.string()),
    responsavelPadrao: pessoa.nullable(),
    ipsPermitidos: z.array(z.string()),
    expiraEm: instante.nullable(),
    revogadaEm: instante.nullable(),
    substituidaPor: z.uuid().nullable(),
    ultimoUsoEm: instante.nullable(),
    ultimoIp: z.string().nullable(),
    situacao: situacaoDaChaveSchema,
    criadoEm: instante,
    criadoPor: pessoa.nullable(),
  })
  .meta({ id: 'ChaveDeApi' })
export type ChaveDeApi = z.infer<typeof chaveDeApiSchema>

export const listaDeChavesSchema = z
  .object({ itens: z.array(chaveDeApiSchema) })
  .meta({ id: 'ListaDeChavesDeApi' })
export type ListaDeChaves = z.infer<typeof listaDeChavesSchema>

/** A resposta da criação e da rotação: o TOKEN só aparece aqui, uma vez. */
export const chaveCriadaSchema = z
  .object({ chave: chaveDeApiSchema, token: z.string() })
  .meta({ id: 'ChaveDeApiCriada' })
export type ChaveCriada = z.infer<typeof chaveCriadaSchema>

const nome = z.string().trim().min(1, 'informe o nome').max(80)

export const criarChaveSchema = z
  .object({
    nome,
    permissoes: z.array(permissaoDeIntegracaoSchema).min(1, 'escolha ao menos uma permissão'),
    responsavelPadraoId: z.uuid().nullable().optional(),
    ipsPermitidos: ipsSchema.optional(),
    expiraEm: instante.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CriarChaveDeApi' })
export type CriarChaveEntrada = z.infer<typeof criarChaveSchema>

export const alterarChaveSchema = z
  .object({
    nome: nome.optional(),
    permissoes: z
      .array(permissaoDeIntegracaoSchema)
      .min(1, 'escolha ao menos uma permissão')
      .optional(),
    responsavelPadraoId: z.uuid().nullable().optional(),
    ipsPermitidos: ipsSchema.optional(),
    expiraEm: instante.nullable().optional(),
  })
  .strict()
  .meta({ id: 'AlterarChaveDeApi' })
export type AlterarChaveEntrada = z.infer<typeof alterarChaveSchema>

export const rotacionarChaveSchema = z
  .object({
    /** Por quantos dias a chave antiga continua valendo (0 = revoga agora) */
    prazoDias: z.number().int().min(0).max(PRAZO_MAXIMO_DA_ROTACAO_DIAS).default(1),
  })
  .strict()
  .meta({ id: 'RotacionarChaveDeApi' })
export type RotacionarChaveEntrada = z.infer<typeof rotacionarChaveSchema>

/** Modelos de uso que a tela sugere ao criar a chave (o admin ajusta). */
export const MODELOS_DE_ESCOPO: { id: string; rotulo: string; permissoes: readonly string[] }[] = [
  {
    id: 'leitura',
    rotulo: 'Leitura da carteira',
    permissoes: ['empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver'],
  },
  {
    id: 'financeiro',
    rotulo: 'Financeiro (situação dos associados)',
    permissoes: ['empresas.ver', 'empresas.editar'],
  },
  {
    id: 'formulario',
    rotulo: 'Formulário do site (cria lead)',
    permissoes: [
      'empresas.ver',
      'empresas.criar',
      'contatos.criar',
      'oportunidades.criar',
      'atividades.criar',
    ],
  },
]
