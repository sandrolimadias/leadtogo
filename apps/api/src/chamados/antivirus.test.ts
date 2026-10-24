import { Readable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'

import { varrerComClamd, VarreduraIndisponivel } from './antivirus.js'
import { type ClamdFalso, eicar, subirClamdFalso } from '../testes/clamd-falso.js'

let clamd: ClamdFalso | undefined
afterEach(async () => {
  await clamd?.parar()
  clamd = undefined
})

const opcoes = (porta: number) => ({ host: '127.0.0.1', porta, tempoLimiteMs: 3000 })

describe('cliente do clamd (INSTREAM)', () => {
  it('arquivo limpo: manda o comando e todos os bytes, em blocos, e entende o OK', async () => {
    clamd = await subirClamdFalso()
    const bytes = Buffer.alloc(300_000, 7)
    const r = await varrerComClamd(
      Readable.from([bytes.subarray(0, 100_000), bytes.subarray(100_000)]),
      opcoes(clamd.porta),
    )
    expect(r).toEqual({ limpo: true })
    expect(clamd.recebidos).toHaveLength(1)
    expect(clamd.recebidos[0]?.comando).toBe('zINSTREAM')
    expect(clamd.recebidos[0]?.bytes.equals(bytes)).toBe(true)
  })

  it('arquivo do EICAR: devolve a assinatura encontrada', async () => {
    clamd = await subirClamdFalso()
    const r = await varrerComClamd(Readable.from([eicar()]), opcoes(clamd.porta))
    expect(r).toEqual({ limpo: false, assinatura: 'Eicar-Test-Signature' })
  })

  it('arquivo vazio de bytes também completa a varredura', async () => {
    clamd = await subirClamdFalso()
    expect(await varrerComClamd(Readable.from([]), opcoes(clamd.porta))).toEqual({ limpo: true })
  })

  it('resposta de erro, clamd fora do ar e clamd mudo nunca viram "limpo"', async () => {
    clamd = await subirClamdFalso(() => 'INSTREAM size limit exceeded. ERROR')
    await expect(
      varrerComClamd(Readable.from([Buffer.from('x')]), opcoes(clamd.porta)),
    ).rejects.toBeInstanceOf(VarreduraIndisponivel)
    await clamd.parar()
    // porta fechada
    await expect(
      varrerComClamd(Readable.from([Buffer.from('x')]), opcoes(clamd.porta)),
    ).rejects.toBeInstanceOf(VarreduraIndisponivel)
    clamd = await subirClamdFalso(() => null)
    await expect(
      varrerComClamd(Readable.from([Buffer.from('x')]), {
        ...opcoes(clamd.porta),
        tempoLimiteMs: 300,
      }),
    ).rejects.toThrow(/tempo esgotado/)
  })

  it('falha ao ler o arquivo: a varredura não acontece', async () => {
    clamd = await subirClamdFalso()
    const quebrado = new Readable({
      read() {
        this.destroy(new Error('conexão com o Garage caiu'))
      },
    })
    await expect(varrerComClamd(quebrado, opcoes(clamd.porta))).rejects.toThrow(
      /leitura do arquivo/,
    )
  })
})
