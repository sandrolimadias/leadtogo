import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Copy, ShieldCheck } from 'lucide-react'
import QRCode from 'qrcode'
import { type FormEvent, useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import type { ConfiguracaoDoDoisFatores } from '@/auth/tipos'
import { CampoDeCodigo } from '@/components/acesso/campo-de-codigo'
import { CampoDeSenha } from '@/components/acesso/campo-de-senha'
import { Cabecalho } from '@/components/acesso/layout'
import { Button } from '@leadtogo/ui/button'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { classeDoLinkSuave, focarCampo, useEnvio } from './comum'

type Etapa = 'senha' | 'qr' | 'codigos'

function ImagemDoQr({ uri }: { uri: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let vivo = true
    void QRCode.toString(uri, { type: 'svg', margin: 1, width: 192 }).then((svg) => {
      if (vivo) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    })
    return () => {
      vivo = false
    }
  }, [uri])
  return src ? (
    <img
      src={src}
      alt="QR code para o app autenticador"
      width={192}
      height={192}
      className="rounded-md border border-border bg-white"
    />
  ) : (
    <span className="block size-48 rounded-md bg-surface-sunken" aria-hidden="true" />
  )
}

/**
 * Ativação obrigatória do 2FA (administradores). Três passos: confirmar a senha, ler o QR code (ou
 * digitar a chave) e confirmar com um código, e guardar os códigos de recuperação.
 */
export function TelaDeAtivarDoisFatores() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  return (
    <FluxoDeAtivacao
      aoConcluir={async () => {
        await queryClient.invalidateQueries({ queryKey: chaveDoMe })
        await navegar({ to: '/' })
      }}
      aoSair={async () => {
        await servicos.sair()
        await queryClient.invalidateQueries({ queryKey: chaveDoMe })
        await navegar({ to: '/login', search: { redirect: undefined } })
      }}
    />
  )
}

/**
 * Os três passos da ativação, usados na ativação obrigatória (`/ativar-2fa`) e na voluntária
 * (Meu perfil → Segurança). `aoSair` só existe na obrigatória (ali a pessoa não tem outra saída).
 */
