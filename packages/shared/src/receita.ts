import { z } from 'zod'

import { normalizarCnpj } from './cnpj.js'
import { normalizarTelefone } from './telefone.js'

// Dados da Receita Federal no formato interno. A Minha Receita e a BrasilAPI devolvem o mesmo JSON
// (a BrasilAPI repassa a Minha Receita): `normalizarRespostaDaReceita` lê esse JSON e devolve só o
// que o Leadtogo usa, já limpo. O CPF mascarado dos sócios nunca passa daqui (LGPD).

/** Situação cadastral da Receita: 1 nula, 2 ativa, 3 suspensa, 4 inapta, 8 baixada. */
export const SITUACAO_ATIVA = 2
export const DESCRICAO_DA_SITUACAO: Record<number, string> = {
  1: 'NULA',
  2: 'ATIVA',
  3: 'SUSPENSA',
  4: 'INAPTA',
  8: 'BAIXADA',
}

export const regimeTributarioSchema = z.enum([
  'mei',
  'simples_nacional',
  'lucro_presumido',
  'lucro_real',
  'imune_isenta',
  'nao_informado',
])
export type RegimeTributario = z.infer<typeof regimeTributarioSchema>

export const ROTULO_DO_REGIME: Record<RegimeTributario, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  imune_isenta: 'Imune/Isenta',
  nao_informado: 'Não informado',
}

/** Na Receita: matriz é a ordem 0001 (posições 9 a 12 do CNPJ, que podem ser letras). */
export function matrizOuFilialDoCnpj(cnpj: string): 'matriz' | 'filial' {
  return normalizarCnpj(cnpj).slice(8, 12) === '0001' ? 'matriz' : 'filial'
}

export const telefoneDaReceitaSchema = z.object({
  numero: z.string(),
  e164: z.string(),
  tipo: z.enum(['fixo', 'celular', 'outro']),
})

export const cnaeDaReceitaSchema = z.object({ codigo: z.number().int(), descricao: z.string() })

