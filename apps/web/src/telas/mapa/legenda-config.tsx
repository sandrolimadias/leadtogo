import { type EntradaDaLegenda, PALETA_DO_MAPA, tokenDaCorDoMapa } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'

import { AmostraDePin } from './legenda'

const chaveDaLegenda = ['mapa', 'legenda'] as const

function Entrada({
  e,
  podeEditar,
  aoSalvar,
}: {
  e: EntradaDaLegenda
  podeEditar: boolean
  aoSalvar: (chave: string, dados: { cor?: string; nome?: string | null }) => Promise<void>
}) {
  const [nome, setNome] = useState(e.personalizada && e.nome !== e.nomePadrao ? e.nome : '')
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <AmostraDePin token={tokenDaCorDoMapa(e.cor)} />
        <strong className="text-sm">{e.nome}</strong>
        <span className="text-xs text-ink-muted">
          {e.fixa ? 'Estado fixo' : 'Tag de Status'}
          {e.personalizada ? ' · personalizado' : ' · padrão'}
        </span>
      </div>
      <p className="m-0 text-[13px] text-ink-muted">{e.regra}</p>
      {podeEditar ? (
        <>
          <TextField
            label="Nome na legenda"
            placeholder={e.nomePadrao}
            maxLength={40}
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            onBlur={() => {
              const novo = nome.trim()
              if ((novo || null) !== (e.nome === e.nomePadrao ? null : e.nome)) {
                void aoSalvar(e.chave, { nome: novo || null })
              }
            }}
            hint="Vazio usa o nome padrão."
          />
          <div role="radiogroup" aria-label={`Cor de ${e.nome}`} className="flex flex-wrap gap-2">
            {PALETA_DO_MAPA.map((c) => (
              <button
                key={c.chave}
                type="button"
                role="radio"
                aria-checked={e.cor === c.chave}
                aria-label={c.rotulo}
                title={c.rotulo}
                onClick={() => void aoSalvar(e.chave, { cor: c.chave })}
                className={cn(
                  'inline-flex size-9 cursor-pointer items-center justify-center rounded-full border-2 bg-transparent p-0',
                  e.cor === c.chave
                    ? 'border-ink'
                    : 'border-transparent hover:border-border-strong',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-6 rounded-full border border-white/70"
                  style={{ background: `var(${c.token})` }}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </li>
  )
}

/** Legenda do mapa em Configurações: cor (paleta de 12 cores dos tokens) e nome de cada estado, com prévia. */
export function LegendaDoMapaConfig({ podeEditar }: { podeEditar: boolean }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [erro, setErro] = useState<string>()
  const [restaurando, setRestaurando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const legenda = useQuery({
    queryKey: chaveDaLegenda,
    retry: false,
    queryFn: async () => {
      const r = await servicos.mapa.legenda.ler()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const atualizar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: chaveDaLegenda }),
      queryClient.invalidateQueries({ queryKey: ['mapa', 'opcoes'] }),
    ])

  async function salvar(chave: string, dados: { cor?: string; nome?: string | null }) {
    setErro(undefined)
    const r = await servicos.mapa.legenda.alterar(chave, dados as never)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    await atualizar()
  }

  async function restaurar() {
    setRestaurando(true)
    const r = await servicos.mapa.legenda.restaurar()
    setRestaurando(false)
    setConfirmando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Legenda restaurada ao padrão.')
    await atualizar()
  }

  if (legenda.isPending) return <Skeleton className="h-40 w-full" />
  if (legenda.isError) return <Alert tone="danger">Não consegui carregar a legenda.</Alert>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-0 flex-1 text-sm text-ink-muted">
          Cor e nome de cada estado do mapa. A regra de cada estado não muda; cada tag de Status que
          aparece no mapa é uma entrada.
        </p>
        {podeEditar ? (
          <Button icon={RotateCcw} onClick={() => setConfirmando(true)}>
            Restaurar padrão
          </Button>
        ) : null}
      </div>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 max-lg:grid-cols-1">
        {legenda.data.entradas.map((e) => (
          <Entrada key={e.chave} e={e} podeEditar={podeEditar} aoSalvar={salvar} />
        ))}
      </ul>
      {confirmando ? (
        <DialogoDeConfirmacao
          aberto
          titulo="Restaurar a legenda padrão?"
          descricao="Todas as cores e nomes que você escolheu voltam ao padrão."
          rotuloDoBotao="Restaurar"
          enviando={restaurando}
          aoConfirmar={() => void restaurar()}
          aoFechar={() => setConfirmando(false)}
        />
      ) : null}
    </div>
  )
}
