import type { ResultadosDoDashboard as Dashboard } from '@leadtogo/api-client'
import { Link, useNavigate } from '@tanstack/react-router'
import { Area, AreaChart, Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from 'recharts'

import { ConteudoDoTooltip, ContainerDoGrafico, GraficoVazio } from '@leadtogo/ui/grafico'
import { corDaTag, useReduzirMovimento } from '@/lib/grafico'
import { reais, reaisCurto } from '@/telas/oportunidades/formatos'

import { linkDaFase, linkDeConquistadas, linkDePerdas, linkDoMes, linkDoMotivo } from './links'

const AVISO_CLIQUE = 'Clique para ver a lista'

/** O dado do gráfico que o clique trouxe (o Recharts entrega a barra com o dado em `payload`). */
const dadoDoClique = <T,>(item: unknown): T => ((item as { payload?: T }).payload ?? item) as T

const percentual = (parte: number, total: number): string =>
  total === 0 ? '0%' : `${(Math.round((parte / total) * 1000) / 10).toLocaleString('pt-BR')}%`

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Links só para o teclado e o leitor de tela (o gráfico em si se clica com o mouse ou o toque). */
function LinksDoGrafico({
  itens,
  titulo,
}: {
  titulo: string
  itens: { rotulo: string; link: { to: string; search: Record<string, unknown> } }[]
}) {
  return (
    <nav
      aria-label={titulo}
      className="sr-only focus-within:not-sr-only focus-within:mt-2 focus-within:flex focus-within:flex-wrap focus-within:gap-x-3 focus-within:text-[13px]"
    >
      {itens.map((i) => (
        <Link key={i.rotulo} to={i.link.to as '/'} search={i.link.search as never}>
          {i.rotulo}
        </Link>
      ))}
    </nav>
  )
}

/** O mini-gráfico do MRR conquistado: área dos meses da série (6 nos períodos curtos), dentro do indicador. */
export function GraficoDeMrr({ serie }: { serie: Dashboard['mrr']['serie'] }) {
  const navegar = useNavigate()
  const reduzir = useReduzirMovimento()
  if (serie.every((p) => p.valor === 0)) {
    return <GraficoVazio texto="Sem MRR conquistado nestes meses." altura={48} />
  }
  return (
    <>
      <ContainerDoGrafico
        altura={56}
        rotulo={`MRR conquistado nos últimos 6 meses: ${serie.map((p) => `${p.rotulo} ${reais(p.valor)}`).join(', ')}`}
        config={{ valor: { rotulo: 'MRR conquistado', cor: 'var(--success)' } }}
        className="cursor-pointer"
      >
        <AreaChart
          data={serie}
          margin={{ top: 4, right: 2, bottom: 0, left: 2 }}
          accessibilityLayer
          onClick={(estado) => {
            const indice = Number(estado?.activeTooltipIndex)
            const ponto = Number.isInteger(indice) ? serie[indice] : undefined
            if (ponto) void navegar(linkDoMes(ponto))
          }}
        >
          <XAxis dataKey="rotulo" hide />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)' }}
            content={({ active, payload }) => {
              const ponto = payload?.[0]?.payload as Dashboard['mrr']['serie'][number] | undefined
              if (!active || !ponto) return null
              return (
                <ConteudoDoTooltip
                  titulo={ponto.rotulo}
                  linhas={[
                    { rotulo: 'MRR conquistado', valor: reais(ponto.valor), cor: 'var(--success)' },
                    { rotulo: 'Conquistadas', valor: String(ponto.quantidade) },
                  ]}
                  aviso={AVISO_CLIQUE}
                />
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="var(--cor-valor)"
            fill="var(--cor-valor)"
            fillOpacity={0.18}
            strokeWidth={2}
            isAnimationActive={!reduzir}
            animationDuration={500}
          />
        </AreaChart>
      </ContainerDoGrafico>
      <LinksDoGrafico
        titulo="Conquistadas por mês"
        itens={serie.map((p) => ({ rotulo: `${p.rotulo}: ${reais(p.valor)}`, link: linkDoMes(p) }))}
      />
    </>
  )
}

/** O funil por fase: barras horizontais com a quantidade e o total de cada fase. */
export function GraficoDoFunil({ funil }: { funil: Dashboard['funil'] }) {
  const navegar = useNavigate()
  const reduzir = useReduzirMovimento()
  const total = funil.fases.reduce((n, f) => n + f.total, 0)
  const quantidade = funil.fases.reduce((n, f) => n + f.quantidade, 0)
  if (quantidade === 0) {
    return <GraficoVazio texto="Nenhuma oportunidade ativa neste funil." />
  }
  const dados = funil.fases.map((f) => ({ ...f, fill: corDaTag(f.cor) }))
  return (
    <>
      <ContainerDoGrafico
        altura={Math.max(160, dados.length * 44)}
        rotulo={`Funil ${funil.nome}: ${funil.fases.map((f) => `${f.nome}, ${plural(f.quantidade, 'oportunidade', 'oportunidades')}, ${reais(f.total)}`).join('; ')}`}
        config={{ total: { rotulo: 'Total', cor: 'var(--accent)' } }}
        className="[&_.recharts-rectangle]:cursor-pointer"
      >
        <BarChart
          data={dados}
          layout="vertical"
          margin={{ top: 0, right: 96, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="nome" width={104} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ active, payload }) => {
              const f = payload?.[0]?.payload as (typeof dados)[number] | undefined
              if (!active || !f) return null
              return (
                <ConteudoDoTooltip
                  titulo={f.nome}
                  linhas={[
                    { rotulo: 'Oportunidades', valor: String(f.quantidade), cor: f.fill },
                    { rotulo: 'Total', valor: reais(f.total) },
                    { rotulo: 'Do funil', valor: percentual(f.total, total) },
                  ]}
                  aviso={AVISO_CLIQUE}
                />
              )
            }}
          />
          <Bar
            dataKey="total"
            radius={4}
            barSize={18}
            minPointSize={3}
            isAnimationActive={!reduzir}
            animationDuration={500}
            onClick={(item: unknown) => {
              const f = dadoDoClique<(typeof dados)[number]>(item)
              void navegar(linkDaFase(funil.id, f.id))
            }}
          >
            <LabelList
              dataKey="total"
              position="right"
              formatter={(v: unknown) => reaisCurto(Number(v))}
              className="fill-ink text-[12px]"
            />
          </Bar>
        </BarChart>
      </ContainerDoGrafico>
      <LinksDoGrafico
        titulo="Oportunidades por fase"
        itens={funil.fases.map((f) => ({
          rotulo: `${f.nome}: ${plural(f.quantidade, 'oportunidade', 'oportunidades')}`,
          link: linkDaFase(funil.id, f.id),
        }))}
      />
    </>
  )
}

/** Conquistadas × Perdidas e canceladas: duas barras com o valor, a quantidade e o MRR no tooltip. */
export function GraficoDeResultado({
  resultado,
  periodo,
}: {
  resultado: Dashboard['resultado']
  periodo: Dashboard['periodo']
}) {
  const navegar = useNavigate()
  const reduzir = useReduzirMovimento()
  const { conquistadas, perdidasECanceladas: perdidas } = resultado
  if (conquistadas.quantidade === 0 && perdidas.quantidade === 0) {
    return <GraficoVazio texto="Nenhuma oportunidade fechada neste período." />
  }
  const dados = [
    {
      id: 'conquistadas',
      nome: 'Conquistadas',
      total: conquistadas.total,
      quantidade: conquistadas.quantidade,
      fill: 'var(--success)',
    },
    {
      id: 'perdidas',
      nome: 'Perdidas e canceladas',
      total: perdidas.total,
      quantidade: perdidas.quantidade,
      fill: 'var(--danger)',
    },
  ]
  return (
    <>
      <ContainerDoGrafico
        altura={176}
        rotulo={`Conquistadas: ${plural(conquistadas.quantidade, 'oportunidade', 'oportunidades')}, ${reais(conquistadas.total)}, ${reais(conquistadas.mensal)} por mês. Perdidas e canceladas: ${plural(perdidas.quantidade, 'oportunidade', 'oportunidades')}, ${reais(perdidas.total)}`}
        config={{ total: { rotulo: 'Total', cor: 'var(--success)' } }}
        className="[&_.recharts-rectangle]:cursor-pointer"
      >
        <BarChart
          data={dados}
          margin={{ top: 20, right: 8, bottom: 0, left: 8 }}
          accessibilityLayer
        >
          <XAxis dataKey="nome" tickLine={false} axisLine={false} />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
              if (!active || !d) return null
              const linhas =
                d.id === 'conquistadas'
                  ? [
                      { rotulo: 'Oportunidades', valor: String(d.quantidade), cor: d.fill },
                      { rotulo: 'Valor', valor: reais(d.total) },
                      { rotulo: 'MRR', valor: reais(conquistadas.mensal) },
                    ]
                  : [
                      { rotulo: 'Oportunidades', valor: String(d.quantidade), cor: d.fill },
                      { rotulo: 'Valor', valor: reais(d.total) },
                      { rotulo: 'Perdidas', valor: String(perdidas.perdidas) },
                      { rotulo: 'Canceladas', valor: String(perdidas.canceladas) },
                    ]
              return <ConteudoDoTooltip titulo={d.nome} linhas={linhas} aviso={AVISO_CLIQUE} />
            }}
          />
          <Bar
            dataKey="total"
            radius={4}
            maxBarSize={72}
            minPointSize={3}
            isAnimationActive={!reduzir}
            animationDuration={500}
            onClick={(item: unknown) => {
              const d = dadoDoClique<(typeof dados)[number]>(item)
              void navegar(
                d.id === 'conquistadas' ? linkDeConquistadas(periodo) : linkDePerdas(periodo),
              )
            }}
          >
            <LabelList
              dataKey="quantidade"
              position="top"
              formatter={(v: unknown) => plural(Number(v), 'oportunidade', 'oportunidades')}
              className="fill-ink text-[12px]"
            />
          </Bar>
        </BarChart>
      </ContainerDoGrafico>
      <LinksDoGrafico
        titulo="Oportunidades fechadas no período"
        itens={[
          { rotulo: `Conquistadas: ${conquistadas.quantidade}`, link: linkDeConquistadas(periodo) },
          { rotulo: `Perdidas e canceladas: ${perdidas.quantidade}`, link: linkDePerdas(periodo) },
        ]}
      />
    </>
  )
}

