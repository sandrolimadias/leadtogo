import type { DocumentoDoPortal } from '@leadtogo/api-client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, FileText, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { dataCurta, tamanhoLegivel } from '@/casca/rotulos'
import { useServicos } from '@/servicos/contexto'

const POR_PAGINA = 20

function Linha({ d }: { d: DocumentoDoPortal }) {
  const servicos = useServicos()
  const [baixando, setBaixando] = useState(false)
  async function baixar() {
    setBaixando(true)
    const r = await servicos.documentos.baixar(d.id)
    setBaixando(false)
    if (!r.ok) toast.error(r.erro.mensagem)
    else window.location.assign(r.dados.url)
  }
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0">
      <FileText
        size={20}
        strokeWidth={1.75}
        aria-hidden="true"
        className="flex-none text-ink-muted"
      />
      <div className="flex min-w-0 flex-1 basis-60 flex-col">
        <span className="truncate font-semibold">{d.titulo}</span>
        {d.descricao ? <span className="text-[13px] text-ink-muted">{d.descricao}</span> : null}
        <span className="text-xs text-ink-subtle">
          {d.nome} · {tamanhoLegivel(d.tamanho)} · publicado em {dataCurta(d.publicadoEm)}
        </span>
      </div>
      <Button
        icon={Download}
        loading={baixando}
        aria-label={`Baixar ${d.titulo}`}
        onClick={() => void baixar()}
      >
        Baixar
      </Button>
    </li>
  )
}

/** Os documentos que a equipe compartilha com a empresa do cliente: busca e download. */
export function TelaDocumentos() {
  const servicos = useServicos()
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca.trim())
  const [pagina, setPagina] = useState(1)
  const consulta = useQuery({
    queryKey: ['documentos', buscaAdiada, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.documentos.listar({ busca: buscaAdiada, pagina })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const lista = consulta.data
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="m-0 text-2xl leading-8 font-semibold">Documentos</h1>
        <p className="mt-1 mb-0 text-sm leading-5 text-ink-muted">
          Arquivos que a equipe compartilha com a sua empresa.
        </p>
      </header>
      <TextField
        aria-label="Buscar documentos"
        placeholder="Buscar pelo título ou pela descrição"
        icon={Search}
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value)
          setPagina(1)
        }}
      />
      {consulta.isError ? (
        <Alert tone="danger" title="Não foi possível carregar os documentos.">
          Tente de novo em instantes.
        </Alert>
      ) : null}
      <div className="rounded-md border border-border bg-surface">
        {!lista ? (
          <div className="p-4">
            <Skeleton lines={4} />
          </div>
        ) : lista.itens.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={buscaAdiada ? 'Nenhum documento encontrado' : 'Nenhum documento ainda'}
            description={
              buscaAdiada
                ? 'Confira as palavras da busca.'
                : 'Quando a equipe compartilhar um arquivo com a sua empresa, ele aparece aqui.'
            }
          />
        ) : (
          <ul aria-label="Documentos" className="m-0 list-none p-0">
            {lista.itens.map((d) => (
              <Linha key={d.id} d={d} />
            ))}
          </ul>
        )}
      </div>
      {lista && lista.total > pagina * POR_PAGINA ? (
        <Button onClick={() => setPagina((p) => p + 1)}>Próxima página</Button>
      ) : null}
      {pagina > 1 ? (
        <Button variant="ghost" onClick={() => setPagina((p) => p - 1)}>
          Página anterior
        </Button>
      ) : null}
    </div>
  )
}
