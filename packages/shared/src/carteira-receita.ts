import { z } from 'zod'

// "Atualizar pela Receita" na ficha da empresa: reconsulta ignorando o cache, mostra o que mudou
// (atual × Receita) e o usuário aplica ou mantém como está.

/** Campos que a comparação pode apontar (as chaves de `mudancas[].chave`). */
export const CAMPOS_DA_RECEITA = [
  'razaoSocial',
  'nomeFantasia',
  'mei',
  'dataInicioAtividades',
  'porteCodigo',
  'regimeTributario',
  'endereco',
  'cnaes',
  'telefones',
  'socios',
] as const
export const campoDaReceitaSchema = z.enum(CAMPOS_DA_RECEITA)
export type CampoDaReceita = z.infer<typeof campoDaReceitaSchema>

export const mudancaDaReceitaSchema = z.object({
  chave: campoDaReceitaSchema,
  rotulo: z.string(),
  /** Como está no cadastro, já legível; nulo = vazio */
  atual: z.string().nullable(),
  /** Como a Receita informa agora */
  receita: z.string().nullable(),
})

/** POST /v1/carteira/empresas/{id}/receita/consultar */
export const consultaDaReceitaDaEmpresaSchema = z
  .object({
    consultadoEm: z.string(),
    /** `minhareceita` ou `brasilapi` */
    fonte: z.string(),
    situacao: z.object({
      descricao: z.string(),
      motivo: z.string().nullable(),
      ativa: z.boolean(),
      desde: z.string().nullable(),
    }),
    /** A situação da consulta anterior, se havia; nulo na primeira */
    situacaoAnterior: z.string().nullable(),
    /** Só o que difere; vazio = o cadastro já está igual à Receita */
    mudancas: z.array(mudancaDaReceitaSchema),
  })
  .meta({ id: 'ConsultaDaReceitaDaEmpresa' })
export type ConsultaDaReceitaDaEmpresa = z.infer<typeof consultaDaReceitaDaEmpresaSchema>

/** POST /v1/carteira/empresas/{id}/receita/aplicar: sem `campos`, aplica todas as mudanças. */
export const aplicarDaReceitaSchema = z
  .object({ campos: z.array(campoDaReceitaSchema).max(CAMPOS_DA_RECEITA.length).optional() })
  .strict()
  .meta({ id: 'AplicarDaReceitaEntrada' })
export type AplicarDaReceita = z.output<typeof aplicarDaReceitaSchema>
