import type { ListaDeContatos as ListaDeContatosDados, TagGrupo } from '@leadtogo/api-client'
import type { TamanhoDePagina } from '@leadtogo/shared'
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { Filter, Plus, Search, Upload, Users, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePodeImportar } from '@/telas/importacao/comum'
import { useDispositivo } from '@/casca/dispositivo'
import { usePorPagina } from '@/casca/preferencias'
import { Button, IconButton } from '@leadtogo/ui/button'
import { Select, TextField } from '@leadtogo/ui/campos'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Paginacao } from '@leadtogo/ui/paginacao'
import { AreaDaTabela, CorpoDaTabela, PaginaDeTabela } from '@leadtogo/ui/pagina'
import { cn } from '@leadtogo/ui/cn'

import {
  type BuscaDeContatos,
  consultaDeContatos,
  lerBusca,
  quantosFiltros,
  temFiltroAtivo,
} from './busca'
import { FiltroDeEmpresa } from './filtro-de-empresa'
import { CartoesDeContatos, TabelaDeContatos } from './lista-partes'
import { rotaDoContato } from './rotas'

const rota = getRouteApi('/_autenticado/contatos/')

const ESPERA_DA_BUSCA_MS = 300

const contagemDeContatos = (n: number): string => `${n} ${n === 1 ? 'contato' : 'contatos'}`

