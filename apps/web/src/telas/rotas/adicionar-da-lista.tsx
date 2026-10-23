import { codigoDaRota } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, Route as RotaIcone } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@/components/ui/button'
import { type ItemDeMenu, Menu } from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'

import { hojeLocal } from './rascunho'

/**
 * "Adicionar à rota" da seleção em massa (lista de Empresas): numa rota nova ou numa rota aberta (planejada
 * ou em andamento, de hoje em diante). Entram no fim as que cabem (até 30) e que têm posição; depois o
 * editor abre no mapa.
 */
export function BotaoAdicionarARota({ empresaIds }: { empresaIds: string[] }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const { pode } = usePermissoes()
  const [ocupado, setOcupado] = useState(false)
  const hoje = hojeLocal()
  const abertas = useQuery({
    queryKey: ['rotas', 'lista', { de: hoje, porPagina: 10 }],
    enabled: pode('rotas.editar'),
    retry: false,
    queryFn: async () => {
      const r = await servicos.rotas.listar({ de: hoje, porPagina: 10 })
      return r.ok
        ? r.dados.itens.filter((i) => i.situacao === 'planejada' || i.situacao === 'em_andamento')
        : []
    },
  })
  if (!pode('rotas.editar')) return null

  async function adicionar(rotaId: string | null) {
    setOcupado(true)
    try {
      let id = rotaId
      if (!id) {
        const [a, m, d] = hoje.split('-')
        const criada = await servicos.rotas.criar({
          nome: `Rota de ${d}/${m}/${a}`,
          data: hoje,
          partida: 'posicao_atual',
          voltarAoInicio: true,
          empresaIds: [],
        })
        if (!criada.ok) throw new Error(criada.erro.mensagem)
        id = criada.dados.id
      }
      const r = await servicos.rotas.adicionar(id, empresaIds)
      if (!r.ok) throw new Error(r.erro.mensagem)
      const { adicionadas, jaNaRota, ignoradas, excedentes } = r.dados
      const fora = [
        jaNaRota ? `${jaNaRota} já estavam` : null,
        ignoradas ? `${ignoradas} sem posição ou fora da carteira` : null,
        excedentes ? `${excedentes} além do limite de 30` : null,
      ].filter(Boolean)
      ;(fora.length ? toast.warning : toast.success)(
        `${adicionadas} ${adicionadas === 1 ? 'empresa adicionada' : 'empresas adicionadas'} à rota ${codigoDaRota(r.dados.rota.codigo)}`,
        fora.length ? { description: fora.join(' · ') } : undefined,
      )
      await queryClient.invalidateQueries({ queryKey: ['rotas'] })
      void navegar({ to: '/mapa', search: { rota: id } })
    } catch (e) {
      toast.error('Não foi possível adicionar à rota', {
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setOcupado(false)
    }
  }

  const itens: ItemDeMenu[] = [
    { label: 'Nova rota', onSelect: () => void adicionar(null) },
    ...((abertas.data ?? []).length ? [{ heading: 'Rotas abertas' }] : []),
    ...(abertas.data ?? []).map((r) => ({
      label: `${codigoDaRota(r.codigo)} · ${r.nome}`,
      onSelect: () => void adicionar(r.id),
    })),
  ]
  return (
    <Menu
      items={itens}
      trigger={
        <Button size="sm" icon={RotaIcone} iconRight={ChevronDown} loading={ocupado}>
          Adicionar à rota
        </Button>
      }
    />
  )
}
