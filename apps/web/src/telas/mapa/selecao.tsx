import type { SelecaoDoMapaResposta } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Route as RotaIcone, TagIcon, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/campos'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { distanciaCurta } from '@/telas/geolocalizacao/rotulos'
import { BotaoLevarParaOffline } from '@/telas/visitas/campo/offline'

const RAIOS_EM_KM = [2, 5, 10, 25] as const

/** A barra de raio: "N empresas a até [2 5 10 25] km de X", com a opção de incluir as já visitadas. */
export function BarraDeRaio({
  centroNome,
  raioKm,
  aoMudarRaio,
  incluirVisitadas,
  aoMudarIncluir,
  total,
  carregando,
  aoFechar,
  className,
}: {
  centroNome: string
  raioKm: number
  aoMudarRaio: (km: number) => void
  incluirVisitadas: boolean
  aoMudarIncluir: (v: boolean) => void
  total: number | null
  carregando: boolean
  aoFechar: () => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Empresas por raio"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] shadow-lg',
        className,
      )}
    >
      <span aria-live="polite">
        <strong className="tabular-nums">{carregando || total === null ? '…' : total}</strong>{' '}
        {total === 1 ? 'empresa' : 'empresas'} até
      </span>
      <div
        role="group"
        aria-label="Raio em quilômetros"
        className="inline-flex rounded-sm border border-border-strong"
      >
        {RAIOS_EM_KM.map((km) => (
          <button
            key={km}
            type="button"
            aria-pressed={raioKm === km}
            onClick={() => aoMudarRaio(km)}
            className={cn(
              'h-8 cursor-pointer border-0 px-3 text-[13px] font-semibold first:rounded-l-sm last:rounded-r-sm',
              raioKm === km
                ? 'bg-brand text-on-brand'
                : 'bg-surface text-ink hover:bg-surface-hover',
            )}
          >
            {km} km
          </button>
        ))}
      </div>
      <span className="text-ink-muted">de {centroNome}</span>
      <Checkbox
        checked={incluirVisitadas}
        onChange={(e) => aoMudarIncluir(e.target.checked)}
        label="Incluir já visitadas"
      />
      <IconButton icon={X} label="Fechar" onClick={aoFechar} className="ml-auto" />
    </div>
  )
}

/**
 * O resultado de uma seleção (raio, retângulo ou próximas): a lista, o total e as ações. No G2 a seleção
 * serve para listar, abrir, aplicar uma tag, levar para o offline e adicionar à rota (G4).
 */
export function ResultadoDaSelecao({
  titulo,
  dados,
  aoAbrir,
  aoFechar,
  aoAdicionarARota,
  className,
}: {
  titulo: string
  dados: SelecaoDoMapaResposta
  aoAbrir: (id: string) => void
  aoFechar: () => void
  /** "Adicionar todas à rota" (G4): sem ele, o botão não aparece */
  aoAdicionarARota?: (itens: SelecaoDoMapaResposta['itens']) => void
  className?: string
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [tagId, setTagId] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [erro, setErro] = useState<string>()
  const grupos = useQuery({
    queryKey: ['cadastros', 'tags'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.tags.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  // Só as tags que a pessoa aplica à mão (grupos automáticos e de Status ficam de fora: Status troca a empresa de lado)
  const opcoes = useMemo(
    () =>
      (grupos.data ?? [])
        .filter((g) => !g.automatico && g.ativo)
        .flatMap((g) =>
          g.tags
            .filter((t) => t.ativo)
            .map((t) => ({ value: t.id, label: `${g.nome}: ${t.nome}` })),
        ),
    [grupos.data],
  )

  async function aplicar() {
    setAplicando(true)
    setErro(undefined)
    const r = await servicos.carteira.aplicarTagEmMassa(
      dados.itens.map((i) => i.id),
      tagId,
    )
    setAplicando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(
      `Tag aplicada em ${r.dados.aplicadas} ${r.dados.aplicadas === 1 ? 'empresa' : 'empresas'}.`,
    )
    await queryClient.invalidateQueries({ queryKey: ['carteira'] })
    await queryClient.invalidateQueries({ queryKey: ['mapa'] })
  }

  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="m-0 flex-1 text-[15px] leading-5 font-semibold">{titulo}</h2>
        <IconButton icon={X} label="Fechar a lista" onClick={aoFechar} />
      </div>
      <p className="m-0 px-4 pt-3 text-[13px] text-ink-muted" aria-live="polite">
        {dados.total.toLocaleString('pt-BR')} {dados.total === 1 ? 'empresa' : 'empresas'}
        {dados.total > dados.limite ? ` (mostrando as ${dados.limite} primeiras)` : ''}.
      </p>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
        {dados.itens.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => aoAbrir(i.id)}
              className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-2 text-left hover:bg-surface-hover"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{i.nome}</span>
                <span className="truncate text-xs text-ink-muted">
                  {i.cidade ?? 'Sem cidade'}
                  {i.distanciaM !== null ? ` · a ${distanciaCurta(i.distanciaM)}` : ''}
                </span>
              </span>
              {i.visitada ? (
                <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                  <Check size={13} aria-hidden="true" /> Visitada
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {dados.itens.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-ink-muted">
            Nenhuma empresa nessa área.
          </li>
        ) : null}
      </ul>
      {dados.itens.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          {aoAdicionarARota ? (
            <Button icon={RotaIcone} onClick={() => aoAdicionarARota(dados.itens)}>
              Adicionar todas à rota
            </Button>
          ) : null}
          <BotaoLevarParaOffline empresaIds={dados.itens.map((i) => i.id)} />
          <Select
            label="Aplicar uma tag a todas da lista"
            value={tagId}
            placeholder="Escolha a tag"
            options={opcoes}
            onChange={(e) => setTagId(e.target.value)}
          />
          <Button
            icon={TagIcon}
            disabled={!tagId}
            loading={aplicando}
            onClick={() => void aplicar()}
          >
            Aplicar a {dados.itens.length} {dados.itens.length === 1 ? 'empresa' : 'empresas'}
          </Button>
          {erro ? <Alert tone="danger">{erro}</Alert> : null}
        </div>
      ) : null}
    </section>
  )
}
