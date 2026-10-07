import type { Me } from '@leadtogo/api-client'
import { Link } from '@tanstack/react-router'
import { Bell, Check, Ellipsis, LogOut, Plus, Search, ShieldCheck } from 'lucide-react'
import { Popover } from 'radix-ui'
import type { ReactNode } from 'react'

import { Button, IconButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Logo } from '@/components/acesso/logo'
import { classeDaCor, corDoNome, iniciais } from '@/components/ui/cores'
import { Avatar } from '@/components/ui/exibicao'
import { EmptyState } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icone'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Sheet } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

import { VERSAO_DO_APP } from './empresas'
import {
  ROTULO_DO_PAPEL,
  TELAS,
  TELAS_DA_BARRA_INFERIOR,
  estaAtiva,
  telaVisivel,
} from './navegacao'
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
    <header className="flex h-14 flex-none items-center gap-1 border-b border-border bg-surface pr-2 pl-3">
      <span className="mr-2 ml-1 inline-flex">
        <Logo tamanho={24} />
      </span>
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
        <Avatar name={me.usuario.nome} size="sm" />
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
 * Folha de perfil do celular (como no protótipo): usuário, empresa ativa (lista para trocar) e "Mais"
 * (Contatos, Prospecção, Painel consolidado, Configurações, Meu perfil → Segurança, tema e Sair), com a
 * versão no fim. O seletor de empresa do celular fica aqui.
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
  const ativa = me.empresas.find((e) => e.ativa)
  const pessoa = {
    administradorDeConta: me.administradorDeConta,
    papelNaEmpresaAtiva: ativa?.papel ?? null,
  }
  const linhaDoMais =
    'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-sm border-0 bg-transparent px-2 text-left text-base text-ink no-underline hover:bg-surface-hover'
  const rotulo =
    'm-0 px-1 pt-3 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase'
  const mais = TELAS.filter(
    (t) =>
      ['/contatos', '/prospeccao', '/consolidado', '/configuracoes'].includes(t.caminho) &&
      telaVisivel(t, pessoa),
  )
  return (
    <Sheet open={aberta} onOpenChange={(o) => !o && aoFechar()} title="Meu perfil" semCabecalho>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <Avatar name={me.usuario.nome} size="lg" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold">{me.usuario.nome}</span>
            <span className="truncate text-[13px] text-ink-muted">{me.usuario.email}</span>
          </div>
        </div>

        {me.empresas.length > 0 ? (
          <section className="flex flex-col gap-1" aria-label="Empresa ativa">
            <h3 className={rotulo}>Empresa ativa</h3>
            {me.empresas.map((e) => {
              const nome = nomeDaEmpresa(e)
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={e.ativa}
                  onClick={() => (e.ativa ? aoFechar() : aoTrocarEmpresa(e.id))}
                  className={cn(
                    'flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-md border bg-surface px-2 py-1 text-left text-ink',
                    e.ativa ? 'border-brand bg-surface-selected' : 'border-border',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex size-8 flex-none items-center justify-center rounded-sm text-xs font-bold',
                      classeDaCor[corDoNome(nome)],
                    )}
                  >
                    {iniciais(nome)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{nome}</span>
                    <span className="text-[13px] text-ink-muted">{ROTULO_DO_PAPEL[e.papel]}</span>
                  </span>
                  {e.ativa ? (
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-brand">
                      <Icon icon={Check} size={16} />
                      Ativa
                    </span>
                  ) : null}
                </button>
              )
            })}
          </section>
        ) : null}

        <h3 className={rotulo}>Mais</h3>
        {mais.map((t) => (
          <Link key={t.caminho} to={t.caminho as '/'} onClick={aoFechar} className={linhaDoMais}>
            <Icon icon={t.icone} size={18} />
            {t.titulo}
          </Link>
        ))}
        <Link to="/perfil/seguranca" onClick={aoFechar} className={linhaDoMais}>
          <Icon icon={ShieldCheck} size={18} />
          Meu perfil → Segurança
        </Link>
        <div className="flex flex-col gap-2 px-2 py-2">
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
        <button type="button" onClick={aoSair} className={linhaDoMais}>
          <Icon icon={LogOut} size={18} />
          Sair
        </button>
        <p className="m-0 pt-2 text-center text-[12px] text-ink-subtle">
          Leadtogo · versão {VERSAO_DO_APP}
        </p>
      </div>
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
    <main className="flex w-full max-w-[1400px] flex-col gap-5 p-6 max-md:p-4">
      <h1 className="m-0 text-[22px] leading-7 font-semibold max-md:sr-only">{titulo}</h1>
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState
          {...(icone ? { icon: icone } : {})}
          title="Em breve"
          description={descricao}
          {...(acao ? { actions: acao } : {})}
        />
      </div>
    </main>
  )
}
