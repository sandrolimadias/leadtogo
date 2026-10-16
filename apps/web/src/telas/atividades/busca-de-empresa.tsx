import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { documentoFormatado } from '@/telas/empresas/formatos'

/** Quantas empresas a busca traz por vez; quem procura refina digitando mais. */
const RESULTADOS = 6

/**
 * Escolha da empresa no formulário: um campo de pesquisa (nome, razão social, CNPJ/CPF ou cidade, com ou
 * sem máscara), com os resultados logo abaixo, na própria janela. Não é uma lista suspensa: dentro de um
 * diálogo ela ficaria escondida atrás dele. A busca é feita no servidor (a carteira passa de milhares de
 * empresas), pelo mesmo índice da lista de Empresas.
 */
export function BuscaDeEmpresa({
  valor,
  aoMudar,
  erro,
  obrigatoria,
  rotuloOpcional,
}: {
  valor: { id: string; nome: string } | null
  aoMudar: (empresa: { id: string; nome: string } | null) => void
  erro?: string | undefined
  obrigatoria: boolean
  /** O que diz ao lado do rótulo quando a empresa é opcional (ex.: "opcional na Tarefa") */
  rotuloOpcional?: string
}) {
  const servicos = useServicos()
  const [texto, setTexto] = useState('')
  const [termo, setTermo] = useState('')
  const [aberta, setAberta] = useState(false)
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), 250)
    return () => clearTimeout(espera)
  }, [texto])

  const achadas = useQuery({
    queryKey: ['atividades', 'busca-de-empresa', termo],
    enabled: valor === null && termo !== '',
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await servicos.carteira.listar({
        busca: termo,
        porPagina: RESULTADOS,
        ordem: 'nome',
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return { itens: r.dados.itens, total: r.dados.total, termo }
    },
  })

  const termoDaBusca = achadas.data?.termo

  const rotulo = (
    <span className="text-[13px] leading-[18px] font-semibold">
      Empresa
      {obrigatoria ? (
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      ) : (
        <span className="ml-1 font-normal text-ink-muted">({rotuloOpcional ?? 'opcional'})</span>
      )}
    </span>
  )

  if (valor) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        {rotulo}
        <div className="flex items-center gap-2 rounded-sm border border-border-strong bg-surface px-3 py-2">
          <span aria-label="Empresa escolhida" className="min-w-0 flex-1 truncate font-semibold">
            {valor.nome}
          </span>
          <Button variant="ghost" size="sm" icon={X} onClick={() => aoMudar(null)}>
            Trocar empresa
          </Button>
        </div>
        {erro ? <span className="text-xs font-medium text-danger">{erro}</span> : null}
      </div>
    )
  }

  const itens = achadas.data?.itens ?? []
  const faltam = (achadas.data?.total ?? 0) - itens.length
  // Os resultados só aparecem depois de digitar (nada de lista aberta ao abrir a janela) e como uma camada
  // sobre os campos de baixo: a janela não muda de tamanho.
  const buscando = aberta && texto.trim() !== '' && termo !== ''
  return (
    <div
      className="relative flex min-w-0 flex-col gap-1.5"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAberta(false)
      }}
    >
      {rotulo}
      <TextField
        icon={Search}
        type="search"
        aria-label="Buscar empresa"
        placeholder="Buscar por nome ou CNPJ"
        autoComplete="off"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberta(true)
        }}
        onFocus={() => setAberta(true)}
        {...(erro ? { error: erro } : {})}
      />
      {buscando ? (
        <div
          role="region"
          aria-label="Resultados da busca de empresa"
          className="absolute top-full right-0 left-0 z-20 mt-1 flex max-h-60 flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-md"
        >
          {achadas.isError ? (
            <span className="px-2 py-1.5 text-sm text-danger">{achadas.error.message}</span>
          ) : null}
          {achadas.isPending || termo !== termoDaBusca ? (
            <span role="status" className="px-2 py-1.5 text-sm text-ink-muted">
              Buscando…
            </span>
          ) : null}
          {achadas.data && termo === termoDaBusca && itens.length === 0 ? (
            <span className="px-2 py-1.5 text-sm text-ink-muted">
              Nenhuma empresa com esse nome ou CNPJ.
            </span>
          ) : null}
          {termo === termoDaBusca && itens.length > 0 ? (
            <ul
              aria-label="Empresas encontradas"
              className="m-0 flex list-none flex-col gap-0.5 p-0"
            >
              {itens.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      aoMudar({ id: e.id, nome: e.nome })
                      setTexto('')
                      setTermo('')
                      setAberta(false)
                    }}
                    className="flex w-full cursor-pointer flex-col rounded-sm border-0 bg-transparent px-2 py-1.5 text-left hover:bg-surface-hover"
                  >
                    <span className="text-sm font-semibold">{e.nome}</span>
                    <span className="font-mono text-xs text-ink-muted">
                      {documentoFormatado(e.tipoDocumento, e.documento)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {faltam > 0 && termo === termoDaBusca ? (
            <span className="px-2 pt-1 pb-1.5 text-xs text-ink-muted">
              {faltam === 1 ? 'Mais 1 empresa:' : `Mais ${faltam} empresas:`} digite mais do nome ou
              do CNPJ para achar.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
