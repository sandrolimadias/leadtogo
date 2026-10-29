import type { LoteDeImportacao } from '@leadtogo/api-client'
import {
  DIAS_PARA_DESFAZER,
  ROTULO_DO_RESULTADO,
  rotuloDoResultado,
  type ResultadoDaLinha,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Download, RotateCw, TriangleAlert, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { Paginacao } from '@leadtogo/ui/paginacao'
import { AreaDaTabela, CorpoDaTabela } from '@leadtogo/ui/pagina'
import { usePorPagina } from '@/casca/preferencias'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'
import { useEnvio } from '@/telas/acesso/comum'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'

import { formatarDataHora, formatarDuracao, PASSO, TEXTOS_DO_TIPO, TOM_DO_RESULTADO } from './comum'
import { Pagina } from './pagina'
import type { PropsDoPasso } from './passos'

const chaveDoAndamento = (id: string) => ['importacao', 'andamento', id] as const

/**
 * A carteira mudou (o lote terminou ou foi desfeito): as listas, o Kanban e as fichas já carregadas deixam de
 * valer, senão "Ver oportunidades" (ou contatos, atividades...) mostra o que estava em cache antes do lote.
 */
const invalidarACarteira = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'importacao' })

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
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const andamento = useAndamento(lote.id, true)
  const a = andamento.data
  const terminou = a !== undefined && a.situacao !== 'em_andamento'

  // Terminou (ou foi cancelada): busca o lote de novo e o assistente passa para o relatório
  useEffect(() => {
    if (!terminou) return
    void invalidarACarteira(queryClient)
    void servicos.importacao.lotes.detalhar(lote.id).then((r) => {
      if (r.ok) aoAlterar(r.dados)
    })
  }, [terminou, servicos, queryClient, lote.id, aoAlterar])

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
    <Pagina
      titulo="Importar planilha"
      trilha={`${TEXTOS_DO_TIPO[lote.tipo].trilha} › ${lote.nome}`}
      passo={PASSO.importar}
      tipo={lote.tipo}
    >
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
            : lote.tipo === 'empresas'
              ? 'Validando CNPJs, consultando a Receita e cadastrando as empresas…'
              : `Lendo as linhas e gravando ${TEXTOS_DO_TIPO[lote.tipo].plural}…`}
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

/** O que o desfazer faz, em palavras, em cada tipo de lote. */
function textoDoDesfazer(tipo: LoteDeImportacao['tipo']): string {
  if (tipo === 'contatos') {
    return 'Tira os contatos que este lote criou e que ninguém alterou nem usou depois, e inativa os vínculos que ele criou com contatos que já existiam (esses contatos ficam). O que alguém mexeu ou usou numa atividade fica, e o resultado avisa quantos.'
  }
  if (tipo === 'oportunidades') {
    return 'Tira as oportunidades que este lote criou e que ninguém mexeu depois (as que alguém editou, moveu de fase, fechou, reabriu ou ligou a uma atividade ficam), junto com a atividade de retomada das suspensas. A empresa que virou Cliente por uma conquistada continua Cliente.'
  }
  if (tipo === 'atividades') {
    return 'Tira as atividades que este lote criou e que ninguém alterou depois (as que alguém concluiu, editou ou cancelou ficam). Depois recalcula a última visita, o último contato, a próxima atividade e as tags de cada empresa afetada.'
  }
  return 'Tira da carteira as empresas que este lote criou e que ninguém alterou depois; as que alguém editou, marcou com tag ou vinculou a um contato ficam, e o resultado avisa quais. As que já estavam na carteira antes não são tocadas.'
}

