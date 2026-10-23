import type {
  ConfiguracaoDeVisitas,
  Me,
  EmpresaOffline,
  ModeloDeVisita,
  RelatorioDeVisita,
  ResultadoDeVisita,
} from '@leadtogo/api-client'
import type { SalvarVisitaEntrada } from '@leadtogo/shared'

import type { Resultado, ServicosDeAcesso } from '@/auth/tipos'

import { guardar, recuperar, recuperarTodos, remover } from './banco'

// Visitas sem sinal (G3b): o que o aparelho guarda e a fila de relatórios. Ver docs/lgpd.md, seção 3.2.

/** O que o relatório offline precisa além da empresa: resultados, modelos e o check-in. */
export interface ApoioDasVisitas {
  resultados: ResultadoDeVisita[]
  modelos: ModeloDeVisita[]
  configuracao: ConfiguracaoDeVisitas
  /** Para o campo "próximo passo" */
  tiposAtividade: { id: string; nome: string }[]
  /** Para o campo "dados da empresa: vertical" */
  verticais: { id: string; nome: string }[]
}

/** Um relatório esperando para subir. `dados` é o corpo do PUT (idempotente pelo id). */
export interface ItemDaFila {
  id: string
  empresaNome: string
  dados: SalvarVisitaEntrada
  atualizadoEm: string
  /** O servidor recusou (4xx): fica na fila com o motivo, para a pessoa corrigir */
  erro?: string
}

export const guardarEmpresas = async (empresas: EmpresaOffline[]) => {
  for (const e of empresas) await guardar('empresas', e.id, e)
}
export const empresaOffline = (id: string) => recuperar<EmpresaOffline>('empresas', id)
export const empresasOffline = async () =>
  (await recuperarTodos<EmpresaOffline>('empresas')).map((x) => x.valor)

export const guardarApoio = (apoio: ApoioDasVisitas) => guardar('apoio', 'visitas', apoio)

/**
 * A sessão já conferida no servidor, para abrir o app SEM SINAL e chegar às visitas (cifrada, 7 dias,
 * apagada ao sair). Com sinal, a sessão é sempre conferida no servidor.
 */
export const guardarMe = (me: Me) => guardar('apoio', 'me', me)
export const meOffline = () => recuperar<Me>('apoio', 'me')
export const apoioOffline = () => recuperar<ApoioDasVisitas>('apoio', 'visitas')

export const relatorioLocal = (id: string) => recuperar<ItemDaFila>('fila', id)
export const relatoriosLocais = async () =>
  (await recuperarTodos<ItemDaFila>('fila')).map((x) => x.valor)

/** Grava (ou troca) o relatório na fila do aparelho. Sempre o estado completo: o PUT é um upsert. */
export async function enfileirar(item: Omit<ItemDaFila, 'atualizadoEm' | 'erro'>): Promise<void> {
  await guardar('fila', item.id, { ...item, atualizadoEm: new Date().toISOString() })
}

/** Erro que vale tentar de novo depois (sem rede, servidor fora, limite): não é culpa do relatório. */
const temporario = (status: number) => status === 0 || status === 429 || status >= 500

let emAndamento: Promise<ResultadoDaSincronizacao> | null = null

export interface ResultadoDaSincronizacao {
  enviados: RelatorioDeVisita[]
  recusados: { id: string; mensagem: string }[]
  pendentes: number
}

/**
 * Sobe a fila, um relatório por vez, na ordem em que foram feitos. Sucesso: sai da fila. Recusa do
 * servidor (4xx): fica, com o motivo. Sem rede ou servidor fora: para e tenta na próxima vez (ao voltar
 * o sinal ou ao abrir o app). Duas chamadas juntas viram uma só; reenviar não duplica (PUT idempotente).
 */
export function sincronizar(servicos: ServicosDeAcesso): Promise<ResultadoDaSincronizacao> {
  emAndamento ??= (async () => {
    const saida: ResultadoDaSincronizacao = { enviados: [], recusados: [], pendentes: 0 }
    try {
      const fila = (await relatoriosLocais()).sort((a, b) =>
        a.atualizadoEm.localeCompare(b.atualizadoEm),
      )
      for (const [i, item] of fila.entries()) {
        const r: Resultado<RelatorioDeVisita> = await servicos.visitas.campo.salvar(
          item.id,
          item.dados,
        )
        if (r.ok) {
          await remover('fila', item.id)
          saida.enviados.push(r.dados)
        } else if (temporario(r.erro.status)) {
          saida.pendentes = fila.length - i
          break
        } else {
          await guardar('fila', item.id, { ...item, erro: r.erro.mensagem })
          saida.recusados.push({ id: item.id, mensagem: r.erro.mensagem })
        }
      }
      return saida
    } finally {
      emAndamento = null
    }
  })()
  return emAndamento
}
