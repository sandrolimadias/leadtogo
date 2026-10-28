import type { ChaveDeApi, EntregaDeWebhook, Webhook } from '@leadtogo/api-client'
import {
  EVENTOS_DE_WEBHOOK,
  MODELOS_DE_ESCOPO,
  PERMISSOES_DE_INTEGRACAO,
  ROTULO_DA_SITUACAO_DA_CHAVE,
  ROTULO_DO_EVENTO,
  definicaoDaPermissao,
  type SituacaoDaChave,
} from '@leadtogo/shared'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Webhook as IconeWebhook,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Checkbox, Switch } from '@leadtogo/ui/checkbox'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge, type TomDoBadge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Tabs } from '@leadtogo/ui/tabs'
import { toast } from '@leadtogo/ui/toast'

import { dataHora } from '../chamados/rotulos'

const TOM_DA_CHAVE: Record<SituacaoDaChave, TomDoBadge> = {
  ativa: 'success',
  substituida: 'warning',
  vencida: 'neutral',
  revogada: 'neutral',
}

const rotuloDaPermissao = (chave: string) => definicaoDaPermissao(chave)?.rotulo ?? chave

/** `datetime-local` → ISO; vazio → null. */
const paraIso = (local: string): string | null => {
  const data = new Date(local)
  return local && !Number.isNaN(data.getTime()) ? data.toISOString() : null
}

const copiar = (texto: string) => {
  void navigator.clipboard
    ?.writeText(texto)
    .then(() => toast.success('Copiado'))
    .catch(() => toast.error('Não foi possível copiar: selecione e copie à mão.'))
}

/** O segredo (token ou segredo do webhook) aparece uma única vez, com o aviso e o botão Copiar. */
function SegredoUmaVez({
  titulo,
  valor,
  aoFechar,
}: {
  titulo: string
  valor: string
  aoFechar: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) aoFechar()
      }}
      title={titulo}
      description="Guarde agora: por segurança, este valor não será mostrado de novo."
      footer={
        <>
          <Button icon={Copy} onClick={() => copiar(valor)}>
            Copiar
          </Button>
          <Button variant="primary" onClick={aoFechar}>
            Já guardei
          </Button>
        </>
      }
    >
      <code
        aria-label="Valor"
        className="block rounded-md border border-border bg-surface-sunken p-3 font-mono text-sm break-all"
      >
        {valor}
      </code>
    </Dialog>
  )
}

// ------------------------------------------------------------------------------------------- chaves de API

