import { createTransport, type Transporter } from 'nodemailer'
import type { Logger } from 'pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import type { ModeloDeEmail } from './modelos.js'

/**
 * Envio por SMTP (Mailpit em desenvolvimento; o provedor de produção é escolhido na E13). Quem usa é o
 * WORKER: a API só enfileira. Falha de envio LANÇA erro, para a fila tentar de novo com espera progressiva.
 */
export class EnviadorSmtp {
  private readonly transporte: Transporter | null

  constructor(
    private readonly config: Configuracao,
    private readonly log: Logger,
  ) {
    this.transporte = config.SMTP_HOST
      ? createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          auth:
            config.SMTP_USER && config.SMTP_PASSWORD
              ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
              : undefined,
          connectionTimeout: 5000,
          socketTimeout: 10_000,
        })
      : null
  }

  get configurado(): boolean {
    return this.transporte !== null
  }

  /** Sem SMTP configurado nada sai (aviso no log, sem erro: tentar de novo não resolveria). O log nunca leva destinatário nem corpo. */
  async enviar(para: string, modelo: ModeloDeEmail): Promise<void> {
    if (!this.transporte) {
      this.log.warn({ assunto: modelo.assunto }, 'SMTP não configurado: e-mail não enviado')
      return
    }
    await this.transporte.sendMail({
      from: this.config.SMTP_FROM,
      to: para,
      subject: modelo.assunto,
      text: modelo.texto,
      html: modelo.html,
    })
    this.log.info({ assunto: modelo.assunto }, 'e-mail enviado')
  }
}
