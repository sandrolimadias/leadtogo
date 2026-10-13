import { type Conexao, sql } from '@leadtogo/db'
import {
  type DadosDaReceita,
  cnpjValido,
  normalizarCnpj,
  normalizarRespostaDaReceita,
} from '@leadtogo/shared'
import { Inject, Injectable, Logger } from '@nestjs/common'

import type { Configuracao } from '../configuracao/configuracao.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'
import { FalhaDaReceita, ProvedorHttpDaReceita, type ProvedorDeReceita } from './provedores.js'

/** O cache vale 30 dias (docs/modelagem_banco.md, seção 4). */
export const VALIDADE_DO_CACHE_DIAS = 30

export const PROVEDORES_DA_RECEITA = Symbol('PROVEDORES_DA_RECEITA')

export interface ConsultaDeCnpj {
  dados: DadosDaReceita
  /** `minhareceita` ou `brasilapi` */
  fonte: string
  consultadoEm: Date
  /** A resposta veio do cache (sem chamar a Receita agora) */
  doCache: boolean
  /** Veio do cache vencido, porque as duas fontes estavam fora do ar */
  expirada: boolean
}

type LinhaDoCache = {
  dados: unknown
  consultado_em: Date
  fonte: string
}

/** Provedores na ordem: Minha Receita primeiro, BrasilAPI como segunda tentativa. */
export function provedoresPadrao(config: Configuracao): ProvedorDeReceita[] {
  return [
    new ProvedorHttpDaReceita('minhareceita', config.MINHA_RECEITA_URL, config.RECEITA_TIMEOUT_MS),
    new ProvedorHttpDaReceita('brasilapi', config.BRASILAPI_URL, config.RECEITA_TIMEOUT_MS),
  ]
}

/**
 * Consulta de CNPJ na Receita, com cache em `receita_consultas` (dado público, compartilhado entre
 * empresas do grupo), segunda tentativa e consultas repetidas juntas numa só chamada.
 *
 * Limitação conhecida: a BrasilAPI repassa a própria Minha Receita, então só cobre falha de rede ou de
 * hospedagem da Minha Receita, não uma queda da base dela. A alternativa de verdade será a instância
 * própria da Minha Receita (docs/configuracao_tecnologia.md, seção 17).
 */
@Injectable()
export class ReceitaService {
  private readonly log = new Logger(ReceitaService.name)
  private readonly emAndamento = new Map<string, Promise<ConsultaDeCnpj>>()

  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    @Inject(PROVEDORES_DA_RECEITA) private readonly provedores: ProvedorDeReceita[],
  ) {}

  /**
   * `forcar` ignora o cache (botão "Atualizar pela Receita"). Erros: `cnpj_invalido` (400),
   * `cnpj_nao_encontrado` (404) e `receita_indisponivel` (503, as duas fontes fora do ar e sem cache).
   */
  consultar(cnpjInformado: string, opcoes: { forcar?: boolean } = {}): Promise<ConsultaDeCnpj> {
    const cnpj = normalizarCnpj(cnpjInformado)
    if (!cnpjValido(cnpj)) {
      throw new ErroApi(
        'cnpj_invalido',
        'CNPJ inválido. Confira os 14 caracteres e os dígitos.',
        400,
      )
    }
    const chave = `${cnpj}:${opcoes.forcar ? 'f' : 'n'}`
    const andando = this.emAndamento.get(chave)
    if (andando) return andando
    const trabalho = this.executar(cnpj, opcoes.forcar === true).finally(() => {
      this.emAndamento.delete(chave)
    })
    this.emAndamento.set(chave, trabalho)
    return trabalho
  }

  private async executar(cnpj: string, forcar: boolean): Promise<ConsultaDeCnpj> {
    const guardado = await this.lerCache(cnpj)
    const idadeMs = guardado ? Date.now() - guardado.consultado_em.getTime() : Infinity
    if (guardado && !forcar && idadeMs < VALIDADE_DO_CACHE_DIAS * 86_400_000) {
      const lido = this.lerDoCache(guardado)
      if (lido) return { ...lido, doCache: true, expirada: false }
    }

    for (const provedor of this.provedores) {
      try {
        const bruto = await provedor.consultar(cnpj)
        const dados = normalizarRespostaDaReceita(bruto) // resposta fora do formato: tenta o próximo
        await this.gravarCache(cnpj, bruto, provedor.nome)
        return {
          dados,
          fonte: provedor.nome,
          consultadoEm: new Date(),
          doCache: false,
          expirada: false,
        }
      } catch (erro) {
        if (erro instanceof FalhaDaReceita && erro.tipo === 'invalido') {
          throw new ErroApi(
            'cnpj_invalido',
            'A Receita recusou este CNPJ. Confira os dígitos.',
            400,
          )
        }
        if (erro instanceof FalhaDaReceita && erro.tipo === 'nao_encontrado') {
          throw new ErroApi(
            'cnpj_nao_encontrado',
            'A Receita não tem este CNPJ. Confira o número ou cadastre a empresa sem consulta.',
            404,
          )
        }
        const motivo = erro instanceof Error ? erro.message : String(erro)
        this.log.warn(`consulta falhou em ${provedor.nome}: ${motivo}`)
      }
    }

    // As duas fontes fora do ar: um cache vencido ainda serve melhor que nada
    if (guardado) {
      const lido = this.lerDoCache(guardado)
      if (lido) return { ...lido, doCache: true, expirada: true }
    }
    throw new ErroApi(
      'receita_indisponivel',
      'Não foi possível consultar a Receita agora. Tente de novo em instantes ou preencha os dados à mão.',
      503,
    )
  }

  private lerDoCache(linha: LinhaDoCache): Omit<ConsultaDeCnpj, 'doCache' | 'expirada'> | null {
    try {
      return {
        dados: normalizarRespostaDaReceita(linha.dados),
        fonte: linha.fonte,
        consultadoEm: linha.consultado_em,
      }
    } catch {
      return null // cache que não lê mais (formato antigo): como se não houvesse
    }
  }

  private async lerCache(cnpj: string): Promise<LinhaDoCache | null> {
    const [linha] = await this.banco.db.execute<LinhaDoCache>(
      sql`SELECT dados, consultado_em, fonte FROM receita_consultas WHERE cnpj = ${cnpj}`,
    )
    if (!linha) return null
    // O cliente do Drizzle devolve o jsonb como texto e o timestamptz como texto: converte aqui, uma vez
    const dados: unknown = typeof linha.dados === 'string' ? JSON.parse(linha.dados) : linha.dados
    return { dados, consultado_em: new Date(linha.consultado_em), fonte: linha.fonte }
  }

  private async gravarCache(cnpj: string, bruto: unknown, fonte: string): Promise<void> {
    await this.banco.db.execute(sql`
      INSERT INTO receita_consultas (cnpj, dados, consultado_em, fonte)
      VALUES (${cnpj}, ${JSON.stringify(bruto)}::jsonb, now(), ${fonte})
      ON CONFLICT (cnpj) DO UPDATE SET dados = EXCLUDED.dados, consultado_em = now(), fonte = EXCLUDED.fonte`)
  }
}
