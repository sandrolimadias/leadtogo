import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Search, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { cn } from '@/lib/cn'
import { documentoFormatado } from '@/telas/empresas/formatos'

/** Quantas empresas a busca traz por vez; quem procura refina digitando mais. */
const RESULTADOS = 8

/**
 * Filtro de Empresa da lista de contatos: um campo com busca no servidor (parte do nome ou do CNPJ), no
 * lugar de uma lista fixa. A carteira passa de milhares de empresas depois da importação, então nada de
 * carregar todas. A empresa escolhida vem pelo id (da URL); o nome é buscado se ainda não se conhece.
 */
export function FiltroDeEmpresa({
  valor,
  aoMudar,
}: {
  valor: string | undefined
  aoMudar: (id: string | undefined) => void
}) {
  const servicos = useServicos()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [termo, setTermo] = useState('')
  // O nome da empresa escolhida aqui (sem nova ida ao servidor); da URL, ele vem de `nomeDaUrl`
  const [escolhida, setEscolhida] = useState<{ id: string; nome: string } | null>(null)

  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), 300)
    return () => clearTimeout(espera)
  }, [texto])

  const achadas = useQuery({
    queryKey: ['contatos', 'busca-de-empresa-no-filtro', termo],
    enabled: aberto,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await servicos.carteira.listar({
        ...(termo ? { busca: termo } : {}),
        porPagina: RESULTADOS,
        ordem: 'nome',
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return { itens: r.dados.itens, total: r.dados.total }
    },
  })

  const nomeConhecido = escolhida && escolhida.id === valor ? escolhida.nome : undefined
  const nomeDaUrl = useQuery({
    queryKey: ['contatos', 'empresa-do-filtro', valor],
    enabled: Boolean(valor) && nomeConhecido === undefined,
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.detalhar(valor as string)
      return r.ok ? (r.dados.nomeFantasia ?? r.dados.razaoSocial) : null
    },
  })
  const nome = valor ? (nomeConhecido ?? nomeDaUrl.data ?? 'Empresa') : undefined

  const escolher = (empresa: { id: string; nome: string } | null) => {
    setEscolhida(empresa)
    aoMudar(empresa?.id)
    setAberto(false)
    setTexto('')
    setTermo('')
  }

  const itens = achadas.data?.itens ?? []
  const faltam = (achadas.data?.total ?? 0) - itens.length

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <div className="relative flex items-center">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Empresa"
            aria-haspopup="listbox"
            className={cn(
              'flex h-(--ctl) w-full cursor-pointer items-center rounded-sm border border-border-strong bg-surface pr-14 pl-3 text-left text-[length:var(--ctl-font)] hover:border-ink-muted',
              nome ? 'text-ink' : 'text-ink-subtle',
            )}
          >
            <span className="truncate">{nome ?? 'Empresa: todas'}</span>
          </button>
        </Popover.Trigger>
        {valor ? (
          <button
            type="button"
            aria-label="Limpar o filtro de empresa"
            onClick={() => escolher(null)}
            className="absolute right-7 flex size-5 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-ink-muted hover:text-ink"
          >
            <X size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : null}
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute right-2 text-ink-muted"
        />
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[1000] flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-1 rounded-md border border-border bg-surface p-2 text-ink shadow-md"
        >
          <div className="relative flex items-center">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 text-ink-subtle"
            />
            <input
              autoFocus
              type="search"
              aria-label="Buscar empresa"
              placeholder="Parte do nome ou do CNPJ"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="h-(--ctl) w-full rounded-sm border border-border-strong bg-surface pr-3 pl-9 text-[length:var(--ctl-font)] text-ink placeholder:text-ink-subtle"
            />
          </div>
          {achadas.isError ? (
            <span className="px-2 py-1 text-sm text-danger">{achadas.error.message}</span>
          ) : null}
          {achadas.isPending ? (
            <span role="status" className="px-2 py-1 text-sm text-ink-muted">
              Buscando…
            </span>
          ) : null}
          {achadas.data && itens.length === 0 ? (
            <span className="px-2 py-1 text-sm text-ink-muted">
              Nenhuma empresa com esse nome ou CNPJ.
            </span>
          ) : null}
          <ul
            aria-label="Empresas encontradas"
            className="m-0 flex max-h-72 list-none flex-col gap-0.5 overflow-y-auto p-0"
          >
            {valor ? (
              <li>
                <button
                  type="button"
                  onClick={() => escolher(null)}
                  className="flex w-full cursor-pointer items-center rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm text-ink-muted hover:bg-surface-hover"
                >
                  Todas as empresas
                </button>
              </li>
            ) : null}
            {itens.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={e.id === valor}
                  onClick={() => escolher({ id: e.id, nome: e.nome })}
                  className={cn(
                    'flex w-full cursor-pointer flex-col rounded-sm border-0 bg-transparent px-2 py-1.5 text-left hover:bg-surface-hover',
                    e.id === valor && 'bg-surface-hover',
                  )}
                >
                  <span className="text-sm font-semibold">{e.nome}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {documentoFormatado(e.tipoDocumento, e.documento)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {faltam > 0 ? (
            <span className="px-2 pt-1 text-xs text-ink-muted">
              {faltam === 1 ? 'Mais 1 empresa:' : `Mais ${faltam} empresas:`} digite mais do nome ou
              do CNPJ para achar.
            </span>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
