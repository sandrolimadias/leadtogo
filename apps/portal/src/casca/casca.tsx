import type { SessaoDoPortal } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Bell, FileText, Home, LifeBuoy, Plus, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { type ReactNode, useCallback } from 'react'

import { Avatar } from '@leadtogo/ui/exibicao'
import { Button } from '@leadtogo/ui/button'
import { cn } from '@leadtogo/ui/cn'
import { toast } from '@leadtogo/ui/toast'

import { useSessaoAtual } from '@/app/sessao'
import { useServicos } from '@/servicos/contexto'

import { useDispositivo } from './dispositivo'
import { useFluxoDoSino } from './fluxo-do-sino'
import { primeiroNome } from './rotulos'

interface ItemDoMenu {
  para: '/' | '/chamados' | '/documentos' | '/notificacoes' | '/perfil'
  rotulo: string
  icone: LucideIcon
  contagem?: number
  exato?: boolean
}

function Selo({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span
      aria-label={`${n} pendente${n > 1 ? 's' : ''}`}
      className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] leading-5 font-semibold text-on-danger"
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

function useContagens() {
  const servicos = useServicos()
  const inicio = useQuery({
    queryKey: ['inicio'],
    queryFn: async () => {
      const r = await servicos.inicio()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const notificacoes = useQuery({
    queryKey: ['notificacoes', 'contagem'],
    queryFn: async () => {
      const r = await servicos.notificacoes.listar(true)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.naoLidas
    },
  })
  return { aguardando: inicio.data?.aguardandoVoce ?? 0, naoLidas: notificacoes.data ?? 0 }
}

/** A casca do portal: menu lateral no desktop e no tablet; cabeçalho e barra inferior no celular. */
export function Casca({
  sessao: inicial,
  children,
}: {
  sessao: SessaoDoPortal
  children: ReactNode
}) {
  const sessao = useSessaoAtual(inicial)
  const dispositivo = useDispositivo()
  const router = useRouter()
  const { aguardando, naoLidas } = useContagens()
  // O sino em tempo real: um aviso novo aparece num toast e atualiza as contagens
  const avisar = useCallback((aviso: { titulo?: string }) => {
    toast.info(aviso.titulo ?? 'Você tem uma notificação nova.')
  }, [])
  useFluxoDoSino(avisar)

  const itens: ItemDoMenu[] = [
    { para: '/', rotulo: 'Início', icone: Home, exato: true },
    { para: '/chamados', rotulo: 'Chamados', icone: LifeBuoy, contagem: aguardando },
    { para: '/documentos', rotulo: 'Documentos', icone: FileText },
    { para: '/notificacoes', rotulo: 'Notificações', icone: Bell, contagem: naoLidas },
    { para: '/perfil', rotulo: 'Perfil e empresa', icone: User },
  ]
  const abrirChamado = () => void router.navigate({ to: '/chamados/novo' })

  if (dispositivo === 'celular') {
    return (
      <div className="flex h-dvh flex-col bg-bg">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
          <Avatar name={sessao.nomeDoPortal} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm leading-5 font-semibold">{sessao.nomeDoPortal}</p>
            <p className="m-0 truncate text-xs leading-4 text-ink-muted">Portal do Cliente</p>
          </div>
          <Button size="sm" variant="primary" icon={Plus} onClick={abrirChamado}>
            Chamado
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <nav
          aria-label="Principal"
          className="grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
        >
          {itens.map((i) => (
            <Link
              key={i.para}
              to={i.para}
              activeOptions={{ exact: i.exato ?? false }}
              className="relative flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] leading-4 font-medium text-ink-muted [&.active]:text-brand"
            >
              <i.icone size={20} strokeWidth={1.75} aria-hidden="true" />
              {i.rotulo.split(' ')[0]}
              {i.contagem ? (
                <span className="absolute top-1 right-[calc(50%-18px)] size-2 rounded-full bg-danger" />
              ) : null}
            </Link>
          ))}
        </nav>
      </div>
    )
  }

  const recolhido = dispositivo === 'tablet'
  return (
    <div className="flex h-dvh bg-bg">
      <aside
        className={cn(
          'flex flex-none flex-col border-r border-border bg-surface',
          recolhido ? 'w-16 items-center px-2' : 'w-64 px-3',
        )}
      >
        <div className={cn('flex items-center gap-3 py-5', recolhido ? 'justify-center' : 'px-2')}>
          <Avatar name={sessao.nomeDoPortal} />
          {recolhido ? null : (
            <div className="min-w-0">
              <p className="m-0 truncate text-[15px] leading-5 font-semibold">
                {sessao.nomeDoPortal}
              </p>
              <p className="m-0 text-xs leading-4 text-ink-muted">Portal do Cliente</p>
            </div>
          )}
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {itens.map((i) => (
            <Link
              key={i.para}
              to={i.para}
              activeOptions={{ exact: i.exato ?? false }}
              aria-label={recolhido ? i.rotulo : undefined}
              className={cn(
                'flex items-center gap-3 rounded-sm px-3 py-2 text-sm leading-5 font-medium text-ink hover:bg-surface-hover [&.active]:bg-brand-soft [&.active]:text-brand',
                recolhido && 'justify-center px-2',
              )}
            >
              <i.icone size={18} strokeWidth={1.75} aria-hidden="true" />
              {recolhido ? null : i.rotulo}
              {recolhido ? null : <Selo n={i.contagem ?? 0} />}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-border py-4">
          <Avatar name={sessao.contato.nome} size="sm" />
          {recolhido ? null : (
            <div className="min-w-0">
              <p className="m-0 truncate text-sm leading-5 font-semibold">{sessao.contato.nome}</p>
              <p className="m-0 truncate text-xs leading-4 text-ink-muted">
                {sessao.empresaCliente.nome} ·{' '}
                {sessao.papel === 'responsavel' ? 'Responsável' : 'Colega'}
              </p>
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-surface px-6 py-3">
          <p className="m-0 mr-auto text-sm text-ink-muted">
            Olá, {primeiroNome(sessao.contato.nome)}
          </p>
          <Button variant="primary" icon={Plus} onClick={abrirChamado}>
            Abrir chamado
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
