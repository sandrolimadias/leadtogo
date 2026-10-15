import { z } from 'zod'

import { nomeDeCadastroSchema } from './cadastros.js'

// Importação de planilha (docs/escopo_mvp.md, Módulo 4): perfis de regras por empresa.

/** Quantos CNAEs um perfil guarda no máximo (a lista completa da CNAE tem cerca de 1.300 subclasses). */
export const MAX_CNAES_DO_PERFIL = 1500

export interface CnaeInvalido {
  /** O trecho como foi colado */
  texto: string
  motivo: string
}

export interface CnaesInterpretados {
  /** Códigos de 7 dígitos, sem repetição, na ordem em que apareceram */
  codigos: number[]
  invalidos: CnaeInvalido[]
  /** Quantas repetições foram ignoradas */
  repetidos: number
}

/**
 * Lê uma lista de CNAEs colada, separada por espaço, vírgula, ponto e vírgula ou quebra de linha.
 * Aceita 6 ou 7 dígitos (completa o zero à esquerda), com ou sem pontuação: `0710-3/01`, `0710301`,
 * `710301`. Não consulta a tabela de CNAEs: quem sabe se o código existe é a API.
 */
export function interpretarCnaes(texto: string): CnaesInterpretados {
  const codigos: number[] = []
  const vistos = new Set<number>()
  const invalidos: CnaeInvalido[] = []
  let repetidos = 0
  for (const trecho of texto.split(/[\s,;]+/)) {
    if (trecho === '') continue
    const digitos = trecho.replace(/\D/g, '')
    if (digitos === '') {
      invalidos.push({ texto: trecho, motivo: 'não tem dígitos' })
    } else if (digitos.length < 6 || digitos.length > 7) {
      invalidos.push({ texto: trecho, motivo: 'o CNAE tem 6 ou 7 dígitos' })
    } else {
      const codigo = Number(digitos.padStart(7, '0'))
      if (vistos.has(codigo)) repetidos += 1
      else {
        vistos.add(codigo)
        codigos.push(codigo)
      }
    }
  }
  return { codigos, invalidos, repetidos }
}

