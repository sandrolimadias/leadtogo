import { z } from 'zod'

// Configurações → Empresa: os dados e o endereço da empresa que usa o CRM (a linha de `tenants`). O endereço
// diz o estado dos mapas do Dashboard (docs/plano_dashboard_v2.md).

/** As 27 UFs, na ordem alfabética da sigla. */
export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const
export const ufSchema = z.enum(UFS)
export type Uf = z.infer<typeof ufSchema>

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

export const dadosDaEmpresaSchema = z
  .object({
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
    /** Só leitura (vem do cadastro da conta) */
    cnpj: z.string().nullable(),
    email: z.string().nullable(),
    telefone: z.string().nullable(),
    website: z.string().nullable(),
    endereco: z.object({
      cep: z.string().nullable(),
      tipoLogradouro: z.string().nullable(),
      logradouro: z.string().nullable(),
      numero: z.string().nullable(),
      complemento: z.string().nullable(),
      bairro: z.string().nullable(),
      /** A cidade (dela sai o estado dos mapas do Dashboard); nula sem endereço */
      municipio: z
        .object({ codigo: z.number().int(), nome: z.string(), uf: z.string() })
        .nullable(),
    }),
  })
  .meta({ id: 'DadosDaEmpresa' })
export type DadosDaEmpresa = z.infer<typeof dadosDaEmpresaSchema>

/** PATCH /v1/configuracoes/empresa (`empresa.configurar`): só os campos enviados mudam; vazio apaga. */
export const alterarDadosDaEmpresaSchema = z
  .object({
    razaoSocial: z.string().trim().min(2, 'informe a razão social').max(200).optional(),
    nomeFantasia: opcional(200),
    email: z
      .union([z.literal(''), z.email('e-mail inválido')])
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    telefone: opcional(30),
    website: opcional(200),
    endereco: z
      .object({
        cep: z
          .string()
          .trim()
          .transform((v) => v.replace(/\D/g, ''))
          .refine((v) => v === '' || v.length === 8, 'o CEP tem 8 dígitos')
          .transform((v) => (v === '' ? null : v))
          .nullable()
          .optional(),
        tipoLogradouro: opcional(30),
        logradouro: opcional(200),
        numero: opcional(20),
        complemento: opcional(100),
        bairro: opcional(100),
        /** Código IBGE da cidade; nulo tira a cidade */
        municipioCodigo: z.number().int().positive().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarDadosDaEmpresaEntrada' })
export type AlterarDadosDaEmpresa = z.output<typeof alterarDadosDaEmpresaSchema>
export type AlterarDadosDaEmpresaEntrada = z.input<typeof alterarDadosDaEmpresaSchema>

export const consultaDeMunicipiosSchema = z
  .object({
    uf: z
      .string()
      .transform((u) => u.toUpperCase())
      .pipe(ufSchema),
  })
  .strict()
export type ConsultaDeMunicipios = z.output<typeof consultaDeMunicipiosSchema>

export const municipiosDaUfSchema = z
  .array(z.object({ codigo: z.number().int(), nome: z.string() }))
  .meta({ id: 'MunicipiosDaUf' })
export type MunicipiosDaUf = z.infer<typeof municipiosDaUfSchema>
