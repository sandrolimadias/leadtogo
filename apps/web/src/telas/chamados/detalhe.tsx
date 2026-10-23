import type { Chamado, MensagemDoChamado } from '@leadtogo/api-client'
import {
  MAXIMO_DE_ANEXOS_POR_MENSAGEM,
  PRIORIDADES_DO_CHAMADO,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_ESTADO_DE_ANEXO,
  ROTULO_DO_STATUS_DO_CHAMADO,
  TAMANHO_MAXIMO_DO_ANEXO,
  type PrioridadeDoChamado,
  type StatusDoChamado,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Download,
  FileWarning,
  Lock,
  Paperclip,
  RotateCcw,
  Send,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Select, TextArea } from '@/components/ui/campos'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/exibicao'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { PaginaDeTabela } from '@/components/ui/pagina'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

import { useAreasDeAtendimento } from './areas'
import {
  dataHora,
  descreverEvento,
  selosDoPrazo,
  TOM_DA_PRIORIDADE,
  TOM_DO_STATUS,
  tamanhoLegivel,
} from './rotulos'

const TOM_DO_ANEXO = {
  pendente_varredura: 'neutral',
  limpo: 'success',
  infectado: 'danger',
} as const

/** O chamado de verdade vem do servidor; qualquer ação devolve o chamado novo, que entra direto no cache. */
function useChamado(chamadoId: string) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const chave = ['chamados', 'detalhe', chamadoId] as const
  const consulta = useQuery({
    queryKey: chave,
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.obter(chamadoId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const atualizar = (novo: Chamado) => {
    queryClient.setQueryData(chave, novo)
    void queryClient.invalidateQueries({ queryKey: ['chamados', 'lista'] })
  }
  return { consulta, atualizar }
}

/** Uma ação do chamado: roda, mostra o erro em português e atualiza a tela com o resultado. */
function useAcao(atualizar: (c: Chamado) => void) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const executar = async (
    chamada: () => Promise<
      { ok: true; dados: Chamado } | { ok: false; erro: { mensagem: string } }
    >,
    sucesso?: string,
  ): Promise<boolean> => {
    setOcupado(true)
    setErro(null)
    const r = await chamada()
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return false
    }
    atualizar(r.dados)
    if (sucesso) toast.success(sucesso)
    return true
  }
  return { ocupado, erro, executar, limparErro: () => setErro(null) }
}

