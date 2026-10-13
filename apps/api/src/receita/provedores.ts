import { Logger } from '@nestjs/common'

/**
 * O que um provedor de dados da Receita pode responder de errado. `invalido` (400) e `nao_encontrado`
 * (404) são respostas DEFINITIVAS: a alternativa não é consultada. `indisponivel` (rede, tempo
 * esgotado, 429, 5xx, resposta que não é JSON) passa para o provedor seguinte.
 */
export type TipoDeFalhaDaReceita = 'invalido' | 'nao_encontrado' | 'indisponivel'

export class FalhaDaReceita extends Error {
  constructor(
    readonly tipo: TipoDeFalhaDaReceita,
    mensagem: string,
    readonly provedor: string,
  ) {
    super(mensagem)
    this.name = 'FalhaDaReceita'
  }
}

export interface ProvedorDeReceita {
  /** Vai para o cache (`receita_consultas.fonte`) */
  readonly nome: string
  /** O JSON bruto da Receita; lança `FalhaDaReceita` */
  consultar(cnpj: string): Promise<unknown>
}

/**
 * Provedor HTTP no formato da Minha Receita: `GET {base}/{cnpj}`. A BrasilAPI responde o mesmo JSON
 * (o serviço dela repassa a Minha Receita), então os dois usam esta classe com URLs diferentes. Quando
 * houver uma instância própria da Minha Receita, basta apontar `MINHA_RECEITA_URL` para ela.
 */
export class ProvedorHttpDaReceita implements ProvedorDeReceita {
  private readonly log = new Logger('Receita')

  constructor(
    readonly nome: string,
    private readonly urlBase: string,
    private readonly tempoMs: number,
    private readonly buscar: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  async consultar(cnpj: string): Promise<unknown> {
    const url = `${this.urlBase.replace(/\/+$/, '')}/${encodeURIComponent(cnpj)}`
    let resposta: Response
    try {
      resposta = await this.buscar(url, {
        headers: { accept: 'application/json', 'user-agent': 'Leadtogo/1.0 (+consulta de CNPJ)' },
        signal: AbortSignal.timeout(this.tempoMs),
      })
    } catch (erro) {
      const motivo =
        erro instanceof Error && erro.name === 'TimeoutError' ? 'tempo esgotado' : 'sem conexão'
      this.log.warn(`${this.nome}: ${motivo}`)
      throw new FalhaDaReceita('indisponivel', motivo, this.nome)
    }
    if (resposta.status === 400) {
      throw new FalhaDaReceita('invalido', 'CNPJ recusado pela Receita', this.nome)
    }
    if (resposta.status === 404) {
      throw new FalhaDaReceita('nao_encontrado', 'CNPJ não encontrado', this.nome)
    }
    if (!resposta.ok) {
      this.log.warn(`${this.nome}: HTTP ${resposta.status}`)
      throw new FalhaDaReceita('indisponivel', `HTTP ${resposta.status}`, this.nome)
    }
    try {
      return await resposta.json()
    } catch {
      this.log.warn(`${this.nome}: resposta que não é JSON`)
      throw new FalhaDaReceita('indisponivel', 'resposta que não é JSON', this.nome)
    }
  }
}