function descricaoDoDesfazer(tipo: LoteDeImportacao['tipo'], nome: string): string {
  if (tipo === 'contatos') {
    return `Os contatos criados por "${nome}" saem (menos os que alguém alterou ou usou depois) e os vínculos com contatos que já existiam são inativados; esses contatos ficam.`
  }
  if (tipo === 'oportunidades') {
    return `As oportunidades criadas por "${nome}" saem (menos as que alguém mexeu depois), com a retomada das suspensas. O Status das empresas não volta.`
  }
  if (tipo === 'atividades') {
    return `As atividades criadas por "${nome}" saem (menos as que alguém alterou depois) e a carteira das empresas afetadas é recalculada.`
  }
  return `As empresas criadas por "${nome}" saem da carteira, menos as que alguém alterou depois ou que têm contato vinculado (essas ficam e o relatório avisa quais). As que já existiam antes não mudam.`
}

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

  const tamanho = usePorPagina('importacao_linhas')
  const linhas = useQuery({
    queryKey: ['importacao', 'linhas', lote.id, filtro, pagina, tamanho.porPagina, lote.situacao],
    retry: false,
    enabled: tamanho.pronto,
    queryFn: async () => {
      const r = await servicos.importacao.lotes.linhas(lote.id, {
        pagina,
        porPagina: tamanho.porPagina,
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
    .filter(
      (r) =>
        r !== 'criada' &&
        r !== 'criada_fora_do_perfil' &&
        r !== 'pendente' &&
        r !== 'vinculada' &&
        r !== 'ja_vinculada',
    )
    .reduce((soma, r) => soma + n(r), 0)
  const concluida = lote.situacao === 'concluida'

  const puladasDoTipo = (Object.keys(contagens) as ResultadoDaLinha[])
    .filter((r) => r.startsWith('pulada_') && r !== 'pulada_duplicada')
    .reduce((soma, r) => soma + n(r), 0)
  const resumo =
    lote.tipo === 'contatos'
      ? [
          { rotulo: 'Contatos criados', n: n('criada'), tom: 'success' as const },
          { rotulo: 'Vinculados', n: n('vinculada') + n('ja_vinculada'), tom: 'info' as const },
          { rotulo: 'Puladas', n: puladasDoTipo + n('pulada_duplicada'), tom: 'neutral' as const },
          { rotulo: 'Com erro', n: n('erro'), tom: 'danger' as const },
        ]
      : lote.tipo === 'atividades' || lote.tipo === 'oportunidades'
        ? [
            {
              rotulo: lote.tipo === 'atividades' ? 'Atividades criadas' : 'Oportunidades criadas',
              n: n('criada'),
              tom: 'success' as const,
            },
            { rotulo: 'Já existiam', n: n('pulada_duplicada'), tom: 'neutral' as const },
            { rotulo: 'Puladas', n: puladasDoTipo, tom: 'warning' as const },
            { rotulo: 'Com erro', n: n('erro'), tom: 'danger' as const },
          ]
        : [
            {
              rotulo: 'Importadas',
              n: n('criada') + n('criada_fora_do_perfil'),
              tom: 'success' as const,
            },
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
    ...filtros.map((r) => ({ valor: r, rotulo: rotuloDoResultado(r, lote.tipo), n: n(r) })),
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
      void invalidarACarteira(queryClient)
      aoAlterar(r.dados)
    })
  const podeDesfazer = lote.desfazerAte !== null && Date.parse(lote.desfazerAte) > agora

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
        {resumo[0]?.n.toLocaleString('pt-BR')} {TEXTOS_DO_TIPO[lote.tipo].plural}{' '}
        {lote.tipo === 'contatos' ? 'criados' : 'importadas'}
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
        {lote.tipo === 'empresas' ? (
          <>
            {lote.desfeito
              ? `${lote.desfeito.removidas.toLocaleString('pt-BR')} ${lote.desfeito.removidas === 1 ? 'empresa saiu' : 'empresas saíram'} da carteira.`
              : 'As empresas criadas por este lote saíram da carteira.'}
            {lote.desfeito && lote.desfeito.mantidas > 0
              ? ` ${lote.desfeito.mantidas.toLocaleString('pt-BR')} ${lote.desfeito.mantidas === 1 ? 'ficou' : 'ficaram'} porque alguém alterou depois da importação ou vinculou um contato; ${lote.desfeito.mantidas === 1 ? 'aparece' : 'aparecem'} marcadas como "Ficou na carteira" na lista abaixo.`
              : ''}
          </>
        ) : (
          <>
            {lote.desfeito
              ? `${lote.desfeito.removidas.toLocaleString('pt-BR')} ${lote.tipo === 'contatos' ? 'contatos e vínculos desfeitos' : lote.tipo === 'atividades' ? 'atividades desfeitas' : 'oportunidades desfeitas'}.`
              : 'O que este lote criou foi desfeito.'}
            {lote.desfeito && lote.desfeito.mantidas > 0
              ? ` ${lote.desfeito.mantidas.toLocaleString('pt-BR')} ficaram porque alguém alterou ou usou depois da importação.`
              : ''}
            {lote.tipo === 'atividades'
              ? ' A última visita, o último contato, a próxima atividade e as tags das empresas foram recalculados.'
              : ''}
          </>
        )}
      </Alert>
    ),
  } as const
  const aviso = (avisos as Partial<Record<string, React.ReactNode>>)[lote.situacao]

  return (
    <Pagina
      tabela
      titulo="Importar planilha"
      trilha={`${TEXTOS_DO_TIPO[lote.tipo].trilha} › ${lote.nome}`}
      passo={PASSO.relatorio}
      tipo={lote.tipo}
      rodape={
        <>
          <span className="flex-1" />
          <Link
            to={TEXTOS_DO_TIPO[lote.tipo].destino}
            className="inline-flex h-(--ctl) items-center gap-1.5 rounded-sm bg-brand px-3 text-[length:var(--ctl-font)] font-semibold text-on-brand hover:bg-brand-hover"
          >
            {TEXTOS_DO_TIPO[lote.tipo].verTudo}
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

      <AreaDaTabela>
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border p-3">
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
            <CorpoDaTabela>
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
                      <span className="font-semibold [overflow-wrap:anywhere]">
                        {(lote.tipo === 'contatos'
                          ? l.contatoNome
                          : lote.tipo === 'atividades'
                            ? l.atividadeTitulo
                            : lote.tipo === 'oportunidades'
                              ? l.oportunidadeTitulo
                              : null) ??
                          l.empresaNome ??
                          (dadoPrincipal(l.dados, linhas.data.colunas) || 'Sem dados')}
                      </span>
                      {lote.tipo !== 'empresas' && l.empresaNome ? (
                        <span className="text-[13px] text-ink-muted">{l.empresaNome}</span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={TOM_DO_RESULTADO[l.resultado]}>
                          {rotuloDoResultado(l.resultado, lote.tipo)}
                        </Badge>
                        {lote.situacao === 'desfeita' && l.empresaNaCarteira === false ? (
                          <Badge tone="neutral">Removida</Badge>
                        ) : null}
                        {lote.situacao === 'desfeita' &&
                        l.empresaNaCarteira === true &&
                        (l.resultado === 'criada' || l.resultado === 'criada_fora_do_perfil') ? (
                          <Badge tone="warning">Ficou na carteira</Badge>
                        ) : null}
                      </span>
                      {l.motivo ? (
                        <span className="text-[13px] text-ink-muted">{l.motivo}</span>
                      ) : null}
                      {l.avisos.map((aviso) => (
                        <span
                          key={aviso}
                          className="flex items-start gap-1 text-[13px] text-warning"
                        >
                          <TriangleAlert
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            className="mt-0.5 flex-none"
                          />
                          <span>Aviso: {aviso}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
                {linhas.data.itens.length === 0 ? (
                  <li className="p-4 text-[13px] text-ink-muted">
                    Nenhuma linha com este resultado.
                  </li>
                ) : null}
              </ul>
            </CorpoDaTabela>
            <Paginacao
              pagina={linhas.data.pagina}
              porPagina={linhas.data.porPagina}
              total={linhas.data.total}
              aoMudarPagina={setPagina}
              aoMudarPorPagina={(n) => {
                tamanho.mudar(n)
                setPagina(1)
              }}
            />
          </>
        )}
      </AreaDaTabela>

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
            Disponível até {formatarDataHora(lote.desfazerAte)} ({DIAS_PARA_DESFAZER} dias depois de
            terminar). {textoDoDesfazer(lote.tipo)}
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
        descricao={`${descricaoDoDesfazer(lote.tipo, lote.nome)} O relatório continua disponível.`}
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
