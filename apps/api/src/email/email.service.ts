import { Inject, Injectable, Logger } from '@nestjs/common'
import { createTransport, type Transporter } from 'nodemailer'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import type { ModeloDeEmail } from './modelos.js'

/** Envio de e-mail por SMTP (Mailpit em desenvolvimento; o provedor de produção é escolhido na E13). */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name)
  private readonly transporte: Transporter | null

  constructor(@Inject(CONFIGURACAO) private readonly config: Configuracao) {
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

  /**
   * Envia o e-mail. Sem SMTP configurado, registra um aviso e segue (nenhum e-mail sai). O log
   * nunca leva o destinatário nem o corpo (que tem links com token).
   */
  async enviar(para: string, modelo: ModeloDeEmail): Promise<void> {
    if (!this.transporte) {
      this.log.warn(`SMTP não configurado: e-mail "${modelo.assunto}" não foi enviado`)
      return
    }
    try {
      await this.transporte.sendMail({
        from: this.config.SMTP_FROM,
        to: para,
        subject: modelo.assunto,
        text: modelo.texto,
        html: modelo.html,
      })
      this.log.log(`e-mail enviado: "${modelo.assunto}"`)
    } catch (erro) {
      // Não propaga: quem pediu (ex.: "esqueci a senha") não pode descobrir se o e-mail existe pela falha
      this.log.error(
        `falha ao enviar "${modelo.assunto}": ${erro instanceof Error ? erro.message : String(erro)}`,
      )
    }
  }
}
