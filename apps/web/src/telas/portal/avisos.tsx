import type { Aviso } from '@leadtogo/api-client'
import {
  ROTULO_DA_SITUACAO_DO_AVISO,
  type SituacaoDoAviso,
  TAMANHO_MAXIMO_DO_AVISO,
} from '@leadtogo/shared'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Send, Smartphone, XCircle } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { TextArea, TextField } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge, type TomDoBadge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'
import { toast } from '@leadtogo/ui/toast'

import { dataHora } from '../chamados/rotulos'

import { SelecaoDeEmpresas } from './selecao-de-empresas'

const TOM: Record<SituacaoDoAviso, TomDoBadge> = {
  agendado: 'info',
  enviado: 'success',
  cancelado: 'neutral',
}

/** `datetime-local` (hora do navegador) → ISO com fuso; vazio ou inválido → null. */
const paraIso = (local: string): string | null => {
  const data = new Date(local)
  return local && !Number.isNaN(data.getTime()) ? data.toISOString() : null
}

const audiencia = (a: Aviso): string =>
  a.alcance === 'todos'
    ? 'Todos os clientes'
    : `${a.empresas.length} ${a.empresas.length === 1 ? 'empresa' : 'empresas'}`

/** Como o aviso chega no celular: a mensagem inteira, sem corte. */
function Previa({ mensagem, urgente }: { mensagem: string; urgente: boolean }) {
  return (
    <figure
      aria-label="Como chega no celular"
      className="m-0 flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-3"
    >
      <figcaption className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <Smartphone size={14} aria-hidden="true" /> Como chega no celular
      </figcaption>
      <div className="flex gap-3 rounded-md bg-surface p-3 shadow-sm">
        <span
          aria-hidden="true"
          className="inline-flex size-9 flex-none items-center justify-center rounded-sm bg-brand text-on-brand"
        >
          <Megaphone size={18} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm leading-5 font-semibold">
            Portal do Cliente{urgente ? ' · aviso urgente' : ''}
          </span>
          <span className="text-sm leading-5 break-words text-ink">
            {mensagem.trim() || 'A sua mensagem aparece aqui.'}
          </span>
        </div>
      </div>
    </figure>
  )
}

