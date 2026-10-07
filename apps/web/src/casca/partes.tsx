import type { Me } from '@leadtogo/api-client'
import { Link } from '@tanstack/react-router'
import { Bell, Check, Ellipsis, Plus, Search, ShieldCheck } from 'lucide-react'
import { Popover } from 'radix-ui'
import type { ReactNode } from 'react'

import { Button, IconButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Avatar } from '@/components/ui/exibicao'
import { EmptyState } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icone'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Sheet } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

import { VERSAO_DO_APP } from './empresas'
import { ROTULO_DO_PAPEL, TELAS, TELAS_DA_BARRA_INFERIOR, estaAtiva } from './navegacao'
import { avisarEmBreve, nomeDaEmpresa } from './utilidades'

type Tema = 'claro' | 'escuro' | 'sistema'

/** Sino de notificações (painel de 360 px). Ainda sem notificações: o painel diz isso. */
export function Notificacoes({ tamanho = 'md' }: { tamanho?: 'md' | 'lg' }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton icon={Bell} label="Notificações" size={tamanho} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-[1000] w-[360px] max-w-[calc(100vw-24px)] rounded-md border border-border bg-surface p-1 text-ink shadow-md"
        >
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase">
            Notificações
          </div>
          <EmptyState
            icon={Bell}
            title="Nenhuma notificação"
            description="Avisos de todas as suas empresas aparecem aqui, com o nome da empresa."
            className="py-6"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Barra superior do desktop e do tablet: busca global, "Registrar atividade" e o sino. */
export function BarraSuperior() {
  return (
    <header className="flex h-(--topbar-height) flex-none items-center gap-3 border-b border-border bg-surface px-6">
      <div className="w-[420px] max-w-full">
        <TextField
          icon={Search}
          type="search"
          aria-label="Buscar empresas, contatos e oportunidades"
          placeholder="Buscar empresas, contatos e oportunidades"
          onKeyDown={(e) => {
            if (e.key === 'Enter') avisarEmBreve('Busca global')
          }}
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button icon={Plus} onClick={() => avisarEmBreve('Registrar atividade')}>
          Registrar atividade
        </Button>
        <Notificacoes />
      </div>
    </header>
  )
}

/** Cabeçalho do celular: marca, título da tela, busca, sino e o avatar que abre o perfil. */
export function CabecalhoDoCelular({
  titulo,
  me,
  aoAbrirPerfil,
}: {
  titulo: string
  me: Me
  aoAbrirPerfil: () => void
}) {
  return (
    <header className="flex h-14 flex-none items-center gap-1 border-b border-border bg-surface pr-2 pl-4">
      <p className="m-0 min-w-0 flex-1 truncate text-lg leading-6 font-semibold">{titulo}</p>
      <IconButton
        icon={Search}
        label="Buscar"
        size="lg"
        onClick={() => avisarEmBreve('Busca global')}
      />
      <Notificacoes tamanho="lg" />
      <button
        type="button"
        aria-label="Abrir perfil"
        onClick={aoAbrirPerfil}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0"
      >
        <Avatar name={me.usuario.nome} />
      </button>
    </header>
  )
}

/** Barra inferior do celular: Início, Empresas, Funil, Tarefas e Mais (perfil). */
export function BarraInferior({
  caminho,
  aoAbrirPerfil,
}: {
  caminho: string
  aoAbrirPerfil: () => void
}) {
  const itens = TELAS.filter((t) => TELAS_DA_BARRA_INFERIOR.includes(t.caminho))
  const classe =
    'flex h-full min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 text-[11px] leading-[14px] font-medium text-ink-muted no-underline aria-[current=page]:font-semibold aria-[current=page]:text-brand'
  return (
    <nav
      aria-label="Navegação do celular"
      className="fixed inset-x-0 bottom-0 z-[100] grid h-[68px] grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {itens.map((t) => (
        <Link
          key={t.caminho}
          to={t.caminho as '/'}
          aria-current={estaAtiva(t, caminho) ? 'page' : undefined}
          className={classe}
        >
          <Icon icon={t.icone} size={20} />
          {t.rotuloCurto ?? t.titulo}
        </Link>
      ))}
      <button type="button" className={classe} onClick={aoAbrirPerfil}>
        <Icon icon={Ellipsis} size={20} />
        Mais
      </button>
    </nav>
  )
}

