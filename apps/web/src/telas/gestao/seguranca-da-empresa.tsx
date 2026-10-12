import type { PoliticaDoisFatores } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { useEnvio } from '@/telas/acesso/comum'

const OPCOES: { valor: PoliticaDoisFatores; titulo: string; quem: string }[] = [
  {
    valor: 'admin',
    titulo: 'Administradores',
    quem: 'Só os administradores da empresa precisam da verificação em duas etapas.',
  },
  {
    valor: 'admin_gestor',
    titulo: 'Administradores e gestores',
    quem: 'Administradores e gestores precisam; vendedores usam se quiserem.',
  },
  {
    valor: 'todos',
    titulo: 'Todos os membros',
    quem: 'Administradores, gestores e vendedores precisam da verificação em duas etapas.',
  },
]

const chaveDaSegurancaDaEmpresa = ['seguranca-da-empresa'] as const

/**
 * Configurações → Segurança: a política de 2FA da empresa ativa (quem é obrigado a ter a verificação em
 * duas etapas). Só o administrador altera; vale na próxima requisição de cada pessoa.
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
  const [escolhida, setEscolhida] = useState<PoliticaDoisFatores | undefined>()
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

  const atual = consulta.data.doisFatoresExigido
  const selecionada = escolhida ?? atual
  const salvar = () =>
    void executar(async () => {
      setFalha(undefined)
      const r = await servicos.alterarPoliticaDeDoisFatores(selecionada)
      if (!r.ok) {
        setFalha(r.erro.mensagem)
        return
      }
      queryClient.setQueryData(chaveDaSegurancaDaEmpresa, r.dados)
      setEscolhida(undefined)
      toast.success('Política de segurança salva', {
        description: 'Vale na próxima requisição de cada pessoa.',
      })
    })

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">Quem precisa da verificação em duas etapas</legend>
        {OPCOES.map((o) => (
          <label
            key={o.valor}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border bg-surface p-3',
              selecionada === o.valor ? 'border-brand bg-surface-selected' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="politica-2fa"
              value={o.valor}
              checked={selecionada === o.valor}
              onChange={() => setEscolhida(o.valor)}
              className="mt-1 accent-(--brand)"
            />
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{o.titulo}</span>
              <span className="text-[13px] text-ink-muted">{o.quem}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Alert tone="info" title="Como a regra é aplicada">
        Quem entra na empresa sem a verificação ativa é levado à ativação e fica barrado nas demais
        telas até concluir. Administradores da conta precisam dela sempre, qualquer que seja a
        política.
      </Alert>
      {falha ? (
        <Alert tone="danger" title="Não foi possível salvar">
          {falha}
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button
          variant="primary"
          loading={enviando}
          disabled={selecionada === atual}
          onClick={salvar}
        >
          Salvar
        </Button>
      </div>
    </div>
  )
}
