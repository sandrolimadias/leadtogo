import { useNavigate } from '@tanstack/react-router'
import { Building2, Check } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'

import { useEmpresasDoAcesso, useTrocarEmpresa } from './hooks'

/** "Escolha a empresa": aparece depois de entrar, para quem acessa mais de uma empresa-cliente. */
export function TelaEscolherEmpresa() {
  const empresas = useEmpresasDoAcesso()
  const trocar = useTrocarEmpresa()
  const navegar = useNavigate()
  const [trocando, setTrocando] = useState<string | null>(null)

  const escolher = async (acessoId: string, atual: boolean) => {
    if (atual) {
      await navegar({ to: '/' })
      return
    }
    setTrocando(acessoId)
    if (!(await trocar(acessoId))) setTrocando(null)
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="m-0 text-2xl leading-8 font-semibold">Escolha a empresa</h1>
        <p className="m-0 text-sm text-ink-muted">
          Seu e-mail tem acesso a mais de uma empresa. Você pode trocar depois, pelo menu.
        </p>
      </header>
      {empresas.isError ? <Alert tone="danger" title={empresas.error.message} /> : null}
      {!empresas.data ? (
        <Skeleton lines={3} />
      ) : (
        <ul aria-label="Empresas" className="m-0 flex list-none flex-col gap-2 p-0">
          {empresas.data.map((e) => (
            <li key={e.acessoId}>
              <button
                type="button"
                disabled={trocando !== null}
                onClick={() => void escolher(e.acessoId, e.atual)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-surface p-4 text-left text-ink hover:bg-surface-hover disabled:cursor-wait"
              >
                <Building2
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="text-ink-muted"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{e.nome}</span>
                  <span className="text-xs text-ink-muted">
                    {e.papel === 'responsavel' ? 'Responsável' : 'Colega'}
                  </span>
                </span>
                {e.atual ? (
                  <Badge tone="success">
                    <Check size={12} aria-hidden="true" /> Atual
                  </Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
