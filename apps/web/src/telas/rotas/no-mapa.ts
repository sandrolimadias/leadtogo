import type { PontoDePartida, Rota } from '@leadtogo/api-client'
import type { AvisoDaOtimizacao, Coordenada } from '@leadtogo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import type { RotaDesenhada } from '@/components/mapa/mapa-base'
import { toast } from '@/components/ui/toast'

import {
  adicionarParadas,
  aplicarOrdem,
  desenhoDoRascunho,
  entradaDoRascunho,
  novoRascunho,
  type ParadaDoRascunho,
  type RascunhoDeRota,
  rascunhoDaRota,
} from './rascunho'

/** Lê a posição do aparelho só quando é preciso (otimizar ou salvar com "minha posição"); nunca vai para o banco. */
function lerPosicao(): Promise<Coordenada | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((ok) =>
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    ),
  )
}

export type NovaParada = Omit<ParadaDoRascunho, 'resolvida' | 'distanciaTrechoM'>

/**
 * A rota aberta no mapa (G4a): `?rota=nova` ou `?rota=<id>`. Guarda o rascunho, lê a posição só na hora de
 * calcular, otimiza e salva. "Adicionar à rota" sem editor aberto abre uma rota nova com a empresa.
 */
export function useRotaNoMapa(entrada: {
  rotaParam: string | undefined
  aoTrocarParam: (rota: string | undefined) => void
}) {
  const servicos = useServicos()
  const cliente = useQueryClient()
  const { pode } = usePermissoes()
  const podeMontar = pode('rotas.editar')
  const aberto = entrada.rotaParam !== undefined
  const idSalvo = entrada.rotaParam && entrada.rotaParam !== 'nova' ? entrada.rotaParam : null

  const config = useQuery({
    queryKey: ['rotas', 'configuracao'],
    enabled: pode('rotas.ver'),
    queryFn: async () => {
      const r = await servicos.rotas.configuracao()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const pontos = useQuery<PontoDePartida[]>({
    queryKey: ['rotas', 'pontos'],
    enabled: aberto,
    queryFn: async () => {
      const r = await servicos.rotas.pontos.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const salva = useQuery<Rota>({
    queryKey: ['rotas', 'rota', idSalvo],
    enabled: idSalvo !== null,
    retry: false,
    queryFn: async () => {
      const r = await servicos.rotas.obter(idSalvo as string)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  // O rascunho é o da rota aberta (`?rota=`): enquanto a pessoa não mexe, vale o inicial (a rota salva ou uma
  // nova); o que ela edita fica guardado com a chave da rota aberta e some quando outra rota abre.
  const chave = entrada.rotaParam ?? ''
  const [editado, setEditado] = useState<{ chave: string; r: RascunhoDeRota } | null>(null)
  const [posicao, setPosicao] = useState<Coordenada | null>(null)
  const [aviso, setAviso] = useState<{ chave: string; a: AvisoDaOtimizacao | null } | null>(null)
  // empresas que pediram "Adicionar à rota" quando nenhuma rota estava aberta: entram na rota nova
  const [pendentes, setPendentes] = useState<NovaParada[]>([])

  const inicial = useMemo<RascunhoDeRota | null>(() => {
    if (!aberto) return null
    if (idSalvo) return salva.data ? rascunhoDaRota(salva.data) : null
    if (!config.data || !pontos.data) return null
    const novo = novoRascunho({
      responsavelId: '',
      minutosPorVisita: config.data.minutosPorVisita,
      pontos: pontos.data,
    })
    return adicionarParadas(novo, pendentes, config.data.maxParadas).rascunho
  }, [aberto, idSalvo, salva.data, config.data, pontos.data, pendentes])
  const rascunho = editado?.chave === chave ? editado.r : inicial
  const setRascunho = (r: RascunhoDeRota) => setEditado({ chave, r })

  const inicio = useMemo<Coordenada | null>(() => {
    if (!rascunho) return null
    if (rascunho.partida === 'ponto') {
      const p = pontos.data?.find((x) => x.id === rascunho.pontoPartidaId)
      return p ? { latitude: p.latitude, longitude: p.longitude } : null
    }
    return posicao
  }, [rascunho, pontos.data, posicao])

  const desenho = useMemo<RotaDesenhada | null>(
    () =>
      rascunho
        ? desenhoDoRascunho(
            rascunho,
            inicio,
            // o OpenAPI não tem tupla: o trajeto vem como [longitude, latitude][]
            idSalvo ? ((salva.data?.trajeto ?? null) as [number, number][] | null) : null,
          )
        : null,
    [rascunho, inicio, idSalvo, salva.data],
  )

  async function posicaoParaCalcular(): Promise<Coordenada | null> {
    if (rascunho?.partida !== 'posicao_atual') return null
    const p = await lerPosicao()
    setPosicao(p)
    return p
  }

  const otimizar = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error('sem rota')
      const posicaoAtual = await posicaoParaCalcular()
      const r = await servicos.rotas.otimizar({
        partida: rascunho.partida,
        pontoPartidaId: rascunho.partida === 'ponto' ? rascunho.pontoPartidaId : null,
        voltarAoInicio: rascunho.voltarAoInicio,
        empresaIds: rascunho.paradas.map((x) => x.empresaId),
        ...(posicaoAtual ? { posicaoAtual } : {}),
        ...(rascunho.responsavelId ? { responsavelId: rascunho.responsavelId } : {}),
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
    onSuccess: (o) => {
      if (rascunho) setRascunho(aplicarOrdem(rascunho, o.empresaIds))
      setAviso({ chave, a: o.aviso })
    },
    onError: (e) => toast.error(e.message),
  })

  const salvar = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error('sem rota')
      const posicaoAtual = await posicaoParaCalcular()
      const dados = entradaDoRascunho(rascunho, posicaoAtual)
      const r = rascunho.id
        ? await servicos.rotas.salvar(rascunho.id, dados)
        : await servicos.rotas.criar(dados)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
    onSuccess: (rota) => {
      cliente.setQueryData(['rotas', 'rota', rota.id], rota)
      void cliente.invalidateQueries({ queryKey: ['rotas'] })
      setEditado({ chave: rota.id, r: rascunhoDaRota(rota) })
      setPendentes([])
      toast.success(rascunho?.id ? 'Rota salva' : 'Rota criada')
      if (entrada.rotaParam !== rota.id) entrada.aoTrocarParam(rota.id)
    },
    onError: (e) => toast.error(e.message),
  })

  /** "Adicionar à rota": no rascunho aberto, ou numa rota nova com estas empresas. */
  function adicionar(novas: NovaParada[]) {
    if (!podeMontar || novas.length === 0) return
    if (!rascunho) {
      setPendentes(novas)
      entrada.aoTrocarParam('nova')
      return
    }
    const max = config.data?.maxParadas ?? 30
    const r = adicionarParadas(rascunho, novas, max)
    setRascunho(r.rascunho)
    const partes = [
      r.adicionadas ? `${r.adicionadas} adicionada${r.adicionadas > 1 ? 's' : ''}` : null,
      r.jaNaRota ? `${r.jaNaRota} já na rota` : null,
      r.excedentes ? `${r.excedentes} fora (limite de ${max} paradas)` : null,
    ].filter(Boolean)
    if (r.excedentes) toast.warning(partes.join(' · '))
    else toast.success(partes.join(' · '))
  }

  /** A posição da empresa no rascunho aberto (1, 2...), ou null. */
  const ordemNoRascunho = (empresaId: string): number | null => {
    const i = rascunho?.paradas.findIndex((x) => x.empresaId === empresaId) ?? -1
    return i >= 0 ? i + 1 : null
  }

  return {
    aberto,
    podeMontar,
    config: config.data ?? null,
    pontos: pontos.data ?? [],
    salva: salva.data ?? null,
    erroAoAbrir: salva.isError ? salva.error.message : null,
    rascunho,
    setRascunho,
    inicio,
    desenho,
    aviso: aviso?.chave === chave ? aviso.a : null,
    otimizar: () => otimizar.mutate(),
    otimizando: otimizar.isPending,
    salvar: () => salvar.mutate(),
    salvando: salvar.isPending,
    adicionar,
    ordemNoRascunho,
    fechar: () => {
      setPendentes([])
      entrada.aoTrocarParam(undefined)
    },
  }
}
