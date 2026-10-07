import type { ReactNode } from 'react'

import { VERSAO_DO_APP } from '@/casca/empresas'

import { Logo } from './logo'

/**
 * Moldura das telas de acesso (Acesso.dc.html). Desktop: painel da marca à esquerda (44%) e o
 * formulário de 400 px à direita, centralizado. Celular (< 768 px): sem painel, marca no topo,
 * conteúdo alinhado ao topo e controles de 44 px (densidade de toque).
 */
export function AcessoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <aside className="hidden flex-[0_0_44%] flex-col justify-between border-r border-border bg-surface-sunken p-12 md:flex">
        <div className="flex items-center gap-2.5">
          <Logo tamanho={32} />
          <span className="text-[22px] font-bold">Leadtogo</span>
        </div>
        <div className="flex max-w-[440px] flex-col gap-3">
          <p className="m-0 text-4xl leading-[42px] font-semibold tracking-[-0.02em] text-pretty">
            A carteira inteira, com a próxima visita sempre marcada.
          </p>
          <p className="m-0 text-base leading-6 text-pretty text-ink-muted">
            Empresas, contatos, atividades e oportunidades num só lugar, em várias empresas com o
            mesmo login.
          </p>
        </div>
        <span className="text-[13px] text-ink-muted">
          Dados protegidos conforme a LGPD.
          <span className="mt-1 block text-[11px] text-ink-subtle">Versão {VERSAO_DO_APP}</span>
        </span>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col items-center justify-start overflow-auto px-5 py-6 max-md:[--ctl-font:16px] max-md:[--ctl:var(--control-lg)] md:justify-center md:p-12">
        <div className="flex w-full max-w-full flex-col gap-5 md:max-w-[400px]">
          <div className="flex items-center gap-2 md:hidden">
            <Logo tamanho={28} />
            <span className="text-[19px] font-bold">Leadtogo</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

/** Título da tela (h1) com a frase de apoio. */
export function Cabecalho({ titulo, descricao }: { titulo: string; descricao?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="m-0 text-2xl leading-[30px] font-semibold">{titulo}</h1>
      {descricao ? <span className="text-ink-muted">{descricao}</span> : null}
    </div>
  )
}

/** Linha "ou" entre o Google e o formulário. */
export function DivisorOu() {
  return (
    <div className="flex items-center gap-3 text-[13px] text-ink-muted">
      <span className="h-px flex-1 bg-border" />
      ou
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Selo redondo de 48 px (e-mail enviado, tudo pronto). */
export function Selo({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
      {children}
    </span>
  )
}