function NovoAviso({
  semana,
  aoEnviar,
}: {
  semana: { usados: number; limite: number }
  aoEnviar: () => void
}) {
  const servicos = useServicos()
  const [mensagem, setMensagem] = useState('')
  const [link, setLink] = useState('')
  const [alcance, setAlcance] = useState<'todos' | 'empresas'>('todos')
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([])
  const [envio, setEnvio] = useState<'agora' | 'agendar'>('agora')
  const [quando, setQuando] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const quandoIso = paraIso(quando)
  const semEmpresa = alcance === 'empresas' && empresas.length === 0
  const semHorario = envio === 'agendar' && !quandoIso
  const noLimite = !urgente && semana.usados >= semana.limite
  const invalido = mensagem.trim() === '' || semEmpresa || semHorario

  async function enviar() {
    setOcupado(true)
    setErro(null)
    const r = await servicos.portal.avisos.criar({
      mensagem: mensagem.trim(),
      link: link.trim() || null,
      urgencia: urgente ? 'urgente' : 'normal',
      alcance,
      empresaIds: alcance === 'empresas' ? empresas.map((e) => e.id) : [],
      enviarEm: envio === 'agendar' ? quandoIso : null,
    })
    setOcupado(false)
    setConfirmando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(envio === 'agendar' ? 'Aviso agendado' : 'Aviso enviado')
    setMensagem('')
    setLink('')
    setUrgente(false)
    setEnvio('agora')
    setQuando('')
    aoEnviar()
  }

  const para =
    alcance === 'todos'
      ? 'todos os clientes com acesso ativo'
      : `${empresas.length} ${empresas.length === 1 ? 'empresa escolhida' : 'empresas escolhidas'}`

  return (
    <section
      aria-label="Novo aviso"
      className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4"
    >
      <h2 className="m-0 text-lg leading-6 font-semibold">Novo aviso</h2>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <TextArea
        label="Mensagem"
        required
        rows={3}
        value={mensagem}
        maxLength={TAMANHO_MAXIMO_DO_AVISO}
        onChange={(e) => setMensagem(e.target.value)}
        hint={`${mensagem.length} de ${TAMANHO_MAXIMO_DO_AVISO} caracteres. Aparece inteira na notificação.`}
      />
      <TextField
        label="Link (opcional)"
        value={link}
        maxLength={500}
        placeholder="/agenda ou https://…"
        onChange={(e) => setLink(e.target.value)}
        hint="Uma tela do portal (como /agenda, /documentos ou /chamados) ou um endereço http(s)."
      />
      <div className="flex flex-col gap-2">
        <SegmentedControl
          label="Para quem"
          value={alcance}
          onChange={(v) => setAlcance(v as 'todos' | 'empresas')}
          options={[
            { value: 'todos', label: 'Todos os clientes' },
            { value: 'empresas', label: 'Empresas escolhidas' },
          ]}
        />
        {alcance === 'empresas' ? (
          <SelecaoDeEmpresas empresas={empresas} aoMudar={setEmpresas} />
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <SegmentedControl
          label="Envio"
          value={envio}
          onChange={(v) => setEnvio(v as 'agora' | 'agendar')}
          options={[
            { value: 'agora', label: 'Agora' },
            { value: 'agendar', label: 'Agendar' },
          ]}
        />
        {envio === 'agendar' ? (
          <TextField
            label="Enviar em"
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Switch checked={urgente} onChange={(e) => setUrgente(e.target.checked)} label="Urgente" />
        <p className="m-0 text-[13px] text-ink-muted">
          Urgente chega na hora, mesmo no horário de silêncio do cliente, e não conta no limite
          semanal. Use só quando for mesmo.
        </p>
      </div>
      <p className="m-0 text-sm text-ink-muted" aria-live="polite">
        <strong>
          {semana.usados} de {semana.limite}
        </strong>{' '}
        avisos normais usados nesta semana (para a empresa mais atingida).
        {noLimite ? ' O limite foi atingido: só um aviso urgente pode sair agora.' : ''}
      </p>
      <Previa mensagem={mensagem} urgente={urgente} />
      <div>
        <Button
          variant="primary"
          icon={Send}
          disabled={invalido || noLimite}
          onClick={() => setConfirmando(true)}
        >
          {envio === 'agendar' ? 'Agendar aviso' : 'Enviar aviso'}
        </Button>
      </div>
      {confirmando ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v && !ocupado) setConfirmando(false)
          }}
          title={envio === 'agendar' ? 'Agendar este aviso?' : 'Enviar este aviso agora?'}
          description={`Vai para ${para}${envio === 'agendar' && quandoIso ? `, em ${dataHora(quandoIso)}` : ''}. Depois de enviado, não dá para recolher.`}
          footer={
            <>
              <Button disabled={ocupado} onClick={() => setConfirmando(false)}>
                Voltar
              </Button>
              <Button variant="primary" loading={ocupado} onClick={() => void enviar()}>
                {envio === 'agendar' ? 'Confirmar agendamento' : 'Confirmar envio'}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm break-words">“{mensagem.trim()}”</p>
        </Dialog>
      ) : null}
    </section>
  )
}

function Linha({
  a,
  podeGerir,
  aoCancelar,
}: {
  a: Aviso
  podeGerir: boolean
  aoCancelar: () => void
}) {
  const lidos = a.entregues > 0 ? Math.round((a.lidos / a.entregues) * 100) : 0
  return (
    <li className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={TOM[a.situacao]}>{ROTULO_DA_SITUACAO_DO_AVISO[a.situacao]}</Badge>
        {a.urgencia === 'urgente' ? <Badge tone="danger">Urgente</Badge> : null}
        <span className="ml-auto text-ink-muted">
          {a.situacao === 'agendado'
            ? `Sai em ${dataHora(a.enviarEm)}`
            : dataHora(a.enviadoEm ?? a.enviarEm)}
        </span>
      </span>
      <span className="font-semibold break-words">{a.mensagem}</span>
      <span className="text-xs text-ink-muted">
        {audiencia(a)}
        {a.link ? ` · ${a.link}` : ''}
      </span>
      {a.situacao === 'enviado' ? (
        <span className="text-xs text-ink-muted tabular-nums">
          Entregues {a.entregues} de {a.destinatarios} · Lidos {lidos}% · Push {a.pushEnviados} ·
          E-mail {a.emailsEnfileirados}
        </span>
      ) : null}
      {a.situacao === 'agendado' && podeGerir ? (
        <div>
          <Button size="sm" variant="ghost" icon={XCircle} onClick={aoCancelar}>
            Cancelar envio
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/** Aba Avisos do hub: comunicado curto com push, o limite semanal e o que já saiu. */
export function AvisosDoPortal() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const queryClient = useQueryClient()
  const podeGerir = pode('portal.avisos')
  const [pagina, setPagina] = useState(1)
  const [cancelando, setCancelando] = useState<Aviso | null>(null)
  const consulta = useQuery({
    queryKey: ['portal', 'avisos', pagina],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.portal.avisos.listar({ pagina })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () => void queryClient.invalidateQueries({ queryKey: ['portal', 'avisos'] })
  const lista = consulta.data

  return (
    <div className="flex flex-col gap-4">
      {podeGerir && lista ? <NovoAviso semana={lista.semana} aoEnviar={recarregar} /> : null}
      <section aria-label="Enviados e agendados" className="flex flex-col gap-2">
        <h2 className="m-0 text-lg leading-6 font-semibold">Enviados e agendados</h2>
        {consulta.isError ? <Alert tone="danger">{consulta.error.message}</Alert> : null}
        <div className="rounded-md border border-border bg-surface">
          {!lista ? (
            <div className="p-4">
              <Skeleton lines={3} />
            </div>
          ) : lista.itens.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="Nenhum aviso ainda"
              description="Os avisos enviados e agendados aparecem aqui, com quantos receberam e leram."
            />
          ) : (
            <ul aria-label="Avisos" className="m-0 list-none p-0">
              {lista.itens.map((a) => (
                <Linha key={a.id} a={a} podeGerir={podeGerir} aoCancelar={() => setCancelando(a)} />
              ))}
            </ul>
          )}
        </div>
        {lista && lista.total > lista.itens.length + (pagina - 1) * 25 ? (
          <div>
            <Button onClick={() => setPagina((p) => p + 1)}>Ver mais antigos</Button>
          </div>
        ) : null}
      </section>
      {cancelando ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setCancelando(null)
          }}
          title="Cancelar este envio?"
          description="O aviso agendado não será enviado."
          footer={
            <>
              <Button onClick={() => setCancelando(null)}>Voltar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void servicos.portal.avisos.cancelar(cancelando.id).then((r) => {
                    if (!r.ok) toast.error(r.erro.mensagem)
                    else toast.success('Envio cancelado')
                    setCancelando(null)
                    recarregar()
                  })
                }}
              >
                Cancelar envio
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm break-words">“{cancelando.mensagem}”</p>
        </Dialog>
      ) : null}
    </div>
  )
}