export const dadosDaReceitaSchema = z
  .object({
    cnpj: z.string(),
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
    matrizFilial: z.enum(['matriz', 'filial']),
    situacao: z.object({
      codigo: z.number().int(),
      descricao: z.string(),
      motivo: z.string().nullable(),
      desde: z.string().nullable(),
      ativa: z.boolean(),
    }),
    mei: z.boolean(),
    regimeTributario: regimeTributarioSchema,
    porteCodigo: z.number().int().nullable(),
    dataInicioAtividades: z.string().nullable(),
    endereco: z.object({
      cep: z.string().nullable(),
      tipoLogradouro: z.string().nullable(),
      logradouro: z.string().nullable(),
      numero: z.string().nullable(),
      complemento: z.string().nullable(),
      bairro: z.string().nullable(),
      municipioCodigoIbge: z.number().int().nullable(),
      municipioNome: z.string().nullable(),
      uf: z.string().nullable(),
      /** Nulo para o Brasil */
      paisCodigo: z.number().int().nullable(),
    }),
    telefones: z.array(telefoneDaReceitaSchema),
    cnaes: z.object({
      principal: cnaeDaReceitaSchema.nullable(),
      secundarios: z.array(cnaeDaReceitaSchema),
    }),
    socios: z.array(
      z.object({
        nome: z.string(),
        qualificacaoCodigo: z.number().int().nullable(),
        qualificacaoTexto: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'DadosDaReceita' })
export type DadosDaReceita = z.infer<typeof dadosDaReceitaSchema>

// ---- leitura do JSON da Receita ----

const numero = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).nullish()
const texto = z.string().nullish()

const brutoSchema = z.looseObject({
  cnpj: z.string().min(1),
  razao_social: z.string().min(1),
  nome_fantasia: texto,
  situacao_cadastral: numero,
  descricao_situacao_cadastral: texto,
  descricao_motivo_situacao_cadastral: texto,
  data_situacao_cadastral: texto,
  identificador_matriz_filial: numero,
  opcao_pelo_mei: z.boolean().nullish(),
  opcao_pelo_simples: z.boolean().nullish(),
  regime_tributario: z.array(z.looseObject({ ano: numero, forma_de_tributacao: texto })).nullish(),
  codigo_porte: numero,
  data_inicio_atividade: texto,
  cep: texto,
  descricao_tipo_de_logradouro: texto,
  logradouro: texto,
  numero: texto,
  complemento: texto,
  bairro: texto,
  codigo_municipio_ibge: numero,
  municipio: texto,
  uf: texto,
  codigo_pais: numero,
  ddd_telefone_1: texto,
  ddd_telefone_2: texto,
  cnae_fiscal: numero,
  cnae_fiscal_descricao: texto,
  cnaes_secundarios: z.array(z.looseObject({ codigo: numero, descricao: texto })).nullish(),
  qsa: z
    .array(
      z.looseObject({
        nome_socio: texto,
        codigo_qualificacao_socio: numero,
        qualificacao_socio: texto,
      }),
    )
    .nullish(),
})

export class RespostaDaReceitaInvalida extends Error {
  constructor(detalhe: string) {
    super(`Resposta da Receita fora do formato esperado: ${detalhe}`)
    this.name = 'RespostaDaReceitaInvalida'
  }
}

const vazioParaNulo = (v: string | null | undefined): string | null => {
  const t = v?.trim()
  return t ? t : null
}

function regimeDe(b: z.infer<typeof brutoSchema>): RegimeTributario {
  if (b.opcao_pelo_mei) return 'mei'
  if (b.opcao_pelo_simples) return 'simples_nacional'
  const historico = [...(b.regime_tributario ?? [])].sort((x, y) => (y.ano ?? 0) - (x.ano ?? 0))
  const forma = (historico[0]?.forma_de_tributacao ?? '').toUpperCase()
  if (forma.includes('REAL')) return 'lucro_real'
  if (forma.includes('PRESUMIDO')) return 'lucro_presumido'
  if (forma.includes('IMUNE') || forma.includes('ISENT')) return 'imune_isenta'
  return 'nao_informado'
}

/** Lê o JSON da Minha Receita (ou da BrasilAPI) e devolve os dados no formato interno. */
export function normalizarRespostaDaReceita(origem: unknown): DadosDaReceita {
  const lido = brutoSchema.safeParse(origem)
  if (!lido.success) {
    throw new RespostaDaReceitaInvalida(lido.error.issues[0]?.path.join('.') || 'objeto')
  }
  const b = lido.data
  const codigoSituacao = b.situacao_cadastral
  if (codigoSituacao === null || codigoSituacao === undefined) {
    throw new RespostaDaReceitaInvalida('situacao_cadastral')
  }
  const cnpj = normalizarCnpj(b.cnpj)

  const telefones: DadosDaReceita['telefones'] = []
  for (const bruto of [b.ddd_telefone_1, b.ddd_telefone_2]) {
    const t = bruto ? normalizarTelefone(bruto) : null
    if (t && t.tipo !== 'outro' && !telefones.some((x) => x.e164 === t.e164)) telefones.push(t)
  }

  const principalCodigo = b.cnae_fiscal && b.cnae_fiscal > 0 ? b.cnae_fiscal : null
  const secundarios: DadosDaReceita['cnaes']['secundarios'] = []
  for (const c of b.cnaes_secundarios ?? []) {
    if (!c.codigo || c.codigo <= 0 || c.codigo === principalCodigo) continue
    if (secundarios.some((x) => x.codigo === c.codigo)) continue
    secundarios.push({
      codigo: c.codigo,
      descricao: vazioParaNulo(c.descricao) ?? String(c.codigo),
    })
  }

  const socios: DadosDaReceita['socios'] = []
  for (const s of b.qsa ?? []) {
    const nome = vazioParaNulo(s.nome_socio)
    if (!nome) continue
    const qualificacaoCodigo = s.codigo_qualificacao_socio ?? null
    if (socios.some((x) => x.nome === nome && x.qualificacaoCodigo === qualificacaoCodigo)) continue
    socios.push({
      nome,
      qualificacaoCodigo,
      qualificacaoTexto: vazioParaNulo(s.qualificacao_socio),
    })
  }

  const cep = (b.cep ?? '').replace(/\D/g, '')
  const dataInicio = b.data_inicio_atividade ?? ''
  const identificador = b.identificador_matriz_filial
  return {
    cnpj,
    razaoSocial: b.razao_social.trim(),
    nomeFantasia: vazioParaNulo(b.nome_fantasia),
    matrizFilial:
      identificador === 1 ? 'matriz' : identificador === 2 ? 'filial' : matrizOuFilialDoCnpj(cnpj),
    situacao: {
      codigo: codigoSituacao,
      descricao:
        vazioParaNulo(b.descricao_situacao_cadastral) ??
        DESCRICAO_DA_SITUACAO[codigoSituacao] ??
        String(codigoSituacao),
      motivo: vazioParaNulo(b.descricao_motivo_situacao_cadastral),
      desde: /^\d{4}-\d{2}-\d{2}$/.test(b.data_situacao_cadastral ?? '')
        ? (b.data_situacao_cadastral ?? null)
        : null,
      ativa: codigoSituacao === SITUACAO_ATIVA,
    },
    mei: b.opcao_pelo_mei === true,
    regimeTributario: regimeDe(b),
    porteCodigo: b.codigo_porte ?? null,
    dataInicioAtividades: /^\d{4}-\d{2}-\d{2}$/.test(dataInicio) ? dataInicio : null,
    endereco: {
      cep: cep ? cep.padStart(8, '0').slice(0, 8) : null,
      tipoLogradouro: vazioParaNulo(b.descricao_tipo_de_logradouro),
      logradouro: vazioParaNulo(b.logradouro),
      numero: vazioParaNulo(b.numero),
      complemento: vazioParaNulo(b.complemento),
      bairro: vazioParaNulo(b.bairro),
      municipioCodigoIbge:
        b.codigo_municipio_ibge && b.codigo_municipio_ibge > 0 ? b.codigo_municipio_ibge : null,
      municipioNome: vazioParaNulo(b.municipio),
      uf: vazioParaNulo(b.uf)?.toUpperCase() ?? null,
      paisCodigo: b.codigo_pais && b.codigo_pais !== 105 ? b.codigo_pais : null,
    },
    telefones,
    cnaes: {
      principal: principalCodigo
        ? {
            codigo: principalCodigo,
            descricao: vazioParaNulo(b.cnae_fiscal_descricao) ?? String(principalCodigo),
          }
        : null,
      secundarios,
    },
    socios,
  }
}
