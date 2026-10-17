import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'

import { useServicos } from '@/auth/contexto'
import { Alert, Skeleton } from '@/components/ui/feedback'

import { chaveDoResumo } from './consultas'

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface px-4 py-3">
      <span className="text-[13px] text-ink-muted">{rotulo}</span>
      <span
        className={`text-[24px] leading-8 font-semibold tabular-nums ${destaque && valor > 0 ? 'text-danger' : ''}`}
      >
        {valor.toLocaleString('pt-BR')}
      </span>
    </div>
  )
}

/** Quantas empresas estão exatas, aproximadas, sem coordenada, a confirmar ou ajustadas à mão. */
export function ResumoDaGeolocalizacao() {
  const servicos = useServicos()
  const resumo = useQuery({
    queryKey: chaveDoResumo,
    retry: false,
    queryFn: async () => {
      const r = await servicos.geolocalizacao.resumo()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (resumo.isPending) return <Skeleton className="h-20 w-full" />
  if (resumo.isError) return <Alert tone="danger">Não consegui carregar o resumo.</Alert>
  const r = resumo.data
  return (
    <div className="flex flex-col gap-3">
      {!r.cnefeCarregado ? (
        <Alert tone="warning" title="A base de endereços do IBGE ainda não foi carregada">
          Sem ela, só o OpenStreetMap e o CEP respondem e o resultado fica pior. Peça o carregamento
          (docs/geo_atualizacao.md, seção 1).
        </Alert>
      ) : null}
      {!r.nominatimConfigurado ? (
        <Alert tone="info">
          O Nominatim (OpenStreetMap) não está configurado neste ambiente: a procura usa só a base
          do IBGE e o CEP.
        </Alert>
      ) : null}
      <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
        <Numero rotulo="Posição exata" valor={r.exatas} />
        <Numero rotulo="Posição aproximada" valor={r.aproximadas} />
        <Numero rotulo="Sem coordenada" valor={r.semCoordenada} />
        <Numero rotulo="Endereço a confirmar" valor={r.aConfirmar} destaque />
        <Numero rotulo="Ajustadas à mão" valor={r.ajustadasAMao} />
      </div>
      {r.aConfirmar > 0 ? (
        <p className="m-0 flex items-center gap-1.5 text-[13px] text-ink-muted">
          <TriangleAlert size={14} aria-hidden="true" />
          Empresa com endereço incompleto não aparece no mapa até ser confirmada.
        </p>
      ) : null}
    </div>
  )
}
