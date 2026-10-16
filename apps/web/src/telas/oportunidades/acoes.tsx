import type { Oportunidade } from '@leadtogo/api-client'
import type { StatusDeFechamento } from '@leadtogo/shared'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Ban,
  CircleCheck,
  CircleX,
  Ellipsis,
  Pause,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { IconButton } from '@/components/ui/button'
import { Menu, type ItemDeMenu } from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'

import { useFormularioDeOportunidade } from './contexto-formulario'
import { type DadosDoFechamento, JanelaDeFechamento } from './fechar'

/** Uma fase do funil, para o "Mover para" do menu. */
export interface FaseParaMover {
  id: string
  nome: string
}

/**
 * As ações de uma oportunidade (mover, fechar, reabrir, editar, excluir) com as janelas que elas abrem.
 * Quem usa chama `menu(o, fases)` para o menu de cada card ou linha e desenha `janelas` uma vez, no fim da tela.
 * `mover` serve também ao arrastar e soltar do Kanban.
 */
export function useAcoesDaOportunidade(aoMudar?: () => void): {
  menu: (o: Oportunidade, fases?: FaseParaMover[]) => ReactNode
  mover: (o: Oportunidade, faseId: string, nomeDaFase: string) => Promise<boolean>
  fechar: (o: Oportunidade, status: StatusDeFechamento) => void
  janelas: ReactNode
} {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { abrir } = useFormularioDeOportunidade()
  const [fechando, setFechando] = useState<{
    o: Oportunidade
    status: StatusDeFechamento
  } | null>(null)
  const [excluindo, setExcluindo] = useState<Oportunidade | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string>()

  const atualizar = async () => {
    await Promise.all(
      ['oportunidades', 'carteira', 'atividades'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    )
    aoMudar?.()
  }

  const mover = async (o: Oportunidade, faseId: string, nomeDaFase: string): Promise<boolean> => {
    if (faseId === o.fase.id) return false
    const r = await servicos.oportunidades.mover(o.id, faseId)
    if (!r.ok) {
      toast.error('Não foi possível mover', { description: r.erro.mensagem })
      await atualizar()
      return false
    }
    await atualizar()
    const { oportunidade, avisoDeProbabilidade: aviso } = r.dados
    if (aviso) {
      toast.info(`Movida para ${nomeDaFase}`, {
        description: `A probabilidade continua em ${aviso.atual}% (editada por você). A sugerida desta fase é ${aviso.sugerida}%.`,
      })
    } else {
      toast.success(`Movida para ${nomeDaFase}`, {
        description: `Probabilidade ${oportunidade.probabilidade}%.`,
      })
    }
    return true
  }

  const reabrir = async (o: Oportunidade) => {
    const r = await servicos.oportunidades.reabrir(o.id)
    if (!r.ok) {
      toast.error('Não foi possível reabrir', { description: r.erro.mensagem })
      return
    }
    await atualizar()
    toast.success('Oportunidade reaberta', { description: o.titulo })
  }

  const excluir = async () => {
    if (!excluindo) return
    setEnviando(true)
    const r = await servicos.oportunidades.excluir(excluindo.id)
    setEnviando(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    await atualizar()
    toast.success('Oportunidade excluída')
    setExcluindo(null)
    setErro(undefined)
  }

  const itens = (o: Oportunidade, fases: FaseParaMover[]): ItemDeMenu[] => {
    const ativa = o.status === 'ativo'
    return [
      ...(ativa && fases.length > 0
        ? ([
            { heading: 'Mover para' },
            ...fases.map((f) => ({
              icon: ArrowRight,
              label: f.nome,
              checked: f.id === o.fase.id,
              onSelect: () => void mover(o, f.id, f.nome),
            })),
            { separator: true },
          ] satisfies ItemDeMenu[])
        : []),
      ...(ativa
        ? ([
            { heading: 'Fechar como' },
            {
              icon: CircleCheck,
              label: 'Conquistada',
              onSelect: () => setFechando({ o, status: 'conquistado' }),
            },
            {
              icon: CircleX,
              label: 'Perdida',
              onSelect: () => setFechando({ o, status: 'perdido' }),
            },
            {
              icon: Ban,
              label: 'Cancelada',
              onSelect: () => setFechando({ o, status: 'cancelado' }),
            },
            {
              icon: Pause,
              label: 'Suspensa',
              onSelect: () => setFechando({ o, status: 'suspenso' }),
            },
            { separator: true },
          ] satisfies ItemDeMenu[])
        : [{ icon: RotateCcw, label: 'Reabrir', onSelect: () => void reabrir(o) } as ItemDeMenu]),
      { icon: Pencil, label: 'Editar', onSelect: () => abrir({ oportunidade: o }) },
      ...(o.excluivel
        ? ([
            { separator: true },
            { icon: Trash2, label: 'Excluir', danger: true, onSelect: () => setExcluindo(o) },
          ] satisfies ItemDeMenu[])
        : []),
    ]
  }

  const menu = (o: Oportunidade, fases: FaseParaMover[] = []) =>
    o.editavel || o.excluivel ? (
      <Menu
        align="end"
        items={itens(o, fases)}
        trigger={
          <IconButton icon={Ellipsis} label={`Ações de ${o.titulo}`} variant="ghost" size="sm" />
        }
      />
    ) : null

  const confirmarFechamento = async (dados: DadosDoFechamento): Promise<string | undefined> => {
    if (!fechando) return undefined
    const r = await servicos.oportunidades.fechar(fechando.o.id, dados)
    if (!r.ok) return r.erro.mensagem
    await atualizar()
    toast.success(
      {
        conquistado: 'Oportunidade conquistada',
        perdido: 'Oportunidade marcada como perdida',
        cancelado: 'Oportunidade cancelada',
        suspenso: 'Oportunidade suspensa',
      }[dados.status],
      { description: fechando.o.titulo },
    )
    setFechando(null)
    return undefined
  }

  const janelas = (
    <>
      {fechando ? (
        <JanelaDeFechamento
          key={fechando.o.id + fechando.status}
          oportunidade={fechando.o}
          statusInicial={fechando.status}
          aoFechar={() => setFechando(null)}
          aoConfirmar={confirmarFechamento}
        />
      ) : null}
      <DialogoDeConfirmacao
        aberto={excluindo !== null}
        titulo="Excluir a oportunidade?"
        descricao="A oportunidade sai do funil e da lista. A atividade de retomada que estiver aberta é cancelada."
        rotuloDoBotao="Excluir"
        erro={erro}
        enviando={enviando}
        aoConfirmar={() => void excluir()}
        aoFechar={() => {
          setExcluindo(null)
          setErro(undefined)
        }}
      />
    </>
  )
  return { menu, mover, fechar: (o, status) => setFechando({ o, status }), janelas }
}
