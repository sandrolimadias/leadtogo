import { createTransport } from 'nodemailer'
import { beforeEach, describe, expect, it } from 'vitest'

import { aguardarMensagem, limparCaixa, mensagensPara, primeiroLink } from './mailpit.js'

// Garante que o SMTP de desenvolvimento (Mailpit) recebe e que os testes conseguem ler o que chegou.
const smtp = createTransport({
  host: process.env['SMTP_HOST'] ?? 'localhost',
  port: Number(process.env['SMTP_PORT'] ?? 1025),
  secure: false,
})

beforeEach(limparCaixa)

describe('Mailpit (SMTP de desenvolvimento)', () => {
  it('recebe um e-mail pelo SMTP e o devolve pela API HTTP, com o link', async () => {
    await smtp.sendMail({
      from: 'Leadtogo <nao-responder@leadtogo.local>',
      to: 'ana@exemplo.com',
      subject: 'Redefinir senha',
      text: 'Clique para redefinir: https://crm.exemplo.com/redefinir?token=abc123',
    })
    const mensagem = await aguardarMensagem('ana@exemplo.com')
    expect(mensagem.Subject).toBe('Redefinir senha')
    expect(primeiroLink(mensagem)).toBe('https://crm.exemplo.com/redefinir?token=abc123')
  })

  it('separa as mensagens por destinatário e limpa a caixa', async () => {
    for (const to of ['a@exemplo.com', 'b@exemplo.com']) {
      await smtp.sendMail({ from: 'x@leadtogo.local', to, subject: `para ${to}`, text: 'oi' })
    }
    await aguardarMensagem('a@exemplo.com')
    await aguardarMensagem('b@exemplo.com')
    expect((await mensagensPara('a@exemplo.com'))[0]?.Subject).toBe('para a@exemplo.com')
    await limparCaixa()
    expect(await mensagensPara('a@exemplo.com')).toHaveLength(0)
  })
})