export function FluxoDeAtivacao({
  aoConcluir,
  aoSair,
  aoCancelar,
}: {
  aoConcluir: () => Promise<void>
  aoSair?: () => Promise<void>
  aoCancelar?: () => void
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [etapa, setEtapa] = useState<Etapa>('senha')
  const [senha, setSenha] = useState('')
  const [erroDaSenha, setErroDaSenha] = useState<string | undefined>()
  const [configuracao, setConfiguracao] = useState<ConfiguracaoDoDoisFatores | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erroDoCodigo, setErroDoCodigo] = useState<string | undefined>()
  const [guardei, setGuardei] = useState(false)

  const confirmarSenha = (e: FormEvent) => {
    e.preventDefault()
    if (!senha) {
      setErroDaSenha('Digite a senha.')
      return focarCampo('ativar-senha')
    }
    void executar(async () => {
      const r = await servicos.prepararDoisFatores(senha)
      if (!r.ok) {
        setErroDaSenha(r.erro.codigo === 'INVALID_PASSWORD' ? 'Senha incorreta.' : r.erro.mensagem)
        return
      }
      setSenha('')
      setConfiguracao(r.dados)
      setEtapa('qr')
    })
  }

  const confirmarCodigo = (e: FormEvent) => {
    e.preventDefault()
    if (codigo.length < 6) {
      setErroDoCodigo('Digite os 6 números do código.')
      return
    }
    void executar(async () => {
      const r = await servicos.confirmarDoisFatores(codigo)
      if (!r.ok) {
        setErroDoCodigo(r.erro.mensagem)
        return
      }
      setEtapa('codigos')
    })
  }

  const concluir = (e: FormEvent) => {
    e.preventDefault()
    void executar(aoConcluir)
  }

  const copiar = async (texto: string, o_que: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success(`${o_que} copiado`)
    } catch {
      toast.error('Não foi possível copiar', { description: 'Selecione o texto e copie à mão.' })
    }
  }

  if (etapa === 'senha') {
    return (
      <form onSubmit={confirmarSenha} noValidate className="flex flex-col gap-5">
        <Cabecalho
          titulo="Ative a verificação em duas etapas"
          descricao={
            aoSair
              ? 'Para usar o Leadtogo nesta empresa, é preciso ativar a verificação em duas etapas. Primeiro, confirme sua senha.'
              : 'Proteja sua conta com um código do app autenticador. Primeiro, confirme sua senha.'
          }
        />
        <CampoDeSenha
          id="ativar-senha"
          label="Senha"
          autoComplete="current-password"
          autoFocus
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value)
            setErroDaSenha(undefined)
          }}
          error={erroDaSenha}
        />
        <Button type="submit" variant="primary" block size="lg" loading={enviando}>
          Continuar
        </Button>
        {aoSair ? (
          <button
            type="button"
            onClick={() => void aoSair()}
            className={`cursor-pointer self-center border-0 bg-transparent p-0 text-sm ${classeDoLinkSuave}`}
          >
            Sair
          </button>
        ) : null}
        {aoCancelar ? (
          <button
            type="button"
            onClick={aoCancelar}
            className={`cursor-pointer self-center border-0 bg-transparent p-0 text-sm ${classeDoLinkSuave}`}
          >
            Cancelar
          </button>
        ) : null}
      </form>
    )
  }

  if (etapa === 'qr' && configuracao) {
    return (
      <form onSubmit={confirmarCodigo} noValidate className="flex flex-col gap-5">
        <Cabecalho
          titulo="Leia o QR code"
          descricao="Abra um app autenticador (Google Authenticator, Microsoft Authenticator, 1Password...) e leia o código abaixo."
        />
        <div className="flex justify-center">
          <ImagemDoQr uri={configuracao.totpUri} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Ou digite a chave no app</span>
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-sunken px-3 py-2">
            <code
              className="min-w-0 flex-1 font-mono text-[13px] break-all"
              data-testid="chave-manual"
            >
              {configuracao.chave}
            </code>
            <Button
              size="sm"
              variant="ghost"
              icon={Copy}
              onClick={() => void copiar(configuracao.chave, 'Chave')}
            >
              Copiar
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold" id="rotulo-codigo">
            Digite o código de 6 números que o app mostra
          </span>
          <CampoDeCodigo
            valor={codigo}
            onChange={(c) => {
              setCodigo(c)
              setErroDoCodigo(undefined)
            }}
            erro={erroDoCodigo}
          />
        </div>
        <Button type="submit" variant="primary" block size="lg" loading={enviando}>
          Ativar verificação
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={concluir} noValidate className="flex flex-col gap-5">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
        <ShieldCheck size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <Cabecalho
        titulo="Guarde seus códigos de recuperação"
        descricao="Se você perder o celular, cada código entra uma vez no lugar do app. Eles não aparecem de novo."
      />
      <ul
        aria-label="Códigos de recuperação"
        className="m-0 grid list-none grid-cols-2 gap-2 rounded-md border border-border bg-surface-sunken p-4 font-mono text-[13px]"
      >
        {configuracao?.codigosDeBackup.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        icon={Copy}
        onClick={() => void copiar((configuracao?.codigosDeBackup ?? []).join('\n'), 'Códigos')}
      >
        Copiar os códigos
      </Button>
      <Alert tone="warning">
        Guarde num gerenciador de senhas ou imprima. Não os envie por e-mail.
      </Alert>
      <Checkbox
        label="Guardei meus códigos de recuperação"
        checked={guardei}
        onChange={(e) => setGuardei(e.target.checked)}
      />
      <Button
        type="submit"
        variant="primary"
        block
        size="lg"
        disabled={!guardei}
        loading={enviando}
      >
        Concluir
      </Button>
    </form>
  )
}
