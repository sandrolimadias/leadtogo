import { Logger } from '@nestjs/common'

export interface DadosDoCep {
  logradouro: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  /** Código IBGE do município, quando o provedor traz */
  municipioCodigo: number | null
}

export class CepIndisponivel extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'CepIndisponivel'
  }
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Consulta de CEP: ViaCEP e, se ela falhar, a BrasilAPI. Só o CEP sai do Leadtogo. Para ser educado
 * com os serviços públicos, as chamadas deste processo respeitam um intervalo mínimo entre si.
 * `null` = CEP que não existe (resposta definitiva); falha de rede em AMBOS lança `CepIndisponivel`.
 */
export class ProvedorCep {
  private readonly log = new Logger('Cep')
  private ultimaChamada = 0

  constructor(
    private readonly urlViaCep: string,
    private readonly urlBrasilApi: string,
    private readonly tempoMs: number,
    private readonly intervaloMs = 250,
    private readonly buscar: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  private async esperar(): Promise<void> {
    const espera = this.ultimaChamada + this.intervaloMs - Date.now()
    this.ultimaChamada = Math.max(Date.now(), this.ultimaChamada + this.intervaloMs)
    if (espera > 0) await new Promise((r) => setTimeout(r, espera))
  }

  private async pegar(url: string): Promise<{ status: number; corpo: unknown }> {
    await this.esperar()
    let resposta: Response
    try {
      resposta = await this.buscar(url, {
        headers: { accept: 'application/json', 'user-agent': 'Leadtogo/1.0 (+consulta de CEP)' },
        signal: AbortSignal.timeout(this.tempoMs),
      })
    } catch (erro) {
      throw new CepIndisponivel(
        erro instanceof Error && erro.name === 'TimeoutError' ? 'tempo esgotado' : 'sem conexão',
      )
    }
    if (resposta.status === 404 || resposta.status === 400) return { status: 404, corpo: null }
    if (!resposta.ok) throw new CepIndisponivel(`HTTP ${resposta.status}`)
    try {
      return { status: 200, corpo: await resposta.json() }
    } catch {
      throw new CepIndisponivel('resposta que não é JSON')
    }
  }

  async consultar(cep: string): Promise<DadosDoCep | null> {
    try {
      const { corpo } = await this.pegar(`${this.urlViaCep.replace(/\/+$/, '')}/${cep}/json/`)
      const v = corpo as Record<string, unknown> | null
      if (v && v['erro'] !== true && v['erro'] !== 'true') {
        const ibge = Number.parseInt(typeof v['ibge'] === 'string' ? v['ibge'] : '', 10)
        return {
          logradouro: texto(v['logradouro']),
          bairro: texto(v['bairro']),
          cidade: texto(v['localidade']),
          uf: texto(v['uf']),
          municipioCodigo: Number.isFinite(ibge) ? ibge : null,
        }
      }
      if (v) return null // "erro": CEP que não existe
    } catch (e) {
      this.log.warn(`ViaCEP: ${e instanceof Error ? e.message : 'falha'}; tentando a BrasilAPI`)
    }
    const { status, corpo } = await this.pegar(`${this.urlBrasilApi.replace(/\/+$/, '')}/${cep}`)
    if (status === 404 || !corpo) return null
    const b = corpo as Record<string, unknown>
    return {
      logradouro: texto(b['street']),
      bairro: texto(b['neighborhood']),
      cidade: texto(b['city']),
      uf: texto(b['state']),
      municipioCodigo: null,
    }
  }
}
