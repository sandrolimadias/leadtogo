import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { BarChart3, ListChecks } from 'lucide-react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Tabs } from '@leadtogo/ui/tabs'
import { CardDeChamadosPendentes } from '@/telas/chamados/cartao'
import { CardDaRotaDeHoje } from '@/telas/rotas/rota-de-hoje'
import { CardDePendentes } from '@/telas/visitas/campo/pendentes'

import { AbaDeResultados } from './aba-resultados'
import { MinhasAtividades } from './atividades'
import { type AbaDoDashboard, type BuscaDoDashboard, lerBusca } from './busca'

const rota = getRouteApi('/_autenticado/')

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function saudacao(agora: Date): string {
  const h = agora.getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/**
 * O Dashboard em duas abas (docs/plano_dashboard_v2.md): **Minhas atividades** (o dia a dia, sem período) e
 * **Resultados** (indicadores, gráficos, entradas e saídas de associados, mapas e atendimento, por período).
 */
export function PaginaDoDashboard() {
  const servicos = useServicos()
  const celular = useDispositivo() === 'celular'
  const busca = rota.useSearch({ select: (s) => lerBusca(s) })
  const navegar = rota.useNavigate()
  const aba: AbaDoDashboard = busca.aba ?? 'atividades'

  const mudar = (patch: Partial<BuscaDoDashboard>) =>
    void navegar({
      search: (anterior) => {
        const novo: BuscaDoDashboard = { ...lerBusca(anterior), ...patch }
        for (const [chave, valor] of Object.entries(novo)) {
          if (valor === undefined) delete (novo as Record<string, unknown>)[chave]
        }
        return lerBusca(novo as Record<string, unknown>)
      },
      replace: true,
    })

  // o nome da saudação e o membro (os links da visão "Minha" filtram pela carteira dele)
  const inicio = useQuery({
    queryKey: ['dashboard', 'inicio'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.dashboard.carregar({})
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const agora = new Date()
  const primeiroNome = (inicio.data?.membro.nome ?? '').split(' ')[0] ?? ''

  return (
    <main className="flex w-full flex-1 flex-col gap-5 p-6 max-md:p-4">
      <h1 className="sr-only">Dashboard</h1>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] text-ink-muted">
          {maiuscula(
            agora.toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
          )}
        </span>
        <p className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em] max-md:text-[22px] max-md:leading-7">
          {saudacao(agora)}
          {primeiroNome ? `, ${primeiroNome}` : ''}
        </p>
      </div>

      <Tabs
        label="Dashboard"
        preencher
        value={aba}
        onChange={(v) => mudar({ aba: v === 'atividades' ? undefined : 'resultados' })}
        items={[
          { value: 'atividades', label: 'Minhas atividades', icon: ListChecks },
          { value: 'resultados', label: 'Resultados', icon: BarChart3 },
        ]}
      >
        <div className="pt-5">
          {aba === 'atividades' ? (
            <div className="flex flex-col gap-5">
              <CardDaRotaDeHoje />
              <CardDePendentes />
              <CardDeChamadosPendentes />
              <MinhasAtividades celular={celular} />
            </div>
          ) : (
            <AbaDeResultados
              busca={busca}
              celular={celular}
              membroId={inicio.data?.membro.id}
              mudar={mudar}
            />
          )}
        </div>
      </Tabs>
    </main>
  )
}
