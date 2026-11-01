import type { PreferenciasDoPortal } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Smartphone } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Checkbox, Switch } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import {
  ativarPushNesteAparelho,
  desativarPushNesteAparelho,
  type EstadoDoPush,
  estadoDoPush,
} from '@/casca/push'
import { useServicos } from '@/servicos/contexto'

const SILENCIO_PADRAO = { inicio: '22:00', fim: '07:00' }

/** Push neste aparelho: o consentimento é um clique, e cada estado do navegador tem a sua explicação. */
function PushNesteAparelho() {
  const servicos = useServicos()
  const [estado, setEstado] = useState<EstadoDoPush | null>(null)
  const [trabalhando, setTrabalhando] = useState(false)
  const config = useQuery({
    queryKey: ['push', 'configuracao'],
    queryFn: async () => {
      const r = await servicos.push.configuracao()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  useEffect(() => {
    let vivo = true
    void estadoDoPush().then((e) => {
      if (vivo) setEstado(e)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (config.isLoading || estado === null) return <Skeleton lines={2} />
  if (!config.data?.disponivel) {
    return (
      <p className="m-0 text-sm text-ink-muted">
        As notificações no celular ainda não estão disponíveis. Os avisos continuam chegando aqui no
        portal e por e-mail.
      </p>
    )
  }
  const chave = config.data.chavePublica

  const ativar = async () => {
    if (!chave) return
    setTrabalhando(true)
    try {
      const inscricao = await ativarPushNesteAparelho(chave)
      if (!inscricao) {
        setEstado(Notification.permission === 'denied' ? 'bloqueado' : 'desativado')
        toast.info('Sem a permissão do navegador não dá para enviar avisos ao aparelho.')
        return
      }
      const r = await servicos.push.inscrever(inscricao)
      if (!r.ok) {
        await desativarPushNesteAparelho()
        toast.error(r.erro.mensagem)
        return
      }
      setEstado('ativo')
      toast.success('Avisos ativados neste aparelho')
    } catch {
      toast.error('Não foi possível ativar os avisos neste aparelho.')
    } finally {
      setTrabalhando(false)
    }
  }
  const desativar = async () => {
    setTrabalhando(true)
    try {
      const endpoint = await desativarPushNesteAparelho()
      if (endpoint) await servicos.push.remover(endpoint)
      setEstado('desativado')
      toast.success('Avisos desativados neste aparelho')
    } catch {
      toast.error('Não foi possível desativar agora. Tente de novo.')
    } finally {
      setTrabalhando(false)
    }
  }

  switch (estado) {
    case 'sem_suporte':
      return (
        <p className="m-0 text-sm text-ink-muted">
          Este navegador não recebe notificações do portal. Os avisos continuam chegando aqui e por
          e-mail.
        </p>
      )
    case 'instalar_primeiro':
      return (
        <Alert tone="info" title="No iPhone e no iPad, instale o portal primeiro">
          Abra o portal no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”. Depois
          abra o portal pelo ícone e volte aqui para ativar os avisos.
        </Alert>
      )
    case 'bloqueado':
      return (
        <Alert tone="warning" title="As notificações estão bloqueadas neste navegador">
          Libere as notificações deste site nas configurações do navegador e volte aqui para ativar.
        </Alert>
      )
    case 'ativo':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 mr-auto text-sm">
            Este aparelho recebe os avisos do portal, mesmo com o portal fechado.
          </p>
          <Button loading={trabalhando} onClick={() => void desativar()}>
            Desativar neste aparelho
          </Button>
        </div>
      )
    case 'desativado':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 mr-auto text-sm text-ink-muted">
            Receba os avisos da equipe como notificação no celular ou no computador.
          </p>
          <Button
            variant="primary"
            icon={Smartphone}
            loading={trabalhando}
            onClick={() => void ativar()}
          >
            Ativar avisos neste aparelho
          </Button>
        </div>
      )
  }
}

/** Horário de silêncio e e-mail por tipo. Os avisos de segurança (entrada, 2FA) nunca dependem disto. */
export function Preferencias() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const consulta = useQuery({
    queryKey: ['preferencias'],
    queryFn: async () => {
      const r = await servicos.preferencias.obter()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  // o que a pessoa já mexeu (nulo = ainda igual ao salvo)
  const [editado, setEditado] = useState<PreferenciasDoPortal | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const form = editado ?? consulta.data ?? null

  if (consulta.isError)
    return <Alert tone="danger" title="Não foi possível carregar as preferências." />
  if (!form) return <Skeleton lines={4} />

  const comSilencio = form.silencioInicio !== null
  const mudou = editado !== null && JSON.stringify(editado) !== JSON.stringify(consulta.data)
  const alterar = (parte: Partial<PreferenciasDoPortal>) => setEditado({ ...form, ...parte })

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    // O tema é salvo à parte (Aparência); aqui só o silêncio e os e-mails
    const { tema: _tema, ...semTema } = form
    const r = await servicos.preferencias.salvar(semTema)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    queryClient.setQueryData(['preferencias'], r.dados)
    setEditado(null)
    toast.success('Preferências salvas')
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Avisos no aparelho"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
      >
        <h2 className="m-0 flex items-center gap-2 text-base leading-6 font-semibold">
          <BellRing size={18} strokeWidth={1.75} aria-hidden="true" />
          Avisos no aparelho
        </h2>
        <PushNesteAparelho />
      </section>

      <form
        onSubmit={(e) => void salvar(e)}
        className="flex flex-col gap-5 rounded-md border border-border bg-surface p-4"
        noValidate
      >
        {erro ? <Alert tone="danger" title={erro} /> : null}
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1 p-0 text-base leading-6 font-semibold">
            Horário de silêncio
          </legend>
          <p className="m-0 text-sm text-ink-muted">
            Nesse horário os avisos normais esperam e chegam quando o silêncio termina. Os avisos
            urgentes chegam na hora.
          </p>
          <Switch
            label="Silenciar avisos normais"
            checked={comSilencio}
            onChange={(e) =>
              alterar(
                e.target.checked
                  ? { silencioInicio: SILENCIO_PADRAO.inicio, silencioFim: SILENCIO_PADRAO.fim }
                  : { silencioInicio: null, silencioFim: null },
              )
            }
          />
          {comSilencio ? (
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <TextField
                label="Das"
                type="time"
                value={form.silencioInicio ?? ''}
                onChange={(e) => alterar({ silencioInicio: e.target.value })}
              />
              <TextField
                label="Até"
                type="time"
                value={form.silencioFim ?? ''}
                onChange={(e) => alterar({ silencioFim: e.target.value })}
              />
            </div>
          ) : null}
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1 p-0 text-base leading-6 font-semibold">E-mail</legend>
          <p className="m-0 text-sm text-ink-muted">
            Escolha o que também chega por e-mail. O sino do portal sempre mostra tudo. Os e-mails
            de entrada e de segurança não podem ser desligados.
          </p>
          <Checkbox
            label="Chamados"
            description="Resposta da equipe, chamado aguardando você e chamado resolvido."
            checked={form.emailChamados}
            onChange={(e) => alterar({ emailChamados: e.target.checked })}
          />
          <Checkbox
            label="Agenda"
            description="Vaga confirmada, evento cancelado e lembrete de 24 horas."
            checked={form.emailEventos}
            onChange={(e) => alterar({ emailEventos: e.target.checked })}
          />
          <Checkbox
            label="Avisos da equipe"
            description="Comunicados curtos, como mudança de horário."
            checked={form.emailAvisos}
            onChange={(e) => alterar({ emailAvisos: e.target.checked })}
          />
        </fieldset>

        <div>
          <Button type="submit" variant="primary" loading={salvando} disabled={!mudou}>
            Salvar preferências
          </Button>
        </div>
      </form>
    </div>
  )
}
