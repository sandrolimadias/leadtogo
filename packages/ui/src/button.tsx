import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, Ref } from 'react'

import { cn } from './cn'

type VarianteDoBotao = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
type TamanhoDoBotao = 'sm' | 'md' | 'lg'

const variantes: Record<VarianteDoBotao, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border-border-strong hover:bg-surface-hover',
  ghost: 'bg-transparent text-ink hover:bg-surface-hover',
  danger: 'bg-danger text-on-danger',
  'danger-ghost': 'bg-transparent text-danger hover:bg-danger-soft',
}
const tamanhos: Record<TamanhoDoBotao, string> = {
  sm: '[--ctl:var(--control-sm)] [--ctl-font:13px] px-2',
  md: 'px-3',
  lg: '[--ctl:var(--control-lg)] [--ctl-font:15px] px-4',
}

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: VarianteDoBotao
  size?: TamanhoDoBotao
  icon?: LucideIcon
  iconRight?: LucideIcon
  /** Mantém a largura e desativa o clique ("Consultando Receita…") */
  loading?: boolean
  block?: boolean
  /** O `<button>` (ex.: para devolver o foco a ele) */
  ref?: Ref<HTMLButtonElement>
}

/** Ação com rótulo de verbo. `primary` no máximo uma vez por área. A altura segue `data-density`. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icone,
  iconRight: IconeDireita,
  loading,
  block,
  className,
  children,
  disabled,
  type = 'button',
  ...resto
}: BotaoProps) {
  return (
    <button
      type={type}
      {...resto}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      className={cn(
        'inline-flex h-(--ctl) cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-transparent text-[length:var(--ctl-font)] font-semibold whitespace-nowrap transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-45',
        variantes[variant],
        tamanhos[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-3.5 animate-[lt-spin_.7s_linear_infinite] rounded-full border-2 border-current border-r-transparent"
        />
      ) : Icone ? (
        <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
      ) : null}
      {children}
      {IconeDireita ? <IconeDireita size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  )
}

export interface BotaoDeIconeProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  icon: LucideIcon
  /** Obrigatório: vira `aria-label` e dica */
  label: string
  variant?: 'ghost' | 'secondary' | 'primary' | 'fab'
  size?: TamanhoDoBotao
}

const variantesDeIcone: Record<NonNullable<BotaoDeIconeProps['variant']>, string> = {
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink',
  secondary: 'border-border-strong bg-surface text-ink hover:bg-surface-hover',
  primary: 'bg-brand text-on-brand hover:bg-brand-hover',
  fab: '[--ctl:56px] rounded-full bg-brand text-on-brand shadow-lg',
}

/** Botão só com ícone, para ações repetidas e reconhecíveis. `fab` é o "+" flutuante do celular. */
export function IconButton({
  icon: Icone,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...resto
}: BotaoDeIconeProps) {
  return (
    <button
      type={type}
      {...resto}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-(--ctl) shrink-0 cursor-pointer items-center justify-center rounded-sm border border-transparent disabled:cursor-not-allowed disabled:opacity-45',
        variantesDeIcone[variant],
        size === 'sm' && '[--ctl:var(--control-sm)]',
        size === 'lg' && '[--ctl:var(--control-lg)]',
        className,
      )}
    >
      <Icone
        size={variant === 'fab' ? 22 : size === 'sm' ? 15 : 17}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </button>
  )
}
