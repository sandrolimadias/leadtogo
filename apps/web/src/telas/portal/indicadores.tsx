import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { cn } from '@leadtogo/ui/cn'

function Cartao({
  rotulo,
  valor,
  nota,
  tom,
}: {
  rotulo: string
  valor: string
  nota: string
  tom?: 'danger' | 'success'
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4">
      <span className="text-[13px] text-ink-muted">{rotulo}</span>
      <span
        className={cn(
          'text-[28px] leading-8 font-semibold tabular-nums',
          tom === 'danger' && 'text-danger',
          tom === 'success' && 'text-success',
        )}
      >
        {valor}
      </span>
      <span className="text-xs text-ink-muted">{nota}</span>
    </div>
  )
}

const percentual = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')}%`)

/** Os quatro números do hub, dos chamados abertos pelos clientes: Em aberto, Prazo estourando, 1ª resposta e Nota. */
export function IndicadoresDoPortal() {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['portal', 'indicadores'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.indicadores()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (consulta.isError) {
    return (
      <Alert tone="danger">Não consegui carregar os indicadores. {consulta.error.message}</Alert>
    )
  }
  const i = consulta.data
  if (!i) {
    return (
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} height={96} />
        ))}
      </div>
    )
  }
  return (
    <section aria-label="Indicadores" className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
      <Cartao
        rotulo="Em aberto"
        valor={String(i.emAberto)}
        nota="chamados de clientes sem resolver"
      />
      <Cartao
        rotulo="Prazo estourando"
        valor={String(i.prazoEstourando)}
        nota="primeira resposta ou resolução"
        {...(i.prazoEstourando > 0 ? { tom: 'danger' as const } : {})}
      />
      <Cartao
        rotulo="1ª resposta no prazo"
        valor={percentual(i.primeiraRespostaNoPrazo)}
        nota={`últimos ${i.periodoDias} dias`}
        {...(i.primeiraRespostaNoPrazo !== null && i.primeiraRespostaNoPrazo >= 90
          ? { tom: 'success' as const }
          : {})}
      />
      <Cartao
        rotulo="Nota média"
        valor={i.notaMedia === null ? '—' : String(i.notaMedia).replace('.', ',')}
        nota={`${i.avaliacoes} avaliaç${i.avaliacoes === 1 ? 'ão' : 'ões'} em ${i.periodoDias} dias`}
      />
    </section>
  )
}
