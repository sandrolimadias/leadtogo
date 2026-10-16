import type { Atividade } from '@leadtogo/api-client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { CalendarPlus, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { usePorPagina } from '@/casca/preferencias'
import { Button } from '@/components/ui/button'
import { Select, TextField } from '@/components/ui/campos'
import { Switch } from '@/components/ui/checkbox'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { AreaDaTabela, CorpoDaTabela, PaginaDeTabela } from '@/components/ui/pagina'
import { Paginacao } from '@/components/ui/paginacao'
import { Tabs } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { BolhaDoTipo } from '@/telas/cadastros/tipos-de-atividade'

import { useAcoesDaAtividade } from './acoes'
import {
  abaDaBusca,
  type BuscaDeAtividades,
  consultaDeAtividades,
  lerBusca,
  temFiltro,
} from './busca'
import { quandoDaAtividade } from './formatos'
import { ItemDeAtividade, MarcasDePrioridade, QuemDaAtividade, SituacaoDaAtividade } from './item'
import { useRegistrarAtividade } from './registro-contexto'

const rota = getRouteApi('/_autenticado/atividades/')

const ESPERA_DA_BUSCA_MS = 400

// `sticky`: o cabeçalho das colunas fica no topo da área central (docs/design_system.md, "Layout e rolagem")
const cabecalho =
  'sticky top-0 z-10 h-9 border-b border-border bg-surface-sunken px-3 text-left text-xs font-semibold text-ink-muted'
const celula = 'border-b border-border px-3 py-2.5 align-top'

const VAZIO: Record<string, { titulo: string; descricao: string }> = {
  agendadas: {
    titulo: 'Nada agendado',
    descricao: 'As atividades pendentes que ainda não venceram aparecem aqui.',
  },
  atrasadas: {
    titulo: 'Nenhuma atividade atrasada',
    descricao: 'Quando uma atividade pendente passa da data, ela aparece aqui em vermelho.',
  },
  realizadas: {
    titulo: 'Nenhuma atividade realizada',
    descricao:
      'O que já foi feito (visitas, ligações, reuniões, tarefas) fica aqui, a mais recente primeiro.',
  },
}