/** Contatos: a lista da carteira, com busca, filtros na URL, tabela (desktop e tablet) e cartões (celular). */
export function ListaDeContatos() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const podeImportar = usePodeImportar()
  const celular = useDispositivo() === 'celular'
  // O roteador junta a URL crua com o que `validateSearch` devolveu: valor inválido ainda aparece. Limpa de novo.
  const busca = rota.useSearch({ select: (s) => lerBusca(s) })
  const navegarNaLista = rota.useNavigate()

  // O que a pessoa digita aparece na hora; a URL (e a consulta) acompanha depois de uma pausa
  const [texto, setTexto] = useState(busca.busca ?? '')
  const enviado = useRef(busca.busca ?? '')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const mudar = (patch: Partial<BuscaDeContatos>, voltarParaAPrimeira = true) =>
    void navegarNaLista({
      search: (anterior) => {
        const novo: BuscaDeContatos = { ...lerBusca(anterior), ...patch }
        if (voltarParaAPrimeira && !('pagina' in patch)) delete novo.pagina
        // valores vazios saem da URL
        for (const [chave, valor] of Object.entries(novo)) {
          if (valor === undefined || valor === '') delete (novo as Record<string, unknown>)[chave]
        }
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

  const opcoes = useQuery({
    queryKey: ['contatos', 'opcoes'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.contatos.opcoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const papeis = useQuery({
    queryKey: ['cadastros', 'papeis-decisao'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.papeisDecisao.listar()
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
  // Linhas por página: 25, 50 ou 100, lembrado por tabela nas preferências da pessoa
  const tamanho = usePorPagina('contatos')
  const lista = useQuery({
    queryKey: ['contatos', 'lista', busca, tamanho.porPagina],
    retry: false,
    enabled: tamanho.pronto,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.contatos.listar(consultaDeContatos(busca, tamanho.porPagina))
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const comFiltro = temFiltroAtivo(busca)
  const novo = () => void navegar({ to: '/contatos/novo' })
  const abrir = (id: string) => void navegar(rotaDoContato(id))
  const limpar = () => {
    enviado.current = ''
    setTexto('')
    void navegarNaLista({ search: {}, replace: true })
  }

  const cargos = [...(opcoes.data?.cargos ?? [])]
  if (busca.cargo && !cargos.some((c) => c.toLowerCase() === busca.cargo?.toLowerCase())) {
    cargos.push(busca.cargo)
  }
  const gruposDeTags: TagGrupo[] = tags.data ?? []
  const opcoesDeTag = gruposDeTags.flatMap((g) =>
    g.tags.filter((t) => t.ativo).map((t) => ({ value: t.id, label: `${g.nome}: ${t.nome}` })),
  )

  const total = lista.data?.total
  const subtitulo =
    total === undefined
      ? ''
      : `${contagemDeContatos(total)} ${comFiltro ? 'com estes filtros' : 'na carteira'}`
  const filtrosAtivos = quantosFiltros(busca)

  const selects = (
    <div
      className={cn('grid min-w-0 flex-[3] gap-2', celular ? 'w-full grid-cols-2' : 'grid-cols-4')}
      style={celular ? undefined : { minWidth: 4 * 200 + 3 * 8 }}
    >
      <FiltroDeEmpresa valor={busca.empresa} aoMudar={(empresa) => mudar({ empresa })} />
      <Select
        aria-label="Cargo"
        placeholder="Cargo: todos"
        options={cargos.map((c) => ({ value: c, label: c }))}
        value={busca.cargo ?? ''}
        onChange={(e) => mudar({ cargo: e.target.value || undefined })}
      />
      <Select
        aria-label="Papel na decisão"
        placeholder="Papel: todos"
        options={(papeis.data ?? [])
          .filter((p) => p.ativo || p.id === busca.papel)
          .map((p) => ({ value: p.id, label: p.nome }))}
        value={busca.papel ?? ''}
        onChange={(e) => mudar({ papel: e.target.value || undefined })}
      />
      <Select
        aria-label="Tag da empresa"
        placeholder="Tag da empresa: todas"
        options={opcoesDeTag}
        value={busca.tag ?? ''}
        onChange={(e) => mudar({ tag: e.target.value || undefined })}
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
            Contatos
          </h1>
          <span className="text-[13px] text-ink-muted" aria-live="polite">
            {subtitulo}
          </span>
        </div>
        {celular ? null : (
          <>
            {podeImportar ? (
              <Button
                icon={Upload}
                onClick={() =>
                  void navegar({ to: '/importacao/nova', search: { tipo: 'contatos' } })
                }
              >
                Importar planilha
              </Button>
            ) : null}
            <Button variant="primary" icon={Plus} onClick={novo}>
              Novo contato
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border-border bg-surface p-3 md:border">
        <TextField
          icon={Search}
          placeholder="Nome, telefone ou e-mail"
          aria-label="Buscar contatos"
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
              {filtrosAtivos > 0 ? `Filtros · ${filtrosAtivos}` : 'Filtros'}
            </Button>
            <IconButton
              icon={Plus}
              label="Novo contato"
              variant="secondary"
              size="lg"
              onClick={novo}
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

      <Conteudo
        lista={lista}
        celular={celular}
        vazioDaCarteira={!comFiltro}
        aoAbrir={abrir}
        aoLimpar={limpar}
        aoCriar={novo}
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
  celular,
  vazioDaCarteira,
  aoAbrir,
  aoLimpar,
  aoCriar,
  aoMudarDePagina,
  aoMudarPorPagina,
}: {
  lista: UseQueryResult<ListaDeContatosDados, Error>
  celular: boolean
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
        aria-label="Carregando os contatos"
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
        title="Não foi possível carregar os contatos"
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
            icon={Users}
            title="Nenhum contato ainda"
            description="Cadastre as pessoas com quem você fala nas empresas da sua carteira: telefone, e-mail e cargo ficam à mão."
            actions={
              <Button variant="primary" icon={Plus} onClick={aoCriar}>
                Novo contato
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Nenhum contato encontrado"
            description="Revise a busca ou limpe os filtros."
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
      <CorpoDaTabela>
        {celular ? (
          <CartoesDeContatos itens={itens} aoAbrir={aoAbrir} />
        ) : (
          <TabelaDeContatos itens={itens} aoAbrir={aoAbrir} />
        )}
      </CorpoDaTabela>
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
