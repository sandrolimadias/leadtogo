import type { Evento } from '@leadtogo/api-client'
import { MAXIMO_DE_LEMBRETES_DE_AVALIACAO } from '@leadtogo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Download, Printer, QrCode, Send, UserPlus } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { jaComecou } from './evento-no-tempo'

function ImagemDoQr({ url }: { url: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let vivo = true
    void QRCode.toString(url, { type: 'svg', margin: 1, width: 240 }).then((svg) => {
      if (vivo) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    })
    return () => {
      vivo = false
    }
  }, [url])
  return src ? (
    <img
      src={src}
      alt="QR code do check-in"
      width={240}
      height={240}
      className="rounded-md border border-border bg-white"
    />
  ) : (
    <span className="block size-60 rounded-md bg-surface-sunken" aria-hidden="true" />
  )
}

function DialogoDoQr({ e, aoFechar }: { e: Evento; aoFechar: () => void }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [qr, setQr] = useState<{ url: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const gerar = async () => {
    setOcupado(true)
    const r = await servicos.portal.eventos.gerarCheckin(e.id)
    setOcupado(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    setQr({ url: r.dados.url })
    void queryClient.invalidateQueries({ queryKey: ['portal', 'evento', e.id] })
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) aoFechar()
      }}
      title="QR de check-in"
      description="Um QR por evento. O participante lê com o celular e registra a própria presença."
      width={480}
      footer={
        <>
          <Button onClick={aoFechar}>Fechar</Button>
          {qr ? (
            <Button icon={Printer} onClick={() => window.print()}>
              Imprimir
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {qr ? (
          <>
            <ImagemDoQr url={qr.url} />
            <p className="m-0 text-sm font-semibold">{e.titulo}</p>
            <p className="m-0 text-xs break-all text-ink-muted">{qr.url}</p>
            <Alert tone="info">
              Guarde ou imprima agora: por segurança, este endereço não é mostrado de novo. Gerar
              outro QR invalida este.
            </Alert>
          </>
        ) : (
          <>
            {e.checkinAtivo ? (
              <Alert tone="warning">
                Este evento já tem um QR. Gerar outro faz o anterior parar de valer (inclusive o
                impresso).
              </Alert>
            ) : null}
            <p className="m-0 text-sm text-ink-muted">
              O check-in abre 1 hora antes do início e fecha 1 hora depois do fim.
              {e.checkinExigeCodigo
                ? ' Sem login, a pessoa confirma com o código enviado ao e-mail da inscrição.'
                : ' Sem login, a pessoa só informa o e-mail da inscrição.'}
            </p>
            <Button variant="primary" icon={QrCode} loading={ocupado} onClick={() => void gerar()}>
              {e.checkinAtivo ? 'Gerar novo QR' : 'Gerar QR'}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}

function DialogoDeIncluir({
  e,
  aoFechar,
  aoIncluir,
}: {
  e: Evento
  aoFechar: () => void
  aoIncluir: () => void
}) {
  const servicos = useServicos()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const incluir = async () => {
    setErro(null)
    setOcupado(true)
    const r = await servicos.portal.eventos.incluirParticipante(e.id, {
      nome: nome.trim(),
      email: email.trim(),
      telefone: telefone.trim() || null,
      cnpj: cnpj.trim() || null,
    })
    setOcupado(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    toast.success('Participante incluído com presença')
    aoIncluir()
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !ocupado) aoFechar()
      }}
      title="Incluir participante"
      description="Para quem veio sem se inscrever: entra já com a presença registrada."
      width={520}
      footer={
        <>
          <Button disabled={ocupado} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={ocupado}
            disabled={nome.trim().length < 2 || !email.includes('@')}
            onClick={() => void incluir()}
          >
            Incluir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        <TextField
          label="Nome"
          required
          value={nome}
          maxLength={160}
          onChange={(x) => setNome(x.target.value)}
        />
        <TextField
          label="E-mail"
          type="email"
          required
          value={email}
          maxLength={254}
          onChange={(x) => setEmail(x.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Telefone"
            value={telefone}
            maxLength={20}
            onChange={(x) => setTelefone(x.target.value)}
          />
          <TextField
            label="CNPJ da empresa"
            value={cnpj}
            maxLength={18}
            hint="Com o vínculo ao CRM ligado, a empresa e o contato vão para a carteira."
            onChange={(x) => setCnpj(x.target.value)}
          />
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Ações do dia do evento (Fase 4G): QR de check-in, incluir quem veio, encerrar e pedir a avaliação, e os
 * relatórios de inscritos.
 */
export function AcoesDoEvento({
  e,
  agora,
  aoMudar,
}: {
  e: Evento
  agora: number
  aoMudar: () => void
}) {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const [qr, setQr] = useState(false)
  const [incluindo, setIncluindo] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const agenda = pode('portal.agenda')
  const presenca = agenda || pode('portal.eventos_presenca')
  const relatorios = agenda || pode('portal.eventos_relatorios')
  if (e.situacao !== 'publicado') return null
  const comecou = jaComecou(e, agora)
  const encerrado = e.encerradoEm !== null

  const exportar = async (formato: 'csv' | 'xlsx' | 'html') => {
    const r = await servicos.portal.eventos.exportarInscritos(e.id, formato)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    const url = URL.createObjectURL(r.dados.conteudo)
    if (formato === 'html') {
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = r.dados.nome
    a.click()
    URL.revokeObjectURL(url)
  }
  const encerrar = async () => {
    setOcupado(true)
    const r = await servicos.portal.eventos.encerrar(e.id)
    setOcupado(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    setEncerrando(false)
    toast.success(
      e.formularioAvaliacaoId
        ? 'Evento encerrado. O pedido de avaliação está a caminho de quem esteve presente.'
        : 'Evento encerrado',
    )
    aoMudar()
  }
  const reenviar = async () => {
    const r = await servicos.portal.eventos.reenviarAvaliacao(e.id)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    toast.success('Pedido de avaliação reenviado a quem ainda não avaliou')
    aoMudar()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {agenda && !encerrado ? (
          <Button size="sm" icon={QrCode} onClick={() => setQr(true)}>
            QR de check-in
          </Button>
        ) : null}
        {presenca && comecou && !encerrado ? (
          <Button size="sm" icon={UserPlus} onClick={() => setIncluindo(true)}>
            Incluir participante
          </Button>
        ) : null}
        {agenda && comecou && !encerrado ? (
          <Button size="sm" icon={CheckCheck} onClick={() => setEncerrando(true)}>
            Encerrar evento
          </Button>
        ) : null}
        {relatorios ? (
          <>
            <Button size="sm" variant="ghost" icon={Download} onClick={() => void exportar('csv')}>
              CSV
            </Button>
            <Button size="sm" variant="ghost" icon={Download} onClick={() => void exportar('xlsx')}>
              Excel
            </Button>
            <Button size="sm" variant="ghost" icon={Printer} onClick={() => void exportar('html')}>
              Imprimir / PDF
            </Button>
          </>
        ) : null}
      </div>
      {encerrado ? (
        <div className="flex flex-wrap items-center gap-3 rounded-sm bg-surface-sunken p-3 text-sm">
          <span>
            Encerrado · {e.presentes} {e.presentes === 1 ? 'presente' : 'presentes'}
            {e.formularioAvaliacaoId
              ? ` · ${e.avaliaram} ${e.avaliaram === 1 ? 'avaliou' : 'avaliaram'}`
              : ''}
          </span>
          {agenda && e.formularioAvaliacaoId && e.avaliaram < e.presentes ? (
            <Button size="sm" icon={Send} onClick={() => void reenviar()}>
              Reenviar pedido de avaliação
            </Button>
          ) : null}
          {e.formularioAvaliacaoId ? (
            <span className="text-xs text-ink-muted">
              Até {MAXIMO_DE_LEMBRETES_DE_AVALIACAO} pedidos por pessoa.
            </span>
          ) : null}
        </div>
      ) : null}

      {qr ? <DialogoDoQr e={e} aoFechar={() => setQr(false)} /> : null}
      {incluindo ? (
        <DialogoDeIncluir
          e={e}
          aoFechar={() => setIncluindo(false)}
          aoIncluir={() => {
            setIncluindo(false)
            aoMudar()
          }}
        />
      ) : null}
      {encerrando ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v && !ocupado) setEncerrando(false)
          }}
          title="Encerrar evento"
          description={
            e.formularioAvaliacaoId
              ? 'Quem não tem presença fica como ausente. Quem esteve presente recebe o pedido de avaliação (no portal e, para quem não tem acesso, por e-mail se ligado em Configurações).'
              : 'Quem não tem presença fica como ausente. O evento não tem formulário de avaliação.'
          }
          footer={
            <>
              <Button disabled={ocupado} onClick={() => setEncerrando(false)}>
                Voltar
              </Button>
              <Button variant="primary" loading={ocupado} onClick={() => void encerrar()}>
                Encerrar
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">
            Encerrar “{e.titulo}”? Registre antes a presença de quem veio sem fazer o check-in.
          </p>
        </Dialog>
      ) : null}
    </div>
  )
}
