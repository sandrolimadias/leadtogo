import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'

import { contextoDaRequisicao } from '../log/contexto-log.js'
import { CODIGO_POR_STATUS, type DetalheErro, ErroApi } from './erro-api.js'

/** Formato único de erro da API. Nada de stack trace, SQL ou mensagem interna na resposta. */
export interface RespostaDeErro {
  statusCode: number
  /** Código estável para o front (ex.: `validacao_invalida`, `2fa_obrigatorio`) */
  erro: string
  mensagem: string
  request_id?: string
  detalhes?: DetalheErro[]
}

/** Erros dos parsers de corpo (body-parser/http-errors) trazem `status` e `type`. */
interface ErroDeParser {
  status?: number
  statusCode?: number
  type?: string
  expose?: boolean
}

function statusDe(erro: unknown): number | undefined {
  if (erro instanceof HttpException) return erro.getStatus()
  const parser = erro as ErroDeParser
  const status = parser.status ?? parser.statusCode
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined
}

@Catch()
export class FiltroDeExcecoes implements ExceptionFilter {
  private readonly log = new Logger(FiltroDeExcecoes.name)

  catch(erro: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()
    const requestId = contextoDaRequisicao(req)?.requestId

    const status = statusDe(erro) ?? 500
    let corpo: RespostaDeErro

    if (erro instanceof ErroApi) {
      // Erro nosso, com mensagem feita para o cliente (inclusive 5xx intencionais, como o 503)
      if (status >= 500) this.log.warn(`${erro.codigo}: ${erro.message}`)
      corpo = {
        statusCode: status,
        erro: erro.codigo,
        mensagem: erro.message,
        ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
      }
    } else if (status >= 500) {
      // Falha inesperada: o detalhe vai só para o log (com o request_id), nunca para o cliente
      this.log.error(erro instanceof Error ? (erro.stack ?? erro.message) : String(erro))
      corpo = { statusCode: 500, erro: 'erro_interno', mensagem: 'Erro interno. Tente novamente.' }
    } else if (erro instanceof HttpException) {
      corpo = {
        statusCode: status,
        erro: CODIGO_POR_STATUS[status] ?? 'requisicao_invalida',
        mensagem: mensagemDe(erro),
      }
    } else {
      // Erro de parser (JSON malformado, corpo grande demais...)
      const parser = erro as ErroDeParser
      const porTipo: Record<string, [string, string]> = {
        'entity.parse.failed': ['corpo_invalido', 'O corpo da requisição não é um JSON válido.'],
        'entity.too.large': ['corpo_grande_demais', 'O corpo da requisição é grande demais.'],
      }
      const [codigo, mensagem] = porTipo[parser.type ?? ''] ?? [
        CODIGO_POR_STATUS[status] ?? 'requisicao_invalida',
        'Requisição inválida.',
      ]
      corpo = { statusCode: status, erro: codigo, mensagem }
    }

    if (requestId) corpo.request_id = requestId
    res.status(corpo.statusCode).json(corpo)
  }
}

/** Mensagem de uma HttpException do Nest (pode vir como texto ou como objeto). */
function mensagemDe(erro: HttpException): string {
  const resposta = erro.getResponse()
  if (typeof resposta === 'string') return resposta
  const mensagem = (resposta as { message?: unknown }).message
  if (Array.isArray(mensagem)) return mensagem.join('; ')
  return typeof mensagem === 'string' ? mensagem : erro.message
}
