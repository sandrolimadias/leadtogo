import type { OportunidadeDetalhada } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { CalendarPlus, ChevronRight, Hourglass } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Button } from '@leadtogo/ui/button'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { ConteudoDaAba, Tabs } from '@leadtogo/ui/tabs'
import { AtividadesDaFicha } from '@/telas/atividades/na-ficha'
import { useRegistrarAtividade } from '@/telas/atividades/registro-contexto'
import { dataEHora } from '@/telas/empresas/formatos'
import { Cartao } from '@/telas/empresas/ficha-resumo'

import { useAcoesDaOportunidade } from './acoes'
import { diaDoBanco, previsaoEmPalavras, reais, rotuloDoStatus, TOM_DO_STATUS } from './formatos'

const rota = getRouteApi('/_autenticado/oportunidades/$oportunidadeId')

const ABAS = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'atividades', label: 'Atividades' },
  { value: 'historico', label: 'Histórico' },
]

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-ink-muted">{rotulo}</dt>
      <dd className="m-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** A ficha da oportunidade: dados e valores, atividades vinculadas e o histórico de fases e de status. */
export function FichaDaOportunidade() {
  const { oportunidadeId } = rota.useParams()
  const servicos = useServicos()
  const celular = useDispositivo() === 'celular'
  const { abrir: abrirAtividade } = useRegistrarAtividade()
  const [aba, setAba] = useState('resumo')
  const acoes = useAcoesDaOportunidade()

  const consulta = useQuery({
    queryKey: ['oportunidades', 'oportunidade', oportunidadeId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.oportunidades.detalhar(oportunidadeId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const funis = useQuery({
    queryKey: ['cadastros', 'funis'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.funis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  if (consulta.isPending) {
    return (
      <main
        className="flex w-full flex-col gap-3 p-6 max-md:p-4"
        role="status"
        aria-label="Carregando"
      >
        <Skeleton height={28} width={320} />
        <Skeleton height={120} />
      </main>
    )
  }
  if (consulta.isError) {
    return (
      <main className="flex w-full flex-col gap-4 p-6 max-md:p-4">
        <Alert tone="danger">{consulta.error.message}</Alert>
        <Link to="/oportunidades">Voltar para Oportunidades</Link>
      </main>
    )
  }
  const o: OportunidadeDetalhada = consulta.data
  const previsao = previsaoEmPalavras(o)
  const fases = (funis.data?.find((f) => f.id === o.funil.id)?.fases ?? []).filter((f) => f.ativo)

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-3 bg-surface px-6 pt-5 pb-3 max-md:px-4">
        {celular ? null : (
          <nav
            aria-label="Você está em"
            className="flex items-center gap-1.5 text-[13px] text-ink-muted"
          >
            <Link to="/oportunidades" className="text-ink-muted">
              Oportunidades
            </Link>
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-ink">{o.titulo}</span>
          </nav>
        )}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[22px] leading-7 font-semibold tracking-[-0.01em]">
                {o.titulo}
              </h1>
              <Badge tone={TOM_DO_STATUS[o.status]}>{rotuloDoStatus(o.status)}</Badge>
              {o.parada ? (
                <Badge tone="warning" icon={Hourglass}>
                  Parada há {o.diasParada} {o.diasParada === 1 ? 'dia' : 'dias'}
                </Badge>
              ) : null}
            </div>
            <span className="text-[13px] text-ink-muted">
              <Link
                to="/empresas/$empresaId"
                params={{ empresaId: o.empresa.id }}
                className="text-ink-muted"
              >
                {o.empresa.nome}
              </Link>{' '}
              · {o.funil.nome} ·{' '}
              {o.status === 'ativo'
                ? o.fase.nome
                : `parou em ${o.faseParouEm?.nome ?? o.fase.nome}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {o.editavel && o.status === 'ativo' ? (
              <Button
                variant="primary"
                icon={CalendarPlus}
                onClick={() =>
                  abrirAtividade({
                    empresa: o.empresa,
                    oportunidade: { id: o.id, nome: o.titulo },
                    ...(o.contato ? { contatoId: o.contato.id } : {}),
                  })
                }
              >
                Nova atividade
              </Button>
            ) : null}
            {acoes.menu(o, fases)}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-x-6 gap-y-3 border-t border-border pt-3 text-sm max-md:grid-cols-2">
          <Campo rotulo="Total">
            <strong className="tabular-nums">{reais(o.valorTotal)}</strong>
          </Campo>
          <Campo rotulo="Mensal">
            <span className="tabular-nums">
              {o.valorMensal > 0 ? `${reais(o.valorMensal)}/mês` : '—'}
            </span>
          </Campo>
          <Campo rotulo={`Ponderado (${o.probabilidade}%)`}>
            <span className="tabular-nums">{reais(o.valorPonderado)}</span>
          </Campo>
          <Campo rotulo="Previsão">
            <span
              className={
                previsao.tom === 'vencida'
                  ? 'font-semibold text-danger'
                  : previsao.tom === 'sem'
                    ? 'text-ink-muted'
                    : undefined
              }
            >
              {previsao.tom === 'sem' ? 'Sem previsão' : diaDoBanco(o.dataPrevistaFechamento)}
            </span>
          </Campo>
          <Campo rotulo="Responsável">{o.responsavel.nome}</Campo>
        </div>
      </header>

      <Tabs
        label="Seções da oportunidade"
        items={ABAS}
        value={aba}
        onChange={setAba}
        className="flex flex-col [&>[role=tablist]]:bg-surface [&>[role=tablist]]:px-6 max-md:[&>[role=tablist]]:px-4"
      >
        <main className="w-full p-6 max-md:p-4">
          <ConteudoDaAba value="resumo" className="flex flex-col gap-4">
            <Cartao titulo="Dados da oportunidade">
              <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3.5 max-md:grid-cols-1">
                <Campo rotulo="Empresa">
                  <Link to="/empresas/$empresaId" params={{ empresaId: o.empresa.id }}>
                    {o.empresa.nome}
                  </Link>
                </Campo>
                <Campo rotulo="Contato principal">
                  {o.contato ? (
                    <Link to="/contatos/$contatoId" params={{ contatoId: o.contato.id }}>
                      {o.contato.nome}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Campo>
                <Campo rotulo="Solução">{o.solucao?.nome ?? '—'}</Campo>
                <Campo rotulo="Origem">{o.origem?.nome ?? '—'}</Campo>
                <Campo rotulo="Funil e fase">
                  {o.funil.nome} · {o.fase.nome}
                </Campo>
                <Campo rotulo="Probabilidade">
                  {o.probabilidade}%
                  {o.probabilidadeManual ? (
                    <span className="text-ink-muted"> (editada à mão)</span>
                  ) : null}
                </Campo>
                <Campo rotulo="Valor único">
                  <span className="tabular-nums">{reais(o.valorUnico)}</span>
                </Campo>
                <Campo rotulo="Valor mensal × duração">
                  <span className="tabular-nums">
                    {reais(o.valorMensal)} × {o.meses} {o.meses === 1 ? 'mês' : 'meses'}
                  </span>
                </Campo>
                <Campo rotulo="Total do contrato">
                  <strong className="tabular-nums">{reais(o.valorTotal)}</strong>
                </Campo>
                <Campo rotulo="Ponderado">
                  <span className="tabular-nums">{reais(o.valorPonderado)}</span>
                </Campo>
                <Campo rotulo="Na fase desde">{dataEHora(o.faseDesde)}</Campo>
                <Campo rotulo="Criada em">{dataEHora(o.criadaEm)}</Campo>
                {o.status !== 'ativo' ? (
                  <>
                    <Campo rotulo="Fechamento">
                      {rotuloDoStatus(o.status)} em {dataEHora(o.dataFechamento)}
                    </Campo>
                    <Campo rotulo="Parou na fase">{o.faseParouEm?.nome ?? '—'}</Campo>
                    <Campo rotulo="Motivo">{o.motivo?.nome ?? '—'}</Campo>
                    {o.status === 'suspenso' ? (
                      <Campo rotulo="Retomar em">{diaDoBanco(o.suspensaAte)}</Campo>
                    ) : null}
                    {o.motivoDetalhe ? <Campo rotulo="Detalhe">{o.motivoDetalhe}</Campo> : null}
                  </>
                ) : null}
              </dl>
            </Cartao>
            {o.observacoes ? (
              <Cartao titulo="Observações">
                <p className="m-0 whitespace-pre-line">{o.observacoes}</p>
              </Cartao>
            ) : null}
          </ConteudoDaAba>
          <ConteudoDaAba value="atividades">
            <AtividadesDaFicha
              filtro={{ oportunidadeId: o.id }}
              inicio={{
                empresa: o.empresa,
                oportunidade: { id: o.id, nome: o.titulo },
                ...(o.contato ? { contatoId: o.contato.id } : {}),
              }}
              podeRegistrar={o.editavel && o.status === 'ativo'}
              mostrarEmpresa={false}
            />
          </ConteudoDaAba>
          <ConteudoDaAba value="historico">
            {o.historico.length === 0 ? (
              <EmptyState
                title="Sem histórico"
                description="As mudanças de fase e de status aparecem aqui."
              />
            ) : (
              <ul
                aria-label="Histórico da oportunidade"
                className="m-0 flex list-none flex-col p-0"
              >
                {o.historico.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-col gap-0.5 border-b border-border py-3 last:border-b-0"
                  >
                    <span className="text-sm font-semibold">{h.titulo}</span>
                    <span className="text-[13px] text-ink-muted">
                      {dataEHora(h.em)}
                      {h.por ? ` · ${h.por.nome}` : ' · Sistema'}
                    </span>
                    {h.detalhe ? <span className="text-[13px]">{h.detalhe}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </ConteudoDaAba>
        </main>
      </Tabs>
      {acoes.janelas}
    </div>
  )
}
