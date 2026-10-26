import type { ResultadoDaBusca } from '@leadtogo/api-client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, FileText, LifeBuoy, Megaphone, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { TextField } from '@leadtogo/ui/campos'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'

import { dataCurta } from '@/casca/rotulos'
import { useServicos } from '@/servicos/contexto'

const TAMANHO_MINIMO = 2
const TELAS = ['/', '/chamados', '/documentos', '/agenda', '/notificacoes', '/perfil'] as const

const GRUPOS: { tipo: ResultadoDaBusca['tipo']; rotulo: string; icone: LucideIcon }[] = [
  { tipo: 'chamado', rotulo: 'Chamados', icone: LifeBuoy },
  { tipo: 'documento', rotulo: 'Documentos', icone: FileText },
  { tipo: 'evento', rotulo: 'Agenda', icone: CalendarDays },
  { tipo: 'publicacao', rotulo: 'Publicações', icone: Megaphone },
]

/** Busca global do cliente: chamados, documentos, eventos e publicações que ele pode ver. */
export function TelaBusca({ q: inicial }: { q: string }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const [texto, setTexto] = useState(inicial)
  const termo = useDeferredValue(texto.trim())
  const pronto = termo.length >= TAMANHO_MINIMO
  const consulta = useQuery({
    queryKey: ['busca', termo],
    enabled: pronto,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.busca(termo)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })

  const abrir = (r: ResultadoDaBusca) => {
    const chamado = r.destino.match(/^\/chamados\/([0-9a-f-]{36})$/)
    if (chamado?.[1]) {
      void navegar({ to: '/chamados/$chamadoId', params: { chamadoId: chamado[1] } })
    } else if ((TELAS as readonly string[]).includes(r.destino)) {
      void navegar({ to: r.destino as (typeof TELAS)[number] })
    }
  }
  const itens = pronto ? consulta.data : undefined

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="m-0 text-2xl leading-8 font-semibold">Busca</h1>
        <p className="mt-1 mb-0 text-sm leading-5 text-ink-muted">
          Procure nos seus chamados, documentos, na agenda e nas publicações.
        </p>
      </header>
      <TextField
        label="O que você procura?"
        icon={Search}
        type="search"
        value={texto}
        autoFocus
        maxLength={100}
        onChange={(e) => setTexto(e.target.value)}
        hint={pronto ? undefined : `Digite ao menos ${TAMANHO_MINIMO} letras.`}
      />
      {consulta.isError ? <Alert tone="danger" title="Não foi possível buscar agora." /> : null}
      {pronto && !itens && !consulta.isError ? <Skeleton lines={4} /> : null}
      {itens && itens.length === 0 ? (
        <div className="rounded-md border border-border bg-surface">
          <EmptyState
            icon={Search}
            title="Nada encontrado"
            description="Tente outras palavras. A busca ignora acentos e maiúsculas."
          />
        </div>
      ) : null}
      {itens
        ? GRUPOS.map((g) => {
            const grupo = itens.filter((i) => i.tipo === g.tipo)
            if (grupo.length === 0) return null
            return (
              <section key={g.tipo} aria-label={g.rotulo} className="flex flex-col gap-2">
                <h2 className="m-0 flex items-center gap-2 text-sm leading-5 font-semibold text-ink-muted">
                  <g.icone size={16} strokeWidth={1.75} aria-hidden="true" />
                  {g.rotulo}
                </h2>
                <ul className="m-0 list-none divide-y divide-border rounded-md border border-border bg-surface p-0">
                  {grupo.map((r) => (
                    <li key={`${r.tipo}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => abrir(r)}
                        className="flex w-full cursor-pointer flex-col gap-0.5 border-0 bg-transparent px-4 py-3 text-left hover:bg-surface-hover"
                      >
                        <span className="text-sm leading-5 font-semibold">{r.titulo}</span>
                        {r.trecho ? (
                          <span className="text-sm leading-5 text-ink-muted">{r.trecho}</span>
                        ) : null}
                        <span className="text-xs leading-4 text-ink-subtle">
                          {dataCurta(r.data)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        : null}
    </div>
  )
}
