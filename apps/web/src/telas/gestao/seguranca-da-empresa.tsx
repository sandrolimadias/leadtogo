import type { Seguranca } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Switch } from '@leadtogo/ui/checkbox'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { useEnvio } from '@/telas/acesso/comum'

const chaveDaSegurancaDaEmpresa = ['seguranca-da-empresa'] as const

const usuarios = (n: number) => (n === 1 ? '1 usuário' : `${n} usuários`)

/**
 * Configurações → Segurança: quem precisa da verificação em duas etapas, perfil por perfil (o flag
 * `exige2fa` do perfil de acesso). Altera quem tem `seguranca.gerir`; vale na próxima requisição de
 * cada pessoa. O Administrador sempre exige.
 */
export function TelaDeSegurancaDaEmpresa() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const consulta = useQuery({
    queryKey: chaveDaSegurancaDaEmpresa,
    retry: false,
    queryFn: async () => {
      const r = await servicos.seguranca()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [mudancas, setMudancas] = useState<Record<string, boolean>>({})
  const [falha, setFalha] = useState<string | undefined>()

  const cabecalho = (
    <div className="flex flex-col gap-1">
      <h2 className="m-0 text-[17px] leading-6 font-semibold">Segurança</h2>
      <p className="m-0 text-sm text-ink-muted">
        Quem precisa ativar a verificação em duas etapas (app autenticador) para usar esta empresa.
      </p>
    </div>
  )

  if (consulta.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Carregando a segurança">
        {cabecalho}
        <Skeleton lines={3} />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Alert
          tone="danger"
          title="Não foi possível carregar a segurança"
          actions={
            <Button size="sm" onClick={() => void consulta.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {consulta.error.message}
        </Alert>
      </div>
    )
  }

  const perfis: Seguranca['perfis'] = consulta.data.perfis
  const exige = (id: string, atual: boolean) => mudancas[id] ?? atual
  const mudou = perfis.some((p) => exige(p.id, p.exige2fa) !== p.exige2fa)
  const salvar = () =>
    void executar(async () => {
      setFalha(undefined)
      const alteradas = Object.fromEntries(
        perfis
          .filter((p) => exige(p.id, p.exige2fa) !== p.exige2fa)
          .map((p) => [p.id, exige(p.id, p.exige2fa)]),
      )
      const r = await servicos.alterarDoisFatoresDosPerfis(alteradas)
      if (!r.ok) {
        setFalha(r.erro.mensagem)
        return
      }
      queryClient.setQueryData(chaveDaSegurancaDaEmpresa, r.dados)
      setMudancas({})
      toast.success('Segurança salva', {
        description: 'Vale na próxima requisição de cada pessoa.',
      })
    })

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      <ul
        aria-label="Verificação em duas etapas por perfil"
        className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
      >
        {perfis.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="flex min-w-[200px] flex-1 flex-col">
              <span className="flex items-center gap-2 font-semibold">
                {p.nome}
                {p.ativo ? null : <Badge tone="neutral">Inativo</Badge>}
              </span>
              <span className="text-xs text-ink-muted">
                {usuarios(p.membros)}
                {p.chaveSistema === 'admin' ? ' · o Administrador sempre exige' : ''}
              </span>
            </div>
            <Switch
              label={`Exige a verificação: ${p.nome}`}
              checked={exige(p.id, p.exige2fa)}
              disabled={p.chaveSistema === 'admin'}
              onChange={(e) => setMudancas((m) => ({ ...m, [p.id]: e.target.checked }))}
            />
          </li>
        ))}
      </ul>
      <Alert tone="info" title="Como a regra é aplicada">
        Quem entra na empresa sem a verificação ativa e tem um perfil que a exige é levado à
        ativação e fica barrado nas demais telas até concluir. Administradores da conta precisam
        dela sempre. Os perfis ficam em Configurações → Perfis de acesso.
      </Alert>
      {falha ? (
        <Alert tone="danger" title="Não foi possível salvar">
          {falha}
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button variant="primary" loading={enviando} disabled={!mudou} onClick={salvar}>
          Salvar
        </Button>
      </div>
    </div>
  )
}
