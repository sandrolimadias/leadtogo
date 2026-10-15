import type { ListaDeEmpresas, TagGrupo } from '@leadtogo/api-client'
import { CHIPS_DA_LISTA, type ChipDaLista, type TamanhoDePagina } from '@leadtogo/shared'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Building2, Check, Filter, Plus, Search, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { useDispositivo } from '@/casca/dispositivo'
import { usePorPagina } from '@/casca/preferencias'
import { Button, IconButton } from '@/components/ui/button'
import { Select, TextField } from '@/components/ui/campos'
import { Checkbox } from '@/components/ui/checkbox'
import { Paginacao } from '@/components/ui/paginacao'
import { AreaDaTabela, CorpoRolavel, PaginaDeTabela } from '@/components/ui/pagina'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

import { type BuscaDaLista, consultaDaLista, lerBusca, temFiltroAtivo } from './busca'
import { contagemDeEmpresas } from './formatos'
import { BarraDeAcoesEmMassa } from './acoes-em-massa'
import { CartoesDeEmpresas, TabelaDeEmpresas } from './lista-partes'

const rota = getRouteApi('/_autenticado/empresas/')

const ESPERA_DA_BUSCA_MS = 300

const ROTULO_DO_CHIP: Record<ChipDaLista, string> = {
  todas: 'Todas',
  minha: 'Minha carteira',
  sem_visita_90: 'Sem visita há 90 dias',
  nunca_visitadas: 'Nunca visitadas',
  sem_proxima_atividade: 'Sem próxima atividade',
}

const OPCOES_DA_ULTIMA_VISITA = [
  { value: '30', label: 'Nos últimos 30 dias' },
  { value: '60', label: 'Sem visita há 60 dias' },
  { value: '90', label: 'Sem visita há 90 dias' },
  { value: 'nunca', label: 'Nunca visitadas' },
]

/** O Status é o grupo da tag `lead`; a Visitação, o grupo que o sistema aplica sozinho. */
function gruposDosFiltros(grupos: TagGrupo[] | undefined) {
  const ativos = (g: TagGrupo | undefined) => g?.tags.filter((t) => t.ativo) ?? []
  const status = grupos?.find((g) => g.tags.some((t) => t.chaveSistema === 'lead'))
  const visitacao = grupos?.find((g) => g.automatico && g !== status)
  return { status: ativos(status), visitacao: ativos(visitacao) }
}

