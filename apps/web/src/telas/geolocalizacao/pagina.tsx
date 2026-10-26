import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { ConteudoDaAba, Tabs } from '@leadtogo/ui/tabs'

import { FilaDeConfirmacao } from './confirmar'
import { chaveDoResumo, useRegioes } from './consultas'
import { LegendaDoMapaConfig } from '@/telas/mapa/legenda-config'
import { ListaDeLotes, NovoLote } from './lotes'
import { useQuemGeocodifica } from './papel'
import { Regioes } from './regioes'
import { ResumoDaGeolocalizacao } from './resumo'

/**
 * Geolocalização: o resumo e os lotes por cidade ou região (administrador e gestor), a fila "Confirmar
 * endereço" (todo mundo, cada um com as suas) e as regiões (o administrador edita).
 */
export function TelaDeGeolocalizacao({
  dentroDasConfiguracoes = false,
}: {
  dentroDasConfiguracoes?: boolean
}) {
  const quem = useQuemGeocodifica()
  const servicos = useServicos()
  const [aba, setAba] = useState<string>()
  // A UF vem da configuração do servidor (`GEO_UF`), nunca fixa no código
  const resumo = useQuery({
    queryKey: chaveDoResumo,
    enabled: quem.lotes,
    retry: false,
    queryFn: async () => {
      const r = await servicos.geolocalizacao.resumo()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const regioes = useRegioes(quem.lotes ? resumo.data?.uf : undefined)

  if (quem.carregando) return <Skeleton className="m-6 h-40" />

  const abas = [
    ...(quem.lotes ? [{ value: 'lotes', label: 'Resumo e lotes' }] : []),
    { value: 'confirmar', label: 'Confirmar endereço' },
    ...(quem.lotes ? [{ value: 'regioes', label: 'Regiões' }] : []),
    ...(quem.regioes ? [{ value: 'legenda', label: 'Legenda do mapa' }] : []),
  ]
  const atual = aba ?? abas[0]?.value ?? 'confirmar'

  return (
    <Moldura dentroDasConfiguracoes={dentroDasConfiguracoes}>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-muted">Carteira</span>
        <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em] max-md:text-[22px] max-md:leading-7">
          Geolocalização
        </h1>
      </div>
      <Tabs items={abas} value={atual} onChange={setAba} label="Seções da geolocalização">
        {quem.lotes ? (
          <ConteudoDaAba value="lotes" className="flex flex-col gap-5 pt-4">
            <ResumoDaGeolocalizacao />
            {regioes.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : regioes.isError || !resumo.data ? (
              <Alert tone="danger">Não consegui carregar as cidades e regiões.</Alert>
            ) : (
              <NovoLote regioes={regioes.data} />
            )}
            <ListaDeLotes />
          </ConteudoDaAba>
        ) : null}
        <ConteudoDaAba value="confirmar" className="pt-4">
          <FilaDeConfirmacao />
        </ConteudoDaAba>
        {quem.lotes ? (
          <ConteudoDaAba value="regioes" className="pt-4">
            {regioes.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : regioes.isError ? (
              <Alert tone="danger">Não consegui carregar as regiões.</Alert>
            ) : (
              <Regioes regioes={regioes.data} podeEditar={quem.regioes} />
            )}
          </ConteudoDaAba>
        ) : null}
        {quem.regioes ? (
          <ConteudoDaAba value="legenda" className="pt-4">
            <LegendaDoMapaConfig podeEditar />
          </ConteudoDaAba>
        ) : null}
      </Tabs>
    </Moldura>
  )
}

/** Página própria (menu Geolocalização) ou seção das Configurações (que já tem a sua moldura e o <main>). */
function Moldura({
  dentroDasConfiguracoes,
  children,
}: {
  dentroDasConfiguracoes: boolean
  children: ReactNode
}) {
  return dentroDasConfiguracoes ? (
    <div className="flex w-full flex-col gap-5">{children}</div>
  ) : (
    <main className="flex w-full max-w-[1080px] flex-col gap-5 p-6 max-md:p-4">{children}</main>
  )
}
