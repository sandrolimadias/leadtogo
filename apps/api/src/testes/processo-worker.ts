import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('../..', import.meta.url))

/** Compila a API (o teste exercita o `dist/worker.js` de verdade, o que vai para a imagem). */
export function compilarApi(): void {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: raiz, stdio: 'pipe' })
}

export async function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer()
    servidor.once('error', rejeitar)
    servidor.listen(0, '127.0.0.1', () => {
      const porta = (servidor.address() as { port: number }).port
      servidor.close(() => resolver(porta))
    })
  })
}

export interface WorkerFilho {
  processo: ChildProcess
  porta: number
  saida: () => string
  /** Espera o processo sair e devolve o código (ou o sinal) */
  aguardarSaida: (
    ms?: number,
  ) => Promise<{ codigo: number | null; sinal: NodeJS.Signals | null; emMs: number }>
  /** Espera o healthcheck responder 200 */
  aguardarPronto: (ms?: number) => Promise<void>
}

/** Sobe `node dist/worker.js` com ambiente de teste e a fila `teste`, num prefixo próprio. */
export async function subirWorker(extra: Record<string, string> = {}): Promise<WorkerFilho> {
  const porta = await portaLivre()
  let saida = ''
  const processo = spawn(process.execPath, ['dist/worker.js'], {
    cwd: raiz,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKER_SAUDE_PORTA: String(porta),
      LOG_LEVEL: 'info',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  processo.stdout?.on('data', (p) => (saida += String(p)))
  processo.stderr?.on('data', (p) => (saida += String(p)))
  const inicio = () => Date.now()
  const pronto = async (ms = 15_000) => {
    const limite = Date.now() + ms
    while (Date.now() < limite) {
      if (processo.exitCode !== null)
        throw new Error(`worker saiu antes de ficar pronto:\n${saida}`)
      try {
        const r = await fetch(`http://127.0.0.1:${porta}/health`)
        if (r.status === 200) return
      } catch {
        // ainda subindo
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`worker não ficou saudável em ${ms} ms:\n${saida}`)
  }
  return {
    processo,
    porta,
    saida: () => saida,
    aguardarPronto: pronto,
    aguardarSaida: (ms = 20_000) =>
      new Promise((resolver, rejeitar) => {
        const t0 = inicio()
        if (processo.exitCode !== null)
          return resolver({ codigo: processo.exitCode, sinal: processo.signalCode, emMs: 0 })
        const timer = setTimeout(
          () => rejeitar(new Error(`worker não saiu em ${ms} ms:\n${saida}`)),
          ms,
        )
        processo.once('exit', (codigo, sinal) => {
          clearTimeout(timer)
          resolver({ codigo, sinal, emMs: Date.now() - t0 })
        })
      }),
  }
}
