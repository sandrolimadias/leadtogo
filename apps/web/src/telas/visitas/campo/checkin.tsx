import { decidirCheckin, distanciaEmMetros, type PosicaoDoAparelho } from '@leadtogo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardPen, MapPinCheck } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { novoIdDoAparelho } from '@/lib/offline/id'
import { apoioOffline, empresaOffline, enfileirar, sincronizar } from '@/lib/offline/visitas'
import { Janela } from '@/telas/cadastros/base'

/** Lê a posição do aparelho (alta precisão, até 20 s). */
function lerPosicao(): Promise<PosicaoDoAparelho> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este aparelho não informa a localização.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          precisaoM: Math.round(p.coords.accuracy),
        }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'A localização está bloqueada para o Leadtogo. Libere nas configurações do navegador, ou registre a visita sem check-in.'
              : 'Não consegui ler a localização agora. Tente de novo ou registre a visita sem check-in.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    )
  })
}

interface Previa {
  posicao: PosicaoDoAparelho
  distanciaM: number | null
  limiteM: number
  modo: 'avisar' | 'bloquear' | 'so_gravar'
  foraDoLimite: boolean
  bloqueado: boolean
  offline: boolean
}

const distanciaCurta = (m: number) =>
  m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

/**
 * "Check-in" (G3b) na ficha e no painel do mapa: lê a posição, aplica o modo configurado (avisar,
 * bloquear, só gravar) e cria a visita em execução com o relatório pendente. Sem sinal, usa a posição da
 * empresa guardada no aparelho e a fila sobe depois. "Registrar depois" cria a visita sem check-in.
 */