/** Atividades: a agenda e o histórico da carteira, com as abas Agendadas, Atrasadas e Realizadas. */
export function ListaDeAtividades() {
  const servicos = useServicos()
  const celular = useDispositivo() === 'celular'
  const { abrir } = useRegistrarAtividade()
  const acoes = useAcoesDaAtividade()
  const busca = rota.useSearch({ select: (s) => lerBusca(s) })
  const navegar = rota.useNavigate()
  const aba = abaDaBusca(busca)

  const [texto, setTexto] = useState('')
  const [termo, setTermo] = useState('')
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), ESPERA_DA_BUSCA_MS)
    return () => clearTimeout(espera)
  }, [texto])

  const mudar = (patch: Partial<BuscaDeAtividades>, voltarParaAPrimeira = true) =>
    void navegar({
      search: (anterior) => {
        const novo: BuscaDeAtividades = { ...lerBusca(anterior), ...patch }
        if (voltarParaAPrimeira && !('pagina' in patch)) delete novo.pagina
        for (const [chave, valor] of Object.entries(novo)) {
          if (valor === undefined || valor === '' || valor === false) {
            delete (novo as Record<string, unknown>)[chave]
          }
        }
        return novo
      },
      replace: true,
    })
  // a busca por texto também volta para a primeira página
  useEffect(() => {
    if (busca.pagina) mudar({ pagina: undefined }, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo])

  const tipos = useQuery({
    queryKey: ['cadastros', 'tipos-atividade'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.tiposAtividade.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const tamanho = usePorPagina('atividades')
  const lista = useQuery({
    queryKey: ['atividades', 'lista', busca, termo, tamanho.porPagina],
    retry: false,
    enabled: tamanho.pronto,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.atividades.listar(
        consultaDeAtividades(busca, termo, tamanho.porPagina),
      )
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const contagens = lista.data?.contagens
  const comFiltro = temFiltro(busca, termo)
  const limpar = () => {
    setTexto('')
    setTermo('')
    void navegar({
      search: (a) => ({ ...(lerBusca(a).aba ? { aba: lerBusca(a).aba } : {}) }),
      replace: true,
    })
  }

  return (
    <PaginaDeTabela>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1
            className={cn(
              'm-0 text-[30px] leading-9 font-semibold tracking-[-0.015em]',
              celular && 'sr-only',
            )}
          >
            Atividades
          </h1>
          <span className="text-[13px] text-ink-muted" aria-live="polite">
            {contagens
              ? `${contagens.agendadas + contagens.atrasadas} em aberto, ${contagens.atrasadas} atrasada${contagens.atrasadas === 1 ? '' : 's'}`
              : ''}
          </span>
        </div>
        <Button variant="primary" icon={CalendarPlus} onClick={() => abrir()}>
          Registrar atividade
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border-border bg-surface p-3 md:border">
        <TextField
          icon={Search}
          placeholder="Título, empresa ou contato"
          aria-label="Buscar atividades"
          className="min-w-0 flex-1 md:min-w-64"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Select
          aria-label="Tipo"
          placeholder="Tipo: todos"
          className="w-full md:w-48"
          options={(tipos.data ?? [])
            .filter((t) => t.ativo || t.id === busca.tipo)
            .map((t) => ({ value: t.id, label: t.nome }))}
          value={busca.tipo ?? ''}
          onChange={(e) => mudar({ tipo: e.target.value || undefined })}
        />
        <Switch
          label="Só as minhas"
          checked={busca.minhas === true}
          onChange={(e) => mudar({ minhas: e.target.checked || undefined })}
          className="pb-2.5"
        />
        {comFiltro ? (
          <Button variant="ghost" icon={X} onClick={limpar}>
            Limpar filtros
          </Button>
        ) : null}
      </div>

      <Tabs
        label="Situação das atividades"
        items={[
          {
            value: 'agendadas',
            label: 'Agendadas',
            ...(contagens ? { count: contagens.agendadas } : {}),
          },
          {
            value: 'atrasadas',
            label: 'Atrasadas',
            ...(contagens ? { count: contagens.atrasadas } : {}),
          },
          {
            value: 'realizadas',
            label: 'Realizadas',
            ...(contagens ? { count: contagens.realizadas } : {}),
          },
        ]}
        value={aba}
        onChange={(v) =>
          mudar({ aba: v === 'agendadas' ? undefined : (v as BuscaDeAtividades['aba']) })
        }
        className="flex flex-col gap-3"
      >
        {lista.isError ? <Alert tone="danger">{lista.error.message}</Alert> : null}
        {lista.isPending && tamanho.pronto ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Carregando atividades">
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : null}
        {lista.data && lista.data.total === 0 ? (
          <AreaDaTabela>
            <EmptyState
              title={comFiltro ? 'Nenhuma atividade com esses filtros' : (VAZIO[aba]?.titulo ?? '')}
              description={
                comFiltro ? 'Revise a busca ou limpe os filtros.' : (VAZIO[aba]?.descricao ?? '')
              }
              actions={
                comFiltro ? (
                  <Button onClick={limpar}>Limpar filtros</Button>
                ) : (
                  <Button variant="primary" icon={CalendarPlus} onClick={() => abrir()}>
                    Registrar atividade
                  </Button>
                )
              }
            />
          </AreaDaTabela>
        ) : null}
        {lista.data && lista.data.total > 0 ? (
          <AreaDaTabela
            className={cn(
              'max-md:rounded-none max-md:border-0 max-md:bg-transparent',
              lista.isPlaceholderData && 'opacity-60',
            )}
          >
            <CorpoDaTabela>
              {celular ? (
                <ul aria-label="Atividades" className="m-0 flex list-none flex-col p-0">
                  {lista.data.itens.map((a) => (
                    <ItemDeAtividade key={a.id} a={a} acoes={acoes.menu(a)} />
                  ))}
                </ul>
              ) : (
                <TabelaDeAtividades itens={lista.data.itens} menu={acoes.menu} />
              )}
            </CorpoDaTabela>
            <Paginacao
              pagina={lista.data.pagina}
              porPagina={lista.data.porPagina}
              total={lista.data.total}
              aoMudarPagina={(pagina) => mudar({ pagina }, false)}
              aoMudarPorPagina={(n) => {
                tamanho.mudar(n)
                mudar({ pagina: undefined }, false)
              }}
            />
          </AreaDaTabela>
        ) : null}
      </Tabs>
      {acoes.janelas}
    </PaginaDeTabela>
  )
}

function TabelaDeAtividades({
  itens,
  menu,
}: {
  itens: Atividade[]
  menu: (a: Atividade) => React.ReactNode
}) {
  return (
    <table className="w-full border-collapse text-sm leading-5">
      <thead className="bg-surface-sunken">
        <tr>
          <th scope="col" className={cabecalho}>
            Atividade
          </th>
          <th scope="col" className={cabecalho}>
            Empresa e contato
          </th>
          <th scope="col" className={cabecalho}>
            Quando
          </th>
          <th scope="col" className={cabecalho}>
            Responsável
          </th>
          <th scope="col" className={cabecalho}>
            Situação
          </th>
          <th scope="col" className={cn(cabecalho, 'w-12')}>
            <span className="sr-only">Ações</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {itens.map((a) => (
          <tr key={a.id}>
            <td className={celula}>
              <div className="flex items-start gap-2.5">
                <BolhaDoTipo icone={a.tipo.icone} cor={a.tipo.cor} />
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-1.5 font-semibold [overflow-wrap:anywhere]">
                    {a.titulo}
                    <MarcasDePrioridade a={a} />
                  </span>
                  <span className="text-[13px] text-ink-muted">{a.tipo.nome}</span>
                  {a.resultado ? (
                    <span className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">
                      {a.resultado}
                    </span>
                  ) : null}
                </div>
              </div>
            </td>
            <td className={celula}>
              <QuemDaAtividade a={a} />
            </td>
            <td className={cn(celula, 'whitespace-nowrap tabular-nums')}>
              {a.situacao === 'realizada' && a.realizadaEm
                ? quandoDaAtividade({ dataInicio: a.realizadaEm, diaInteiro: false })
                : quandoDaAtividade(a)}
            </td>
            <td className={celula}>{a.responsavel.nome}</td>
            <td className={celula}>
              <SituacaoDaAtividade a={a} />
            </td>
            <td className={cn(celula, 'text-right')}>{menu(a)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