/** "0710-3/01" para exibir um código de 7 dígitos. */
export const formatarCnae = (codigo: number): string => {
  const d = String(codigo).padStart(7, '0')
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`
}

export const ESTABELECIMENTOS_DO_PERFIL = ['ambas', 'matriz', 'filial'] as const
export const estabelecimentoDoPerfilSchema = z.enum(ESTABELECIMENTOS_DO_PERFIL)
export type EstabelecimentoDoPerfil = z.infer<typeof estabelecimentoDoPerfilSchema>

export const ACOES_FORA_DO_PERFIL = ['pular', 'importar_com_tag'] as const
export const acaoForaDoPerfilSchema = z.enum(ACOES_FORA_DO_PERFIL)
export type AcaoForaDoPerfil = z.infer<typeof acaoForaDoPerfilSchema>

const cnaesSchema = z
  .array(z.number().int().min(1000000).max(9999999))
  .max(MAX_CNAES_DO_PERFIL)
  .meta({ description: 'Códigos de CNAE de 7 dígitos aceitos (vazio: qualquer CNAE)' })

export const perfilDeImportacaoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    exigeSituacaoAtiva: z.boolean(),
    estabelecimento: estabelecimentoDoPerfilSchema,
    excluirMei: z.boolean(),
    cnaes: cnaesSchema,
    aceitarCnaeSecundario: z.boolean(),
    acaoForaDoPerfil: acaoForaDoPerfilSchema,
    ativo: z.boolean(),
  })
  .meta({ id: 'PerfilDeImportacao' })
export type PerfilDeImportacao = z.infer<typeof perfilDeImportacaoSchema>

export const criarPerfilDeImportacaoSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    exigeSituacaoAtiva: z.boolean().default(true),
    estabelecimento: estabelecimentoDoPerfilSchema.default('ambas'),
    excluirMei: z.boolean().default(false),
    cnaes: cnaesSchema.default([]),
    aceitarCnaeSecundario: z.boolean().default(false),
    acaoForaDoPerfil: acaoForaDoPerfilSchema.default('pular'),
  })
  .strict()
  .meta({ id: 'CriarPerfilDeImportacaoEntrada' })
export type CriarPerfilDeImportacaoEntrada = z.infer<typeof criarPerfilDeImportacaoSchema>

export const alterarPerfilDeImportacaoSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    exigeSituacaoAtiva: z.boolean(),
    estabelecimento: estabelecimentoDoPerfilSchema,
    excluirMei: z.boolean(),
    cnaes: cnaesSchema,
    aceitarCnaeSecundario: z.boolean(),
    acaoForaDoPerfil: acaoForaDoPerfilSchema,
    ativo: z.boolean(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarPerfilDeImportacaoEntrada' })
export type AlterarPerfilDeImportacaoEntrada = z.infer<typeof alterarPerfilDeImportacaoSchema>

export const conferirCnaesSchema = z
  .object({ texto: z.string().max(200_000) })
  .strict()
  .meta({ id: 'ConferirCnaesEntrada' })
export type ConferirCnaesEntrada = z.infer<typeof conferirCnaesSchema>

export const cnaesConferidosSchema = z
  .object({
    validos: z.array(z.object({ codigo: z.number().int(), descricao: z.string() })),
    invalidos: z.array(z.object({ texto: z.string(), motivo: z.string() })),
    repetidos: z.number().int(),
  })
  .meta({ id: 'CnaesConferidos' })
export type CnaesConferidos = z.infer<typeof cnaesConferidosSchema>

// ---- Lotes de importação (upload da planilha) ----

/** O arquivo da planilha: até 10 MB e 10.000 linhas (o limite do mockup, 5.000, não vale: escopo_mvp.md). */
export const LIMITE_BYTES_DA_IMPORTACAO = 10 * 1024 * 1024
export const LIMITE_LINHAS_DA_IMPORTACAO = 10_000
/** Quantas linhas do arquivo a resposta do upload mostra para conferir o mapeamento. */
export const LINHAS_DE_AMOSTRA = 5

/** Os campos da empresa que uma coluna da planilha pode preencher (também as colunas do modelo). */
export const CAMPOS_DA_EMPRESA_NA_IMPORTACAO = [
  { chave: 'documento', rotulo: 'CNPJ' },
  { chave: 'razaoSocial', rotulo: 'Razão social' },
  { chave: 'nomeFantasia', rotulo: 'Nome fantasia' },
  { chave: 'telefone', rotulo: 'Telefone' },
  { chave: 'website', rotulo: 'Site' },
  { chave: 'cep', rotulo: 'CEP' },
  { chave: 'logradouro', rotulo: 'Logradouro' },
  { chave: 'numero', rotulo: 'Número' },
  { chave: 'complemento', rotulo: 'Complemento' },
  { chave: 'bairro', rotulo: 'Bairro' },
  { chave: 'municipio', rotulo: 'Município' },
  { chave: 'uf', rotulo: 'UF' },
  { chave: 'observacoes', rotulo: 'Observações' },
] as const

/** De onde vêm os dados da empresa: a planilha, tudo da Receita ou a planilha completada pela Receita. */
export const fonteDosDadosSchema = z.enum(['planilha', 'receita', 'completar'])
export type FonteDosDados = z.infer<typeof fonteDosDadosSchema>

export const situacaoDaImportacaoSchema = z.enum([
  'rascunho',
  'pronta',
  'em_andamento',
  'concluida',
  'falhou',
  'cancelada',
  'desfeita',
])
export type SituacaoDaImportacao = z.infer<typeof situacaoDaImportacaoSchema>

export const loteDeImportacaoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    tipo: z.enum(['empresas', 'contatos']),
    nomeArquivo: z.string(),
    situacao: situacaoDaImportacaoSchema,
    totalLinhas: z.number().int(),
    /** Os títulos da primeira linha do arquivo, na ordem */
    colunas: z.array(z.string()),
    /** As primeiras linhas, por coluna, para conferir o mapeamento */
    amostra: z.array(z.record(z.string(), z.string())),
    /** Mapeamento escolhido: campo → título da coluna */
    campos: z.record(z.string(), z.string()),
    /** O que os títulos das colunas sugerem (para o passo Mapear colunas começar preenchido) */
    sugestao: z.record(z.string(), z.string()),
    fonteDados: fonteDosDadosSchema,
    /** Espera entre duas consultas à Receita, em milissegundos */
    intervaloMs: z.number().int(),
    perfilId: z.uuid().nullable(),
    vendedorId: z.uuid().nullable(),
    statusTagId: z.uuid().nullable(),
    origemId: z.uuid().nullable(),
    verticalId: z.uuid().nullable(),
    /** O que falta para o lote ficar pronta; vazio = pronta (`situacao`) */
    pendencias: z.array(z.string()),
    criadoEm: z.string(),
  })
  .meta({ id: 'LoteDeImportacao' })
export type LoteDeImportacao = z.infer<typeof loteDeImportacaoSchema>

/** Intervalo mínimo e máximo entre consultas à Receita (padrão 3 s). */
export const INTERVALO_MINIMO_MS = 500
export const INTERVALO_MAXIMO_MS = 60_000

/** PATCH do lote: só o que veio muda. `campos` troca o mapeamento inteiro. */
export const alterarLoteSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    fonteDados: fonteDosDadosSchema,
    campos: z.record(z.string(), z.string().nullable()),
    intervaloMs: z.number().int().min(INTERVALO_MINIMO_MS).max(INTERVALO_MAXIMO_MS),
    /** Nulo = "Sem regras" */
    perfilId: z.uuid().nullable(),
    vendedorId: z.uuid(),
    statusTagId: z.uuid(),
    origemId: z.uuid().nullable(),
    verticalId: z.uuid().nullable(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarLoteEntrada' })
export type AlterarLoteEntrada = z.infer<typeof alterarLoteSchema>

/** O arquivo vai no corpo (bytes); o resto, na consulta. */
export const consultaDoEnvioSchema = z
  .object({
    arquivo: z.string().trim().min(1).max(255),
    nome: z.string().trim().min(1).max(120).optional(),
    tipo: z.enum(['empresas']).default('empresas'),
  })
  .strict()
export type ConsultaDoEnvio = z.infer<typeof consultaDoEnvioSchema>

// ---- Prévia (antes de importar) ----

export const problemaDaPreviaSchema = z.object({
  numero: z.number().int(),
  motivo: z.string(),
})

export const previaDaImportacaoSchema = z
  .object({
    totalLinhas: z.number().int(),
    /** Linhas com CNPJ válido, sem repetição na planilha e que ainda não estão na carteira */
    aImportar: z.number().int(),
    semCnpjValido: z.number().int(),
    /** O mesmo CNPJ já apareceu antes na planilha (vale a primeira linha) */
    repetidasNaPlanilha: z.number().int(),
    /** O CNPJ já está na carteira: a linha é pulada e a empresa não é alterada */
    jaNaCarteira: z.number().int(),
    /** A importação consulta a Receita (por regra do perfil, bloqueio de empresa não ativa ou fonte dos dados) */
    consultaAReceita: z.boolean(),
    /** CNPJs a importar que não estão no cache de 30 dias: cada um é uma consulta de verdade */
    consultasNecessarias: z.number().int(),
    /** `consultasNecessarias` × o intervalo escolhido, em segundos */
    estimativaSegundos: z.number().int(),
    /** As primeiras linhas com problema, para conferir o arquivo */
    problemas: z.array(problemaDaPreviaSchema),
  })
  .meta({ id: 'PreviaDaImportacao' })
export type PreviaDaImportacao = z.infer<typeof previaDaImportacaoSchema>

/** Quantas linhas com problema a prévia lista. */
export const PROBLEMAS_NA_PREVIA = 20
