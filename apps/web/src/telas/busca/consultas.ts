import type { BuscaRecente, ItemDaBuscaGlobal, ResultadoDaBuscaGlobal } from '@leadtogo/api-client'
import {
  LIMITE_PADRAO_DA_BUSCA_GLOBAL,
  TAMANHO_MINIMO_DA_BUSCA,
  type TipoDaBuscaGlobal,
  termoComparavel,
} from '@leadtogo/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'

/** Espera depois da última tecla antes de buscar (as sugestões não buscam a cada letra). */
export const ESPERA_DA_BUSCA_MS = 250

export const TIPOS: { tipo: TipoDaBuscaGlobal; rotulo: string }[] = [
  { tipo: 'empresas', rotulo: 'Empresas' },
  { tipo: 'contatos', rotulo: 'Contatos' },
  { tipo: 'oportunidades', rotulo: 'Oportunidades' },
]

export interface ItemAchado extends ItemDaBuscaGlobal {
  tipo: TipoDaBuscaGlobal
}

/** Os itens na ordem em que aparecem na tela (Empresas, Contatos, Oportunidades). */
export const itensEmOrdem = (r: ResultadoDaBuscaGlobal | undefined): ItemAchado[] =>
  r ? TIPOS.flatMap(({ tipo }) => r[tipo].map((i) => ({ ...i, tipo }))) : []

/** O texto digitado, depois da espera, aparado. */
export function useTermoComEspera(texto: string, espera = ESPERA_DA_BUSCA_MS): string {
  const [termo, setTermo] = useState(texto.trim())
  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), espera)
    return () => clearTimeout(t)
  }, [texto, espera])
  return termo
}

export const termoValido = (termo: string) => termo.length >= TAMANHO_MINIMO_DA_BUSCA

/** Busca global (só lê). Cada termo é uma consulta: a resposta de um termo antigo não substitui a do atual. */
export function useBuscaGlobal(termo: string, limite = LIMITE_PADRAO_DA_BUSCA_GLOBAL) {
  const servicos = useServicos()
  return useQuery({
    queryKey: ['busca-global', termo, limite],
    enabled: termoValido(termo),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await servicos.busca.buscar({ q: termo, limite })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return { termo, resultado: r.dados }
    },
  })
}

const CHAVE_DAS_RECENTES = ['busca-global', 'recentes'] as const

/** As buscas recentes de quem está logado, com gravar, apagar e limpar (otimistas). */
export function useBuscasRecentes() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const lista = useQuery({
    queryKey: CHAVE_DAS_RECENTES,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await servicos.busca.recentes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const mudarLocal = (f: (atual: BuscaRecente[]) => BuscaRecente[]) => {
    const anterior = queryClient.getQueryData<BuscaRecente[]>(CHAVE_DAS_RECENTES)
    queryClient.setQueryData<BuscaRecente[]>(CHAVE_DAS_RECENTES, (a) => f(a ?? []))
    return anterior
  }
  const desfazer = (anterior: BuscaRecente[] | undefined) =>
    queryClient.setQueryData(CHAVE_DAS_RECENTES, anterior)

  const registrar = useMutation({
    mutationFn: async (termo: string) => {
      const r = await servicos.busca.registrar(termo)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
    onMutate: (termo) =>
      mudarLocal((atual) => [
        { id: `local-${termo}`, termo, buscadoEm: new Date().toISOString() },
        ...atual.filter((b) => termoComparavel(b.termo) !== termoComparavel(termo)),
      ]),
    onError: (_e, _termo, anterior) => desfazer(anterior),
    onSuccess: (dados) => queryClient.setQueryData(CHAVE_DAS_RECENTES, dados),
  })
  const apagar = useMutation({
    mutationFn: async (id: string) => {
      // Ainda não gravada (a gravação otimista não terminou): basta tirar da tela
      if (id.startsWith('local-')) return
      const r = await servicos.busca.apagar(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
    },
    onMutate: (id) => mudarLocal((atual) => atual.filter((b) => b.id !== id)),
    onError: (_e, _id, anterior) => desfazer(anterior),
  })
  const limpar = useMutation({
    mutationFn: async () => {
      const r = await servicos.busca.limpar()
      if (!r.ok) throw new Error(r.erro.mensagem)
    },
    onMutate: () => mudarLocal(() => []),
    onError: (_e, _v, anterior) => desfazer(anterior),
  })

  return {
    itens: lista.data ?? [],
    /** Grava a busca concluída (não grava termo curto demais) */
    registrar: (termo: string) => {
      const t = termo.trim()
      if (termoValido(t)) registrar.mutate(t)
    },
    apagar: (id: string) => apagar.mutate(id),
    limpar: () => limpar.mutate(),
  }
}
