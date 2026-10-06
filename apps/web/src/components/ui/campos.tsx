import { ChevronDown, CircleAlert, type LucideIcon } from 'lucide-react'
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react'

import { cn } from '@/lib/cn'

const controle =
  'w-full rounded-sm border border-border-strong bg-surface text-ink text-[length:var(--ctl-font)] placeholder:text-ink-subtle hover:border-ink-muted focus-visible:border-brand focus-visible:outline-offset-0 aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-45'

interface EnvoltorioProps {
  id: string
  label?: string | undefined
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}

/** Rótulo sempre visível acima do campo; dica ou erro abaixo (o erro diz como corrigir). */
function Campo({ id, label, hint, error, required, className, children }: EnvoltorioProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-[13px] leading-[18px] font-semibold text-ink">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span
          id={`${id}-msg`}
          className="flex items-center gap-1 text-xs leading-4 font-medium text-danger"
        >
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-msg`} className="text-xs leading-4 text-ink-muted">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

type ComunsDoCampo = {
  label?: string
  hint?: string
  error?: string
  /** Documentos e códigos (CNPJ, CEP): alinha os dígitos */
  mono?: boolean
}

export type TextFieldProps = ComunsDoCampo &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'suffix'> & {
    icon?: LucideIcon
    /** Ex.: botão "Consultar" dentro do campo */
    suffix?: ReactNode
  }

export function TextField({
  label,
  hint,
  error,
  mono,
  icon: Icone,
  suffix,
  className,
  id: idProp,
  required,
  ...resto
}: TextFieldProps) {
  const gerado = useId()
  const id = idProp ?? gerado
  return (
    <Campo
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <div className="relative flex items-center">
        {Icone ? (
          <Icone
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 text-ink-subtle"
          />
        ) : null}
        <input
          type="text"
          {...resto}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={cn(
            controle,
            'h-(--ctl) px-3',
            Icone && 'pl-[calc(--spacing(3)+16px+--spacing(2))]',
            mono && 'font-mono',
            suffix && 'pr-[116px]',
          )}
        />
        {suffix ? <div className="absolute right-2 flex items-center">{suffix}</div> : null}
      </div>
    </Campo>
  )
}

export type TextAreaProps = ComunsDoCampo & TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({
  label,
  hint,
  error,
  mono,
  className,
  id: idProp,
  required,
  ...resto
}: TextAreaProps) {
  const gerado = useId()
  const id = idProp ?? gerado
  return (
    <Campo
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <textarea
        {...resto}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={cn(controle, 'min-h-22 resize-y px-3 py-2 leading-5', mono && 'font-mono')}
      />
    </Campo>
  )
}

export type SelectProps = ComunsDoCampo &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
    placeholder?: string
    options: (string | { value: string; label: string })[]
  }

/** Escolha única numa lista curta e fixa. Usa o `<select>` nativo (teclado e celular de graça). */
export function Select({
  label,
  hint,
  error,
  placeholder,
  options,
  className,
  id: idProp,
  required,
  ...resto
}: SelectProps) {
  const gerado = useId()
  const id = idProp ?? gerado
  return (
    <Campo
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <div className="relative flex items-center">
        <select
          {...resto}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={cn(controle, 'h-(--ctl) cursor-pointer appearance-none pr-8 pl-3')}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => {
            const valor = typeof o === 'string' ? o : o.value
            return (
              <option key={valor} value={valor}>
                {typeof o === 'string' ? o : o.label}
              </option>
            )
          })}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute right-2 text-ink-muted"
        />
      </div>
    </Campo>
  )
}
