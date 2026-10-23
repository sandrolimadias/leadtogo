import type { Me } from '@leadtogo/api-client'
import { Link } from '@tanstack/react-router'
import { Check, Ellipsis, LogOut, Plus, Search, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { permissoesDaAtiva } from '@/auth/permissoes'
import { Button, IconButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Logo } from '@/components/acesso/logo'
import { classeDaCor, corDoNome, iniciais } from '@/components/ui/cores'
import { Avatar } from '@/components/ui/exibicao'
import { EmptyState } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icone'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tooltip } from '@/components/ui/tooltip'
import { Sheet } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

import { VERSAO_DO_APP } from './empresas'
import { Notificacoes } from './sino'
import { TELAS, TELAS_DA_BARRA_INFERIOR, estaAtiva, telaVisivel, telasDoMais } from './navegacao'
import { useRegistrarAtividade } from '@/telas/atividades/registro-contexto'
import { avisarEmBreve, nomeDaEmpresa, perfilDaEmpresa } from './utilidades'

type Tema = 'claro' | 'escuro' | 'sistema'

/**
 * A versão do app no rodapé do menu: só os 7 primeiros caracteres do hash do commit (o hash inteiro estoura
 * a largura do menu), com o valor completo na dica. Em desenvolvimento, `dev`.
 */
export function VersaoDoApp({
  className,
  versao = VERSAO_DO_APP,
}: {
  className?: string
  versao?: string
}) {
  const curta = versao.slice(0, 7)
  return (
    <Tooltip label={versao}>
      <p
        tabIndex={0}
        className={cn('m-0 min-w-0 truncate text-[11px] leading-4 text-ink-subtle', className)}
      >
        Leadtogo · versão {curta}
      </p>
    </Tooltip>
  )
}

/** Primeiro item da tabulação: leva o foco direto ao conteúdo, sem passar por todo o menu. */
export function PularParaOConteudo() {
  return (
    <a
      href="#conteudo"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('conteudo')?.focus()
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[2000] focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:font-semibold focus:text-brand focus:shadow-md"
    >
      Pular para o conteúdo
    </a>
  )
}

/** Barra superior do desktop e do tablet: busca global, "Registrar atividade" e o sino. */
export function BarraSuperior() {
  const { abrir } = useRegistrarAtividade()
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
        <Button icon={Plus} onClick={() => abrir()}>
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
  const { abrir } = useRegistrarAtividade()
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
      <IconButton icon={Plus} label="Registrar atividade" size="lg" onClick={() => abrir()} />
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

/** Barra inferior do celular: Início, Empresas, Funil, Atividades e Mais (abre a folha "Mais"). */
export function BarraInferior({
  caminho,
  aoAbrirMais,
}: {
  caminho: string
  aoAbrirMais: () => void
}) {
  const itens = TELAS.filter((t) => TELAS_DA_BARRA_INFERIOR.includes(t.caminho))
  const classe =
    'flex h-full min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 text-[11px] leading-[14px] font-medium text-ink-muted no-underline aria-[current=page]:font-semibold aria-[current=page]:text-brand'
  return (
    <nav
      aria-label="Navegação do celular"
      className="relative z-[100] grid h-[68px] flex-none grid-cols-5 border-t border-border bg-surface pb-[max(8px,env(safe-area-inset-bottom))]"
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
      <button type="button" className={classe} onClick={aoAbrirMais}>
        <Icon icon={Ellipsis} size={20} />
        Mais
      </button>
    </nav>
  )
}

/**
 * Folha "Mais" do celular: as telas que não cabem na barra inferior (geradas de `TELAS`, só as que a pessoa
 * vê, na ordem do menu lateral), seguidas de Meu perfil, troca de empresa e Sair. A tela ativa fica
 * destacada e a folha fecha ao navegar.
 */
export function FolhaMais({
  aberta,
  aoFechar,
  me,
  caminho,
  aoTrocarEmpresa,
  aoSair,
}: {
  aberta: boolean
  aoFechar: () => void
  me: Me
  caminho: string
  aoTrocarEmpresa: (id: string) => void
  aoSair: () => void
}) {
  const telas = telasDoMais({
    administradorDeConta: me.administradorDeConta,
    permissoes: permissoesDaAtiva(me),
  })
  const linha =
    'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-sm border-0 bg-transparent px-2 text-left text-base text-ink no-underline hover:bg-surface-hover aria-[current=page]:bg-surface-selected aria-[current=page]:font-semibold aria-[current=page]:text-brand'
  const rotulo =
    'm-0 px-1 pt-3 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase'
  const perfilAtivo = caminho.startsWith('/perfil')
  return (
    <Sheet open={aberta} onOpenChange={(o) => !o && aoFechar()} title="Mais" semCabecalho>
      <div className="flex flex-col gap-1 overflow-y-auto px-4 pb-4">
        {telas.map((t) => (
          <Link
            key={t.caminho}
            to={t.caminho as '/'}
            onClick={aoFechar}
            aria-current={estaAtiva(t, caminho) ? 'page' : undefined}
            className={linha}
          >
            <Icon icon={t.icone} size={18} />
            {t.titulo}
          </Link>
        ))}
        <Link
          to="/perfil/seguranca"
          onClick={aoFechar}
          aria-current={perfilAtivo ? 'page' : undefined}
          className={cn(linha, 'mt-1 border-t border-border')}
        >
          <Icon icon={ShieldCheck} size={18} />
          Meu perfil
        </Link>
        {me.empresas.length > 1 ? (
          <section className="flex flex-col gap-1" aria-label="Trocar de empresa">
            <h3 className={rotulo}>Trocar de empresa</h3>
            {me.empresas.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={e.ativa}
                onClick={() => (e.ativa ? aoFechar() : aoTrocarEmpresa(e.id))}
                className={cn(
                  linha,
                  'justify-between',
                  e.ativa && 'bg-surface-selected font-semibold text-brand',
                )}
              >
                <span className="truncate">{nomeDaEmpresa(e)}</span>
                {e.ativa ? <Icon icon={Check} size={16} /> : null}
              </button>
            ))}
          </section>
        ) : null}
        <button type="button" onClick={aoSair} className={cn(linha, 'mt-1 border-t border-border')}>
          <Icon icon={LogOut} size={18} />
          Sair
        </button>
      </div>
    </Sheet>
  )
}

/**
 * Folha de perfil do celular (como no protótipo): usuário, empresa ativa (lista para trocar) e atalhos
 * (Contatos, Prospecção, Painel consolidado, Configurações, Meu perfil → Segurança, tema e Sair), com a
 * versão no fim. Abre pelo avatar do cabeçalho; o "Mais" da barra inferior abre a `FolhaMais`.
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
  const pessoa = {
    administradorDeConta: me.administradorDeConta,
    permissoes: permissoesDaAtiva(me),
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
                    <span className="text-[13px] text-ink-muted">{perfilDaEmpresa(e)}</span>
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
        {me.administradorDeConta ? (
          <Link to="/criar-empresa" onClick={aoFechar} className={linhaDoMais}>
            <Icon icon={Plus} size={18} />
            Criar empresa
          </Link>
        ) : null}
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
        <VersaoDoApp className="pt-2 text-center text-[12px]" />
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
    <main className="flex w-full flex-col gap-5 p-6 max-md:p-4">
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
