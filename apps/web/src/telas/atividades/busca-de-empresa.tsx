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
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), 250)
    return () => clearTimeout(espera)
  }, [texto])

  const achadas = useQuery({
    queryKey: ['atividades', 'busca-de-empresa', termo],
    enabled: valor === null,
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
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {rotulo}
      <TextField
        icon={Search}
        type="search"
        aria-label="Buscar empresa"
        placeholder="Buscar por nome ou CNPJ"
        autoComplete="off"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        {...(erro ? { error: erro } : {})}
      />
      {achadas.isError ? (
        <span className="text-sm text-danger">{achadas.error.message}</span>
      ) : null}
      {achadas.isPending ? (
        <span role="status" className="text-sm text-ink-muted">
          Buscando…
        </span>
      ) : null}
      {achadas.data && itens.length === 0 ? (
        <span className="text-sm text-ink-muted">Nenhuma empresa com esse nome ou CNPJ.</span>
      ) : null}
      {itens.length > 0 ? (
        <ul
          aria-label="Empresas encontradas"
          className="m-0 flex max-h-56 list-none flex-col gap-0.5 overflow-y-auto rounded-sm border border-border p-1"
        >
          {itens.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  aoMudar({ id: e.id, nome: e.nome })
                  setTexto('')
                  setTermo('')
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
      {faltam > 0 ? (
        <span className="text-xs text-ink-muted">
          {faltam === 1 ? 'Mais 1 empresa:' : `Mais ${faltam} empresas:`} digite mais do nome ou do
          CNPJ para achar.
        </span>
      ) : null}
    </div>
  )
}
