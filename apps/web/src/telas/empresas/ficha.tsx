import type { ConsultaDaReceitaDaEmpresa, EmpresaCarteira } from '@leadtogo/api-client'
import { linkDeLigacao, linkDoWhatsapp } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import {
  Building2,
  Check,
  ChevronRight,
  Ellipsis,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Button, IconButton } from '@/components/ui/button'
import { type CorDeTag } from '@/components/ui/cores'
import { Avatar, Badge, Tag } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Menu } from '@/components/ui/menu'
import { ConteudoDaAba, Tabs } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'

import { dataCurta, diasDesde, linkDeRota, tempoRelativo } from './formatos'
import { ComparacaoComAReceita } from './ficha-receita'
import { EditarTags } from './ficha-tags'
import { HistoricoDaEmpresaAba } from './ficha-historico'
import { Cartao, CnaesDaEmpresa, DadosCadastrais, SociosDaEmpresa } from './ficha-resumo'

const rota = getRouteApi('/_autenticado/empresas/$empresaId')

const ABAS = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'historico', label: 'Histórico' },
]

/** Botão-ícone que é um link (Ligar, WhatsApp): o `IconButton` é um <button>, e aqui o destino é um endereço. */
export function LinkDeIcone({
  href,
  label,
  icone: Icone,
  semDestino,
}: {
  href: string | null
  label: string
  icone: typeof Phone
  /** Dica quando o botão está desativado */
  semDestino?: string
}) {
  const classes =
    'inline-flex size-(--ctl) shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface text-ink'
  return href ? (
    <a
      href={href}
      aria-label={label}
      title={label}
      className={cn(classes, 'hover:bg-surface-hover')}
    >
      <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
    </a>
  ) : (
    <span
      role="link"
      aria-disabled="true"
      aria-label={label}
      title={semDestino ? `${label}: ${semDestino}` : `${label}: a empresa não tem telefone`}
      className={cn(classes, 'cursor-not-allowed opacity-45')}
    >
      <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
}

function Resumo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-medium text-ink-muted">{rotulo}</span>
      <span className="font-semibold">{children}</span>
    </div>
  )
}

function DataComRelativo({ iso }: { iso: string | null }) {
  if (!iso) return <>Nunca</>
  return (
    <span className="tabular-nums">
      {dataCurta(iso)}{' '}
      <span className="font-normal text-ink-muted">{tempoRelativo(diasDesde(iso))}</span>
    </span>
  )
}

