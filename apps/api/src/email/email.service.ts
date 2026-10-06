import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { VALKEY } from '../infra/infra.module.js'
import { chavesDe, cifrar } from '../seguranca/cifra.js'
import { FILAS, opcoesDeFila } from '../worker/filas.js'
import type { ModeloDeEmail } from './modelos.js'

/** Dados do job da fila `email`: o conteúdo inteiro vai cifrado (`v1:...`), pois os links levam token. */
export interface JobDeEmail {
  p: string
}

/**
 * E-mails de identidade (verificação e recuperação de senha): a API só ENFILEIRA; o worker envia, com
 * reenvio e espera progressiva. Se não der para enfileirar (Valkey fora), lança erro: a requisição
 * falha em vez de responder sucesso sem e-mail. O convite não passa por aqui (vai pelo outbox).
 */
@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly fila: Queue

  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    @Inject(VALKEY) valkey: Redis,
  ) {
    this.fila = new Queue(FILAS.email, opcoesDeFila(config, valkey))
  }

  async onModuleDestroy(): Promise<void> {
    await this.fila.close()
  }

  /** O envio real depende do SMTP do worker; aqui só se sabe se a API foi configurada com um. */
  get configurado(): boolean {
    return Boolean(this.config.SMTP_HOST)
  }

  async enfileirar(para: string, modelo: ModeloDeEmail): Promise<void> {
    const p = cifrar(JSON.stringify({ para, ...modelo }), chavesDe(this.config))
    try {
      await this.fila.add('enviar', { p } satisfies JobDeEmail, {
        attempts: this.config.EMAIL_TENTATIVAS,
        backoff: { type: 'exponential', delay: this.config.EMAIL_ESPERA_MS },
      })
    } catch {
      throw new ErroApi(
        'servico_indisponivel',
        'Não foi possível agendar o envio do e-mail agora. Tente de novo em instantes.',
        503,
      )
    }
  }
}
