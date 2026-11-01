import type { PeriodoDoDashboard, VisaoDoDashboard } from '@leadtogo/shared'
import { CalendarRange } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { Select, TextField } from '@leadtogo/ui/campos'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'

import type { BuscaDoDashboard } from './busca'

/** Os períodos do botão segmentado (os anos anteriores e o personalizado ficam à parte). */
const RAPIDOS = ['mes', 'mes_anterior', 'trimestre', 'semestre', 'ano'] as const
const ROTULO: Record<(typeof RAPIDOS)[number], { cheio: string; curto: string }> = {
  mes: { cheio: 'Mês atual', curto: 'Mês' },
  mes_anterior: { cheio: 'Mês anterior', curto: 'Anterior' },
  trimestre: { cheio: 'Trimestre', curto: 'Trimestre' },
  semestre: { cheio: 'Semestre', curto: 'Semestre' },
  ano: { cheio: 'Ano', curto: 'Ano' },
}
const VISOES: Record<VisaoDoDashboard, string> = {
  minha: 'Minha',
  equipe: 'Equipe',
  empresa: 'Empresa',
}
/** Quantos anos anteriores o seletor oferece */
const ANOS_ANTERIORES = 10

const ehRapido = (p: PeriodoDoDashboard): p is (typeof RAPIDOS)[number] =>
  (RAPIDOS as readonly string[]).includes(p)

/**
 * A barra da aba Resultados: Mês atual · Mês anterior · Trimestre · Semestre · Ano, os anos anteriores, um
 * período específico (De/Até) e a visão (Minha · Equipe · Empresa, só as que o perfil permite). No celular,
 * um seletor só para o período.
 */
export function BarraDePeriodo({
  busca,
  anoAtual,
  visoes,
  celular,
  mudar,
}: {
  busca: BuscaDoDashboard
  anoAtual: number
  visoes: VisaoDoDashboard[]
  celular: boolean
  mudar: (patch: Partial<BuscaDoDashboard>) => void
}) {
  const periodo: PeriodoDoDashboard = busca.periodo ?? 'mes'
  const [abrirIntervalo, setAbrirIntervalo] = useState(periodo === 'personalizado')
  const [de, setDe] = useState(busca.de ?? '')
  const [ate, setAte] = useState(busca.ate ?? '')
  const [erro, setErro] = useState<string>()
  const anos = Array.from({ length: ANOS_ANTERIORES }, (_, i) => anoAtual - 1 - i)

  const limpo = { ano: undefined, de: undefined, ate: undefined }
  const escolherRapido = (p: string) => {
    setAbrirIntervalo(false)
    mudar({ ...limpo, periodo: p === 'mes' ? undefined : (p as BuscaDoDashboard['periodo']) })
  }
  const escolherAno = (ano: string) => {
    if (!ano) return
    setAbrirIntervalo(false)
    mudar({ ...limpo, periodo: 'ano_anterior', ano: Number(ano) })
  }
  const aplicar = () => {
    if (!de || !ate) return setErro('Informe o início e o fim.')
    if (de > ate) return setErro('O fim vem antes do início.')
    const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000 + 1
    if (dias > 1096) return setErro('O período tem no máximo 3 anos.')
    setErro(undefined)
    mudar({ periodo: 'personalizado', de, ate, ano: undefined })
  }

  const intervalo = abrirIntervalo ? (
    <div className="flex flex-wrap items-end gap-2">
      <TextField label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
      <TextField label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      <Button onClick={aplicar}>Aplicar</Button>
      {erro ? (
        <p role="alert" className="m-0 w-full text-[13px] text-danger">
          {erro}
        </p>
      ) : null}
    </div>
  ) : null

  const visao =
    visoes.length > 1 ? (
      <SegmentedControl
        label="Visão"
        options={visoes.map((v) => ({ value: v, label: VISOES[v] }))}
        value={busca.visao ?? 'minha'}
        onChange={(v) =>
          mudar({ visao: v === 'minha' ? undefined : (v as BuscaDoDashboard['visao']) })
        }
      />
    ) : null

  if (celular) {
    const valor =
      periodo === 'ano_anterior'
        ? `ano:${busca.ano}`
        : periodo === 'personalizado'
          ? 'personalizado'
          : periodo
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Período"
            className="min-w-44 flex-1"
            value={valor}
            options={[
              ...RAPIDOS.map((p) => ({ value: p, label: ROTULO[p].cheio })),
              ...anos.map((a) => ({ value: `ano:${a}`, label: String(a) })),
              { value: 'personalizado', label: 'Personalizado…' },
            ]}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'personalizado') setAbrirIntervalo(true)
              else if (v.startsWith('ano:')) escolherAno(v.slice(4))
              else escolherRapido(v)
            }}
          />
          {visao}
        </div>
        {intervalo}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Período"
          options={RAPIDOS.map((p) => ({ value: p, label: ROTULO[p].cheio }))}
          value={ehRapido(periodo) ? periodo : ''}
          onChange={escolherRapido}
        />
        <Select
          aria-label="Anos anteriores"
          className="w-40"
          placeholder="Anos anteriores"
          value={periodo === 'ano_anterior' ? String(busca.ano) : ''}
          options={anos.map((a) => ({ value: String(a), label: String(a) }))}
          onChange={(e) => escolherAno(e.target.value)}
        />
        <Button
          variant={periodo === 'personalizado' ? 'secondary' : 'ghost'}
          icon={CalendarRange}
          aria-expanded={abrirIntervalo}
          onClick={() => setAbrirIntervalo((v) => !v)}
        >
          Período específico
        </Button>
        {visao ? <div className="ml-auto">{visao}</div> : null}
      </div>
      {intervalo}
    </div>
  )
}
