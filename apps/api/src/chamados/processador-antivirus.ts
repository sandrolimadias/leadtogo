import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { type Conexao, sql } from '@leadtogo/db'
import type { Job } from 'bullmq'
import { Readable } from 'node:stream'
import type { Logger } from 'pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import { varrerComClamd, VarreduraIndisponivel } from './antivirus.js'
import type { JobDeVarredura } from './fila-antivirus.js'

type Desfecho = 'limpo' | 'infectado' | 'ja_varrido' | 'sem_anexo'

/**
 * Consumidor da fila `antivirus`: lê o anexo do Garage, varre no clamd e grava o resultado. Só "limpo" libera o
 * download. Se o clamd não responde (ou o arquivo não pode ser lido), o job FALHA e o BullMQ tenta de novo com
 * espera progressiva: o anexo fica "pendente_varredura" (nunca baixável) e o erro fica gravado nele. Idempotente:
 * um anexo já varrido não é varrido de novo.
 */
export function processadorDeAntivirus(deps: {
  config: Configuracao
  banco: Conexao
  s3: S3Client
  log: Logger
}) {
  const { config, banco, s3, log } = deps
  return async (job: Job<JobDeVarredura>): Promise<Desfecho> => {
    const { tenantId, anexoId } = job.data
    // Só estas duas tabelas (nunca vem de fora): as colunas do arquivo têm os mesmos nomes nas duas
    const tabela = sql.raw(
      job.data.tipo === 'documento'
        ? 'documentos'
        : job.data.tipo === 'midia'
          ? 'publicacao_midias'
          : 'chamado_anexos',
    )
    const comTenant = <T>(
      fn: (tx: Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]) => Promise<T>,
    ) =>
      banco.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
        return fn(tx)
      })

    const [anexo] = await comTenant((tx) =>
      tx.execute<{ chave_arquivo: string; estado: string; enviado_em: string | null }>(sql`
        SELECT chave_arquivo, estado, enviado_em FROM ${tabela} WHERE id = ${anexoId} AND excluido_em IS NULL`),
    )
    if (!anexo || anexo.enviado_em === null) return 'sem_anexo'
    if (anexo.estado !== 'pendente_varredura') return 'ja_varrido'
    if (!config.CLAMAV_HOST) throw new VarreduraIndisponivel('CLAMAV_HOST não configurado')

    try {
      const objeto = await s3.send(
        new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: anexo.chave_arquivo }),
      )
      if (!(objeto.Body instanceof Readable)) throw new VarreduraIndisponivel('objeto sem conteúdo')
      const r = await varrerComClamd(objeto.Body, {
        host: config.CLAMAV_HOST,
        porta: config.CLAMAV_PORT,
        tempoLimiteMs: config.CLAMAV_TIMEOUT_MS,
      })
      if (r.limpo) {
        await comTenant((tx) =>
          tx.execute(sql`
            UPDATE ${tabela} SET estado = 'limpo', varrido_em = now(), ultimo_erro = NULL,
              tentativas_varredura = tentativas_varredura + 1, atualizado_em = now()
            WHERE id = ${anexoId} AND estado = 'pendente_varredura'`),
        )
        return 'limpo'
      }
      log.warn({ anexoId, tenantId, assinatura: r.assinatura }, 'anexo infectado bloqueado')
      await comTenant((tx) =>
        tx.execute(sql`
          UPDATE ${tabela} SET estado = 'infectado', assinatura = ${r.assinatura}, varrido_em = now(),
            ultimo_erro = NULL, tentativas_varredura = tentativas_varredura + 1, atualizado_em = now()
          WHERE id = ${anexoId} AND estado = 'pendente_varredura'`),
      )
      return 'infectado'
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e)
      await comTenant((tx) =>
        tx.execute(sql`
          UPDATE ${tabela} SET ultimo_erro = ${mensagem.slice(0, 300)},
            tentativas_varredura = tentativas_varredura + 1, atualizado_em = now()
          WHERE id = ${anexoId}`),
      ).catch(() => undefined)
      throw e
    }
  }
}
