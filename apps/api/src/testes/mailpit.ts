/**
 * Lê o que a API enviou, pela API HTTP do Mailpit (docker compose, porta 8025).
 * Os testes de recuperação de senha, verificação de e-mail e convites usam isto.
 */

import { PRAZO_ESPERA_MS } from './espera.js'

const base = () => process.env['MAILPIT_URL'] ?? 'http://localhost:8025'

export interface MensagemResumo {
  ID: string
  Subject: string
  To: { Address: string }[]
  Created: string
}
export interface MensagemCompleta extends MensagemResumo {
  Text: string
  HTML: string
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${base()}${caminho}`, init)
  if (!resposta.ok) throw new Error(`Mailpit ${caminho}: HTTP ${resposta.status}`)
  return (await resposta.json()) as T
}

/** Apaga todas as mensagens (chame antes do cenário). */
export async function limparCaixa(): Promise<void> {
  await fetch(`${base()}/api/v1/messages`, { method: 'DELETE' })
}

export async function mensagensPara(email: string): Promise<MensagemResumo[]> {
  const { messages } = await chamar<{ messages: MensagemResumo[] }>(
    `/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  )
  return messages
}

/**
 * Espera chegar uma mensagem para o endereço (até `ms`) e devolve o conteúdo completo. O e-mail passa
 * pelo outbox, pela fila e pelo worker antes do SMTP: com a máquina ou o runner lentos isso passa de 5 s
 * (sem nenhuma limpeza concorrente: os arquivos rodam em sequência e a caixa só é limpa antes do envio).
 */
export async function aguardarMensagem(
  email: string,
  ms = PRAZO_ESPERA_MS,
): Promise<MensagemCompleta> {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    const [mensagem] = await mensagensPara(email)
    if (mensagem) return chamar<MensagemCompleta>(`/api/v1/message/${mensagem.ID}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Nenhum e-mail para ${email} em ${ms} ms`)
}

/** Primeiro link (http/https) do texto da mensagem. */
export function primeiroLink(mensagem: MensagemCompleta): string {
  const achado = /https?:\/\/[^\s"<>]+/.exec(mensagem.Text || mensagem.HTML)
  if (!achado) throw new Error('A mensagem não tem link')
  return achado[0]
}
