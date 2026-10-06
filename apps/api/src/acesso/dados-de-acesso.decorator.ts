import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

import type { DadosDeAcesso, RequisicaoAutenticada } from './requisicao.js'

/**
 * Dados que o AcessoGuard levantou da requisição (sessão, vínculos, tipo de acesso):
 * `@Acesso() acesso: DadosDeAcesso`. Só existe em rota protegida.
 */
export const Acesso = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): DadosDeAcesso => {
    const dados = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().dadosDeAcesso
    if (!dados) throw new Error('Acesso() usado em rota pública')
    return dados
  },
)
