/** Erro de uma chamada ao portal, já em português e com o código estável da API. */
export interface ErroDoPortal {
  codigo: string
  mensagem: string
  status: number
  /** Erros por campo (formulários: 422 `respostas_invalidas`) */
  detalhes?: { campo: string; mensagem: string }[]
}

export type Resultado<T = void> = { ok: true; dados: T } | { ok: false; erro: ErroDoPortal }

export const ok = <T>(dados: T): Resultado<T> => ({ ok: true, dados })
export const falha = (erro: ErroDoPortal): Resultado<never> => ({ ok: false, erro })

const MENSAGENS_PADRAO: Record<number, string> = {
  401: 'Sua sessão terminou. Entre de novo.',
  403: 'Você não pode fazer isso.',
  404: 'Não encontramos o que você procura.',
  429: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  503: 'O serviço está indisponível agora. Tente de novo em alguns minutos.',
}

/** Textos para os códigos que a tela trata de um jeito próprio ou que merecem uma frase melhor. */
const MENSAGENS_POR_CODIGO: Record<string, string> = {
  nao_autenticado: 'Sua sessão terminou. Entre de novo.',
  link_invalido: 'Este link não vale mais. Peça um novo.',
  privacidade_obrigatoria: 'Para continuar, aceite o aviso de privacidade do portal.',
  codigo_invalido: 'Código incorreto ou vencido. Confira e tente de novo.',
  muitas_tentativas: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  origem_invalida: 'Não foi possível concluir por este endereço. Abra o portal pelo link oficial.',
  portal_indisponivel: 'O portal ainda não está disponível. Fale com a equipe.',
}

const SEM_REDE = 'Sem conexão com o servidor. Confira a internet e tente de novo.'

export const erroDeRede = (): ErroDoPortal => ({
  codigo: 'sem_rede',
  mensagem: SEM_REDE,
  status: 0,
})

/** Traduz o corpo de erro da API (`{ erro, mensagem }`) num erro do portal. */
export function traduzirErro(
  status: number,
  corpo?: {
    erro?: string
    mensagem?: string
    detalhes?: { campo: string; mensagem: string }[]
  } | null,
): ErroDoPortal {
  const codigo = corpo?.erro ?? `http_${status}`
  const mensagem =
    MENSAGENS_POR_CODIGO[codigo] ??
    (status === 429 ? MENSAGENS_PADRAO[429] : undefined) ??
    corpo?.mensagem ??
    MENSAGENS_PADRAO[status] ??
    'Não foi possível concluir agora. Tente de novo em alguns minutos.'
  return {
    codigo,
    mensagem,
    status,
    ...(Array.isArray(corpo?.detalhes) ? { detalhes: corpo.detalhes } : {}),
  }
}
