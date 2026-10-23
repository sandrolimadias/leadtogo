import type { Me } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Bell, ClipboardList, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { empresasOffline, guardarMe, sincronizar } from '@/lib/offline/visitas'

import { useApoioDasVisitas } from './apoio'
import { usePendentes } from './pendentes-dados'
import { BotaoDeVisita } from './checkin'

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** Relatórios de visita pendentes (G3b): a lista do celular, com "Enviar agora" e o aviso do lembrete. */
export function TelaDePendentes() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const pendentes = usePendentes()
  const [enviando, setEnviando] = useState(false)
  const podeNotificar = typeof Notification !== 'undefined'
  const [permissao, setPermissao] = useState(podeNotificar ? Notification.permission : 'denied')

  const enviar = async () => {
    setEnviando(true)
    const r = await sincronizar(servicos)
    setEnviando(false)
    if (r.enviados.length) toast.success(`${r.enviados.length} relatório(s) enviado(s)`)
    if (r.pendentes) toast.info('Sem sinal agora: tento de novo quando a conexão voltar.')
    await queryClient.invalidateQueries({ queryKey: ['visitas'] })
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[26px] leading-8 font-semibold max-md:text-[22px]">
          Relatórios pendentes
        </h1>
        <Button icon={RefreshCw} loading={enviando} onClick={() => void enviar()}>
          Enviar agora
        </Button>
      </div>
      {podeNotificar && permissao === 'default' ? (
        <Alert
          tone="info"
          title="Quer o lembrete no fim do dia?"
          actions={
            <Button
              size="sm"
              icon={Bell}
              onClick={() => void Notification.requestPermission().then(setPermissao)}
            >
              Ativar notificações
            </Button>
          }
        >
          Com as notificações ligadas, o Leadtogo avisa dos relatórios pendentes no horário que a
          empresa definiu. Sem elas, o aviso aparece ao abrir o app.
        </Alert>
      ) : null}
      {pendentes.isPending ? (
        <Skeleton lines={4} />
      ) : (pendentes.data ?? []).length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={ClipboardList}
            title="Nenhum relatório pendente"
            description="Todo check-in fica aqui até o relatório ser concluído."
          />
        </div>
      ) : (
        <ul
          aria-label="Relatórios pendentes"
          className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
        >
          {(pendentes.data ?? []).map((p) => (
            <li key={p.id} className="border-b border-border last:border-b-0">
              <Link
                to="/visitas/$relatorioId"
                params={{ relatorioId: p.id }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-ink hover:bg-surface-hover"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{p.empresaNome}</span>
                  <span className="text-xs text-ink-muted">Visita em {quando(p.quando)}</span>
                </span>
                {p.erro ? (
                  <Badge tone="danger" icon={TriangleAlert}>
                    Recusado: abra para corrigir
                  </Badge>
                ) : p.noAparelho ? (
                  <Badge tone="outline" icon={CloudOff}>
                    No aparelho
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <EmpresasNoAparelho />
    </div>
  )
}

/**
 * As empresas guardadas no aparelho ("Levar para offline" e as abertas recentemente), com o check-in:
 * sem sinal a ficha não abre, e é daqui que o vendedor começa a visita.
 */
function EmpresasNoAparelho() {
  const empresas = useQuery({
    queryKey: ['visitas', 'empresas-no-aparelho'],
    retry: false,
    networkMode: 'always',
    queryFn: async () =>
      (await empresasOffline().catch(() => [])).sort((a, b) => a.nome.localeCompare(b.nome)),
  })
  const lista = empresas.data ?? []
  if (lista.length === 0) return null
  return (
    <section aria-label="Empresas no aparelho" className="flex flex-col gap-2">
      <h2 className="m-0 text-[17px] leading-6 font-semibold">Empresas no aparelho</h2>
      <p className="m-0 text-[13px] text-ink-muted">
        Para visitar sem sinal: valem por 7 dias depois de levadas ou abertas.
      </p>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0">
        {lista.map((e) => (
          <li
            key={e.id}
            aria-label={e.nome}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{e.nome}</span>
              <span className="truncate text-xs text-ink-muted">
                {e.endereco ?? 'Sem endereço'}
              </span>
            </span>
            {e.podeVisitar ? <BotaoDeVisita empresa={{ id: e.id, nome: e.nome }} compacto /> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Card do Dashboard: quantos relatórios estão pendentes (some quando não há nenhum). */
export function CardDePendentes() {
  const pendentes = usePendentes()
  const n = pendentes.data?.length ?? 0
  if (n === 0) return null
  return (
    <Link
      to="/visitas"
      aria-label={`${n} ${n === 1 ? 'relatório de visita pendente' : 'relatórios de visita pendentes'}`}
      className="flex items-center gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-ink"
    >
      <ClipboardList size={18} aria-hidden="true" className="text-warning" />
      <span className="flex-1 text-sm">
        <strong>{n}</strong>{' '}
        {n === 1 ? 'relatório de visita pendente' : 'relatórios de visita pendentes'}
      </span>
      <span className="text-sm font-semibold text-brand">Ver</span>
    </Link>
  )
}

const CHAVE_DO_LEMBRETE = 'leadtogo:lembrete-relatorios'

/**
 * A casca monta isto (não desenha nada): prepara o banco do aparelho para a pessoa (limpa o de outra; tira o vencido), sobe
 * a fila ao abrir e quando o sinal volta, e lembra dos relatórios pendentes no horário da empresa (uma
 * vez por dia: notificação do aparelho se permitida, senão um aviso na tela).
 */
export function CampoDasVisitas({
  me,
  ...pessoa
}: {
  me: Me
  usuarioId: string
  empresaId: string
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const apoio = useApoioDasVisitas()
  const pendentes = usePendentes()
  const router = useRouter()

  // As telas do campo já ficam carregadas: sem sinal não haveria de onde baixar o código delas
  useEffect(() => {
    for (const id of [
      '/_autenticado/visitas',
      '/_autenticado/visitas/',
      '/_autenticado/visitas/$relatorioId',
    ] as const) {
      void Promise.resolve(router.loadRouteChunk(router.routesById[id])).catch(() => undefined)
    }
  }, [router])

  useEffect(() => {
    let cancelado = false
    const subir = async () => {
      const r = await sincronizar(servicos).catch(() => null)
      if (r && (r.enviados.length || r.recusados.length)) {
        await queryClient.invalidateQueries({ queryKey: ['visitas'] })
        await queryClient.invalidateQueries({ queryKey: ['carteira'] })
      }
    }
    void (async () => {
      const { prepararParaUsuario } = await import('@/lib/offline/banco')
      await prepararParaUsuario(pessoa.usuarioId, pessoa.empresaId).catch(() => undefined)
      if (cancelado) return
      // com sinal, a sessão conferida fica no aparelho para abrir o app sem sinal
      if (navigator.onLine) await guardarMe(me).catch(() => undefined)
      await subir()
    })()
    const aoVoltar = () => void subir()
    window.addEventListener('online', aoVoltar)
    return () => {
      cancelado = true
      window.removeEventListener('online', aoVoltar)
    }
  }, [pessoa.usuarioId, pessoa.empresaId, me, servicos, queryClient])

  const hora = apoio.data?.configuracao.lembreteRelatoriosHora
  const quantos = pendentes.data?.length ?? 0
  useEffect(() => {
    if (!hora || quantos === 0) return
    const conferir = () => {
      const agora = new Date()
      const [h, m] = hora.split(':').map(Number)
      const limite = new Date(agora)
      limite.setHours(h ?? 17, m ?? 30, 0, 0)
      const hoje = agora.toISOString().slice(0, 10)
      let lembrado: string | null = null
      try {
        lembrado = localStorage.getItem(CHAVE_DO_LEMBRETE)
      } catch {
        // armazenamento bloqueado: lembra de novo, sem problema
      }
      if (agora < limite || lembrado === hoje) return
      try {
        localStorage.setItem(CHAVE_DO_LEMBRETE, hoje)
      } catch {
        // idem
      }
      const texto = `Você tem ${quantos} ${quantos === 1 ? 'relatório de visita pendente' : 'relatórios de visita pendentes'}.`
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Leadtogo', { body: texto, tag: 'relatorios-pendentes' })
      } else {
        toast.warning(texto, {
          description: 'Conclua os relatórios do dia.',
          action: (
            <a href="/visitas" className="font-semibold text-brand">
              Ver pendentes
            </a>
          ),
        })
      }
    }
    conferir()
    const t = setInterval(conferir, 60_000)
    return () => clearInterval(t)
  }, [hora, quantos])
  return null
}
