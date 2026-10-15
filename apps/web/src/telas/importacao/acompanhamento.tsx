import type { LoteDeImportacao } from '@leadtogo/api-client'
import { ROTULO_DO_RESULTADO, type ResultadoDaLinha } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Download, RotateCw, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge, type TomDoBadge } from '@/components/ui/exibicao'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { useEnvio } from '@/telas/acesso/comum'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'

import { formatarDataHora, formatarDuracao, PASSO } from './comum'
import { Pagina } from './pagina'
import type { PropsDoPasso } from './passos'

const chaveDoAndamento = (id: string) => ['importacao', 'andamento', id] as const

const TOM_DO_RESULTADO: Record<ResultadoDaLinha, TomDoBadge> = {
  pendente: 'neutral',
  criada: 'success',
  criada_fora_do_perfil: 'info',
  fora_do_perfil: 'warning',
  pulada_sem_cnpj: 'neutral',
  pulada_duplicada: 'neutral',
  pulada_nao_ativa: 'neutral',
  erro: 'danger',
}

function useAndamento(id: string, acompanhar: boolean) {
  const servicos = useServicos()
  return useQuery({
    queryKey: chaveDoAndamento(id),
    retry: false,
    // enquanto executa, repete a cada poucos segundos; parado, confere uma vez
    refetchInterval: (q) => (acompanhar && q.state.data?.situacao !== 'concluida' ? 2500 : false),
    queryFn: async () => {
      const r = await servicos.importacao.lotes.andamento(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}

// ---------------------------------------------------------------------------------------------------
// Passo 6: Importar (progresso)

export function PassoImportar({ lote, aoAlterar }: PropsDoPasso) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const andamento = useAndamento(lote.id, true)
  const a = andamento.data
  const terminou = a !== undefined && a.situacao !== 'em_andamento'

  // Terminou (ou foi cancelada): busca o lote de novo e o assistente passa para o relatório
  useEffect(() => {
    if (!terminou) return
    void servicos.importacao.lotes.detalhar(lote.id).then((r) => {
      if (r.ok) aoAlterar(r.dados)
    })
  }, [terminou, servicos, lote.id, aoAlterar])

  const total = a?.totalLinhas ?? lote.totalLinhas
  const feitas = a?.processadas ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((100 * feitas) / total)) : 0

  const cancelar = () =>
    executar(async () => {
      const r = await servicos.importacao.lotes.cancelar(lote.id)
      if (!r.ok) {
        toast.error(r.erro.mensagem)
        return
      }
      aoAlterar(r.dados)
    })

  return (
    <Pagina titulo="Importar planilha" trilha={`Empresas › ${lote.nome}`} passo={PASSO.importar}>
      <section
        aria-label="Andamento da importação"
        className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-6 max-md:p-4"
      >
        <div className="flex items-baseline gap-2">
          <h2 className="m-0 flex-1 text-lg leading-6 font-semibold">Importando…</h2>
          <span className="font-semibold tabular-nums">
            {feitas.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} linhas
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Linhas processadas"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={feitas}
          className="h-2 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[13px] text-ink-muted">
          {a && a.estimativaRestanteSegundos > 0
            ? `Faltam cerca de ${formatarDuracao(a.estimativaRestanteSegundos)} (no máximo: o que já está no cache não espera).`
            : 'Validando CNPJs, consultando a Receita e cadastrando as empresas…'}
        </span>
        {andamento.isError ? (
          <Alert tone="warning" title="Não foi possível atualizar o andamento">
            {andamento.error.message} A importação continua em segundo plano.
          </Alert>
        ) : null}
        <Alert tone="info" title="Pode sair desta tela">
          A importação continua em segundo plano. Volte a esta página quando quiser ver o relatório.
        </Alert>
        <div>
          <Button variant="danger-ghost" loading={enviando} onClick={() => void cancelar()}>
            Cancelar importação
          </Button>
        </div>
      </section>
    </Pagina>
  )
}

// ---------------------------------------------------------------------------------------------------
// Passo 7: Relatório

function dadoPrincipal(dados: Record<string, string>, colunas: string[]): string {
  return colunas.map((c) => dados[c]).find((v) => v) ?? ''
}

export function PassoRelatorio({ lote, aoAlterar }: PropsDoPasso) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const andamento = useAndamento(lote.id, false)
  const [filtro, setFiltro] = useState<ResultadoDaLinha | ''>('')
  const [pagina, setPagina] = useState(1)
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string>()
  const [agora] = useState(() => Date.now())
  const [desfazendo, setDesfazendo] = useState(false)
  const [erroAoDesfazer, setErroAoDesfazer] = useState<string>()

  const linhas = useQuery({
    queryKey: ['importacao', 'linhas', lote.id, filtro, pagina, lote.situacao],
    retry: false,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.linhas(lote.id, {
        pagina,
        ...(filtro ? { resultado: filtro } : {}),
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const contagens = (andamento.data?.porResultado ?? {}) as Partial<
    Record<ResultadoDaLinha, number>
  >
  const n = (r: ResultadoDaLinha) => contagens[r] ?? 0
  const foraDoPerfil = n('fora_do_perfil')
  const naoEntraram = (Object.keys(contagens) as ResultadoDaLinha[])
    .filter((r) => r !== 'criada' && r !== 'criada_fora_do_perfil' && r !== 'pendente')
    .reduce((soma, r) => soma + n(r), 0)
  const concluida = lote.situacao === 'concluida'

  const resumo = [
    { rotulo: 'Importadas', n: n('criada') + n('criada_fora_do_perfil'), tom: 'success' as const },
    { rotulo: 'Fora do perfil', n: foraDoPerfil, tom: 'warning' as const },
    {
      rotulo: 'Puladas',
      n: n('pulada_sem_cnpj') + n('pulada_duplicada') + n('pulada_nao_ativa'),
      tom: 'neutral' as const,
    },
    { rotulo: 'Com erro', n: n('erro'), tom: 'danger' as const },
  ]
  const filtros = (Object.keys(ROTULO_DO_RESULTADO) as ResultadoDaLinha[]).filter((r) => n(r) > 0)

  const opcoesDeFiltro: { valor: ResultadoDaLinha | ''; rotulo: string; n: number }[] = [
    { valor: '', rotulo: 'Todas', n: lote.totalLinhas },
    ...filtros.map((r) => ({ valor: r, rotulo: ROTULO_DO_RESULTADO[r], n: n(r) })),
  ]

  const alternar = (id: string) =>
    setEscolhidas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const importarMesmoAssim = () =>
    executar(async () => {
      setErro(undefined)
      const r = await servicos.importacao.lotes.importarForaDoPerfil(
        lote.id,
        escolhidas.size > 0 ? [...escolhidas] : undefined,
      )
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      setEscolhidas(new Set())
      await queryClient.invalidateQueries({ queryKey: ['importacao', 'linhas', lote.id] })
      aoAlterar(r.dados)
    })

  const desfazer = () =>
    executar(async () => {
      setErroAoDesfazer(undefined)
      const r = await servicos.importacao.lotes.desfazer(lote.id)
      if (!r.ok) {
        setErroAoDesfazer(r.erro.mensagem)
        return
      }
      setDesfazendo(false)
      toast.success('Importação desfeita')
      await queryClient.invalidateQueries({ queryKey: ['importacao', 'linhas', lote.id] })
      aoAlterar(r.dados)
    })
  const podeDesfazer =
    concluida && lote.desfazerAte !== null && Date.parse(lote.desfazerAte) > agora

  const retomar = () =>
    executar(async () => {
      setErro(undefined)
      const r = await servicos.importacao.lotes.iniciar(lote.id)
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      aoAlterar(r.dados)
    })

  const avisos = {
    concluida: (
      <Alert tone="success" title="Importação concluída">
        {resumo[0]?.n.toLocaleString('pt-BR')} empresas importadas
        {naoEntraram > 0 ? ` e ${naoEntraram.toLocaleString('pt-BR')} linhas que não entraram` : ''}
        .
      </Alert>
    ),
    falhou: (
      <Alert
        tone="danger"
        title="A importação parou antes do fim"
        actions={
          <Button size="sm" icon={RotateCw} loading={enviando} onClick={() => void retomar()}>
            Retomar
          </Button>
        }
      >
        O que já entrou continua na carteira. Ao retomar, só as linhas pendentes são processadas.
      </Alert>
    ),
    cancelada: (
      <Alert
        tone="warning"
        title="Importação cancelada"
        actions={
          <Button size="sm" icon={RotateCw} loading={enviando} onClick={() => void retomar()}>
            Retomar
          </Button>
        }
      >
        O que já entrou continua na carteira. Ao retomar, só as linhas pendentes são processadas.
      </Alert>
    ),
    desfeita: (
      <Alert tone="info" title="Importação desfeita">
        As empresas criadas por este lote foram removidas da carteira.
      </Alert>
    ),
  } as const
  const aviso = (avisos as Partial<Record<string, React.ReactNode>>)[lote.situacao]

  return (
    <Pagina
      titulo="Importar planilha"
      trilha={`Empresas › ${lote.nome}`}
      passo={PASSO.relatorio}
      rodape={
        <>
          <span className="flex-1" />
          <Link
            to="/empresas"
            className="inline-flex h-(--ctl) items-center gap-1.5 rounded-sm bg-brand px-3 text-[length:var(--ctl-font)] font-semibold text-on-brand hover:bg-brand-hover"
          >
            Ver empresas importadas
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </>
      }
    >
      {aviso}
      <div
        role="list"
        aria-label="Resumo do relatório"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        {resumo.map((r) => (
          <div
            key={r.rotulo}
            role="listitem"
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3.5"
          >
            <Badge tone={r.tom}>{r.rotulo}</Badge>
            <span className="text-[28px] leading-8 font-semibold tabular-nums">
              {r.n.toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </div>

      <section
        aria-label="Linhas da importação"
        className="flex flex-col rounded-lg border border-border bg-surface"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div
            role="group"
            aria-label="Filtrar por resultado"
            className="flex flex-1 flex-wrap gap-1.5"
          >
            {opcoesDeFiltro.map((f) => (
              <button
                key={f.valor || 'todas'}
                type="button"
                aria-pressed={filtro === f.valor}
                onClick={() => {
                  setFiltro(f.valor)
                  setPagina(1)
                }}
                className={cn(
                  'h-7 cursor-pointer rounded-full border px-3 text-[13px] font-semibold',
                  filtro === f.valor
                    ? 'border-brand bg-brand-soft text-ink'
                    : 'border-border bg-surface text-ink-muted',
                )}
              >
                {f.rotulo} · {f.n}
              </button>
            ))}
          </div>
          {naoEntraram > 0 ? (
            <a
              href={`/v1/importacao/lotes/${lote.id}/problemas.csv`}
              className="inline-flex h-(--control-sm) items-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold text-ink hover:bg-surface-hover"
            >
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              Baixar o que não entrou (CSV)
            </a>
          ) : null}
        </div>

        {linhas.isPending ? (
          <div className="p-4" role="status" aria-label="Carregando as linhas">
            <Skeleton lines={4} />
          </div>
        ) : linhas.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Não foi possível carregar as linhas">
              {linhas.error.message}
            </Alert>
          </div>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col p-0">
              {linhas.data.itens.map((l) => (
                <li
                  key={l.id}
                  aria-label={`Linha ${l.numero}`}
                  className="grid items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 md:grid-cols-[auto_72px_minmax(0,1.2fr)_minmax(0,1.4fr)]"
                >
                  {concluida && l.resultado === 'fora_do_perfil' ? (
                    <Checkbox
                      aria-label={`Importar a linha ${l.numero}`}
                      checked={escolhidas.has(l.id)}
                      onChange={() => alternar(l.id)}
                    />
                  ) : (
                    <span className="max-md:hidden" />
                  )}
                  <span className="text-xs text-ink-muted tabular-nums">Linha {l.numero}</span>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold">
                      {l.empresaNome ??
                        (dadoPrincipal(l.dados, linhas.data.colunas) || 'Sem dados')}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span>
                      <Badge tone={TOM_DO_RESULTADO[l.resultado]}>
                        {ROTULO_DO_RESULTADO[l.resultado]}
                      </Badge>
                    </span>
                    {l.motivo ? (
                      <span className="text-[13px] text-ink-muted">{l.motivo}</span>
                    ) : null}
                  </div>
                </li>
              ))}
              {linhas.data.itens.length === 0 ? (
                <li className="p-4 text-[13px] text-ink-muted">
                  Nenhuma linha com este resultado.
                </li>
              ) : null}
            </ul>
            {linhas.data.total > linhas.data.porPagina ? (
              <nav
                aria-label="Páginas das linhas"
                className="flex items-center justify-end gap-2 p-3 text-[13px]"
              >
                <span className="text-ink-muted">
                  Página {linhas.data.pagina} de{' '}
                  {Math.ceil(linhas.data.total / linhas.data.porPagina)}
                </span>
                <Button size="sm" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                  Anterior
                </Button>
                <Button
                  size="sm"
                  disabled={pagina * linhas.data.porPagina >= linhas.data.total}
                  onClick={() => setPagina(pagina + 1)}
                >
                  Próxima
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </section>

      {concluida && foraDoPerfil > 0 ? (
        <section
          aria-label="Importar mesmo assim"
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
        >
          <h2 className="m-0 text-[15px] leading-5 font-semibold">Importar mesmo assim</h2>
          <p className="m-0 text-[13px] text-ink-muted">
            As linhas fora do perfil entram na carteira com a tag &quot;Fora do perfil&quot;. Marque
            as que quiser na lista, ou importe todas. Empresa não ativa na Receita continua de fora.
          </p>
          <div>
            <Button loading={enviando} onClick={() => void importarMesmoAssim()}>
              {escolhidas.size > 0
                ? `Importar mesmo assim (${escolhidas.size} marcadas)`
                : `Importar mesmo assim (todas as ${foraDoPerfil})`}
            </Button>
          </div>
        </section>
      ) : null}
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      {podeDesfazer && lote.desfazerAte ? (
        <section
          aria-label="Desfazer a importação"
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
        >
          <h2 className="m-0 text-[15px] leading-5 font-semibold">Desfazer a importação</h2>
          <p className="m-0 text-[13px] text-ink-muted">
            Disponível até {formatarDataHora(lote.desfazerAte)}. Tira da carteira só as empresas que
            este lote criou; as que já estavam lá não são tocadas.
          </p>
          <div>
            <Button variant="danger-ghost" icon={Undo2} onClick={() => setDesfazendo(true)}>
              Desfazer importação
            </Button>
          </div>
        </section>
      ) : null}
      <DialogoDeConfirmacao
        aberto={desfazendo}
        titulo="Desfazer esta importação?"
        descricao={`As empresas criadas por "${lote.nome}" saem da carteira. As que já existiam antes não mudam. O relatório continua disponível.`}
        rotuloDoBotao="Desfazer importação"
        erro={erroAoDesfazer}
        enviando={enviando}
        aoConfirmar={() => void desfazer()}
        aoFechar={() => {
          setDesfazendo(false)
          setErroAoDesfazer(undefined)
        }}
      />
      <span className="text-[13px] text-ink-muted">Arquivo {lote.nomeArquivo}</span>
    </Pagina>
  )
}

export type { LoteDeImportacao }
