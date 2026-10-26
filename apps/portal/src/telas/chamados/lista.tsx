import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LifeBuoy, Plus, Search } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'

import { ListaDeChamados } from '@/components/lista-de-chamados'
import { useServicos } from '@/servicos/contexto'

/** Os chamados da empresa do cliente: em aberto ou todos, com busca por número ou assunto. */
export function TelaChamados() {
  const servicos = useServicos()
  const [aba, setAba] = useState<'abertos' | 'todos'>('abertos')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const consulta = useQuery({
    queryKey: ['chamados', 'lista', aba, busca, pagina],
    queryFn: async () => {
      const r = await servicos.chamados.listar({ aba, busca, pagina })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const lista = consulta.data
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <h1 className="m-0 mr-auto text-2xl leading-8 font-semibold">Chamados</h1>
        <Link to="/chamados/novo">
          <Button variant="primary" icon={Plus}>
            Abrir chamado
          </Button>
        </Link>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Mostrar"
          value={aba}
          onChange={(v) => {
            setAba(v as 'abertos' | 'todos')
            setPagina(1)
          }}
          options={[
            { value: 'abertos', label: `Em aberto${lista ? ` (${lista.abas.abertos})` : ''}` },
            { value: 'todos', label: `Todos${lista ? ` (${lista.abas.todos})` : ''}` },
          ]}
        />
        <TextField
          aria-label="Buscar chamados"
          placeholder="Buscar por número ou assunto"
          icon={Search}
          value={busca}
          className="min-w-56 flex-1"
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
        />
      </div>
      {consulta.isError ? (
        <Alert tone="danger" title="Não foi possível carregar os chamados.">
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
            icon={LifeBuoy}
            title={
              busca
                ? 'Nenhum chamado encontrado'
                : aba === 'abertos'
                  ? 'Nenhum chamado em aberto'
                  : 'Nenhum chamado ainda'
            }
            description={
              busca
                ? 'Confira o número ou as palavras do assunto.'
                : 'Quando precisar de ajuda, abra um chamado.'
            }
          />
        ) : (
          <ListaDeChamados itens={lista.itens} />
        )}
      </div>
      {lista && lista.total > lista.itens.length + (pagina - 1) * 20 ? (
        <Button variant="secondary" onClick={() => setPagina((p) => p + 1)}>
          Próxima página
        </Button>
      ) : null}
      {pagina > 1 ? (
        <Button variant="ghost" onClick={() => setPagina((p) => p - 1)}>
          Página anterior
        </Button>
      ) : null}
    </div>
  )
}
