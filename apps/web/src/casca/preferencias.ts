import type { Preferencias, PreferenciasPatch } from '@leadtogo/api-client'
import {
  PREFERENCIAS_PADRAO,
  TAMANHO_DE_PAGINA_PADRAO,
  type TabelaPaginada,
  type TamanhoDePagina,
} from '@leadtogo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'

const CHAVE_DO_TEMA = 'leadtogo:tema'

/** Aplica o tema no <html>: "sistema" remove o atributo (vale a preferência do sistema, ver tokens.css). */
export function aplicarTema(tema: Preferencias['tema']) {
  const raiz = document.documentElement
  if (tema === 'sistema') raiz.removeAttribute('data-theme')
  else raiz.setAttribute('data-theme', tema === 'claro' ? 'light' : 'dark')
}

function temaGuardado(): Preferencias['tema'] | null {
  try {
    const t = localStorage.getItem(CHAVE_DO_TEMA)
    return t === 'claro' || t === 'escuro' || t === 'sistema' ? t : null
  } catch {
    return null
  }
}

/**
 * Preferências do membro na empresa ativa (tema, menu recolhido...), com a troca otimista: a tela muda
 * na hora e a API é chamada em seguida (se falhar, volta ao que estava). O tema também fica no
 * aparelho, para a tela não piscar antes de as preferências chegarem.
 */
export function usePreferencias(empresaAtivaId: string | null) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const chave = ['preferencias', empresaAtivaId] as const
  const consulta = useQuery({
    queryKey: chave,
    queryFn: servicos.preferencias,
    enabled: empresaAtivaId !== null,
  })
  const prefs: Preferencias = consulta.data ?? {
    ...PREFERENCIAS_PADRAO,
    tema: temaGuardado() ?? PREFERENCIAS_PADRAO.tema,
  }

  const alterarNoServidor = useMutation({
    mutationFn: async (patch: PreferenciasPatch) => {
      const r = await servicos.alterarPreferencias(patch)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: chave })
      const antes = queryClient.getQueryData<Preferencias>(chave)
      const base = antes ?? prefs
      queryClient.setQueryData<Preferencias>(chave, {
        ...base,
        ...(patch.tema != null ? { tema: patch.tema } : {}),
        ...(patch.menuRecolhido != null ? { menuRecolhido: patch.menuRecolhido } : {}),
        ...(patch.porPagina
          ? { porPagina: aplicarPorPagina(base.porPagina, patch.porPagina) }
          : {}),
      })
      return { antes }
    },
    onError: (_erro, _patch, contexto) => {
      if (contexto?.antes) queryClient.setQueryData(chave, contexto.antes)
    },
    onSuccess: (dados) => queryClient.setQueryData(chave, dados),
  })

  useEffect(() => {
    aplicarTema(prefs.tema)
    try {
      localStorage.setItem(CHAVE_DO_TEMA, prefs.tema)
    } catch {
      // sem armazenamento (janela privada): o tema vale só nesta sessão
    }
  }, [prefs.tema])

  return {
    prefs,
    /** As preferências já chegaram (ou não há onde buscá-las): dá para confiar em `prefs` */
    carregadas: consulta.isSuccess || empresaAtivaId === null,
    alterar: (patch: PreferenciasPatch) => {
      if (empresaAtivaId === null) {
        // sem empresa ativa não há onde guardar na API: o tema vale no aparelho
        if (patch.tema) aplicarTema(patch.tema)
        return
      }
      alterarNoServidor.mutate(patch)
    },
  }
}

/** Mescla o patch de `porPagina` no que está na tela (`null` volta a tabela ao padrão). */
function aplicarPorPagina(
  atual: Preferencias['porPagina'],
  patch: NonNullable<PreferenciasPatch['porPagina']>,
): Preferencias['porPagina'] {
  const novo: Preferencias['porPagina'] = { ...atual }
  for (const [tabela, tamanho] of Object.entries(patch)) {
    if (tamanho === null || tamanho === undefined) delete novo[tabela as TabelaPaginada]
    else novo[tabela as TabelaPaginada] = tamanho
  }
  return novo
}

/**
 * Quantas linhas por página a pessoa quer numa tabela (25, 50 ou 100), guardado nas preferências dela.
 * `pronto` fica falso até as preferências chegarem: a tabela espera, para não buscar duas vezes.
 */
export function usePorPagina(tabela: TabelaPaginada) {
  const servicos = useServicos()
  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me }).data
  const { prefs, alterar, carregadas } = usePreferencias(me?.empresaAtivaId ?? null)
  return {
    porPagina: prefs.porPagina[tabela] ?? TAMANHO_DE_PAGINA_PADRAO,
    pronto: me !== undefined && carregadas,
    mudar: (tamanho: TamanhoDePagina) => alterar({ porPagina: { [tabela]: tamanho } }),
  }
}