/**
 * Folha de perfil do celular: usuário, empresa ativa (lista para trocar), Meu perfil → Segurança, tema,
 * Sair e a versão. O seletor de empresa do celular fica aqui.
 */
export function FolhaDePerfil({
  aberta,
  aoFechar,
  me,
  tema,
  aoMudarTema,
  aoTrocarEmpresa,
  aoSair,
}: {
  aberta: boolean
  aoFechar: () => void
  me: Me
  tema: Tema
  aoMudarTema: (t: Tema) => void
  aoTrocarEmpresa: (id: string) => void
  aoSair: () => void
}) {
  const linha =
    'flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 text-left text-ink'
  return (
    <Sheet open={aberta} onOpenChange={(o) => !o && aoFechar()} title="Meu perfil">
      <div className="flex items-center gap-3">
        <Avatar name={me.usuario.nome} size="lg" />
        <div className="flex min-w-0 flex-col">
          <b className="truncate text-[15px]">{me.usuario.nome}</b>
          <span className="truncate text-[13px] text-ink-muted">{me.usuario.email}</span>
        </div>
      </div>

      {me.empresas.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Empresa ativa">
          <h3 className="m-0 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase">
            Empresa ativa
          </h3>
          {me.empresas.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={e.ativa}
              onClick={() => (e.ativa ? aoFechar() : aoTrocarEmpresa(e.id))}
              className={cn(linha, e.ativa && 'border-brand')}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-[14px]">{nomeDaEmpresa(e)}</b>
                <span className="text-[12px] text-ink-muted">{ROTULO_DO_PAPEL[e.papel]}</span>
              </span>
              {e.ativa ? (
                <span className="flex items-center gap-1 text-[12px] font-semibold text-brand">
                  <Icon icon={Check} size={14} />
                  Ativa
                </span>
              ) : null}
            </button>
          ))}
        </section>
      ) : null}

      <Link to="/perfil/seguranca" onClick={aoFechar} className={cn(linha, 'no-underline')}>
        <Icon icon={ShieldCheck} size={18} className="text-ink-muted" />
        <span className="flex-1 text-[14px] font-medium">Meu perfil → Segurança</span>
      </Link>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase">
          Tema
        </h3>
        <SegmentedControl
          label="Tema"
          value={tema}
          onChange={(v) => aoMudarTema(v as Tema)}
          options={[
            { value: 'claro', label: 'Claro' },
            { value: 'escuro', label: 'Escuro' },
            { value: 'sistema', label: 'Sistema' },
          ]}
        />
      </div>

      <Button variant="danger-ghost" block size="lg" onClick={aoSair}>
        Sair
      </Button>
      <p className="m-0 text-center text-[12px] text-ink-subtle">
        Leadtogo · versão {VERSAO_DO_APP}
      </p>
    </Sheet>
  )
}

/** Página das telas que ainda não existem: o título e uma frase dizendo o que vem aí. */
export function PaginaVazia({
  titulo,
  icone,
  descricao,
  acao,
}: {
  titulo: string
  icone: Parameters<typeof EmptyState>[0]['icon']
  descricao: string
  acao?: ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-6 max-md:p-4">
      <h1 className="m-0 text-[22px] leading-7 font-semibold max-md:sr-only">{titulo}</h1>
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState
          {...(icone ? { icon: icone } : {})}
          title="Em construção"
          description={descricao}
          {...(acao ? { actions: acao } : {})}
        />
      </div>
    </main>
  )
}
