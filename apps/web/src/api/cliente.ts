import { criarApiClient } from '@leadtogo/api-client'

type AoPerderAEmpresa = () => void | Promise<void>
let aoPerderAEmpresa: AoPerderAEmpresa | null = null

/**
 * Quem cuida de "perdi o acesso à empresa ativa" (a casca do app). Uma só pessoa por vez: o app tem uma
 * casca. Passar `null` desliga (ao desmontar).
 */
export function registrarAoPerderAEmpresa(tratador: AoPerderAEmpresa | null) {
  aoPerderAEmpresa = tratador
}

/**
 * Se a API disser que a pessoa não tem mais acesso à empresa ativa (ela foi desativada com a sessão
 * aberta: 403 `empresa_ativa_invalida`), avisa a casca. A resposta segue intacta para quem chamou.
 */
async function vigiarAcessoDaEmpresa(resposta: Response): Promise<Response> {
  if (resposta.status !== 403 || !aoPerderAEmpresa) return resposta
  try {
    const corpo = (await resposta.clone().json()) as { erro?: string }
    if (corpo.erro === 'empresa_ativa_invalida') void aoPerderAEmpresa()
  } catch {
    // corpo que não é JSON: não é o erro que interessa
  }
  return resposta
}

/** Envolve um `fetch` com o vigia do acesso à empresa ativa. */
export const comVigia =
  (base: typeof fetch): typeof fetch =>
  async (...args) =>
    vigiarAcessoDaEmpresa(await base(...args))

/**
 * Cliente da API. Sempre por caminhos relativos (/v1/...): em desenvolvimento o proxy do Vite leva até a
 * API; em produção o Traefik roteia `crm.aledias.com.br/v1` para a API e o resto para o web (domínio
 * único). Por isso a mesma imagem do web serve para qualquer ambiente e não há CORS nem cookie entre origens.
 */
export const api = criarApiClient('', {
  // `fetch` lido a cada chamada (e não na criação): os testes o trocam
  fetch: comVigia((...args) => globalThis.fetch(...args)),
})