function Anexo({
  chamadoId,
  anexo,
}: {
  chamadoId: string
  anexo: MensagemDoChamado['anexos'][number]
}) {
  const servicos = useServicos()
  const [baixando, setBaixando] = useState(false)
  const baixar = async () => {
    setBaixando(true)
    const r = await servicos.chamados.anexos.baixar(chamadoId, anexo.id)
    setBaixando(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    window.open(r.dados.url, '_blank', 'noopener')
  }
  const bloqueado = anexo.estado === 'infectado'
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface-sunken px-2 py-1.5 text-[13px]">
      {bloqueado ? (
        <FileWarning size={15} aria-hidden="true" className="text-danger" />
      ) : (
        <Paperclip size={15} aria-hidden="true" className="text-ink-muted" />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{anexo.nome}</span>
      <span className="text-xs text-ink-muted tabular-nums">{tamanhoLegivel(anexo.tamanho)}</span>
      <Badge tone={TOM_DO_ANEXO[anexo.estado]}>{ROTULO_DO_ESTADO_DE_ANEXO[anexo.estado]}</Badge>
      {anexo.estado === 'limpo' ? (
        <Button
          size="sm"
          variant="ghost"
          icon={Download}
          loading={baixando}
          onClick={() => void baixar()}
          aria-label={`Baixar ${anexo.nome}`}
        >
          Baixar
        </Button>
      ) : null}
    </li>
  )
}

function Bolha({ chamadoId, m }: { chamadoId: string; m: MensagemDoChamado }) {
  return (
    <li className="flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-2 text-xs text-ink-muted">
        <strong className="text-[13px] text-ink">{m.autor.nome}</strong>
        <span className="tabular-nums">{dataHora(m.criadoEm)}</span>
      </div>
      <p className="m-0 whitespace-pre-wrap text-sm">{m.corpo}</p>
      {m.anexos.length > 0 ? (
        <ul aria-label="Anexos" className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
          {m.anexos.map((a) => (
            <Anexo key={a.id} chamadoId={chamadoId} anexo={a} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Escrever na conversa, com até 5 arquivos de 25 MB (cada um sobe direto ao armazenamento e passa pelo antivírus). */
function Resposta({ c, aoAtualizar }: { c: Chamado; aoAtualizar: (n: Chamado) => void }) {
  const servicos = useServicos()
  const [corpo, setCorpo] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)

  const escolher = (lista: FileList | null) => {
    if (!lista) return
    const novos = [...arquivos, ...lista].slice(0, MAXIMO_DE_ANEXOS_POR_MENSAGEM)
    const grande = novos.find((a) => a.size > TAMANHO_MAXIMO_DO_ANEXO)
    setErro(
      grande
        ? `"${grande.name}" passa de 25 MB.`
        : arquivos.length + lista.length > MAXIMO_DE_ANEXOS_POR_MENSAGEM
          ? `No máximo ${MAXIMO_DE_ANEXOS_POR_MENSAGEM} arquivos por mensagem.`
          : null,
    )
    setArquivos(novos.filter((a) => a.size <= TAMANHO_MAXIMO_DO_ANEXO))
    if (seletor.current) seletor.current.value = ''
  }

  const enviar = async () => {
    if (!corpo.trim()) return
    setEnviando(true)
    setErro(null)
    const anexoIds: string[] = []
    for (const arquivo of arquivos) {
      const pedido = await servicos.chamados.anexos.pedir(c.id, {
        nome: arquivo.name,
        mime: arquivo.type || 'application/octet-stream',
        tamanho: arquivo.size,
      })
      if (!pedido.ok) return falhar(`${arquivo.name}: ${pedido.erro.mensagem}`)
      const subiu = await servicos.chamados.anexos.enviar(pedido.dados.url, arquivo)
      if (!subiu.ok) return falhar(`${arquivo.name}: ${subiu.erro.mensagem}`)
      const confirmado = await servicos.chamados.anexos.confirmar(c.id, pedido.dados.anexoId)
      if (!confirmado.ok) return falhar(`${arquivo.name}: ${confirmado.erro.mensagem}`)
      anexoIds.push(pedido.dados.anexoId)
    }
    const r = await servicos.chamados.mensagem(c.id, { corpo: corpo.trim(), anexoIds })
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setCorpo('')
    setArquivos([])
    aoAtualizar(r.dados)
  }
  const falhar = (mensagem: string) => {
    setEnviando(false)
    setErro(mensagem)
  }

  return (
    <form
      aria-label="Responder"
      onSubmit={(e) => {
        e.preventDefault()
        void enviar()
      }}
      className="flex flex-col gap-2"
    >
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <TextArea
        label="Responder"
        value={corpo}
        maxLength={10000}
        onChange={(e) => setCorpo(e.target.value)}
        placeholder="Escreva a mensagem"
      />
      {arquivos.length > 0 ? (
        <ul aria-label="Arquivos a enviar" className="m-0 flex list-none flex-col gap-1 p-0">
          {arquivos.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="flex items-center gap-2 rounded-sm border border-border bg-surface-sunken px-2 py-1 text-[13px]"
            >
              <Paperclip size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="text-xs text-ink-muted tabular-nums">{tamanhoLegivel(a.size)}</span>
              <button
                type="button"
                aria-label={`Tirar ${a.name}`}
                className="cursor-pointer border-0 bg-transparent p-0.5 text-ink-muted hover:text-ink"
                onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={seletor}
          type="file"
          multiple
          hidden
          aria-label="Anexar arquivos"
          onChange={(e) => escolher(e.target.files)}
        />
        <Button
          variant="ghost"
          icon={Paperclip}
          disabled={arquivos.length >= MAXIMO_DE_ANEXOS_POR_MENSAGEM}
          onClick={() => seletor.current?.click()}
        >
          Anexar
        </Button>
        <span className="flex-1 text-xs text-ink-muted">
          Até {MAXIMO_DE_ANEXOS_POR_MENSAGEM} arquivos de 25 MB, verificados pelo antivírus.
        </span>
        <Button
          type="submit"
          variant="primary"
          icon={Send}
          loading={enviando}
          disabled={!corpo.trim()}
        >
          Enviar
        </Button>
      </div>
    </form>
  )
}

/** Notas internas: só a equipe vê. Visualmente à parte da conversa, com cadeado e fundo próprio. */
function NotasInternas({ c, aoAtualizar }: { c: Chamado; aoAtualizar: (n: Chamado) => void }) {
  const servicos = useServicos()
  const [corpo, setCorpo] = useState('')
  const acao = useAcao((n) => {
    aoAtualizar(n)
    setCorpo('')
  })
  return (
    <section
      aria-label="Notas internas"
      className="flex flex-col gap-2 rounded-md border border-warning bg-warning-soft px-3 py-3"
    >
      <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-warning">
        <Lock size={15} aria-hidden="true" /> Notas internas · só a equipe vê
      </h2>
      {c.notasInternas.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-muted">Nenhuma nota ainda.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {c.notasInternas.map((n) => (
            <li key={n.id} className="rounded-sm bg-surface px-2.5 py-1.5">
              <div className="flex items-baseline gap-2 text-xs text-ink-muted">
                <strong className="text-[13px] text-ink">{n.autor.nome}</strong>
                <span className="tabular-nums">{dataHora(n.criadoEm)}</span>
              </div>
              <p className="m-0 whitespace-pre-wrap text-sm">{n.corpo}</p>
            </li>
          ))}
        </ul>
      )}
      {acao.erro ? <Alert tone="danger">{acao.erro}</Alert> : null}
      <TextArea
        label="Nova nota interna"
        value={corpo}
        onChange={(e) => setCorpo(e.target.value)}
        placeholder="O cliente não vê esta nota"
      />
      <div>
        <Button
          loading={acao.ocupado}
          disabled={!corpo.trim()}
          onClick={() =>
            void acao.executar(() => servicos.chamados.nota(c.id, { corpo: corpo.trim() }))
          }
        >
          Salvar nota
        </Button>
      </div>
    </section>
  )
}

/** Triagem: define a área, a prioridade e, se quiser, o responsável. */
function Triar({
  c,
  aberto,
  aoFechar,
  aoAtualizar,
}: {
  c: Chamado
  aberto: boolean
  aoFechar: () => void
  aoAtualizar: (n: Chamado) => void
}) {
  const servicos = useServicos()
  const areas = useAreasDeAtendimento()
  const [areaId, setAreaId] = useState(c.area?.id ?? '')
  const [prioridade, setPrioridade] = useState<PrioridadeDoChamado>(c.prioridade)
  const [responsavelId, setResponsavelId] = useState('')
  const atendentes = useQuery({
    queryKey: ['chamados', 'atendentes', areaId],
    enabled: aberto && areaId !== '',
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.atendentes(areaId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const acao = useAcao((n) => {
    aoAtualizar(n)
    aoFechar()
  })
  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => (a ? undefined : aoFechar())}
      title="Triar chamado"
      description="Escolha a área que vai atender. O chamado passa a Pendente."
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={acao.ocupado}
            disabled={!areaId}
            onClick={() =>
              void acao.executar(
                () =>
                  servicos.chamados.triar(c.id, {
                    areaId,
                    prioridade,
                    responsavelId: responsavelId || null,
                  }),
                'Chamado triado',
              )
            }
          >
            Triar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {acao.erro ? <Alert tone="danger">{acao.erro}</Alert> : null}
        <Select
          label="Área"
          required
          value={areaId}
          placeholder="Escolha a área"
          options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
          onChange={(e) => (setAreaId(e.target.value), setResponsavelId(''))}
        />
        <Select
          label="Prioridade"
          value={prioridade}
          options={PRIORIDADES_DO_CHAMADO.map((p) => ({
            value: p,
            label: ROTULO_DA_PRIORIDADE[p],
          }))}
          onChange={(e) => setPrioridade(e.target.value as PrioridadeDoChamado)}
        />
        <Select
          label="Responsável (opcional)"
          value={responsavelId}
          placeholder="Ninguém ainda"
          options={(atendentes.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
          onChange={(e) => setResponsavelId(e.target.value)}
        />
      </div>
    </Dialog>
  )
}

/** Atribuir a outra pessoa da área (ou tirar o responsável). */
function Atribuir({
  c,
  aberto,
  aoFechar,
  aoAtualizar,
}: {
  c: Chamado
  aberto: boolean
  aoFechar: () => void
  aoAtualizar: (n: Chamado) => void
}) {
  const servicos = useServicos()
  const [responsavelId, setResponsavelId] = useState(c.responsavel?.id ?? '')
  const areaId = c.area?.id ?? ''
  const atendentes = useQuery({
    queryKey: ['chamados', 'atendentes', areaId],
    enabled: aberto && areaId !== '',
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.atendentes(areaId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const acao = useAcao((n) => {
    aoAtualizar(n)
    aoFechar()
  })
  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => (a ? undefined : aoFechar())}
      title="Atribuir chamado"
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={acao.ocupado}
            onClick={() =>
              void acao.executar(
                () => servicos.chamados.atribuir(c.id, { responsavelId: responsavelId || null }),
                'Chamado atribuído',
              )
            }
          >
            Atribuir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {acao.erro ? <Alert tone="danger">{acao.erro}</Alert> : null}
        <Select
          label="Responsável"
          value={responsavelId}
          placeholder="Ninguém (tirar o responsável)"
          options={(atendentes.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
          onChange={(e) => setResponsavelId(e.target.value)}
        />
      </div>
    </Dialog>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-muted">{rotulo}</dt>
      <dd className="m-0 text-sm">{children}</dd>
    </div>
  )
}

/** O chamado: dados e prazos ao lado; a conversa, as notas internas e o histórico no centro. */
export function TelaDoChamado({ chamadoId }: { chamadoId: string }) {
  const servicos = useServicos()
  const { consulta, atualizar } = useChamado(chamadoId)
  const acao = useAcao(atualizar)
  const [triando, setTriando] = useState(false)
  const [atribuindo, setAtribuindo] = useState(false)

  if (consulta.isPending) {
    return (
      <PaginaDeTabela>
        <Skeleton lines={6} />
      </PaginaDeTabela>
    )
  }
  if (consulta.isError) {
    return (
      <PaginaDeTabela>
        <Link to="/chamados" className="inline-flex items-center gap-1 text-sm">
          <ArrowLeft size={14} aria-hidden="true" /> Chamados
        </Link>
        <Alert tone="danger">Não consegui abrir o chamado. {consulta.error.message}</Alert>
      </PaginaDeTabela>
    )
  }
  const c = consulta.data
  const a = c.acoes
  const prazos = [
    selosDoPrazo(c.prazoResposta, 'Resposta'),
    selosDoPrazo(c.prazoResolucao, 'Resolução'),
  ].filter((p) => p !== null)

  return (
    <PaginaDeTabela>
      <Link
        to="/chamados"
        className="inline-flex items-center gap-1 text-sm no-underline hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Chamados
      </Link>
      <header className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-ink-subtle">{c.codigo}</span>
        <h1 className="m-0 text-[26px] leading-8 font-semibold max-md:text-[22px]">{c.assunto}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TOM_DO_STATUS[c.status]}>{ROTULO_DO_STATUS_DO_CHAMADO[c.status]}</Badge>
          <Badge tone={TOM_DA_PRIORIDADE[c.prioridade]}>{ROTULO_DA_PRIORIDADE[c.prioridade]}</Badge>
          {prazos.map((p) => (
            <Badge key={p.texto} tone={p.tom}>
              {p.texto}
            </Badge>
          ))}
        </div>
      </header>
      {acao.erro ? <Alert tone="danger">{acao.erro}</Alert> : null}
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 max-lg:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Conversa" className="flex flex-col gap-2">
            <h2 className="m-0 text-base font-semibold">Conversa</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              <li className="flex flex-col gap-1 rounded-md border border-border bg-surface-sunken px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-2 text-xs text-ink-muted">
                  <strong className="text-[13px] text-ink">{c.solicitante.nome}</strong>
                  <span className="tabular-nums">{dataHora(c.criadoEm)}</span>
                  <span>abriu o chamado</span>
                </div>
                <p className="m-0 text-sm whitespace-pre-wrap">{c.descricao ?? 'Sem descrição.'}</p>
              </li>
              {c.mensagens.map((m) => (
                <Bolha key={m.id} chamadoId={c.id} m={m} />
              ))}
            </ul>
            {a.responder ? <Resposta c={c} aoAtualizar={atualizar} /> : null}
          </section>
          {a.notaInterna ? <NotasInternas c={c} aoAtualizar={atualizar} /> : null}
          <section aria-label="Histórico" className="flex flex-col gap-1.5">
            <h2 className="m-0 text-base font-semibold">Histórico</h2>
            <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
              {c.eventos.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2 text-ink-muted">
                  <span className="tabular-nums">{dataHora(e.em)}</span>
                  <span>
                    <strong className="text-ink">{e.ator.nome ?? 'Sistema'}</strong>{' '}
                    {descreverEvento(e)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="flex flex-col gap-4">
          <section
            aria-label="Ações"
            className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
          >
            <h2 className="m-0 text-sm font-semibold">Ações</h2>
            {a.triar ? (
              <Button variant="primary" onClick={() => setTriando(true)}>
                Triar
              </Button>
            ) : null}
            {a.assumir ? (
              <Button
                variant="primary"
                icon={UserRoundCheck}
                loading={acao.ocupado}
                onClick={() =>
                  void acao.executar(
                    () => servicos.chamados.assumir(c.id),
                    'Você assumiu o chamado',
                  )
                }
              >
                Assumir
              </Button>
            ) : null}
            {a.atribuir ? <Button onClick={() => setAtribuindo(true)}>Atribuir…</Button> : null}
            {a.alterarStatus ? (
              <Select
                label="Mudar o estado"
                value=""
                placeholder="Escolha o novo estado"
                options={a.statusPossiveis.map((s) => ({
                  value: s,
                  label: ROTULO_DO_STATUS_DO_CHAMADO[s],
                }))}
                onChange={(e) => {
                  const novo = e.target.value as StatusDoChamado
                  if (novo)
                    void acao.executar(
                      () => servicos.chamados.alterarStatus(c.id, novo),
                      'Estado atualizado',
                    )
                }}
              />
            ) : null}
            {a.alterarStatus || a.triar ? (
              <Select
                label="Prioridade"
                value={c.prioridade}
                options={PRIORIDADES_DO_CHAMADO.map((p) => ({
                  value: p,
                  label: ROTULO_DA_PRIORIDADE[p],
                }))}
                onChange={(e) =>
                  void acao.executar(() =>
                    servicos.chamados.alterar(c.id, {
                      prioridade: e.target.value as PrioridadeDoChamado,
                    }),
                  )
                }
              />
            ) : null}
            {a.reabrir ? (
              <Button
                icon={RotateCcw}
                loading={acao.ocupado}
                onClick={() =>
                  void acao.executar(() => servicos.chamados.reabrir(c.id), 'Chamado reaberto')
                }
              >
                Reabrir
              </Button>
            ) : null}
            {!a.triar && !a.assumir && !a.atribuir && !a.alterarStatus && !a.reabrir ? (
              <p className="m-0 text-[13px] text-ink-muted">
                Nenhuma ação disponível para você agora.
              </p>
            ) : null}
          </section>
          <dl
            className={cn(
              'm-0 grid grid-cols-2 gap-3 rounded-md border border-border bg-surface p-3',
            )}
          >
            <Dado rotulo="Área">{c.area?.nome ?? 'A definir na triagem'}</Dado>
            <Dado rotulo="Responsável">{c.responsavel?.nome ?? 'Ninguém ainda'}</Dado>
            <Dado rotulo="Solicitante">{c.solicitante.nome}</Dado>
            <Dado rotulo="Empresa">{c.empresaCliente?.nome ?? '—'}</Dado>
            <Dado rotulo="Aberto em">{dataHora(c.criadoEm)}</Dado>
            <Dado rotulo="Primeira resposta">
              {c.primeiraRespostaEm ? dataHora(c.primeiraRespostaEm) : '—'}
            </Dado>
            {c.resolvidoEm ? <Dado rotulo="Resolvido em">{dataHora(c.resolvidoEm)}</Dado> : null}
            {c.reaberturas > 0 ? <Dado rotulo="Reaberturas">{c.reaberturas}</Dado> : null}
          </dl>
          {c.prazoResposta || c.prazoResolucao ? (
            <dl className="m-0 flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-[13px]">
              {[
                ['Prazo de resposta', c.prazoResposta],
                ['Prazo de resolução', c.prazoResolucao],
              ].map(([nome, p]) =>
                p && typeof p !== 'string' ? (
                  <Dado key={nome as string} rotulo={nome as string}>
                    meta {p.metaMin} min úteis · consumido {Math.round(p.consumidoMin)} min
                    {p.venceEm && !p.cumpridoEm ? ` · vence ${dataHora(p.venceEm)}` : ''}
                    {p.pausado ? ' · pausado (aguardando cliente)' : ''}
                  </Dado>
                ) : null,
              )}
            </dl>
          ) : null}
        </aside>
      </div>
      <Triar c={c} aberto={triando} aoFechar={() => setTriando(false)} aoAtualizar={atualizar} />
      <Atribuir
        c={c}
        aberto={atribuindo}
        aoFechar={() => setAtribuindo(false)}
        aoAtualizar={atualizar}
      />
    </PaginaDeTabela>
  )
}
