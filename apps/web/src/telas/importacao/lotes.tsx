import type { ListaDeLotesDeImportacao } from '@leadtogo/api-client'
import {
  ROTULO_DO_TIPO_DE_IMPORTACAO,
  TIPOS_DE_IMPORTACAO,
  type TipoDeImportacao,
} from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Badge, type TomDoBadge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Paginacao } from '@leadtogo/ui/paginacao'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'
import { AreaDaTabela, CorpoDaTabela, PaginaDeTabela } from '@leadtogo/ui/pagina'
import { usePorPagina } from '@/casca/preferencias'

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
  const [tipo, setTipo] = useState<TipoDeImportacao | ''>('')
  const tamanho = usePorPagina('importacoes')
  const lotes = useQuery({
    queryKey: ['importacao', 'lotes', pagina, tamanho.porPagina, tipo],
    retry: false,
    enabled: pode && tamanho.pronto,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.listar(pagina, tamanho.porPagina, tipo || undefined)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (!pode) return null
  const nova = () => void navegar({ to: '/importacao/nova', search: tipo ? { tipo } : {} })

  return (
    <PaginaDeTabela className="max-w-[1080px]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[13px] text-ink-muted">Carteira</span>
          <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em] max-md:text-[22px] max-md:leading-7">
            Importações
          </h1>
        </div>
        <Button variant="primary" icon={Upload} onClick={nova}>
          Importar planilha
        </Button>
      </div>
      <SegmentedControl
        label="Tipo de importação"
        options={[
          { value: '', label: 'Todas' },
          ...TIPOS_DE_IMPORTACAO.map((t) => ({ value: t, label: ROTULO_DO_TIPO_DE_IMPORTACAO[t] })),
        ]}
        value={tipo}
        onChange={(v) => {
          setTipo(v as TipoDeImportacao | '')
          setPagina(1)
        }}
      />

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
          description="Envie uma planilha Excel ou CSV para cadastrar várias empresas, contatos ou atividades de uma vez."
          actions={
            <Button variant="primary" icon={Upload} onClick={nova}>
              Importar planilha
            </Button>
          }
        />
      ) : (
        <AreaDaTabela>
          <CorpoDaTabela>
            <ul aria-label="Importações" className="m-0 flex list-none flex-col p-0">
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
                  <Badge tone="neutral">{ROTULO_DO_TIPO_DE_IMPORTACAO[l.tipo]}</Badge>
                  <Badge tone={SITUACAO[l.situacao].tom}>{SITUACAO[l.situacao].rotulo}</Badge>
                </li>
              ))}
            </ul>
          </CorpoDaTabela>
          <Paginacao
            pagina={lotes.data.pagina}
            porPagina={lotes.data.porPagina}
            total={lotes.data.total}
            aoMudarPagina={setPagina}
            aoMudarPorPagina={(n) => {
              tamanho.mudar(n)
              setPagina(1)
            }}
          />
        </AreaDaTabela>
      )}
    </PaginaDeTabela>
  )
}