function EditorDaChave({
  chave,
  aoSalvar,
  aoFechar,
}: {
  chave: ChaveDeApi | null
  aoSalvar: (token: string | null) => void
  aoFechar: () => void
}) {
  const servicos = useServicos()
  const [nome, setNome] = useState(chave?.nome ?? '')
  const [permissoes, setPermissoes] = useState<string[]>(chave?.permissoes ?? [])
  const [ips, setIps] = useState((chave?.ipsPermitidos ?? []).join(', '))
  const [validade, setValidade] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const alternar = (p: string, ligar: boolean) =>
    setPermissoes((atual) => (ligar ? [...new Set([...atual, p])] : atual.filter((x) => x !== p)))

  async function salvar() {
    setOcupado(true)
    setErro(null)
    const listaDeIps = ips
      .split(/[,\s]+/)
      .map((i) => i.trim())
      .filter(Boolean)
    const r = chave
      ? await servicos.integracoes.chaves.alterar(chave.id, {
          nome: nome.trim(),
          permissoes,
          ipsPermitidos: listaDeIps,
          ...(validade ? { expiraEm: paraIso(validade) } : {}),
        })
      : await servicos.integracoes.chaves.criar({
          nome: nome.trim(),
          permissoes,
          ipsPermitidos: listaDeIps,
          expiraEm: paraIso(validade),
        })
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    aoSalvar('token' in r.dados ? r.dados.token : null)
  }

  return (
    <Dialog
      open
      width={560}
      onOpenChange={(v) => {
        if (!v && !ocupado) aoFechar()
      }}
      title={chave ? `Editar a chave "${chave.nome}"` : 'Nova chave de API'}
      description="A chave age em nome da empresa, com as permissões escolhidas, em todas as carteiras."
      footer={
        <>
          <Button disabled={ocupado} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={ocupado}
            disabled={nome.trim() === '' || permissoes.length === 0}
            onClick={() => void salvar()}
          >
            {chave ? 'Salvar' : 'Criar chave'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        <TextField
          label="Nome"
          required
          maxLength={80}
          value={nome}
          placeholder="n8n — Omie"
          onChange={(e) => setNome(e.target.value)}
        />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">Permissões</legend>
          <div className="flex flex-wrap gap-2">
            {MODELOS_DE_ESCOPO.map((m) => (
              <Button key={m.id} size="sm" onClick={() => setPermissoes([...m.permissoes])}>
                {m.rotulo}
              </Button>
            ))}
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            {PERMISSOES_DE_INTEGRACAO.map((p) => (
              <Checkbox
                key={p}
                label={rotuloDaPermissao(p)}
                description={p}
                checked={permissoes.includes(p)}
                onChange={(e) => alternar(p, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>
        <TextField
          label="IPs permitidos (opcional)"
          value={ips}
          placeholder="200.1.2.3, 10.0.0.0/8"
          onChange={(e) => setIps(e.target.value)}
          hint="Separe por vírgula. Vazio aceita qualquer IP."
        />
        <TextField
          label={
            chave?.expiraEm ? `Validade (hoje: ${dataHora(chave.expiraEm)})` : 'Validade (opcional)'
          }
          type="datetime-local"
          value={validade}
          onChange={(e) => setValidade(e.target.value)}
          hint="Sem validade, a chave vale até ser revogada. Você recebe um aviso 15 dias antes de vencer."
        />
      </div>
    </Dialog>
  )
}

function AbaDasChaves() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState<ChaveDeApi | 'nova' | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [revogando, setRevogando] = useState<ChaveDeApi | null>(null)
  const [rotacionando, setRotacionando] = useState<ChaveDeApi | null>(null)
  const [prazo, setPrazo] = useState('1')
  const [ocupado, setOcupado] = useState(false)
  const consulta = useQuery({
    queryKey: ['integracoes', 'chaves'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.integracoes.chaves.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () =>
    void queryClient.invalidateQueries({ queryKey: ['integracoes', 'chaves'] })

  async function revogar(c: ChaveDeApi) {
    setOcupado(true)
    const r = await servicos.integracoes.chaves.revogar(c.id)
    setOcupado(false)
    setRevogando(null)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    toast.success('Chave revogada', { description: 'Ela deixou de funcionar agora.' })
    recarregar()
  }

  async function rotacionar(c: ChaveDeApi) {
    setOcupado(true)
    const r = await servicos.integracoes.chaves.rotacionar(c.id, Number(prazo))
    setOcupado(false)
    setRotacionando(null)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    setToken(r.dados.token)
    recarregar()
  }

  const lista = consulta.data?.itens
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 max-w-[70ch] text-sm text-ink-muted">
          As integrações (n8n, ERP, site) chamam a API pública com uma chave:{' '}
          <code>Authorization: Bearer ltg_…</code>. O que a chave faz aparece no histórico como
          “Integração: nome da chave”.
        </p>
        <Button variant="primary" icon={Plus} onClick={() => setEditando('nova')}>
          Nova chave
        </Button>
      </div>
      {consulta.isError ? <Alert tone="danger">{consulta.error.message}</Alert> : null}
      <div className="rounded-md border border-border bg-surface">
        {!lista ? (
          <div className="p-4">
            <Skeleton lines={3} />
          </div>
        ) : lista.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Nenhuma chave de API"
            description="Crie uma chave para o n8n ou outro sistema usar a API pública do Leadtogo."
          />
        ) : (
          <ul aria-label="Chaves de API" className="m-0 list-none p-0">
            {lista.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.nome}</span>
                  <Badge tone={TOM_DA_CHAVE[c.situacao]}>
                    {ROTULO_DA_SITUACAO_DA_CHAVE[c.situacao]}
                  </Badge>
                  <code className="ml-auto text-xs text-ink-muted">{c.prefixo}…</code>
                </span>
                <span className="text-xs text-ink-muted">
                  {c.permissoes.map(rotuloDaPermissao).join(' · ')}
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  Criada em {dataHora(c.criadoEm)}
                  {c.criadoPor ? ` por ${c.criadoPor.nome}` : ''} · Último uso{' '}
                  {c.ultimoUsoEm ? dataHora(c.ultimoUsoEm) : 'nunca'}
                  {c.expiraEm ? ` · Vence em ${dataHora(c.expiraEm)}` : ''}
                  {c.ipsPermitidos.length > 0 ? ` · IPs: ${c.ipsPermitidos.join(', ')}` : ''}
                </span>
                {c.situacao === 'ativa' || c.situacao === 'substituida' ? (
                  <div className="flex flex-wrap gap-1">
                    {c.situacao === 'ativa' ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={RefreshCw}
                          onClick={() => setRotacionando(c)}
                        >
                          Rotacionar
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={XCircle}
                      onClick={() => setRevogando(c)}
                    >
                      Revogar
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editando ? (
        <EditorDaChave
          chave={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(t) => {
            setEditando(null)
            if (t) setToken(t)
            else toast.success('Chave salva')
            recarregar()
          }}
        />
      ) : null}
      {token ? (
        <SegredoUmaVez titulo="Chave criada" valor={token} aoFechar={() => setToken(null)} />
      ) : null}
      {revogando ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v && !ocupado) setRevogando(null)
          }}
          title={`Revogar a chave "${revogando.nome}"?`}
          description="Ela deixa de funcionar na hora: a integração que a usa para de conseguir chamar a API."
          footer={
            <>
              <Button disabled={ocupado} onClick={() => setRevogando(null)}>
                Voltar
              </Button>
              <Button variant="danger" loading={ocupado} onClick={() => void revogar(revogando)}>
                Revogar
              </Button>
            </>
          }
        />
      ) : null}
      {rotacionando ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v && !ocupado) setRotacionando(null)
          }}
          title={`Rotacionar a chave "${rotacionando.nome}"?`}
          description="Cria uma chave nova com as mesmas permissões. Troque o valor na integração antes de a antiga parar."
          footer={
            <>
              <Button disabled={ocupado} onClick={() => setRotacionando(null)}>
                Voltar
              </Button>
              <Button
                variant="primary"
                loading={ocupado}
                onClick={() => void rotacionar(rotacionando)}
              >
                Rotacionar
              </Button>
            </>
          }
        >
          <TextField
            label="A chave antiga continua valendo por (dias)"
            type="number"
            min={0}
            max={7}
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            hint="De 0 (para agora) a 7 dias."
          />
        </Dialog>
      ) : null}
    </div>
  )
}

// ----------------------------------------------------------------------------------------------- webhooks

const TOM_DA_ENTREGA: Record<EntregaDeWebhook['situacao'], TomDoBadge> = {
  pendente: 'info',
  sucesso: 'success',
  falhou: 'danger',
}
const ROTULO_DA_ENTREGA: Record<EntregaDeWebhook['situacao'], string> = {
  pendente: 'Pendente',
  sucesso: 'Entregue',
  falhou: 'Falhou',
}

function EditorDoWebhook({
  webhook,
  aoSalvar,
  aoFechar,
}: {
  webhook: Webhook | null
  aoSalvar: (segredo: string | null) => void
  aoFechar: () => void
}) {
  const servicos = useServicos()
  const [descricao, setDescricao] = useState(webhook?.descricao ?? '')
  const [url, setUrl] = useState(webhook?.url ?? '')
  const [eventos, setEventos] = useState<string[]>(webhook?.eventos ?? [])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setOcupado(true)
    setErro(null)
    const dados = {
      descricao: descricao.trim(),
      url: url.trim(),
      eventos: eventos as (typeof EVENTOS_DE_WEBHOOK)[number][],
    }
    const r = webhook
      ? await servicos.integracoes.webhooks.alterar(webhook.id, dados)
      : await servicos.integracoes.webhooks.criar(dados)
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    aoSalvar('segredo' in r.dados ? r.dados.segredo : null)
  }

  return (
    <Dialog
      open
      width={560}
      onOpenChange={(v) => {
        if (!v && !ocupado) aoFechar()
      }}
      title={webhook ? `Editar o webhook "${webhook.descricao}"` : 'Novo webhook'}
      description="O Leadtogo envia um POST assinado para este endereço a cada evento escolhido."
      footer={
        <>
          <Button disabled={ocupado} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={ocupado}
            disabled={descricao.trim() === '' || url.trim() === '' || eventos.length === 0}
            onClick={() => void salvar()}
          >
            {webhook ? 'Salvar' : 'Criar webhook'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        <Alert tone="info">
          Os eventos levam dados pessoais (nome, e-mail e telefone dos contatos) ao sistema de
          destino. Cadastre só destinos da sua empresa ou de quem trata os dados para ela.
        </Alert>
        <TextField
          label="Descrição"
          required
          maxLength={120}
          value={descricao}
          placeholder="n8n — cobrança"
          onChange={(e) => setDescricao(e.target.value)}
        />
        <TextField
          label="Endereço (URL)"
          required
          maxLength={500}
          value={url}
          placeholder="https://n8n.suaempresa.com.br/webhook/…"
          onChange={(e) => setUrl(e.target.value)}
        />
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">Eventos</legend>
          {EVENTOS_DE_WEBHOOK.map((ev) => (
            <Checkbox
              key={ev}
              label={ROTULO_DO_EVENTO[ev]}
              description={ev}
              checked={eventos.includes(ev)}
              onChange={(e) =>
                setEventos((atual) =>
                  e.target.checked ? [...atual, ev] : atual.filter((x) => x !== ev),
                )
              }
            />
          ))}
        </fieldset>
      </div>
    </Dialog>
  )
}

function LogDeEntregas({ webhook, aoFechar }: { webhook: Webhook; aoFechar: () => void }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [pagina, setPagina] = useState(1)
  const consulta = useQuery({
    queryKey: ['integracoes', 'entregas', webhook.id, pagina],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.integracoes.webhooks.entregas(webhook.id, { pagina })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () =>
    void queryClient.invalidateQueries({ queryKey: ['integracoes', 'entregas', webhook.id] })

  async function reenviar(entregaId: string | null) {
    const r = entregaId
      ? await servicos.integracoes.webhooks.reenviar(webhook.id, entregaId)
      : await servicos.integracoes.webhooks.reenviarFalhas(webhook.id)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    toast.success('Reenvio agendado')
    recarregar()
  }

  const lista = consulta.data
  return (
    <Dialog
      open
      width={720}
      onOpenChange={(v) => {
        if (!v) aoFechar()
      }}
      title={`Entregas: ${webhook.descricao}`}
      description="Da mais nova para a mais antiga. Sucesso fica 30 dias no log; falha, 90."
      footer={
        <>
          <Button icon={RotateCcw} onClick={() => void reenviar(null)}>
            Reenviar as falhas
          </Button>
          <Button variant="primary" onClick={aoFechar}>
            Fechar
          </Button>
        </>
      }
    >
      {consulta.isError ? <Alert tone="danger">{consulta.error.message}</Alert> : null}
      {!lista ? (
        <Skeleton lines={4} />
      ) : lista.itens.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nenhuma entrega ainda"
          description="Use “Enviar teste” para conferir a configuração."
        />
      ) : (
        <ul aria-label="Entregas" className="m-0 flex list-none flex-col gap-2 p-0">
          {lista.itens.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={TOM_DA_ENTREGA[e.situacao]}>{ROTULO_DA_ENTREGA[e.situacao]}</Badge>
                <code className="text-xs">{e.tipo}</code>
                <span className="ml-auto text-xs text-ink-muted">{dataHora(e.criadoEm)}</span>
              </span>
              <span className="text-xs text-ink-muted tabular-nums">
                {e.tentativas} {e.tentativas === 1 ? 'tentativa' : 'tentativas'}
                {e.statusHttp ? ` · HTTP ${e.statusHttp}` : ''}
                {e.duracaoMs !== null ? ` · ${e.duracaoMs} ms` : ''}
                {e.proximaTentativaEm ? ` · próxima em ${dataHora(e.proximaTentativaEm)}` : ''}
              </span>
              {e.erro ? <span className="text-xs text-danger">{e.erro}</span> : null}
              {e.resposta ? (
                <code className="block max-h-24 overflow-auto rounded-sm bg-surface-sunken p-2 text-xs break-all">
                  {e.resposta}
                </code>
              ) : null}
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={() => void reenviar(e.id)}
                >
                  Reenviar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lista && lista.total > pagina * lista.porPagina ? (
        <Button onClick={() => setPagina((p) => p + 1)}>Ver mais antigas</Button>
      ) : null}
    </Dialog>
  )
}

function AbaDosWebhooks() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState<Webhook | 'novo' | null>(null)
  const [segredo, setSegredo] = useState<string | null>(null)
  const [log, setLog] = useState<Webhook | null>(null)
  const [excluindo, setExcluindo] = useState<Webhook | null>(null)
  const consulta = useQuery({
    queryKey: ['integracoes', 'webhooks'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.integracoes.webhooks.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () =>
    void queryClient.invalidateQueries({ queryKey: ['integracoes', 'webhooks'] })

  async function ligar(w: Webhook, ativo: boolean) {
    const r = await servicos.integracoes.webhooks.alterar(w.id, { ativo })
    if (!r.ok) return void toast.error(r.erro.mensagem)
    recarregar()
  }
  async function testar(w: Webhook) {
    const r = await servicos.integracoes.webhooks.testar(w.id)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    toast.success('Teste enviado', { description: 'Acompanhe o resultado no log de entregas.' })
  }
  async function rotacionar(w: Webhook) {
    const r = await servicos.integracoes.webhooks.rotacionarSegredo(w.id)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    setSegredo(r.dados.segredo)
    recarregar()
  }
  async function excluir(w: Webhook) {
    const r = await servicos.integracoes.webhooks.excluir(w.id)
    setExcluindo(null)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    toast.success('Webhook excluído')
    recarregar()
  }

  const lista = consulta.data?.itens
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 max-w-[70ch] text-sm text-ink-muted">
          A cada evento escolhido, o Leadtogo envia um POST assinado (
          <code>X-Leadtogo-Assinatura</code>) e tenta de novo por até 2 dias se o destino falhar.
        </p>
        <Button variant="primary" icon={Plus} onClick={() => setEditando('novo')}>
          Novo webhook
        </Button>
      </div>
      {consulta.isError ? <Alert tone="danger">{consulta.error.message}</Alert> : null}
      <div className="rounded-md border border-border bg-surface">
        {!lista ? (
          <div className="p-4">
            <Skeleton lines={3} />
          </div>
        ) : lista.length === 0 ? (
          <EmptyState
            icon={IconeWebhook}
            title="Nenhum webhook"
            description="Cadastre o endereço do n8n (nó Webhook) para receber os eventos do Leadtogo."
          />
        ) : (
          <ul aria-label="Webhooks" className="m-0 list-none p-0">
            {lista.map((w) => (
              <li
                key={w.id}
                className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{w.descricao}</span>
                  {w.ativo ? (
                    <Badge tone="success">Ativo</Badge>
                  ) : (
                    <Badge tone="neutral">
                      {w.desativadoMotivo === 'falhas'
                        ? 'Desligado: falhas seguidas'
                        : w.desativadoMotivo === '410'
                          ? 'Desligado: destino não existe (410)'
                          : 'Desligado'}
                    </Badge>
                  )}
                  <Switch
                    className="ml-auto"
                    label="Ativo"
                    checked={w.ativo}
                    onChange={(e) => void ligar(w, e.target.checked)}
                  />
                </span>
                <span className="text-xs break-all text-ink-muted">{w.url}</span>
                <span className="text-xs text-ink-muted">
                  {w.eventos
                    .map((e) => ROTULO_DO_EVENTO[e as keyof typeof ROTULO_DO_EVENTO] ?? e)
                    .join(' · ')}
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  Últimas 24 h: {w.entregas24h.sucesso} entregues · {w.entregas24h.falhou} falharam
                  · {w.entregas24h.pendente} pendentes
                  {w.segredoAnteriorAte
                    ? ` · o segredo antigo vale até ${dataHora(w.segredoAnteriorAte)}`
                    : ''}
                </span>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditando(w)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" icon={Send} onClick={() => void testar(w)}>
                    Enviar teste
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLog(w)}>
                    Entregas
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={RefreshCw}
                    onClick={() => void rotacionar(w)}
                  >
                    Trocar segredo
                  </Button>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setExcluindo(w)}>
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editando ? (
        <EditorDoWebhook
          webhook={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(s) => {
            setEditando(null)
            if (s) setSegredo(s)
            else toast.success('Webhook salvo')
            recarregar()
          }}
        />
      ) : null}
      {segredo ? (
        <SegredoUmaVez
          titulo="Segredo do webhook"
          valor={segredo}
          aoFechar={() => setSegredo(null)}
        />
      ) : null}
      {log ? <LogDeEntregas webhook={log} aoFechar={() => setLog(null)} /> : null}
      {excluindo ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setExcluindo(null)
          }}
          title={`Excluir o webhook "${excluindo.descricao}"?`}
          description="Só é possível sem entregas no log; com entregas, desligue-o."
          footer={
            <>
              <Button onClick={() => setExcluindo(null)}>Voltar</Button>
              <Button variant="danger" onClick={() => void excluir(excluindo)}>
                Excluir
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  )
}

/**
 * Configurações → Integrações (docs/plano_api_aberta.md): chaves de API da API pública e webhooks de saída.
 * Só quem tem `integracoes.gerir`; criar chave, criar webhook e trocar segredos exigem o 2FA ativo.
 */
export function TelaDeIntegracoes() {
  const [aba, setAba] = useState('chaves')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[17px] leading-6 font-semibold">Integrações</h2>
        <p className="m-0 text-sm text-ink-muted">
          Conecte o Leadtogo ao n8n, ao ERP ou ao site. A documentação da API pública fica em{' '}
          <a href="/v1/publica/docs" target="_blank" rel="noreferrer">
            /v1/publica/docs
          </a>
          .
        </p>
      </div>
      <Tabs
        label="Integrações"
        value={aba}
        onChange={setAba}
        items={[
          { value: 'chaves', label: 'Chaves de API', icon: KeyRound },
          { value: 'webhooks', label: 'Webhooks', icon: IconeWebhook },
        ]}
      />
      {aba === 'chaves' ? <AbaDasChaves /> : <AbaDosWebhooks />}
    </div>
  )
}
