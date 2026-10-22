import type { ListaDeLotesDeImportacao } from '@leadtogo/api-client'
import type { ResultadoDaLinha, TipoDeImportacao } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { usePermissoes } from '@/auth/permissoes'
import { useServicos } from '@/auth/contexto'
import type { TomDoBadge } from '@/components/ui/exibicao'

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

/** Contatos e atividades não têm Regras nem Carteira: são 5 passos. */
export const NOMES_DOS_PASSOS_DOS_NOVOS_TIPOS = [
  'Enviar arquivo',
  'Mapear colunas',
  'Prévia',
  'Importar',
  'Relatório',
] as const

export const nomesDosPassos = (tipo: TipoDeImportacao): readonly string[] =>
  tipo === 'empresas' ? NOMES_DOS_PASSOS : NOMES_DOS_PASSOS_DOS_NOVOS_TIPOS

/** A posição do passo na barra do tipo (os passos Regras e Carteira só existem em empresas). */
export function posicaoDoPasso(tipo: TipoDeImportacao, passo: number): number {
  if (tipo === 'empresas') return passo
  if (passo >= PASSO.relatorio) return 4
  if (passo >= PASSO.importar) return 3
  if (passo >= PASSO.previa) return 2
  return passo
}

/** O que o lote importa, no singular e no plural, para os textos das telas. */
export const TEXTOS_DO_TIPO: Record<
  TipoDeImportacao,
  {
    plural: string
    trilha: string
    verTudo: string
    destino: '/empresas' | '/contatos' | '/atividades'
  }
> = {
  empresas: {
    plural: 'empresas',
    trilha: 'Empresas',
    verTudo: 'Ver empresas importadas',
    destino: '/empresas',
  },
  contatos: {
    plural: 'contatos',
    trilha: 'Contatos',
    verTudo: 'Ver contatos',
    destino: '/contatos',
  },
  atividades: {
    plural: 'atividades',
    trilha: 'Atividades',
    verTudo: 'Ver atividades',
    destino: '/atividades',
  },
}

/**
 * Importar planilha exige `importacao.executar`. Quem não pode volta para o início (a API também
 * recusa com 403). `pode` fica `false` enquanto a sessão carrega.
 */
export function useQuemImporta(): { pode: boolean; carregando: boolean } {
  const navegar = useNavigate()
  const permissoes = usePermissoes()
  const pode = permissoes.pode('importacao.executar')
  useEffect(() => {
    if (!permissoes.carregando && !pode) void navegar({ to: '/' })
  }, [permissoes.carregando, pode, navegar])
  return { pode, carregando: permissoes.carregando }
}

/** Quem tem `importacao.executar` vê o botão "Importar planilha" nas listas (sem redirecionar quem não pode). */
export function usePodeImportar(): boolean {
  return usePermissoes().pode('importacao.executar')
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
  if (l.tipo !== 'empresas') return resumoDoLoteDoNovoTipo(l)
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

/** Contatos e atividades: "40 linhas · 30 criados · 5 vinculados · 5 puladas". */
function resumoDoLoteDoNovoTipo(l: LoteDaLista): string {
  const criadas = n(l.totais, 'criada')
  const vinculadas = n(l.totais, 'vinculada') + n(l.totais, 'ja_vinculada')
  const nao = (chave: string) => n(l.totais, chave)
  const puladas = Object.keys(l.totais)
    .filter((k) => k.startsWith('pulada_'))
    .reduce((soma, k) => soma + nao(k), 0)
  const partes = [
    `${l.totalLinhas.toLocaleString('pt-BR')} linhas`,
    ...(criadas > 0
      ? [`${criadas.toLocaleString('pt-BR')} ${l.tipo === 'contatos' ? 'criados' : 'criadas'}`]
      : []),
    ...(vinculadas > 0 ? [`${vinculadas.toLocaleString('pt-BR')} vinculados`] : []),
    ...(puladas > 0 ? [`${puladas.toLocaleString('pt-BR')} puladas`] : []),
    ...(l.situacao === 'desfeita'
      ? [
          `${nao('desfeitas').toLocaleString('pt-BR')} desfeitas`,
          ...(nao('mantidas') > 0 ? [`${nao('mantidas').toLocaleString('pt-BR')} ficaram`] : []),
        ]
      : []),
  ]
  return partes.join(' · ')
}

/** A cor do selo de cada resultado de linha, no relatório e na prévia. */
export const TOM_DO_RESULTADO: Record<ResultadoDaLinha, TomDoBadge> = {
  pendente: 'neutral',
  criada: 'success',
  criada_fora_do_perfil: 'info',
  fora_do_perfil: 'warning',
  pulada_sem_cnpj: 'neutral',
  pulada_duplicada: 'neutral',
  pulada_nao_ativa: 'neutral',
  erro: 'danger',
  vinculada: 'info',
  ja_vinculada: 'neutral',
  pulada_empresa_inexistente: 'neutral',
  pulada_tipo_inexistente: 'neutral',
  pulada_no_futuro: 'neutral',
  pulada_invalida: 'warning',
}
