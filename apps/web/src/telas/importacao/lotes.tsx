import type { ListaDeLotesDeImportacao } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Badge, type TomDoBadge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'

import { formatarDataHora, resumoDoLote, useQuemImporta } from './comum'

type Lote = ListaDeLotesDeImportacao['itens'][number]

const SITUACAO: Record<Lote['situacao'], { rotulo: string; tom: TomDoBadge }> = {
  rascunho: { rotulo: 'Rascunho', tom: 'neutral' },
  pronta: { rotulo: 'Pronta', tom: 'info' },
  em_andamento: { rotulo: 'Em andamento', tom: 'accent' },
  concluida: { rotulo: 'Concluída', tom: 'success' },
  falhou: { rotulo: 'Parou', tom: 'danger' },
  cancelada: { rotulo: 'Cancelada', tom: 'warning' },
  desfeita: { rotulo: 'Desfeita', tom: 'neutral' },
}

/** A lista das importações da empresa (do lote mais novo para o mais antigo). */
export function ListaDeImportacoes() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const { pode } = useQuemImporta()
  const [pagina, setPagina] = useState(1)
  const lotes = useQuery({
    queryKey: ['importacao', 'lotes', pagina],
    retry: false,
    enabled: pode,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.listar(pagina)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (!pode) return null
  const nova = () => void navegar({ to: '/importacao/nova' })

  return (
    <main className="flex w-full max-w-[1080px] flex-col gap-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[13px] text-ink-muted">Empresas</span>
          <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em] max-md:text-[22px] max-md:leading-7">
            Importações
          </h1>
        </div>
        <Button variant="primary" icon={Upload} onClick={nova}>
          Importar planilha
        </Button>
      </div>

      {lotes.isPending ? (
        <div role="status" aria-label="Carregando as importações">
          <Skeleton lines={4} />
        </div>
      ) : lotes.isError ? (
        <Alert
          tone="danger"
          title="Não foi possível carregar as importações"
          actions={
            <Button size="sm" onClick={() => void lotes.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {lotes.error.message}
        </Alert>
      ) : lotes.data.itens.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Nenhuma importação ainda"
          description="Envie uma planilha Excel ou CSV para cadastrar várias empresas de uma vez."
          actions={
            <Button variant="primary" icon={Upload} onClick={nova}>
              Importar planilha
            </Button>
          }
        />
      ) : (
        <>
          <ul
            aria-label="Importações"
            className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
          >
            {lotes.data.itens.map((l) => (
              <li
                key={l.id}
                aria-label={l.nome}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-48 flex-1 flex-col gap-0.5">
                  <Link
                    to="/importacao/$loteId"
                    params={{ loteId: l.id }}
                    className="font-semibold text-ink hover:underline"
                  >
                    {l.nome}
                  </Link>
                  <span className="text-[13px] text-ink-muted">{resumoDoLote(l)}</span>
                  <span className="text-xs text-ink-subtle">
                    {l.nomeArquivo} · {formatarDataHora(l.criadoEm)}
                    {l.criadoPor ? ` · ${l.criadoPor}` : ''}
                  </span>
                  {l.situacao === 'falhou' && typeof l.totais['motivo'] === 'string' ? (
                    <span className="text-[13px] text-danger">{l.totais['motivo']}</span>
                  ) : null}
                </div>
                <Badge tone={SITUACAO[l.situacao].tom}>{SITUACAO[l.situacao].rotulo}</Badge>
              </li>
            ))}
          </ul>
          {lotes.data.total > lotes.data.porPagina ? (
            <nav
              aria-label="Páginas das importações"
              className="flex items-center justify-end gap-2 text-[13px]"
            >
              <span className="text-ink-muted">
                Página {lotes.data.pagina} de {Math.ceil(lotes.data.total / lotes.data.porPagina)}
              </span>
              <Button size="sm" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                Anterior
              </Button>
              <Button
                size="sm"
                disabled={pagina * lotes.data.porPagina >= lotes.data.total}
                onClick={() => setPagina(pagina + 1)}
              >
                Próxima
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </main>
  )
}
