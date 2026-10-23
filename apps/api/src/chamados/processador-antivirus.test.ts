import { PutObjectCommand } from '@aws-sdk/client-s3'
import { criarConexao, novoId } from '@leadtogo/db'
import type { Job } from 'bullmq'
import { pino } from 'pino'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { criarClienteS3 } from '../infra/s3.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { dono, empresaDeOutraConta } from '../testes/mundo.js'
import { type ClamdFalso, eicar, subirClamdFalso } from './clamd-falso.js'
import type { JobDeVarredura } from './fila-antivirus.js'
import { processadorDeAntivirus } from './processador-antivirus.js'
import { noTenant } from './teste-chamados.js'

const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
const s3 = criarClienteS3(configuracaoDeTeste())
const log = pino({ level: 'silent' })
let clamd: ClamdFalso | undefined
afterEach(async () => {
  await clamd?.parar()
  clamd = undefined
})
afterAll(async () => {
  await banco.cliente.end({ timeout: 5 })
  await dono.end()
  s3.destroy()
})

/** Um anexo já enviado ao Garage, esperando a varredura (SQL direto, sem a API). */
async function anexoPendente(conteudo: Buffer) {
  const { tenantId } = await empresaDeOutraConta()
  const ids = { membro: novoId(), area: novoId(), chamado: novoId(), anexo: novoId() }
  const chave = `${tenantId}/chamados/${ids.chamado}/${ids.anexo}`
  await s3.send(
    new PutObjectCommand({
      Bucket: configuracaoDeTeste().S3_BUCKET,
      Key: chave,
      Body: conteudo,
    }),
  )
  await noTenant(tenantId, async (tx) => {
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.membro}, ${tenantId}, 'Quem enviou')`
    await tx`INSERT INTO areas_atendimento (id, tenant_id, nome) VALUES (${ids.area}, ${tenantId}, 'Suporte')`
    await tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, solicitante_membro_id)
      VALUES (${ids.chamado}, ${tenantId}, 1, 'Assunto', ${ids.area}, ${ids.membro})`
    await tx`INSERT INTO chamado_anexos (id, tenant_id, chamado_id, chave_arquivo, nome, mime, tamanho, enviado_em)
      VALUES (${ids.anexo}, ${tenantId}, ${ids.chamado}, ${chave}, 'a.pdf', 'application/pdf', ${conteudo.length}, now())`
  })
  const job = { data: { tenantId, anexoId: ids.anexo, eventoId: novoId() } } as Job<JobDeVarredura>
  const ler = async () =>
    (
      await noTenant(
        tenantId,
        (tx) =>
          tx<
            {
              estado: string
              assinatura: string | null
              ultimo_erro: string | null
              tentativas: number
            }[]
          >`SELECT estado, assinatura, ultimo_erro, tentativas_varredura AS tentativas FROM chamado_anexos WHERE id = ${ids.anexo}`,
      )
    )[0]
  return { job, ler }
}

const processador = (porta: number | undefined, host: string | undefined = '127.0.0.1') =>
  processadorDeAntivirus({
    config: configuracaoDeTeste({
      ...(host ? { CLAMAV_HOST: host } : {}),
      ...(porta ? { CLAMAV_PORT: String(porta) } : {}),
      CLAMAV_TIMEOUT_MS: '3000',
    }),
    banco,
    s3,
    log,
  })

describe('processador do antivírus (clamd falso)', () => {
  it('limpo: libera o anexo; rodar de novo não varre outra vez', async () => {
    clamd = await subirClamdFalso()
    const { job, ler } = await anexoPendente(Buffer.from('relatório trimestral'))
    expect(await processador(clamd.porta)(job)).toBe('limpo')
    expect(await ler()).toMatchObject({
      estado: 'limpo',
      assinatura: null,
      ultimo_erro: null,
      tentativas: 1,
    })
    expect(await processador(clamd.porta)(job)).toBe('ja_varrido')
    expect(clamd.recebidos).toHaveLength(1)
  })

  it('infectado: bloqueia e guarda a assinatura', async () => {
    clamd = await subirClamdFalso()
    const { job, ler } = await anexoPendente(eicar())
    expect(await processador(clamd.porta)(job)).toBe('infectado')
    expect(await ler()).toMatchObject({ estado: 'infectado', assinatura: 'Eicar-Test-Signature' })
  })

  it('clamd fora do ar: o job falha (para o BullMQ repetir), o anexo continua pendente e o erro fica gravado', async () => {
    clamd = await subirClamdFalso()
    const porta = clamd.porta
    await clamd.parar()
    clamd = undefined
    const { job, ler } = await anexoPendente(Buffer.from('qualquer coisa'))
    await expect(processador(porta)(job)).rejects.toThrow(/clamd/)
    const antes = await ler()
    expect(antes?.estado).toBe('pendente_varredura')
    expect(antes?.ultimo_erro).toMatch(/clamd/)
    expect(antes?.tentativas).toBe(1)
    // volta o antivírus: a nova tentativa conclui
    clamd = await subirClamdFalso()
    expect(await processador(clamd.porta)(job)).toBe('limpo')
  })

  it('sem CLAMAV_HOST nada é liberado: o job falha e o anexo continua pendente', async () => {
    const { job, ler } = await anexoPendente(Buffer.from('x'))
    await expect(processador(undefined, '')(job)).rejects.toThrow(/CLAMAV_HOST/)
    expect((await ler())?.estado).toBe('pendente_varredura')
  })

  it('anexo que ainda não terminou o envio ou não existe: nada a varrer', async () => {
    clamd = await subirClamdFalso()
    const { job } = await anexoPendente(Buffer.from('x'))
    const outro = { data: { ...job.data, anexoId: novoId() } } as Job<JobDeVarredura>
    expect(await processador(clamd.porta)(outro)).toBe('sem_anexo')
  })
})

// Contra um ClamAV de verdade (o do compose: `pnpm dev:up`, `TEST_CLAMAV_HOST=localhost`); sem a variável, pula.
const clamavReal = process.env['TEST_CLAMAV_HOST']
describe.skipIf(!clamavReal)('processador do antivírus (ClamAV de verdade)', () => {
  const real = () =>
    processadorDeAntivirus({
      config: configuracaoDeTeste({
        CLAMAV_HOST: clamavReal ?? '',
        CLAMAV_PORT: process.env['TEST_CLAMAV_PORT'] ?? '3310',
        CLAMAV_TIMEOUT_MS: '60000',
      }),
      banco,
      s3,
      log,
    })

  it('o arquivo do EICAR é bloqueado e um arquivo comum passa', async () => {
    const virus = await anexoPendente(eicar())
    expect(await real()(virus.job)).toBe('infectado')
    expect((await virus.ler())?.assinatura).toMatch(/eicar/i)
    const comum = await anexoPendente(Buffer.from('Proposta comercial. Nada de mais.'))
    expect(await real()(comum.job)).toBe('limpo')
  })
})
