import { carregarConfiguracao, ErroConfiguracao } from '../configuracao/configuracao.js'
import {
  esvaziarErros,
  iniciarObservabilidade,
  reportarErro,
  type PapelDoProcesso,
} from './erros.js'

export interface SaidaDoTeste {
  imprimir: (linha: string) => void
  imprimirErro: (linha: string) => void
}

/**
 * Dispara um erro de teste para o GlitchTip, para conferir de ponta a ponta (DSN, rede, commit no
 * `release`, limpeza de dados). Roda no terminal do container da API ou do worker; não existe rota
 * HTTP para isso. Códigos de saída: 0 enviado; 1 sem DSN ou envio não confirmado.
 */
export async function executarTestarErro(
  env: NodeJS.ProcessEnv,
  io: SaidaDoTeste,
  opcoes: Parameters<typeof iniciarObservabilidade>[2] = {},
): Promise<number> {
  let config
  try {
    config = carregarConfiguracao(env)
  } catch (erro) {
    io.imprimirErro(erro instanceof ErroConfiguracao ? erro.message : String(erro))
    return 1
  }
  const papel: PapelDoProcesso = env['PAPEL'] === 'worker' ? 'worker' : 'api'
  if (!iniciarObservabilidade(config, papel, opcoes)) {
    io.imprimirErro('SENTRY_DSN não está definida neste container: nada foi enviado.')
    return 1
  }
  reportarErro(new Error(`Erro de teste do Leadtogo (E14) ${new Date().toISOString()}`), {
    teste: 'true',
  })
  const enviado = await esvaziarErros(10_000)
  if (!enviado) {
    io.imprimirErro('O envio não foi confirmado em 10 s (rede, DSN ou GlitchTip fora do ar).')
    return 1
  }
  io.imprimir(
    `Erro de teste enviado (release ${config.APP_VERSION}, papel ${papel}). Confira em erros.crm.aledias.com.br.`,
  )
  return 0
}
