import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Building2, CalendarPlus, Handshake, LifeBuoy, Plus, UserRound } from 'lucide-react'
import { useState } from 'react'

import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { Dialog } from '@leadtogo/ui/dialog'
import { type ItemDeMenu, Menu } from '@leadtogo/ui/menu'
import { cn } from '@leadtogo/ui/cn'
import { useRegistrarAtividade } from '@/telas/atividades/registro-contexto'
import { AbrirChamado } from '@/telas/chamados/abrir'
import { useFormularioDeOportunidade } from '@/telas/oportunidades/contexto-formulario'

import { tituloDoCaminho } from './navegacao'

/** Botão quadrado do topo, do tamanho dos outros controles (desktop) ou maior, para o dedo (celular). */
const classeDoBotao = (grande: boolean) =>
  cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border-strong bg-surface text-ink hover:bg-surface-hover',
    grande ? 'size-11 border-transparent' : 'size-(--control-md)',
  )

/**
 * O "+" do topo: cria qualquer coisa de qualquer tela (Empresa, Contato, Oportunidade, Atividade e Chamado),
 * só com o que o perfil de acesso da pessoa permite. Substitui o antigo "Registrar atividade".
 */
export function MenuCriar({ grande = false }: { grande?: boolean }) {
  const { pode } = usePermissoes()
  const navegar = useNavigate()
  const { abrir: abrirAtividade } = useRegistrarAtividade()
  const { abrir: abrirOportunidade } = useFormularioDeOportunidade()
  const [abrindoChamado, setAbrindoChamado] = useState(false)

  const itens: ItemDeMenu[] = [
    ...(pode('empresas.criar')
      ? [
          {
            icon: Building2,
            label: 'Empresa',
            onSelect: () => void navegar({ to: '/empresas/nova' }),
          },
        ]
      : []),
    ...(pode('contatos.criar')
      ? [
          {
            icon: UserRound,
            label: 'Contato',
            onSelect: () => void navegar({ to: '/contatos/novo' }),
          },
        ]
      : []),
    ...(pode('oportunidades.criar')
      ? [{ icon: Handshake, label: 'Oportunidade', onSelect: () => abrirOportunidade() }]
      : []),
    ...(pode('atividades.criar')
      ? [{ icon: CalendarPlus, label: 'Atividade', onSelect: () => abrirAtividade() }]
      : []),
    ...(pode('chamados.criar')
      ? [{ icon: LifeBuoy, label: 'Chamado', onSelect: () => setAbrindoChamado(true) }]
      : []),
  ]
  if (itens.length === 0) return null

  return (
    <>
      <Menu
        align="end"
        items={itens}
        trigger={
          <button type="button" aria-label="Criar" title="Criar" className={classeDoBotao(grande)}>
            <Plus size={grande ? 22 : 18} strokeWidth={3} aria-hidden="true" />
          </button>
        }
      />
      <AbrirChamado aberto={abrindoChamado} aoFechar={() => setAbrindoChamado(false)} />
    </>
  )
}

/**
 * "?" do topo: a ajuda da tela em que a pessoa está. Por enquanto só anuncia; as orientações e os vídeos
 * de cada tela entram depois, no mesmo lugar.
 */
export function BotaoDeAjuda({ grande = false }: { grande?: boolean }) {
  const caminho = useRouterState({ select: (s) => s.location.pathname })
  const [aberta, setAberta] = useState(false)
  const tela = tituloDoCaminho(caminho)
  return (
    <>
      <button
        type="button"
        aria-label="Ajuda desta tela"
        title="Ajuda desta tela"
        onClick={() => setAberta(true)}
        className={cn(classeDoBotao(grande), 'text-base font-bold')}
      >
        ?
      </button>
      <Dialog
        open={aberta}
        onOpenChange={setAberta}
        title={`Ajuda: ${tela}`}
        footer={
          <Button variant="primary" onClick={() => setAberta(false)}>
            Entendi
          </Button>
        }
      >
        <p className="m-0 text-sm">
          Em breve, aqui você vai encontrar orientações e vídeos sobre a tela{' '}
          <span className="font-semibold">{tela}</span>.
        </p>
      </Dialog>
    </>
  )
}
