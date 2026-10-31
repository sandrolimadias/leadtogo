import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { LayoutList, Plus, Search, SquareKanban, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { usePorPagina } from '@/casca/preferencias'
import { Button } from '@leadtogo/ui/button'
import { Select, TextField } from '@leadtogo/ui/campos'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import {
  AreaDaTabela,
  CabecalhoDoQuadro,
  CorpoDaTabela,
  PaginaDeQuadro,
  PaginaDeTabela,
} from '@leadtogo/ui/pagina'
import { Paginacao } from '@leadtogo/ui/paginacao'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'
import { usePodeImportar } from '@/telas/importacao/comum'

import { useAcoesDaOportunidade } from './acoes'
import { type BuscaDeOportunidades, lerBusca } from './busca'
import { useFormularioDeOportunidade } from './contexto-formulario'
import { diaDoBanco, reais } from './formatos'
import { QuadroKanban } from './kanban'
import { TabelaDeOportunidades } from './lista'
import { useGruposDeTagsDeOportunidade } from './tags'
import { JanelaDeSuspensas } from './suspensas'

const rota = getRouteApi('/_autenticado/oportunidades/')
const ESPERA_DA_BUSCA_MS = 400

const STATUS = [
  { value: 'ativo', label: 'Ativas' },
  { value: 'conquistado', label: 'Conquistadas' },
  { value: 'perdido', label: 'Perdidas' },
  { value: 'cancelado', label: 'Canceladas' },
  { value: 'suspenso', label: 'Suspensas' },
]

/** Oportunidades: o funil de vendas em Kanban ou em lista, com filtros, resumo e as suspensas. */
export function PaginaDeOportunidades() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const celular = useDispositivo() === 'celular'
  const { abrir } = useFormularioDeOportunidade()
  const busca = rota.useSearch({ select: (s) => lerBusca(s) })
  const navegar = rota.useNavigate()
  const navegarParaFora = useNavigate()
  const podeImportar = usePodeImportar()
  const lista = busca.visao === 'lista'
  const [suspensasAbertas, setSuspensasAbertas] = useState(false)

  // O termo pode chegar pela URL ("Ver todos em Oportunidades" da busca global); daí em diante é do campo
  const [texto, setTexto] = useState(busca.busca ?? '')
  const [termo, setTermo] = useState(busca.busca ?? '')
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), ESPERA_DA_BUSCA_MS)
    return () => clearTimeout(espera)
  }, [texto])

  const mudar = (patch: Partial<BuscaDeOportunidades>, voltarParaAPrimeira = true) =>
    void navegar({
      search: (anterior) => {
        const novo: BuscaDeOportunidades = { ...lerBusca(anterior), ...patch }
        if (voltarParaAPrimeira && !('pagina' in patch)) delete novo.pagina
        for (const [chave, valor] of Object.entries(novo)) {
          if (valor === undefined || valor === '') delete (novo as Record<string, unknown>)[chave]
        }
        return novo
      },
      replace: true,
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
  const opcoes = useQuery({
    queryKey: ['carteira', 'opcoes'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.opcoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const motivos = useQuery({
    queryKey: ['cadastros', 'motivos'],
    enabled: lista && Boolean(busca.motivo),
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.motivos.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const funisAtivos = (funis.data ?? []).filter((f) => f.ativo || f.id === busca.funil)
  const funilEscolhido =
    funisAtivos.find((f) => f.id === busca.funil) ?? funisAtivos.find((f) => f.padrao)

  const kanban = useQuery({
    queryKey: ['oportunidades', 'kanban', busca.funil, busca.responsavel, busca.tag, termo],
    enabled: !lista,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.oportunidades.kanban({
        ...(busca.funil ? { funilId: busca.funil } : {}),
        ...(busca.responsavel ? { responsavelId: busca.responsavel } : {}),
        ...(busca.tag ? { tagOportunidadeId: busca.tag } : {}),
        ...(termo ? { busca: termo } : {}),
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const tamanho = usePorPagina('oportunidades')
  const itens = useQuery({
    queryKey: ['oportunidades', 'lista', busca, termo, tamanho.porPagina],
    enabled: lista && tamanho.pronto,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.oportunidades.listar({
        ...(busca.funil ? { funilId: busca.funil } : {}),
        ...(busca.responsavel ? { responsavelId: busca.responsavel } : {}),
        ...(busca.tag ? { tagOportunidadeId: busca.tag } : {}),
        ...(busca.status ? { status: busca.status } : {}),
        ...(busca.fase ? { faseId: busca.fase } : {}),
        ...(busca.motivo ? { motivoId: busca.motivo } : {}),
        ...(busca.grupo ? { grupo: busca.grupo } : {}),
        ...(busca.de ? { fechadaDe: busca.de } : {}),
        ...(busca.ate ? { fechadaAte: busca.ate } : {}),
        ...(termo ? { busca: termo } : {}),
        pagina: busca.pagina ?? 1,
        porPagina: tamanho.porPagina,
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const acoes = useAcoesDaOportunidade()
  // O filtro "Tag da oportunidade": as tags ativas dos grupos ativos (e a que já está na URL)
  const gruposDeTags = useGruposDeTagsDeOportunidade()
  const opcoesDeTag = (gruposDeTags.data ?? [])
    .filter((g) => g.ativo)
    .flatMap((g) =>
      g.tags
        .filter((t) => t.ativo || t.id === busca.tag)
        .map((t) => ({ value: t.id, label: `${g.nome}: ${t.nome}` })),
    )
  // Os filtros que vieram de um clique do Dashboard (fase, motivo, perdas, período), em palavras
  const nomeDaFase = (funis.data ?? [])
    .flatMap((f) => f.fases)
    .find((f) => f.id === busca.fase)?.nome
  const nomeDoMotivo = (motivos.data ?? []).find((m) => m.id === busca.motivo)?.nome
  const filtrosDoDashboard = [
    busca.fase ? `fase ${nomeDaFase ?? '…'}` : null,
    busca.motivo ? `motivo ${nomeDoMotivo ?? '…'}` : null,
    busca.grupo === 'perdas' ? 'perdidas e canceladas' : null,
    busca.de || busca.ate
      ? `fechadas ${busca.de ? `de ${diaDoBanco(busca.de)} ` : ''}${busca.ate ? `até ${diaDoBanco(busca.ate)}` : ''}`.trim()
      : null,
  ].filter((x): x is string => x !== null)
  const comFiltro = Boolean(
    busca.responsavel ??
    busca.tag ??
    busca.status ??
    busca.fase ??
    busca.motivo ??
    busca.grupo ??
    busca.de ??
    (termo || undefined),
  )
  const limpar = () => {
    setTexto('')
    setTermo('')
    void navegar({
      search: (a) => {
        const { visao, funil } = lerBusca(a)
        return { ...(visao ? { visao } : {}), ...(funil ? { funil } : {}) }
      },
      replace: true,
    })
  }
  const reabrirDaLista = async (id: string) => {
    const r = await servicos.oportunidades.reabrir(id)
    if (!r.ok) {
      toast.error('Não foi possível reabrir', { description: r.erro.mensagem })
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['oportunidades'] })
    toast.success('Oportunidade reaberta')
  }

  const resumo = lista ? itens.data?.somas : kanban.data?.resumo
  const quantidade = lista ? itens.data?.total : kanban.data?.resumo.ativas
  const subtitulo =
    quantidade === undefined || !resumo
      ? ''
      : `${quantidade} ${lista ? (quantidade === 1 ? 'oportunidade' : 'oportunidades') : quantidade === 1 ? 'ativa' : 'ativas'} · Total ${reais(resumo.total)} · Mensal ${reais(resumo.mensal)} · Ponderado ${reais(resumo.ponderado)}`
  const funilIdDoKanban = kanban.data?.funil.id ?? funilEscolhido?.id

  const Raiz = lista ? PaginaDeTabela : PaginaDeQuadro

  return (
    <Raiz>
      <CabecalhoDoQuadro>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 max-md:basis-full">
            <h1
              className={cn(
                'm-0 text-[30px] leading-9 font-semibold tracking-[-0.015em]',
                celular && 'sr-only',
              )}
            >
              Oportunidades
            </h1>
            <span className="text-[13px] text-ink-muted tabular-nums" aria-live="polite">
              {subtitulo}
            </span>
          </div>
          <div className="flex items-center gap-3 max-md:w-full">
            <SegmentedControl
              label="Visão"
              options={[
                { value: 'kanban', label: 'Kanban', icon: SquareKanban },
                { value: 'lista', label: 'Lista', icon: LayoutList },
              ]}
              value={lista ? 'lista' : 'kanban'}
              onChange={(v) =>
                mudar({ visao: v === 'lista' ? 'lista' : undefined, status: undefined })
              }
            />
            {podeImportar && !celular ? (
              <Button
                icon={Upload}
                onClick={() =>
                  void navegarParaFora({
                    to: '/importacao/nova',
                    search: { tipo: 'oportunidades' },
                  })
                }
              >
                Importar planilha
              </Button>
            ) : null}
            <Button
              variant="primary"
              icon={Plus}
              className="max-md:min-w-0 max-md:flex-1"
              aria-label="Nova oportunidade"
              onClick={() => abrir({ ...(funilEscolhido ? { funilId: funilEscolhido.id } : {}) })}
            >
              {celular ? 'Nova' : 'Nova oportunidade'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border-border bg-surface p-3 md:border">
          <TextField
            icon={Search}
            placeholder="Nome da oportunidade ou da empresa"
            aria-label="Buscar oportunidades"
            className="min-w-0 flex-1 max-md:basis-full md:min-w-64"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Select
            aria-label="Funil"
            className="max-md:min-w-0 max-md:flex-1 md:w-44"
            options={funisAtivos.map((f) => ({ value: f.id, label: f.nome }))}
            value={funilEscolhido?.id ?? ''}
            onChange={(e) =>
              mudar({
                funil:
                  e.target.value === funis.data?.find((f) => f.padrao)?.id
                    ? undefined
                    : e.target.value,
              })
            }
          />
          {opcoes.data && !opcoes.data.unicoMembro ? (
            <Select
              aria-label="Responsável"
              placeholder="Responsável: todos"
              className="w-full md:w-48"
              options={opcoes.data.vendedores.map((v) => ({ value: v.id, label: v.nome }))}
              value={busca.responsavel ?? ''}
              onChange={(e) => mudar({ responsavel: e.target.value || undefined })}
            />
          ) : null}
          {opcoesDeTag.length > 0 ? (
            <Select
              aria-label="Tag da oportunidade"
              placeholder="Tag: todas"
              className="w-full md:w-52"
              options={opcoesDeTag}
              value={busca.tag ?? ''}
              onChange={(e) => mudar({ tag: e.target.value || undefined })}
            />
          ) : null}
          {lista ? (
            <Select
              aria-label="Status"
              placeholder="Status: todos"
              className="w-full md:w-44"
              options={STATUS}
              value={busca.status ?? ''}
              onChange={(e) =>
                mudar({ status: (e.target.value || undefined) as BuscaDeOportunidades['status'] })
              }
            />
          ) : (
            <Button onClick={() => setSuspensasAbertas(true)} disabled={!funilIdDoKanban}>
              Suspensas · {kanban.data?.suspensas ?? 0}
            </Button>
          )}
          {comFiltro ? (
            <Button variant="ghost" icon={X} onClick={limpar}>
              Limpar filtros
            </Button>
          ) : null}
        </div>

        {lista && filtrosDoDashboard.length > 0 ? (
          <p className="m-0 text-sm text-ink-muted" aria-live="polite">
            Filtrando por <strong className="text-ink">{filtrosDoDashboard.join(' · ')}</strong>.
          </p>
        ) : null}
      </CabecalhoDoQuadro>

      {!lista ? (
        <>
          {kanban.isError ? <Alert tone="danger">{kanban.error.message}</Alert> : null}
          {kanban.isPending ? (
            <div className="flex gap-3" role="status" aria-label="Carregando o funil">
              <Skeleton width={296} height={200} />
              <Skeleton width={296} height={200} />
              <Skeleton width={296} height={200} />
            </div>
          ) : null}
          {kanban.data ? (
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                kanban.isPlaceholderData && 'opacity-60',
              )}
            >
              <QuadroKanban kanban={kanban.data} celular={celular} />
            </div>
          ) : null}
        </>
      ) : (
        <>
          {itens.isError ? <Alert tone="danger">{itens.error.message}</Alert> : null}
          {itens.isPending && tamanho.pronto ? <Skeleton height={44} /> : null}
          {itens.data && itens.data.total === 0 ? (
            <AreaDaTabela>
              <EmptyState
                title={
                  comFiltro
                    ? 'Nenhuma oportunidade com esses filtros'
                    : 'Nenhuma oportunidade ainda'
                }
                description={
                  comFiltro
                    ? 'Revise a busca ou limpe os filtros.'
                    : 'Crie a primeira oportunidade de uma empresa da carteira.'
                }
                actions={
                  comFiltro ? (
                    <Button onClick={limpar}>Limpar filtros</Button>
                  ) : (
                    <Button variant="primary" icon={Plus} onClick={() => abrir()}>
                      Nova oportunidade
                    </Button>
                  )
                }
              />
            </AreaDaTabela>
          ) : null}
          {itens.data && itens.data.total > 0 ? (
            <AreaDaTabela className={cn(itens.isPlaceholderData && 'opacity-60')}>
              <CorpoDaTabela>
                <TabelaDeOportunidades
                  itens={itens.data.itens}
                  menu={(o) =>
                    acoes.menu(
                      o,
                      (funis.data?.find((f) => f.id === o.funil.id)?.fases ?? []).filter(
                        (f) => f.ativo,
                      ),
                    )
                  }
                />
              </CorpoDaTabela>
              <Paginacao
                pagina={itens.data.pagina}
                porPagina={itens.data.porPagina}
                total={itens.data.total}
                aoMudarPagina={(pagina) => mudar({ pagina }, false)}
                aoMudarPorPagina={(n) => {
                  tamanho.mudar(n)
                  mudar({ pagina: undefined }, false)
                }}
              />
            </AreaDaTabela>
          ) : null}
        </>
      )}

      {suspensasAbertas && funilIdDoKanban ? (
        <JanelaDeSuspensas
          funilId={funilIdDoKanban}
          aoFechar={() => setSuspensasAbertas(false)}
          aoReabrir={reabrirDaLista}
        />
      ) : null}
      {acoes.janelas}
    </Raiz>
  )
}
