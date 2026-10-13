import type { ConfiguracaoDaCarteira } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/checkbox'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { useEnvio } from '@/telas/acesso/comum'

const chaveDaCarteira = ['configuracao-da-carteira'] as const

const REGRAS: {
  campo: keyof ConfiguracaoDaCarteira
  rotulo: string
  descricao: string
  avisoAoMudar: (ligado: boolean) => string
}[] = [
  {
    campo: 'bloquearEmpresaNaoAtiva',
    rotulo: 'Bloquear o cadastro de empresa não ativa na Receita',
    descricao:
      'Não deixa cadastrar um CNPJ baixado, inapto, suspenso ou nulo: a tela mostra a situação e o motivo e o botão Salvar fica desligado. Vale só para cadastro novo; a empresa que já está na carteira continua, com o aviso de situação. Se a Receita estiver fora do ar, a empresa é salva como "situação não verificada" e o sistema confere depois.',
    avisoAoMudar: (ligado) =>
      ligado
        ? 'Empresa não ativa na Receita não poderá ser cadastrada.'
        : 'Empresa não ativa na Receita poderá ser cadastrada, com o aviso de situação.',
  },
  {
    campo: 'vendedorVeTodasEmpresas',
    rotulo: 'Vendedores podem ver todas as empresas',
    descricao:
      'Ligado: cada vendedor vê a carteira de todos, mas edita só a própria. Desligado: o vendedor vê só as empresas em que é o responsável. Gestores e administradores sempre veem tudo.',
    avisoAoMudar: (ligado) =>
      ligado
        ? 'Vendedores passam a ver todas as empresas.'
        : 'Vendedores voltam a ver só a própria carteira.',
  },
]

/**
 * Configurações → Carteira: as regras da carteira de empresas. Cada chave vale na hora (como um
 * interruptor); só o administrador altera.
 */
export function TelaDaCarteiraDaEmpresa() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const consulta = useQuery({
    queryKey: chaveDaCarteira,
    retry: false,
    queryFn: async () => {
      const r = await servicos.configuracaoDaCarteira()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const cabecalho = (
    <div className="flex flex-col gap-1">
      <h2 className="m-0 text-[17px] leading-6 font-semibold">Carteira</h2>
      <p className="m-0 text-sm text-ink-muted">
        As regras de quem vê e quais empresas entram na carteira.
      </p>
    </div>
  )

  if (consulta.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Carregando a carteira">
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
          title="Não foi possível carregar as regras da carteira"
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

  const atual = consulta.data
  const mudar = (campo: keyof ConfiguracaoDaCarteira, ligado: boolean, aviso: string) =>
    void executar(async () => {
      const r = await servicos.alterarConfiguracaoDaCarteira({ [campo]: ligado })
      if (!r.ok) {
        toast.error('Não foi possível salvar', { description: r.erro.mensagem })
        await queryClient.invalidateQueries({ queryKey: chaveDaCarteira })
        return
      }
      queryClient.setQueryData(chaveDaCarteira, r.dados)
      toast.success('Regra da carteira salva', { description: aviso })
    })

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {REGRAS.map((regra) => (
          <li
            key={regra.campo}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
          >
            <Switch
              label={regra.rotulo}
              checked={atual[regra.campo]}
              disabled={enviando}
              onChange={(e) =>
                mudar(regra.campo, e.target.checked, regra.avisoAoMudar(e.target.checked))
              }
            />
            <p className="m-0 text-[13px] leading-[18px] text-ink-muted">{regra.descricao}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