export function BotaoDeVisita({
  empresa,
  compacto = false,
}: {
  empresa: { id: string; nome: string }
  compacto?: boolean
}) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string>()
  const [previa, setPrevia] = useState<Previa>()
  const [atualizarPosicao, setAtualizarPosicao] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const abrir = async () => {
    setAberto(true)
    setErro(undefined)
    setPrevia(undefined)
    setAtualizarPosicao(false)
    setLendo(true)
    try {
      const posicao = await lerPosicao()
      const online = navigator.onLine
      const r = online ? await servicos.visitas.campo.distancia(empresa.id, posicao) : null
      if (r?.ok) {
        setPrevia({ posicao, ...r.dados, offline: false })
      } else if (r && r.erro.status !== 0) {
        setErro(r.erro.mensagem)
      } else {
        // sem sinal: decide com a posição da empresa e a configuração guardadas no aparelho
        const e = await empresaOffline(empresa.id)
        const apoio = await apoioOffline()
        const config = apoio?.configuracao ?? { checkinModo: 'avisar', checkinLimiteM: 300 }
        const distanciaM = e?.posicao
          ? Math.round(
              distanciaEmMetros(
                posicao.latitude,
                posicao.longitude,
                e.posicao.latitude,
                e.posicao.longitude,
              ),
            )
          : null
        const d = decidirCheckin(distanciaM, config.checkinModo, config.checkinLimiteM)
        setPrevia({
          posicao,
          distanciaM,
          limiteM: config.checkinLimiteM,
          modo: config.checkinModo,
          foraDoLimite: d.foraDoLimite,
          bloqueado: d.bloqueado,
          offline: true,
        })
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler a localização.')
    } finally {
      setLendo(false)
    }
  }

  const criar = async (comCheckin: boolean) => {
    setSalvando(true)
    const id = novoIdDoAparelho()
    await enfileirar({
      id,
      empresaNome: empresa.nome,
      dados: {
        empresaId: empresa.id,
        checkin:
          comCheckin && previa
            ? {
                em: new Date().toISOString(),
                posicao: previa.posicao,
                offline: !navigator.onLine,
              }
            : null,
        resultadoId: null,
        respostas: [],
        concluir: false,
        ...(comCheckin && atualizarPosicao ? { atualizarPosicaoDaEmpresa: true } : {}),
      },
    })
    const r = navigator.onLine ? await sincronizar(servicos) : null
    setSalvando(false)
    const recusa = r?.recusados.find((x) => x.id === id)
    if (recusa) {
      setErro(recusa.mensagem)
      return
    }
    setAberto(false)
    toast.success(
      comCheckin ? 'Check-in feito' : 'Visita registrada sem check-in',
      navigator.onLine ? undefined : { description: 'Sem sinal: sobe quando a conexão voltar.' },
    )
    await queryClient.invalidateQueries({ queryKey: ['visitas'] })
    await navegar({ to: '/visitas/$relatorioId', params: { relatorioId: id } })
  }

  const aviso = previa ? textoDoAviso(previa) : null

  return (
    <>
      <Button
        icon={MapPinCheck}
        variant={compacto ? 'secondary' : 'primary'}
        size={compacto ? 'sm' : 'md'}
        onClick={() => void abrir()}
      >
        Check-in
      </Button>
      <Janela
        open={aberto}
        onOpenChange={(o) => {
          if (!o && !salvando) setAberto(false)
        }}
        title={`Check-in em ${empresa.nome}`}
        description="A sua posição é gravada só agora, no check-in, e só gestores veem."
        footer={
          <>
            <Button
              variant="ghost"
              icon={ClipboardPen}
              disabled={salvando}
              onClick={() => void criar(false)}
            >
              Registrar sem check-in
            </Button>
            <Button
              variant="primary"
              loading={salvando}
              disabled={lendo || !previa || previa.bloqueado}
              onClick={() => void criar(true)}
            >
              Fazer check-in
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3" aria-live="polite">
          {lendo ? <p className="m-0 text-sm text-ink-muted">Lendo a sua localização…</p> : null}
          {erro ? (
            <Alert tone="danger" title="Não foi possível fazer o check-in">
              {erro}
            </Alert>
          ) : null}
          {aviso ? (
            <Alert tone={aviso.tom} title={aviso.titulo}>
              {aviso.texto}
            </Alert>
          ) : null}
          {previa?.foraDoLimite && !previa.bloqueado ? (
            <Checkbox
              label="Atualizar a posição da empresa com a minha"
              description="Use quando o endereço no mapa estiver errado e você está na empresa."
              checked={atualizarPosicao}
              onChange={(e) => setAtualizarPosicao(e.target.checked)}
            />
          ) : null}
          {previa?.offline ? (
            <p className="m-0 text-xs text-ink-muted">
              Sem sinal: o check-in fica no aparelho e sobe quando a conexão voltar.
            </p>
          ) : null}
        </div>
      </Janela>
    </>
  )
}

function textoDoAviso(p: Previa): {
  tom: 'info' | 'warning' | 'danger' | 'success'
  titulo: string
  texto: string
} | null {
  if (p.distanciaM === null) {
    return {
      tom: 'info',
      titulo: 'A empresa não tem posição no mapa',
      texto: 'O check-in fica gravado sem a distância.',
    }
  }
  if (p.modo === 'so_gravar') return null
  if (p.bloqueado) {
    return {
      tom: 'danger',
      titulo: 'Check-in bloqueado',
      texto: `Você está a ${distanciaCurta(p.distanciaM)} da empresa, além do limite de ${distanciaCurta(p.limiteM)}. Aproxime-se, ou registre a visita sem check-in.`,
    }
  }
  if (p.foraDoLimite) {
    return {
      tom: 'warning',
      titulo: 'Você está longe da empresa',
      texto: `A ${distanciaCurta(p.distanciaM)} do endereço (o limite é ${distanciaCurta(p.limiteM)}). Dá para seguir.`,
    }
  }
  return {
    tom: 'success',
    titulo: 'Você está na empresa',
    texto: `A ${distanciaCurta(p.distanciaM)} do endereço.`,
  }
}