/** Empresas: a carteira, com busca, chips, filtros na URL, tabela (desktop e tablet) e cartões (celular). */
export function ListaDeEmpresas() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const dispositivo = useDispositivo()
  const celular = dispositivo === 'celular'
  // O roteador junta a URL crua com o que `validateSearch` devolveu: valor inválido ainda aparece. Limpa de novo.
  const busca = rota.useSearch({ select: (s) => lerBusca(s) })
  const navegar = rota.useNavigate()

  // O que a pessoa digita aparece na hora; a URL (e a consulta) acompanha depois de uma pausa
  const [texto, setTexto] = useState(busca.busca ?? '')
  const enviado = useRef(busca.busca ?? '')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [marcadas, setMarcadas] = useState<{ chave: string; ids: ReadonlySet<string> }>({
    chave: '',
    ids: new Set(),
  })
  const [aplicando, setAplicando] = useState(false)

  const mudar = (patch: Partial<BuscaDaLista>, voltarParaAPrimeira = true) =>
    void navegar({
      search: (anterior) => {
        const novo: BuscaDaLista = { ...lerBusca(anterior), ...patch }
        if (voltarParaAPrimeira && !('pagina' in patch)) delete novo.pagina
        // valores vazios saem da URL
        for (const [chave, valor] of Object.entries(novo)) {
          if (valor === undefined || valor === '' || valor === false) {
            delete (novo as Record<string, unknown>)[chave]
          }
        }
        if (novo.chip === 'todas') delete novo.chip
        return novo
      },
      replace: true,
    })

  useEffect(() => {
    if (texto.trim() === enviado.current) return
    const espera = setTimeout(() => {
      enviado.current = texto.trim()
      mudar({ busca: texto.trim() || undefined })
    }, ESPERA_DA_BUSCA_MS)
    return () => clearTimeout(espera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  // A URL mudou por fora (Limpar filtros, voltar do navegador): o campo a acompanha
  useEffect(() => {
    const naUrl = busca.busca ?? ''
    if (naUrl !== enviado.current) {
      enviado.current = naUrl
      setTexto(naUrl)
    }
  }, [busca.busca])

  const incluirLeads = busca.incluirLeads === true
  const opcoes = useQuery({
    queryKey: ['carteira', 'opcoes'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.opcoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const tags = useQuery({
    queryKey: ['cadastros', 'tags'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.tags.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const contagens = useQuery({
    queryKey: ['carteira', 'contagens', incluirLeads],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.contagens(incluirLeads)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  // Linhas por página: 25, 50 ou 100, lembrado por tabela nas preferências da pessoa
  const tamanho = usePorPagina('empresas')
  const lista = useQuery({
    queryKey: ['carteira', 'lista', busca, tamanho.porPagina],
    retry: false,
    enabled: tamanho.pronto,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.carteira.listar(consultaDaLista(busca, tamanho.porPagina))
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  // Importar planilha é de administrador e gestor
  const papel = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me }).data?.empresas.find(
    (e) => e.ativa,
  )?.papel
  const quemImporta = papel === 'admin' || papel === 'gestor'
  const importar = () => void navegar({ to: '/importacao/nova' })

  const unicoMembro = opcoes.data?.unicoMembro ?? false
  const filtros = gruposDosFiltros(tags.data)
  const comFiltro = temFiltroAtivo(busca)
  const chip = busca.chip ?? 'todas'
  const abrir = (id: string) =>
    void navegar({ to: '/empresas/$empresaId', params: { empresaId: id } })
  const nova = () => void navegar({ to: '/empresas/nova' })
  const limpar = () => {
    enviado.current = ''
    setTexto('')
    void navegar({
      search: (anterior) => {
        const { chip, incluirLeads } = lerBusca(anterior)
        return { ...(chip ? { chip } : {}), ...(incluirLeads ? { incluirLeads } : {}) }
      },
      replace: true,
    })
  }

  // A seleção vale para a página que se vê: outra busca, filtro ou página começa sem ninguém marcado
  const chaveDaPagina = JSON.stringify(busca)
  const selecionadas: ReadonlySet<string> =
    marcadas.chave === chaveDaPagina ? marcadas.ids : new Set()
  const selecionar = (ids: ReadonlySet<string>) => setMarcadas({ chave: chaveDaPagina, ids })

  const alternar = (id: string) => {
    const novo = new Set(selecionadas)
    if (!novo.delete(id)) novo.add(id)
    selecionar(novo)
  }
  const editaveisDaPagina = (lista.data?.itens ?? []).filter((e) => e.editavel).map((e) => e.id)
  const alternarTodas = () =>
    selecionar(
      editaveisDaPagina.every((id) => selecionadas.has(id))
        ? new Set()
        : new Set(editaveisDaPagina),
    )
  const aplicarTag = async (tagId: string, nome: string) => {
    setAplicando(true)
    const r = await servicos.carteira.aplicarTagEmMassa([...selecionadas], tagId)
    setAplicando(false)
    if (!r.ok) {
      toast.error('Não foi possível aplicar a tag', { description: r.erro.mensagem })
      return
    }
    const { aplicadas, semMudanca, ignoradas } = r.dados
    const partes = [
      semMudanca > 0 ? `${semMudanca} já ${semMudanca === 1 ? 'tinha' : 'tinham'} a tag` : null,
      ignoradas > 0
        ? `${ignoradas} ${ignoradas === 1 ? 'não foi alterada' : 'não foram alteradas'} (fora da sua carteira)`
        : null,
    ].filter(Boolean)
    toast.success(
      aplicadas === 1
        ? `Tag ${nome} aplicada a 1 empresa`
        : `Tag ${nome} aplicada a ${aplicadas} empresas`,
      partes.length > 0 ? { description: `${partes.join('; ')}.` } : {},
    )
    selecionar(new Set())
    await queryClient.invalidateQueries({ queryKey: ['carteira'] })
  }

  const total = lista.data?.total
  const subtitulo =
    total === undefined
      ? ''
      : `${contagemDeEmpresas(total)} ${comFiltro || chip !== 'todas' ? 'com estes filtros' : 'na carteira'}`

  const quantosFiltros = [
    busca.status,
    busca.visitacao,
    busca.vendedor,
    busca.cidade,
    busca.ultimaVisita,
  ].filter(Boolean).length

  const chips = CHIPS_DA_LISTA.filter((c) => !(c === 'minha' && unicoMembro))
  const numeroDoChip = (c: ChipDaLista): number | undefined => {
    const n = contagens.data
    if (!n) return undefined
    return {
      todas: n.todas,
      minha: n.minha,
      sem_visita_90: n.semVisita90,
      nunca_visitadas: n.nuncaVisitadas,
      sem_proxima_atividade: n.semProximaAtividade,
    }[c]
  }

  const selects = (
    <div
      // cada filtro precisa de ~200 px para o texto caber ("Última visita: qualquer"); sem espaço, a barra quebra
      style={
        celular ? undefined : { minWidth: (unicoMembro ? 4 : 5) * 200 + (unicoMembro ? 3 : 4) * 8 }
      }
      className={cn(
        'grid min-w-0 flex-[3] gap-2',
        celular ? 'w-full grid-cols-2' : unicoMembro ? 'grid-cols-4' : 'grid-cols-5',
      )}
    >
      <Select
        aria-label="Status"
        placeholder="Status: todos"
        options={filtros.status.map((t) => ({ value: t.id, label: t.nome }))}
        value={busca.status ?? ''}
        onChange={(e) => mudar({ status: e.target.value || undefined })}
      />
      <Select
        aria-label="Visitação"
        placeholder="Visitação: todas"
        options={filtros.visitacao.map((t) => ({ value: t.id, label: t.nome }))}
        value={busca.visitacao ?? ''}
        onChange={(e) => mudar({ visitacao: e.target.value || undefined })}
      />
      {unicoMembro ? null : (
        <Select
          aria-label="Vendedor"
          placeholder="Vendedor: todos"
          options={(opcoes.data?.vendedores ?? []).map((v) => ({ value: v.id, label: v.nome }))}
          value={busca.vendedor ?? ''}
          onChange={(e) => mudar({ vendedor: e.target.value || undefined })}
        />
      )}
      <Select
        aria-label="Cidade"
        placeholder="Cidade: todas"
        options={(opcoes.data?.cidades ?? []).map((c) => ({
          value: String(c.codigoIbge),
          label: `${c.nome}/${c.uf}`,
        }))}
        value={busca.cidade ? String(busca.cidade) : ''}
        onChange={(e) => mudar({ cidade: e.target.value ? Number(e.target.value) : undefined })}
      />
      <Select
        aria-label="Última visita"
        placeholder="Última visita: qualquer"
        options={OPCOES_DA_ULTIMA_VISITA}
        value={busca.ultimaVisita === undefined ? '' : String(busca.ultimaVisita)}
        onChange={(e) => {
          const v = e.target.value
          mudar({
            ultimaVisita:
              v === '' ? undefined : v === 'nunca' ? 'nunca' : (Number(v) as 30 | 60 | 90),
          })
        }}
      />
    </div>
  )

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
            Empresas
          </h1>
          <span className="text-[13px] text-ink-muted" aria-live="polite">
            {subtitulo}
          </span>
        </div>
        {celular ? null : (
          <>
            {quemImporta ? (
              <Button icon={Upload} onClick={importar}>
                Importar planilha
              </Button>
            ) : null}
            <Button variant="primary" icon={Plus} onClick={nova}>
              Nova empresa
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="Filtros salvos"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0"
        >
          {chips.map((c) => {
            const ligado = chip === c
            const n = numeroDoChip(c)
            return (
              <button
                key={c}
                type="button"
                aria-pressed={ligado}
                onClick={() => mudar({ chip: c })}
                className={cn(
                  'flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap max-md:h-9',
                  ligado
                    ? 'border-brand bg-surface-selected text-brand'
                    : 'border-border-strong bg-surface text-ink hover:bg-surface-hover',
                )}
              >
                {ligado ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : null}
                {ROTULO_DO_CHIP[c]}
                {n === undefined ? null : (
                  <span className="font-medium text-ink-muted tabular-nums">{n}</span>
                )}
              </button>
            )
          })}
        </div>
        <Checkbox
          label="Incluir leads"
          checked={incluirLeads}
          onChange={(e) => mudar({ incluirLeads: e.target.checked || undefined })}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border-border bg-surface p-3 md:border">
        <TextField
          icon={Search}
          placeholder="Nome, CNPJ ou cidade"
          aria-label="Buscar empresas"
          className="min-w-0 flex-1 md:min-w-64 md:flex-[2]"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {celular ? (
          <>
            <Button
              icon={Filter}
              onClick={() => setFiltrosAbertos((a) => !a)}
              aria-expanded={filtrosAbertos}
            >
              {quantosFiltros > 0 ? `Filtros · ${quantosFiltros}` : 'Filtros'}
            </Button>
            <IconButton
              icon={Plus}
              label="Nova empresa"
              variant="secondary"
              size="lg"
              onClick={nova}
            />
          </>
        ) : null}
        {celular && !filtrosAbertos ? null : selects}
        {comFiltro ? (
          <Button variant="ghost" icon={X} onClick={limpar}>
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {!celular && selecionadas.size > 0 ? (
        <BarraDeAcoesEmMassa
          quantidade={selecionadas.size}
          grupos={tags.data ?? []}
          ocupado={aplicando}
          aoAplicar={(tagId, nome) => void aplicarTag(tagId, nome)}
          aoLimpar={() => selecionar(new Set())}
        />
      ) : null}

      <Conteudo
        lista={lista}
        selecionadas={selecionadas}
        aoAlternar={alternar}
        aoAlternarTodas={alternarTodas}
        celular={celular}
        diasDeAlertaDoContato={opcoes.data?.diasAlertaDeContato ?? 60}
        vazioDaCarteira={!comFiltro && chip === 'todas'}
        aoAbrir={abrir}
        aoLimpar={() => {
          limpar()
          mudar({ chip: undefined }, false)
        }}
        aoCriar={nova}
        aoMudarDePagina={(pagina) => mudar({ pagina }, false)}
        aoMudarPorPagina={(n) => {
          tamanho.mudar(n)
          mudar({ pagina: undefined }, false)
        }}
      />
    </PaginaDeTabela>
  )
}

function Conteudo({
  lista,
  selecionadas,
  aoAlternar,
  aoAlternarTodas,
  celular,
  diasDeAlertaDoContato,
  vazioDaCarteira,
  aoAbrir,
  aoLimpar,
  aoCriar,
  aoMudarDePagina,
  aoMudarPorPagina,
}: {
  lista: UseQueryResult<ListaDeEmpresas, Error>
  selecionadas: ReadonlySet<string>
  aoAlternar: (id: string) => void
  aoAlternarTodas: () => void
  celular: boolean
  diasDeAlertaDoContato: number
  vazioDaCarteira: boolean
  aoAbrir: (id: string) => void
  aoLimpar: () => void
  aoCriar: () => void
  aoMudarDePagina: (pagina: number) => void
  aoMudarPorPagina: (porPagina: TamanhoDePagina) => void
}) {
  if (lista.isPending) {
    return (
      <div
        role="status"
        aria-label="Carregando as empresas"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <Skeleton lines={6} />
      </div>
    )
  }
  if (lista.isError) {
    return (
      <Alert
        tone="danger"
        title="Não foi possível carregar as empresas"
        actions={
          <Button size="sm" onClick={() => void lista.refetch()}>
            Tentar de novo
          </Button>
        }
      >
        {lista.error.message}
      </Alert>
    )
  }
  const { itens, total, pagina, porPagina } = lista.data
  if (itens.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        {vazioDaCarteira ? (
          <EmptyState
            icon={Building2}
            title="Sua carteira está vazia"
            description="Cadastre a primeira empresa para começar a acompanhar visitas, contatos e oportunidades."
            actions={
              <Button variant="primary" icon={Plus} onClick={aoCriar}>
                Nova empresa
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Nenhuma empresa com esses filtros"
            description="Revise a busca ou limpe os filtros para ver a carteira inteira."
            actions={<Button onClick={aoLimpar}>Limpar filtros</Button>}
          />
        )}
      </div>
    )
  }
  return (
    <AreaDaTabela
      className={cn(
        'max-md:rounded-none max-md:border-0 max-md:bg-transparent',
        lista.isPlaceholderData && 'opacity-60',
      )}
    >
      <CorpoRolavel>
        {celular ? (
          <CartoesDeEmpresas itens={itens} aoAbrir={aoAbrir} />
        ) : (
          <TabelaDeEmpresas
            itens={itens}
            diasDeAlertaDoContato={diasDeAlertaDoContato}
            aoAbrir={aoAbrir}
            selecionadas={selecionadas}
            aoAlternar={aoAlternar}
            aoAlternarTodas={aoAlternarTodas}
          />
        )}
      </CorpoRolavel>
      <Paginacao
        pagina={pagina}
        porPagina={porPagina}
        total={total}
        aoMudarPagina={aoMudarDePagina}
        aoMudarPorPagina={aoMudarPorPagina}
      />
    </AreaDaTabela>
  )
}
