import type { LoteDeImportacao } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Alert, Skeleton } from '@/components/ui/feedback'

import { PassoImportar, PassoRelatorio } from './acompanhamento'
import { chaveDoLote, PASSO, useQuemImporta } from './comum'
import { PassoCarteira, PassoMapear, PassoPrevia, PassoRegras } from './passos'

const rota = getRouteApi('/_autenticado/importacao/$loteId')

/**
 * Onde o lote está: quem já executou (ou está executando) mostra o progresso ou o relatório, e quem
 * ainda é rascunho ou está pronto segue os passos de configuração. Vale ao abrir o link de novo.
 */
function passoDaSituacao(lote: LoteDeImportacao, escolhido: number): number {
  switch (lote.situacao) {
    case 'em_andamento':
      return PASSO.importar
    case 'concluida':
    case 'falhou':
    case 'cancelada':
    case 'desfeita':
      return PASSO.relatorio
    default:
      return escolhido
  }
}

/** Um lote de importação, do mapeamento ao relatório (passos 2 a 7). */
export function AssistenteDaImportacao() {
  const { loteId } = rota.useParams()
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { pode } = useQuemImporta()
  const [escolhido, setEscolhido] = useState<number>(PASSO.mapear)

  const lote = useQuery({
    queryKey: chaveDoLote(loteId),
    retry: false,
    enabled: pode,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.detalhar(loteId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const guardar = useCallback(
    (novo: LoteDeImportacao) => queryClient.setQueryData(chaveDoLote(loteId), novo),
    [queryClient, loteId],
  )

  if (!pode) return null
  if (lote.isPending) {
    return (
      <main className="w-full max-w-[1080px] p-6 max-md:p-4">
        <div role="status" aria-label="Carregando a importação">
          <Skeleton lines={5} />
        </div>
      </main>
    )
  }
  if (lote.isError) {
    return (
      <main className="flex w-full max-w-[1080px] flex-col gap-3 p-6 max-md:p-4">
        <Alert tone="danger" title="Não foi possível abrir a importação">
          {lote.error.message}
        </Alert>
        <Link to="/importacao/nova" className="text-sm font-semibold text-brand">
          Importar uma planilha
        </Link>
      </main>
    )
  }

  const passo = passoDaSituacao(lote.data, escolhido)
  const props = { lote: lote.data, ir: setEscolhido, aoAlterar: guardar }
  switch (passo) {
    case PASSO.regras:
      return <PassoRegras {...props} />
    case PASSO.previa:
      return <PassoPrevia {...props} />
    case PASSO.carteira:
      return <PassoCarteira {...props} />
    case PASSO.importar:
      return <PassoImportar {...props} />
    case PASSO.relatorio:
      return <PassoRelatorio {...props} />
    default:
      return <PassoMapear {...props} />
  }
}
