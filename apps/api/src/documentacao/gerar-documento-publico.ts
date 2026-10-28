import type { OpenAPIObject } from '@nestjs/swagger'

import { criarApp } from '../app.js'
import { configuracaoParaDocumentacao } from './gerar-documento.js'
import { montarDocumentoPublico } from './openapi.js'

/** O OpenAPI da API pública (o retrato docs/api/publica-v1.openapi.json é gerado daqui). */
export async function gerarDocumentoPublico(): Promise<OpenAPIObject> {
  const app = await criarApp(configuracaoParaDocumentacao())
  try {
    return montarDocumentoPublico(app)
  } finally {
    await app.close()
  }
}

type Esquema = {
  type?: string
  format?: string
  $ref?: string
  properties?: Record<string, Esquema>
  required?: string[]
  items?: Esquema
  enum?: unknown[]
  nullable?: boolean
  anyOf?: Esquema[]
  oneOf?: Esquema[]
  allOf?: Esquema[]
}
type Operacao = {
  parameters?: { name: string; in: string; required?: boolean }[]
  requestBody?: { content?: Record<string, { schema?: Esquema }> }
  responses?: Record<string, { content?: Record<string, { schema?: Esquema }> }>
}
type Documento = {
  paths: Record<string, Record<string, Operacao>>
  components?: { schemas?: Record<string, Esquema> }
}

/**
 * O que quebraria quem já integra (mudança NÃO aditiva) entre o retrato antigo e o novo: rota ou operação removida,
 * parâmetro novo obrigatório, campo de resposta removido, tipo trocado, valor de enum removido, campo de entrada
 * que passou a ser obrigatório. Acrescentar rota, campo de resposta ou campo opcional de entrada é permitido.
 */
export function quebrasDeContrato(antigo: Documento, novo: Documento): string[] {
  const quebras: string[] = []
  const resolver = (doc: Documento, e: Esquema | undefined): Esquema | undefined => {
    if (!e?.$ref) return e
    return doc.components?.schemas?.[e.$ref.replace('#/components/schemas/', '')]
  }
  const comparar = (
    onde: string,
    a: Esquema | undefined,
    b: Esquema | undefined,
    entrada: boolean,
    vistos: Set<string>,
  ) => {
    const chave = `${onde}|${a?.$ref ?? ''}|${b?.$ref ?? ''}`
    if (vistos.has(chave)) return
    vistos.add(chave)
    const x = resolver(antigo, a)
    const y = resolver(novo, b)
    if (!x) return
    if (!y) return void quebras.push(`${onde}: schema removido`)
    if (x.type && y.type && x.type !== y.type) quebras.push(`${onde}: tipo ${x.type} → ${y.type}`)
    if (x.format && y.format !== x.format)
      quebras.push(`${onde}: formato ${x.format} → ${y.format ?? 'nenhum'}`)
    // Entrada: valor que deixou de ser aceito quebra quem o envia
    if (entrada && x.enum && y.enum) {
      for (const v of x.enum)
        if (!y.enum.includes(v)) quebras.push(`${onde}: valor ${String(v)} deixou de ser aceito`)
    }
    if (!entrada && x.nullable !== true && y.nullable === true)
      quebras.push(`${onde}: passou a aceitar nulo`)
    for (const [campo, sub] of Object.entries(x.properties ?? {})) {
      const novoSub = y.properties?.[campo]
      if (!novoSub) {
        quebras.push(`${onde}.${campo}: campo removido`)
        continue
      }
      comparar(`${onde}.${campo}`, sub, novoSub, entrada, vistos)
    }
    if (entrada) {
      for (const campo of y.required ?? []) {
        if (!(x.required ?? []).includes(campo))
          quebras.push(`${onde}.${campo}: passou a ser obrigatório`)
      }
    }
    if (x.items) comparar(`${onde}[]`, x.items, y.items, entrada, vistos)
  }
  for (const [caminho, ops] of Object.entries(antigo.paths)) {
    for (const [metodo, op] of Object.entries(ops)) {
      const nova = novo.paths[caminho]?.[metodo]
      const onde = `${metodo.toUpperCase()} ${caminho}`
      if (!nova) {
        quebras.push(`${onde}: operação removida`)
        continue
      }
      for (const p of nova.parameters ?? []) {
        const existia = (op.parameters ?? []).find((q) => q.name === p.name && q.in === p.in)
        if (p.required && !existia?.required)
          quebras.push(`${onde}: parâmetro ${p.name} passou a ser obrigatório`)
      }
      for (const p of op.parameters ?? []) {
        if (!(nova.parameters ?? []).some((q) => q.name === p.name && q.in === p.in)) {
          quebras.push(`${onde}: parâmetro ${p.name} removido`)
        }
      }
      const vistos = new Set<string>()
      comparar(
        `${onde} (corpo)`,
        op.requestBody?.content?.['application/json']?.schema,
        nova.requestBody?.content?.['application/json']?.schema,
        true,
        vistos,
      )
      for (const [status, resposta] of Object.entries(op.responses ?? {})) {
        if (!status.startsWith('2')) continue
        comparar(
          `${onde} (${status})`,
          resposta.content?.['application/json']?.schema,
          nova.responses?.[status]?.content?.['application/json']?.schema,
          false,
          vistos,
        )
      }
    }
  }
  return quebras
}
