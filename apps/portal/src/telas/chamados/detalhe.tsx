import type { ChamadoDoPortal, MensagemDoPortal } from '@leadtogo/api-client'
import {
  MAXIMO_DE_ANEXOS_POR_MENSAGEM,
  ROTULO_DO_ESTADO_DE_ANEXO,
  TAMANHO_MAXIMO_DO_ANEXO,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Download, Paperclip, RotateCcw, Send, Star, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextArea } from '@leadtogo/ui/campos'
import { cn } from '@leadtogo/ui/cn'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { Badge } from '@leadtogo/ui/exibicao'
import { FormularioDinamico } from '@leadtogo/ui/formulario'
import { toast } from '@leadtogo/ui/toast'

import { dataEHora, tamanhoLegivel } from '@/casca/rotulos'
import { EstadoDoChamado } from '@/components/estado-do-chamado'
import { useServicos } from '@/servicos/contexto'
import type { Resultado } from '@/servicos/resultado'

const TOM_DO_ANEXO = {
  pendente_varredura: 'neutral',
  limpo: 'success',
  infectado: 'danger',
} as const

/** O chamado vem do servidor; toda ação devolve o chamado novo, que entra direto no cache. */
function useChamado(id: string) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const chave = ['chamados', 'detalhe', id] as const
  const consulta = useQuery({
    queryKey: chave,
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.obter(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const atualizar = (novo: ChamadoDoPortal) => {
    queryClient.setQueryData(chave, novo)
    void queryClient.invalidateQueries({ queryKey: ['chamados', 'lista'] })
    void queryClient.invalidateQueries({ queryKey: ['inicio'] })
  }
  return { consulta, atualizar }
}

function Anexo({
  chamadoId,
  anexo,
}: {
  chamadoId: string
  anexo: MensagemDoPortal['anexos'][number]
}) {
  const servicos = useServicos()
  const baixar = async () => {
    const r = await servicos.chamados.baixar(chamadoId, anexo.id)
    if (!r.ok) toast.error(r.erro.mensagem)
    else window.location.assign(r.dados.url)
  }
  const liberado = anexo.estado === 'limpo'
  return (
    <li className="flex items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-sm">
      <Paperclip size={14} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{anexo.nome}</span>
      <span className="text-xs text-ink-muted">{tamanhoLegivel(anexo.tamanho)}</span>
      {liberado ? (
        <Button
          size="sm"
          variant="ghost"
          icon={Download}
          onClick={() => void baixar()}
          aria-label={`Baixar ${anexo.nome}`}
        />
      ) : (
        <Badge tone={TOM_DO_ANEXO[anexo.estado]}>{ROTULO_DO_ESTADO_DE_ANEXO[anexo.estado]}</Badge>
      )}
    </li>
  )
}

function Mensagem({ chamadoId, m }: { chamadoId: string; m: MensagemDoPortal }) {
  return (
    <li className={cn('flex flex-col gap-1', m.autor.voce ? 'items-end' : 'items-start')}>
      <span className="text-xs leading-4 text-ink-muted">
        <strong className="text-ink">{m.autor.voce ? 'Você' : m.autor.nome}</strong>
        {m.autor.daEquipe ? ' · equipe' : ''} · {dataEHora(m.criadoEm)}
      </span>
      <div
        className={cn(
          'max-w-[85%] rounded-md px-3 py-2 text-sm leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]',
          m.autor.voce
            ? 'bg-brand-soft'
            : m.autor.daEquipe
              ? 'border border-border bg-surface'
              : 'bg-surface-sunken',
        )}
      >
        {m.corpo}
      </div>
      {m.anexos.length > 0 ? (
        <ul aria-label="Anexos" className="m-0 flex max-w-[85%] list-none flex-col gap-1 p-0">
          {m.anexos.map((a) => (
            <Anexo key={a.id} chamadoId={chamadoId} anexo={a} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Escrever na conversa: texto e até 5 anexos (cada um sobe ao escolher, antes de enviar a mensagem). */
function Resposta({
  chamado,
  atualizar,
}: {
  chamado: ChamadoDoPortal
  atualizar: (c: ChamadoDoPortal) => void
}) {
  const servicos = useServicos()
  const entrada = useRef<HTMLInputElement>(null)
  const [corpo, setCorpo] = useState('')
  const [anexos, setAnexos] = useState<{ anexoId: string; nome: string }[]>([])
  const [subindo, setSubindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const escolher = async (arquivos: FileList | null) => {
    if (!arquivos) return
    setErro(null)
    for (const arquivo of Array.from(arquivos)) {
      if (anexos.length >= MAXIMO_DE_ANEXOS_POR_MENSAGEM) {
        setErro(`Até ${MAXIMO_DE_ANEXOS_POR_MENSAGEM} anexos por mensagem.`)
        break
      }
      if (arquivo.size > TAMANHO_MAXIMO_DO_ANEXO) {
        setErro(`${arquivo.name} passa de 25 MB.`)
        continue
      }
      setSubindo(true)
      const r = await servicos.chamados.anexar(chamado.id, arquivo)
      setSubindo(false)
      if (!r.ok) {
        setErro(r.erro.mensagem)
        break
      }
      setAnexos((atual) => [...atual, r.dados])
    }
    if (entrada.current) entrada.current.value = ''
  }

  const enviar = async () => {
    setEnviando(true)
    setErro(null)
    const r = await servicos.chamados.responder(chamado.id, {
      corpo: corpo.trim(),
      anexoIds: anexos.map((a) => a.anexoId),
    })
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setCorpo('')
    setAnexos([])
    atualizar(r.dados)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      {erro ? <Alert tone="danger" title={erro} /> : null}
      <TextArea
        aria-label="Sua resposta"
        placeholder="Escreva a sua resposta"
        maxLength={10000}
        value={corpo}
        onChange={(e) => setCorpo(e.target.value)}
      />
      {anexos.length > 0 ? (
        <ul aria-label="Anexos desta mensagem" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {anexos.map((a) => (
            <li
              key={a.anexoId}
              className="flex items-center gap-1 rounded-sm bg-surface-sunken px-2 py-1 text-xs"
            >
              {a.nome}
              <button
                type="button"
                aria-label={`Tirar ${a.nome}`}
                className="cursor-pointer border-0 bg-transparent p-0 text-ink-muted"
                onClick={() => setAnexos((atual) => atual.filter((x) => x.anexoId !== a.anexoId))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          aria-label="Escolher arquivos"
          onChange={(e) => void escolher(e.target.files)}
        />
        <Button icon={Paperclip} loading={subindo} onClick={() => entrada.current?.click()}>
          Anexar
        </Button>
        <Button
          variant="primary"
          icon={Send}
          loading={enviando}
          disabled={corpo.trim().length === 0 || subindo}
          onClick={() => void enviar()}
        >
          Enviar
        </Button>
      </div>
    </div>
  )
}

function Estrelas({ valor, onChange }: { valor: number; onChange?: (n: number) => void }) {
  return (
    <div role="group" aria-label="Nota de 1 a 5" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          aria-pressed={valor >= n}
          onClick={() => onChange?.(n)}
          className="cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default"
        >
          <Star
            size={22}
            strokeWidth={1.75}
            className={valor >= n ? 'fill-warning text-warning' : 'text-ink-subtle'}
          />
        </button>
      ))}
    </div>
  )
}

/** A pesquisa de satisfação (Fase 4F): o formulário que a equipe escolheu, no lugar das estrelas. */
function PesquisaDeSatisfacao({
  chamado,
  atualizar,
}: {
  chamado: ChamadoDoPortal
  atualizar: (c: ChamadoDoPortal) => void
}) {
  const servicos = useServicos()
  const [enviando, setEnviando] = useState(false)
  const formularioId = chamado.pesquisa?.formularioId ?? ''
  const f = useQuery({
    queryKey: ['formulario', formularioId],
    enabled: formularioId !== '',
    retry: false,
    queryFn: async () => {
      const r = await servicos.formularios.abrir(formularioId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (f.isError) return <Alert tone="danger" title={f.error.message} />
  if (!f.data) return <Skeleton lines={3} />
  const dados = f.data
  return (
    <section aria-label="Pesquisa de satisfação" className="flex flex-col gap-2">
      <p className="m-0 text-sm font-semibold">Como foi o atendimento? Responda a pesquisa.</p>
      <FormularioDinamico
        definicao={dados.definicao}
        preenchidos={dados.preenchidos}
        travados={dados.travados}
        enviando={enviando}
        aoEnviar={async (botao, respostas) => {
          setEnviando(true)
          const r = await servicos.chamados.responderPesquisa(chamado.id, {
            versao: dados.versao,
            botao,
            respostas,
          })
          setEnviando(false)
          if (!r.ok) {
            return {
              mensagem: r.erro.mensagem,
              ...(r.erro.detalhes
                ? { erros: Object.fromEntries(r.erro.detalhes.map((d) => [d.campo, d.mensagem])) }
                : {}),
            }
          }
          toast.success('Obrigado por responder a pesquisa')
          atualizar(r.dados)
          return undefined
        }}
      />
    </section>
  )
}

/** Chamado resolvido ou fechado: reabrir (até 7 dias) e avaliar (uma vez). */
function Encerramento({
  chamado,
  atualizar,
}: {
  chamado: ChamadoDoPortal
  atualizar: (c: ChamadoDoPortal) => void
}) {
  const servicos = useServicos()
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const rodar = async (chamada: () => Promise<Resultado<ChamadoDoPortal>>, sucesso: string) => {
    setOcupado(true)
    setErro(null)
    const r = await chamada()
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(sucesso)
    atualizar(r.dados)
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {erro ? <Alert tone="danger" title={erro} /> : null}
      {chamado.acoes.reabrir ? (
        <Alert
          tone="info"
          title="Este chamado foi resolvido."
          actions={
            <Button
              icon={RotateCcw}
              loading={ocupado}
              onClick={() =>
                void rodar(() => servicos.chamados.reabrir(chamado.id), 'Chamado reaberto')
              }
            >
              Reabrir
            </Button>
          }
        >
          O problema continua? Reabra em até 7 dias. Depois disso, abra um novo chamado.
        </Alert>
      ) : (
        <Alert
          tone="info"
          title={
            chamado.estado === 'fechado'
              ? 'Este chamado está fechado.'
              : 'Este chamado foi resolvido.'
          }
        >
          Se precisar de algo mais, abra um novo chamado.
        </Alert>
      )}
      {chamado.avaliacao ? (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-sm font-semibold">Sua avaliação</p>
          <Estrelas valor={chamado.avaliacao.nota} />
          {chamado.avaliacao.comentario ? (
            <p className="m-0 text-sm text-ink-muted">{chamado.avaliacao.comentario}</p>
          ) : null}
        </div>
      ) : chamado.pesquisa ? (
        <PesquisaDeSatisfacao chamado={chamado} atualizar={atualizar} />
      ) : chamado.acoes.avaliar ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm font-semibold">Como foi o atendimento?</p>
          <Estrelas valor={nota} onChange={setNota} />
          <TextArea
            aria-label="Comentário"
            placeholder="Quer comentar? (opcional)"
            maxLength={2000}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={ocupado}
              disabled={nota === 0}
              onClick={() =>
                void rodar(
                  () =>
                    servicos.chamados.avaliar(chamado.id, {
                      nota,
                      comentario: comentario.trim() || null,
                    }),
                  'Obrigado pela avaliação',
                )
              }
            >
              Enviar avaliação
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** O chamado: dados, conversa e o que o cliente pode fazer agora. Nada interno da equipe aparece aqui. */
export function TelaDetalheDoChamado({ chamadoId }: { chamadoId: string }) {
  const { consulta, atualizar } = useChamado(chamadoId)
  const chamado = consulta.data
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <Link
        to="/chamados"
        className="inline-flex items-center gap-1 text-sm text-ink-muted no-underline"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Chamados
      </Link>
      {consulta.isError ? (
        <Alert tone="danger" title="Chamado não encontrado.">
          Ele pode ser de outra empresa ou não existir mais.
        </Alert>
      ) : !chamado ? (
        <Skeleton lines={5} />
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <p className="m-0 flex items-center gap-2 text-xs leading-4 text-ink-muted">
              <span className="font-mono">{chamado.codigo}</span>
              {chamado.area ? <span>· {chamado.area}</span> : null}
              <span>
                · aberto por {chamado.abertoPor} em {dataEHora(chamado.criadoEm)}
              </span>
            </p>
            <h1 className="m-0 text-xl leading-7 font-semibold">{chamado.assunto}</h1>
            <div>
              <EstadoDoChamado estado={chamado.estado} />
            </div>
            {chamado.descricao ? (
              <p className="m-0 text-sm leading-5 whitespace-pre-wrap text-ink-muted [overflow-wrap:anywhere]">
                {chamado.descricao}
              </p>
            ) : null}
          </header>
          {chamado.estado === 'aguardando_voce' ? (
            <Alert tone="warning" title="A equipe aguarda a sua resposta.">
              Responda abaixo para o atendimento continuar.
            </Alert>
          ) : null}
          <section aria-label="Conversa" className="flex flex-col gap-4">
            {chamado.mensagens.length === 0 ? (
              <p className="m-0 text-sm text-ink-muted">
                Ainda não há mensagens. A equipe responde por aqui.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {chamado.mensagens.map((m) => (
                  <Mensagem key={m.id} chamadoId={chamado.id} m={m} />
                ))}
              </ul>
            )}
          </section>
          {chamado.acoes.responder ? (
            <Resposta chamado={chamado} atualizar={atualizar} />
          ) : (
            <Encerramento chamado={chamado} atualizar={atualizar} />
          )}
        </>
      )}
    </div>
  )
}
