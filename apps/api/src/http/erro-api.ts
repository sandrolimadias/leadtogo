import { HttpException } from '@nestjs/common'

/** Detalhe de um campo inválido (validação de entrada). */
export interface DetalheErro {
  campo: string
  mensagem: string
}

/**
 * Erro de negócio com código estável (`erro` na resposta), para o front tratar sem ler a mensagem.
 * Ex.: `throw new ErroApi('2fa_obrigatorio', 'Ative o 2FA para continuar.', 403)`.
 */
export class ErroApi extends HttpException {
  constructor(
    readonly codigo: string,
    mensagem: string,
    status: number,
    readonly detalhes?: DetalheErro[],
    /** Dados extras para o front (vão em `dados` na resposta); nada sensível */
    readonly dados?: Record<string, unknown>,
  ) {
    super(mensagem, status)
  }
}

/** Código padrão por status HTTP, quando o erro não traz um próprio. */
export const CODIGO_POR_STATUS: Record<number, string> = {
  400: 'requisicao_invalida',
  401: 'nao_autenticado',
  403: 'acesso_negado',
  404: 'nao_encontrado',
  405: 'metodo_nao_permitido',
  409: 'conflito',
  413: 'corpo_grande_demais',
  415: 'tipo_nao_suportado',
  422: 'entidade_nao_processavel',
  429: 'muitas_requisicoes',
}
