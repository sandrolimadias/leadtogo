import type { IndicadoresDeChamados, MetricasDeChamados } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, meComChamados } from './fixtures'
import { duracaoUtil } from './duracao'

const indicadores = (extra: Partial<IndicadoresDeChamados> = {}): IndicadoresDeChamados => ({
  total: 10,
  abertos: 4,
  resolvidos: 6,
  tempoPrimeiraRespostaMin: 125,
  tempoResolucaoMin: 600,
  diasEmAberto: 2.5,
  respostaNoPrazoPct: 80,
  resolucaoNoPrazoPct: null,
  ...extra,
})

const metricas: MetricasDeChamados = {
  de: '2026-09-23',
  ate: '2026-10-23',
  alcance: 'todas',
  geral: indicadores(),
  porArea: [{ ...indicadores({ total: 7 }), area: { id: id(10), nome: 'Jurídico' } }],
  porResponsavel: [
    { ...indicadores({ total: 3 }), responsavel: null },
    { ...indicadores({ total: 4 }), responsavel: { id: id(900), nome: 'Ana Atendente' } },
  ],
  porStatus: [{ status: 'pendente', total: 4 }],
  truncado: false,
}

function servicos(permissoes: Record<string, true>) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados(permissoes),
    chamados: { ...base.chamados, metricas: vi.fn(async () => ok(metricas)) },
  })
}

describe('duração em minutos úteis', () => {
  it.each([
    [null, '—'],
    [45, '45 min'],
    [60, '1 h'],
    [125, '2 h 5 min'],
  ])('%s → %s', (min, texto) => expect(duracaoUtil(min)).toBe(texto))
})

describe('Métricas dos chamados', () => {
  it('mostra os números do período, por área e por responsável; sem meta aparece traço', async () => {
    const s = servicos({
      'chamados.ver': true,
      'chamados.ver_metricas': true,
      'chamados.exportar': true,
    })
    renderizar(s, '/chamados/metricas')
    expect(
      await screen.findByRole('heading', { name: 'Métricas dos chamados' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(s.chamados.metricas).toHaveBeenCalled())
    expect((await screen.findAllByText('2 h 5 min')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
    const porArea = screen.getByRole('region', { name: 'Por área' })
    expect(within(porArea).getByRole('rowheader', { name: 'Jurídico' })).toBeInTheDocument()
    const porResp = screen.getByRole('region', { name: 'Por responsável' })
    expect(within(porResp).getByRole('rowheader', { name: 'Sem responsável' })).toBeInTheDocument()
    expect(within(porResp).getByRole('rowheader', { name: 'Ana Atendente' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Exportar CSV/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/v1/chamados/exportar.csv'),
    )
  })

  it('sem chamados.exportar não oferece o CSV; sem chamados.ver_metricas volta para a lista', async () => {
    const s = servicos({ 'chamados.ver': true, 'chamados.ver_metricas': true })
    renderizar(s, '/chamados/metricas')
    await screen.findByRole('heading', { name: 'Métricas dos chamados' })
    expect(screen.queryByRole('link', { name: /Exportar CSV/ })).toBeNull()
  })

  it('quem não tem chamados.ver_metricas é mandado de volta à lista e não consulta nada', async () => {
    const s = servicos({ 'chamados.ver': true })
    renderizar(s, '/chamados/metricas')
    await screen.findByRole('heading', { name: 'Chamados' })
    expect(s.chamados.metricas).not.toHaveBeenCalled()
  })
})
