import { CircleCheck, CircleX } from 'lucide-react'

import { SENHA_MIN } from '@leadtogo/shared'

import { cn } from '@/lib/cn'

export interface RegraDeSenha {
  rotulo: string
  cumprida: boolean
}

// eslint-disable-next-line react-refresh/only-export-components -- idem
export function regrasDeSenha(senha: string): RegraDeSenha[] {
  return [
    { rotulo: `Pelo menos ${SENHA_MIN} caracteres`, cumprida: senha.length >= SENHA_MIN },
    { rotulo: 'Uma letra', cumprida: /[a-zA-Z]/.test(senha) },
    { rotulo: 'Um número', cumprida: /\d/.test(senha) },
  ]
}

// eslint-disable-next-line react-refresh/only-export-components -- regra de negócio ao lado da lista que a mostra
export const senhaForte = (senha: string) => regrasDeSenha(senha).every((r) => r.cumprida)

/** Lista de regras que vão ficando verdes enquanto a pessoa digita. Cor + ícone + palavra. */
export function RegrasDeSenha({ senha, id }: { senha: string; id?: string }) {
  return (
    <ul id={id} className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Regras da senha">
      {regrasDeSenha(senha).map(({ rotulo, cumprida }) => {
        const Icone = cumprida ? CircleCheck : CircleX
        return (
          <li
            key={rotulo}
            className={cn(
              'flex items-center gap-1.5 text-[13px]',
              cumprida ? 'text-success' : 'text-ink-muted',
            )}
          >
            <Icone size={14} strokeWidth={1.75} aria-hidden="true" />
            {rotulo}
            <span className="sr-only">{cumprida ? ' (cumprida)' : ' (falta)'}</span>
          </li>
        )
      })}
    </ul>
  )
}