/** Ficha da empresa: cabeçalho, faixa de resumo e as abas Resumo e Histórico. */
export function FichaDaEmpresa() {
  const { empresaId } = rota.useParams()
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const celular = useDispositivo() === 'celular'

  const [aba, setAba] = useState('resumo')
  const [editandoTags, setEditandoTags] = useState(false)
  const [salvandoTags, setSalvandoTags] = useState(false)
  const [erroDasTags, setErroDasTags] = useState<string>()
  const [consultandoReceita, setConsultandoReceita] = useState(false)
  const [comparacao, setComparacao] = useState<ConsultaDaReceitaDaEmpresa | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [erroAoAplicar, setErroAoAplicar] = useState<string>()
  const [excluindo, setExcluindo] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erroDaExclusao, setErroDaExclusao] = useState<string>()

  const consulta = useQuery({
    queryKey: ['carteira', 'empresa', empresaId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.detalhar(empresaId)
      if (!r.ok) throw Object.assign(new Error(r.erro.mensagem), { status: r.erro.status })
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
  }).data
  const grupos = useQuery({
    queryKey: ['cadastros', 'tags'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.tags.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  }).data

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['carteira'] })
  const voltar = () => void navegar({ to: '/empresas' })

  if (consulta.isPending) {
    return (
      <main className="flex w-full max-w-[1400px] flex-col gap-4 p-6 max-md:p-4">
        <div
          role="status"
          aria-label="Carregando a empresa"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton lines={6} />
        </div>
      </main>
    )
  }
  if (consulta.isError) {
    const naoExiste = (consulta.error as { status?: number }).status === 404
    return (
      <main className="flex w-full max-w-[1400px] flex-col gap-4 p-6 max-md:p-4">
        <div className="rounded-lg border border-border bg-surface">
          {naoExiste ? (
            <EmptyState
              icon={Building2}
              title="Empresa não encontrada"
              description="Ela pode ter sido excluída ou estar na carteira de outro vendedor."
              actions={<Button onClick={voltar}>Voltar para Empresas</Button>}
            />
          ) : (
            <Alert
              tone="danger"
              title="Não foi possível carregar a empresa"
              actions={
                <Button size="sm" onClick={() => void consulta.refetch()}>
                  Tentar de novo
                </Button>
              }
            >
              {consulta.error.message}
            </Alert>
          )}
        </div>
      </main>
    )
  }

  const e: EmpresaCarteira = consulta.data
  const telefone = e.telefones.find((t) => t.principal) ?? e.telefones[0]
  const ligar = telefone ? linkDeLigacao(telefone.e164) : null
  const whatsapp = telefone ? linkDoWhatsapp(telefone.e164) : null
  const enderecoRota = [
    [e.endereco.tipoLogradouro, e.endereco.logradouro].filter(Boolean).join(' '),
    e.endereco.numero,
    e.endereco.bairro,
    e.endereco.municipio ? `${e.endereco.municipio.nome} - ${e.endereco.municipio.uf}` : null,
    e.endereco.cep,
  ]
    .filter(Boolean)
    .join(', ')
  const rotaNoMapa = e.endereco.logradouro ? linkDeRota(enderecoRota) : null
  const mostraVendedor = opcoes ? !opcoes.unicoMembro : false
  const eCnpj = e.tipoDocumento === 'cnpj'

  const salvarTags = async (tagIds: string[]) => {
    setSalvandoTags(true)
    setErroDasTags(undefined)
    const r = await servicos.carteira.definirTags(e.id, tagIds)
    setSalvandoTags(false)
    if (!r.ok) {
      setErroDasTags(r.erro.mensagem)
      return
    }
    setEditandoTags(false)
    toast.success('Tags salvas')
    await atualizar()
  }

  const excluir = async () => {
    setExcluindo(true)
    setErroDaExclusao(undefined)
    const r = await servicos.carteira.excluir(e.id)
    setExcluindo(false)
    if (!r.ok) {
      setErroDaExclusao(r.erro.mensagem)
      return
    }
    toast.success('Empresa excluída', { description: `${e.nome} saiu da carteira.` })
    setConfirmandoExclusao(false)
    queryClient.removeQueries({ queryKey: ['carteira', 'empresa', e.id] })
    await queryClient.invalidateQueries({ queryKey: ['carteira'] })
    voltar()
  }

  const itensDoMenu = [
    ...(e.permissoes.editar
      ? [
          {
            icon: Pencil,
            label: 'Editar',
            onSelect: () =>
              void navegar({ to: '/empresas/$empresaId/editar', params: { empresaId: e.id } }),
          },
        ]
      : []),
    ...(e.permissoes.editar && e.permissoes.excluir ? [{ separator: true as const }] : []),
    ...(e.permissoes.excluir
      ? [
          {
            icon: Trash2,
            label: 'Excluir',
            danger: true,
            onSelect: () => {
              setErroDaExclusao(undefined)
              setConfirmandoExclusao(true)
            },
          },
        ]
      : []),
  ]

  const consultarReceita = async () => {
    setConsultandoReceita(true)
    const r = await servicos.carteira.consultarReceitaDaEmpresa(e.id)
    setConsultandoReceita(false)
    if (!r.ok) {
      toast.error('Não foi possível consultar a Receita', { description: r.erro.mensagem })
      return
    }
    setErroAoAplicar(undefined)
    setComparacao(r.dados)
    await atualizar() // a data e a situação já foram renovadas
  }

  const aplicarReceita = async () => {
    setAplicando(true)
    setErroAoAplicar(undefined)
    const r = await servicos.carteira.aplicarReceitaDaEmpresa(e.id)
    setAplicando(false)
    if (!r.ok) {
      setErroAoAplicar(r.erro.mensagem)
      return
    }
    setComparacao(null)
    toast.success('Dados atualizados pela Receita')
    await atualizar()
  }

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-3 bg-surface px-6 pt-5 pb-3 max-md:px-4">
        {celular ? null : (
          <nav
            aria-label="Você está em"
            className="flex items-center gap-1.5 text-[13px] text-ink-muted"
          >
            <Link to="/empresas" className="text-ink-muted">
              Empresas
            </Link>
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-ink">{e.nome}</span>
          </nav>
        )}
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[22px] leading-7 font-semibold tracking-[-0.01em]">
                {e.nome}
              </h1>
              {e.matrizFilial ? (
                <Badge tone="outline">{e.matrizFilial === 'matriz' ? 'Matriz' : 'Filial'}</Badge>
              ) : null}
              {eCnpj && e.receita ? (
                e.receita.ativa ? (
                  <Badge tone="success" icon={Check}>
                    Ativa na Receita
                  </Badge>
                ) : (
                  <Badge tone="danger" icon={TriangleAlert}>
                    {e.receita.situacao} na Receita
                  </Badge>
                )
              ) : null}
              {e.situacaoNaoVerificada ? (
                <Badge tone="warning" icon={TriangleAlert}>
                  Situação não verificada
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
              {e.nomeFantasia ? <span>{e.razaoSocial}</span> : null}
              {e.documento ? (
                <span className="font-mono text-xs">
                  {e.tipoDocumento === 'cpf'
                    ? e.documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
                    : e.documento.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')}
                </span>
              ) : (
                <span>Sem documento</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {e.tags.map((t) => (
                <Tag key={t.id} color={t.cor as CorDeTag}>
                  {t.nome}
                </Tag>
              ))}
              {e.permissoes.editar && grupos ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Pencil}
                  onClick={() => {
                    setErroDasTags(undefined)
                    setEditandoTags(true)
                  }}
                >
                  Editar tags
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {celular ? null : (
              <>
                <LinkDeIcone href={ligar} label="Ligar" icone={Phone} />
                <LinkDeIcone href={whatsapp} label="WhatsApp" icone={MessageCircle} />
              </>
            )}
            {itensDoMenu.length > 0 ? (
              <Menu
                align="end"
                items={itensDoMenu}
                trigger={<IconButton icon={Ellipsis} label="Mais ações" variant="secondary" />}
              />
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-x-6 gap-y-3 border-t border-border pt-3 text-sm max-md:grid-cols-2">
          {mostraVendedor ? (
            <Resumo rotulo="Vendedor">
              <span className="flex items-center gap-1.5">
                <Avatar name={e.vendedor.nome} size="sm" />
                {e.vendedor.nome}
              </span>
            </Resumo>
          ) : null}
          <Resumo rotulo="Vertical">{e.vertical?.nome ?? '—'}</Resumo>
          <Resumo rotulo="Última visita">
            <DataComRelativo iso={e.ultimaVisitaEm} />
          </Resumo>
          <Resumo rotulo="Último contato">
            <DataComRelativo iso={e.ultimoContatoEm} />
          </Resumo>
          <Resumo rotulo="Próxima atividade">
            {e.proximaAtividadeEm ? dataCurta(e.proximaAtividadeEm) : '—'}
          </Resumo>
        </div>

        {celular ? (
          <div className="grid grid-cols-3 gap-2" data-density="touch">
            {[
              { rotulo: 'Ligar', href: ligar, icone: Phone, cor: 'text-tag-blue-fg' },
              {
                rotulo: 'WhatsApp',
                href: whatsapp,
                icone: MessageCircle,
                cor: 'text-tag-green-fg',
              },
              { rotulo: 'Rota', href: rotaNoMapa, icone: Navigation, cor: 'text-tag-orange-fg' },
            ].map((q) => {
              const classes =
                'flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface text-[13px] font-semibold text-ink'
              const Icone = q.icone
              const conteudo = (
                <>
                  <span className={cn('flex', q.cor)}>
                    <Icone size={20} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  {q.rotulo}
                </>
              )
              return q.href ? (
                <a
                  key={q.rotulo}
                  href={q.href}
                  className={classes}
                  target={q.href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                >
                  {conteudo}
                </a>
              ) : (
                <span
                  key={q.rotulo}
                  role="link"
                  aria-disabled="true"
                  className={cn(classes, 'cursor-not-allowed opacity-45')}
                >
                  {conteudo}
                </span>
              )
            })}
          </div>
        ) : null}
      </header>

      <Tabs
        label="Seções da empresa"
        items={ABAS}
        value={aba}
        onChange={setAba}
        className="flex flex-col [&>[role=tablist]]:bg-surface [&>[role=tablist]]:px-6 max-md:[&>[role=tablist]]:px-4"
      >
        <main className="flex flex-col gap-4 p-6 max-md:p-4">
          <ConteudoDaAba
            value="resumo"
            className="grid grid-cols-[1.7fr_1fr] items-start gap-4 max-lg:grid-cols-1"
          >
            <div className="flex min-w-0 flex-col gap-4">
              <Cartao
                titulo="Dados cadastrais"
                direita={
                  eCnpj ? (
                    <>
                      <span className="text-xs text-ink-muted">
                        {e.receitaAtualizadoEm
                          ? `Receita em ${dataCurta(e.receitaAtualizadoEm)}`
                          : 'Sem consulta à Receita'}
                      </span>
                      {e.permissoes.editar ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={RefreshCw}
                          loading={consultandoReceita}
                          onClick={() => void consultarReceita()}
                        >
                          {consultandoReceita ? 'Consultando Receita…' : 'Atualizar pela Receita'}
                        </Button>
                      ) : null}
                    </>
                  ) : undefined
                }
              >
                <DadosCadastrais e={e} />
              </Cartao>
              <Cartao
                titulo="CNAEs"
                semMargem
                direita={<span className="text-xs text-ink-muted">{e.cnaes.length}</span>}
              >
                <CnaesDaEmpresa cnaes={e.cnaes} />
              </Cartao>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {e.socios.length > 0 ? (
                <Cartao titulo="Sócios" semMargem>
                  <SociosDaEmpresa socios={e.socios} />
                </Cartao>
              ) : null}
              <Cartao titulo="Observações">
                {e.observacoes ? (
                  <p className="m-0 text-sm [text-wrap:pretty] whitespace-pre-wrap">
                    {e.observacoes}
                  </p>
                ) : (
                  <p className="m-0 text-sm text-ink-muted">Nenhuma observação.</p>
                )}
              </Cartao>
            </div>
          </ConteudoDaAba>
          <ConteudoDaAba value="historico">
            <HistoricoDaEmpresaAba empresaId={e.id} />
          </ConteudoDaAba>
        </main>
      </Tabs>

      {editandoTags && grupos ? (
        <EditarTags
          aberto
          aoFechar={() => setEditandoTags(false)}
          empresa={e}
          grupos={grupos}
          salvando={salvandoTags}
          erro={erroDasTags}
          aoSalvar={(ids) => void salvarTags(ids)}
        />
      ) : null}
      <DialogoDeConfirmacao
        aberto={confirmandoExclusao}
        titulo="Excluir esta empresa?"
        descricao={`${e.nome} sai da carteira e deixa de aparecer nas listas. Por enquanto não há lixeira para recuperá-la.`}
        rotuloDoBotao="Excluir empresa"
        erro={erroDaExclusao}
        enviando={excluindo}
        aoConfirmar={() => void excluir()}
        aoFechar={() => setConfirmandoExclusao(false)}
      />
      {comparacao ? (
        <ComparacaoComAReceita
          consulta={comparacao}
          nome={e.nome}
          aplicando={aplicando}
          erro={erroAoAplicar}
          aoAplicar={() => void aplicarReceita()}
          aoManter={() => setComparacao(null)}
        />
      ) : null}
    </div>
  )
}
