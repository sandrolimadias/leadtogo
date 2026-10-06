import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { erroSchema } from '@leadtogo/shared'
import { z, type ZodType } from 'zod'

type JsonSchema = Record<string, unknown>

/** Schemas nomeados (`.meta({ id })`) usados pela documentação: viram `components.schemas`. */
const componentes = new Map<string, JsonSchema>()
export const componentesRegistrados = (): Record<string, JsonSchema> =>
  Object.fromEntries(componentes)

/** Tira o `pattern` de formatos conhecidos (uuid, data): o Zod o inclui enorme e o `format` já diz tudo. */
function limpar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpar)
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    const saida: Record<string, unknown> = {}
    for (const [chave, v] of Object.entries(objeto)) {
      if (chave === 'pattern' && typeof objeto['format'] === 'string') continue
      saida[chave] = limpar(v)
    }
    return saida
  }
  return valor
}

/**
 * Converte um schema Zod em JSON Schema do OpenAPI 3.0. Os schemas com `.meta({ id })` viram
 * componentes (`$ref`); o resto fica inline. `entrada` descreve o que o cliente ENVIA (antes das
 * transformações); `saida`, o que a API devolve.
 */
export function jsonSchemaDe(esquema: ZodType, io: 'entrada' | 'saida'): JsonSchema {
  const gerado = z.toJSONSchema(esquema, {
    target: 'openapi-3.0',
    io: io === 'entrada' ? 'input' : 'output',
    unrepresentable: 'any',
  }) as JsonSchema & { definitions?: Record<string, JsonSchema> }
  const { definitions, ...raiz } = gerado
  const comRefsDeComponentes = <T>(valor: T): T =>
    JSON.parse(
      JSON.stringify(limpar(valor)).replaceAll('#/definitions/', '#/components/schemas/'),
    ) as T
  for (const [id, definicao] of Object.entries(definitions ?? {})) {
    componentes.set(id, comRefsDeComponentes(definicao))
  }
  return comRefsDeComponentes(raiz)
}

export interface OpcoesDeDocumentacao {
  resumo: string
  descricao?: string
  /** Corpo da requisição */
  corpo?: ZodType
  /** Parâmetros de query (um objeto Zod de campos simples) */
  consulta?: z.ZodObject
  /** O que a API devolve em caso de sucesso; sem isso a resposta é vazia */
  resposta?: ZodType
  /** Status de sucesso (padrão 200; 201 em criações; 204 sem corpo) */
  status?: number
  /** Status de erro possíveis, além do 500 comum (todos usam o formato `Erro`) */
  erros?: number[]
}

const DESCRICAO_DO_ERRO: Record<number, string> = {
  400: 'Dados inválidos (`validacao_invalida`, com os campos em `detalhes`)',
  401: 'Sem login (`nao_autenticado`) ou sessão expirada',
  403: 'Sem permissão (`acesso_negado`, `2fa_obrigatorio`, `empresa_ativa_invalida`...)',
  404: 'Não encontrado',
  405: 'Método não permitido nesta rota',
  409: 'Conflito (`sem_empresa_ativa`, `ja_e_membro`, e-mail ou CNPJ já cadastrado...)',
  429: 'Muitas requisições (`muitas_requisicoes`; veja o cabeçalho `Retry-After`)',
  503: 'Serviço indisponível (`servico_indisponivel`)',
}

/**
 * Documenta uma rota no OpenAPI a partir dos mesmos schemas Zod que a validam e a respondem.
 * Os erros usam todos o schema `Erro` (código estável em `erro`).
 */
export function Documenta(opcoes: OpcoesDeDocumentacao) {
  const status = opcoes.status ?? 200
  const decoradores: (MethodDecorator | ClassDecorator)[] = [
    ApiOperation({ summary: opcoes.resumo, description: opcoes.descricao }),
  ]
  if (opcoes.corpo) {
    decoradores.push(
      ApiBody({ schema: jsonSchemaDe(opcoes.corpo, 'entrada') as never, required: true }),
    )
  }
  if (opcoes.consulta) {
    const campos = jsonSchemaDe(opcoes.consulta, 'entrada') as {
      properties?: Record<string, JsonSchema>
      required?: string[]
    }
    for (const [nome, schema] of Object.entries(campos.properties ?? {})) {
      decoradores.push(
        ApiQuery({
          name: nome,
          required: campos.required?.includes(nome) ?? false,
          schema: schema as never,
        }),
      )
    }
  }
  decoradores.push(
    ApiResponse({
      status,
      description: opcoes.resposta ? 'Sucesso' : 'Sucesso, sem corpo',
      ...(opcoes.resposta ? { schema: jsonSchemaDe(opcoes.resposta, 'saida') } : {}),
    }),
  )
  jsonSchemaDe(erroSchema, 'saida') // registra o componente Erro
  for (const codigo of opcoes.erros ?? []) {
    decoradores.push(
      ApiResponse({
        status: codigo,
        description: DESCRICAO_DO_ERRO[codigo] ?? 'Erro',
        schema: { $ref: '#/components/schemas/Erro' },
      }),
    )
  }
  return applyDecorators(...decoradores)
}