/** Principais motivos de perda: barras horizontais com a quantidade de cada motivo. */
export function GraficoDeMotivos({
  motivos,
  totalDePerdas,
  periodo,
}: {
  motivos: Dashboard['motivosDePerda']
  totalDePerdas: number
  periodo: Dashboard['periodo']
}) {
  const navegar = useNavigate()
  const reduzir = useReduzirMovimento()
  if (motivos.length === 0) {
    return <GraficoVazio texto="Nenhuma perda neste período." altura={72} />
  }
  const dados = motivos.map((m) => ({ ...m, fill: 'var(--tag-red-fg)' }))
  return (
    <>
      <ContainerDoGrafico
        altura={Math.max(96, dados.length * 36)}
        rotulo={`Principais motivos de perda: ${motivos.map((m) => `${m.nome}, ${plural(m.quantidade, 'oportunidade', 'oportunidades')}`).join('; ')}`}
        config={{ quantidade: { rotulo: 'Oportunidades', cor: 'var(--tag-red-fg)' } }}
        className="[&_.recharts-rectangle]:cursor-pointer"
      >
        <BarChart
          data={dados}
          layout="vertical"
          margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="nome" width={120} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ active, payload }) => {
              const m = payload?.[0]?.payload as (typeof dados)[number] | undefined
              if (!active || !m) return null
              return (
                <ConteudoDoTooltip
                  titulo={m.nome}
                  linhas={[
                    { rotulo: 'Oportunidades', valor: String(m.quantidade), cor: m.fill },
                    { rotulo: 'Valor', valor: reais(m.total) },
                    { rotulo: 'Das perdas', valor: percentual(m.quantidade, totalDePerdas) },
                  ]}
                  aviso={AVISO_CLIQUE}
                />
              )
            }}
          />
          <Bar
            dataKey="quantidade"
            radius={4}
            barSize={14}
            minPointSize={3}
            isAnimationActive={!reduzir}
            animationDuration={500}
            onClick={(item: unknown) => {
              const m = dadoDoClique<(typeof dados)[number]>(item)
              void navegar(linkDoMotivo(m.id, periodo))
            }}
          >
            <LabelList dataKey="quantidade" position="right" className="fill-ink text-[12px]" />
          </Bar>
        </BarChart>
      </ContainerDoGrafico>
      <LinksDoGrafico
        titulo="Oportunidades perdidas por motivo"
        itens={motivos.map((m) => ({
          rotulo: `${m.nome}: ${m.quantidade}`,
          link: linkDoMotivo(m.id, periodo),
        }))}
      />
    </>
  )
}
