import type { Me } from '@leadtogo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { AcessoLayout, Cabecalho } from '@/components/acesso/layout'
import { classeDaCor, corDoNome, iniciais } from '@leadtogo/ui/cores'
import { Alert } from '@leadtogo/ui/feedback'
import { useEnvio } from '@/telas/acesso/comum'
import { cn } from '@leadtogo/ui/cn'

import { nomeDaEmpresa, perfilDaEmpresa } from './utilidades'
import { useTrocarEmpresa } from './empresas'

/**
 * Tela "Escolha a empresa": aparece quando a pessoa tem empresas, mas nenhuma está ativa (várias e
 * nenhuma usada antes, ou perdeu o acesso à que estava). Escolher abre o app na empresa.
 */
export function SeletorDeEmpresa({ me }: { me: Me }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const trocar = useTrocarEmpresa()
  const { enviando, executar } = useEnvio()
  const [escolhida, setEscolhida] = useState<string | null>(null)

  const escolher = (id: string) => {
    setEscolhida(id)
    void executar(async () => {
      await trocar(id, { avisar: false })
      setEscolhida(null)
    })
  }

  const sair = async () => {
    await servicos.sair()
    await queryClient.invalidateQueries({ queryKey: chaveDoMe })
    await navegar({ to: '/login', search: { redirect: undefined } })
  }

  return (
    <AcessoLayout>
      <Cabecalho
        titulo="Escolha a empresa"
        descricao={`${me.usuario.nome}, você tem acesso a mais de uma empresa. Com qual quer trabalhar agora?`}
      />
      <ul aria-label="Suas empresas" className="m-0 flex list-none flex-col gap-2 p-0">
        {me.empresas.map((e) => {
          const nome = nomeDaEmpresa(e)
          const indisponivel = e.situacao !== 'teste' && e.situacao !== 'ativo'
          return (
            <li key={e.id}>
              <button
                type="button"
                disabled={enviando || indisponivel}
                onClick={() => escolher(e.id)}
                aria-busy={escolhida === e.id ? true : undefined}
                className={cn(
                  'flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45',
                  escolhida === e.id && 'border-brand',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-9 flex-none items-center justify-center rounded-sm text-xs font-bold',
                    classeDaCor[corDoNome(nome)],
                  )}
                >
                  {iniciais(nome)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[14px]">{nome}</b>
                  <span className="text-[12px] text-ink-muted">
                    {perfilDaEmpresa(e)}
                    {indisponivel ? ' · empresa suspensa ou cancelada' : ''}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {me.empresas.every((e) => e.situacao !== 'teste' && e.situacao !== 'ativo') ? (
        <Alert tone="warning">Nenhuma das suas empresas está disponível agora.</Alert>
      ) : null}
      <button
        type="button"
        onClick={() => void sair()}
        className="cursor-pointer self-center border-0 bg-transparent p-0 text-sm text-ink-muted hover:text-ink hover:underline"
      >
        Sair
      </button>
    </AcessoLayout>
  )
}
