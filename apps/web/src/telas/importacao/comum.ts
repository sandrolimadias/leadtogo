import type { ListaDeLotesDeImportacao } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'

/** Os passos da importação, na ordem (docs/escopo_mvp.md, Módulo 4). */
export const NOMES_DOS_PASSOS = [
  'Enviar arquivo',
  'Mapear colunas',
  'Regras',
  'Prévia',
  'Carteira',
  'Importar',
  'Relatório',
] as const

/** Posição (a partir de 0) de cada passo do assistente de um lote. */
export const PASSO = {
  enviar: 0,
  mapear: 1,
  regras: 2,
  previa: 3,
  carteira: 4,
  importar: 5,
  relatorio: 6,
} as const

/**
 * Importar planilha é de administrador e gestor. Quem não pode volta para o início (a API também
 * recusa com 403). `pode` fica `false` enquanto a sessão carrega.
 */
export function useQuemImporta(): { pode: boolean; carregando: boolean } {
  const servicos = useServicos()
  const navegar = useNavigate()
  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me })
  const papel = me.data?.empresas.find((e) => e.ativa)?.papel
  const pode = papel === 'admin' || papel === 'gestor'
  useEffect(() => {
    if (me.data && !pode) void navegar({ to: '/' })
  }, [me.data, pode, navegar])
  return { pode, carregando: me.isPending }
}

/** "menos de 1 min", "7 min", "1 h 20 min": para a estimativa de uma importação. */
export function formatarDuracao(segundos: number): string {
  if (segundos < 60) return 'menos de 1 min'
  const min = Math.ceil(segundos / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h} h ${resto} min` : `${h} h`
}

/** "15/10/2026 10:42", na hora de quem está olhando. */
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Tamanho de arquivo em KB ou MB, com vírgula. */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

export const chaveDoLote = (id: string) => ['importacao', 'lote', id] as const

export const chaveDaPrevia = (id: string) => ['importacao', 'previa', id] as const

export function usePrevia(id: string) {
  const servicos = useServicos()
  return useQuery({
    queryKey: chaveDaPrevia(id),
    retry: false,
    // a prévia depende das escolhas dos passos anteriores: sempre confere de novo ao entrar
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.previa(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}

type LoteDaLista = ListaDeLotesDeImportacao['itens'][number]

const n = (totais: LoteDaLista['totais'], chave: string) => {
  const v = totais[chave]
  return typeof v === 'number' ? v : 0
}

/** "30 importadas · 3 puladas · 1 com erro": o que cada lote fez, em uma linha. */
export function resumoDoLote(l: LoteDaLista): string {
  const importadas = n(l.totais, 'criada') + n(l.totais, 'criada_fora_do_perfil')
  const puladas =
    n(l.totais, 'pulada_sem_cnpj') +
    n(l.totais, 'pulada_duplicada') +
    n(l.totais, 'pulada_nao_ativa')
  const partes = [
    `${l.totalLinhas.toLocaleString('pt-BR')} linhas`,
    ...(importadas > 0 ? [`${importadas.toLocaleString('pt-BR')} importadas`] : []),
    ...(n(l.totais, 'fora_do_perfil') > 0
      ? [`${n(l.totais, 'fora_do_perfil')} fora do perfil`]
      : []),
    ...(puladas > 0 ? [`${puladas.toLocaleString('pt-BR')} puladas`] : []),
    ...(n(l.totais, 'erro') > 0 ? [`${n(l.totais, 'erro')} com erro`] : []),
    ...(l.situacao === 'desfeita'
      ? [
          `${n(l.totais, 'desfeitas').toLocaleString('pt-BR')} removidas`,
          ...(n(l.totais, 'mantidas') > 0
            ? [`${n(l.totais, 'mantidas').toLocaleString('pt-BR')} ficaram na carteira`]
            : []),
        ]
      : []),
  ]
  return partes.join(' · ')
}
