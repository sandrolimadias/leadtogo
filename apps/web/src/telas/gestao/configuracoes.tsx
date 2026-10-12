import { Link, Outlet } from '@tanstack/react-router'
import { ShieldCheck, Tags, Users } from 'lucide-react'

import { Icon } from '@/components/ui/icone'
import { cn } from '@/lib/cn'

const SECOES = [
  { para: '/configuracoes/usuarios', titulo: 'Usuários e equipe', icone: Users },
  { para: '/configuracoes/tags', titulo: 'Tags', icone: Tags },
  { para: '/configuracoes/seguranca', titulo: 'Segurança', icone: ShieldCheck },
] as const

/** Casca das Configurações da empresa ativa: menu interno (lateral no desktop, em linha no celular) e a seção. */
export function Configuracoes() {
  return (
    <main className="flex w-full max-w-[1400px] flex-col gap-5 p-6 max-md:p-4">
      <h1 className="m-0 text-[22px] leading-7 font-semibold max-md:sr-only">Configurações</h1>
      <div className="flex gap-6 max-md:flex-col">
        <nav
          aria-label="Configurações"
          className="flex w-[220px] flex-none flex-col gap-1 max-md:w-full max-md:flex-row max-md:overflow-x-auto"
        >
          {SECOES.map((s) => (
            <Link
              key={s.para}
              to={s.para}
              className={cn(
                'flex min-h-9 items-center gap-2 rounded-sm px-3 text-sm whitespace-nowrap text-ink no-underline hover:bg-surface-hover',
              )}
              activeProps={{
                'aria-current': 'page',
                className: 'bg-surface-selected font-semibold text-brand',
              }}
            >
              <Icon icon={s.icone} size={16} />
              {s.titulo}
            </Link>
          ))}
        </nav>
        <section className="min-w-0 flex-1">
          <Outlet />
        </section>
      </div>
    </main>
  )
}
