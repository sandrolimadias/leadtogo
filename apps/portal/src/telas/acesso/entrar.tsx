import { KeyRound, Mail } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { Alert } from '@leadtogo/ui/feedback'

import { Centralizado } from '@/components/centralizado'
import { useServicos } from '@/servicos/contexto'

import { useDepoisDeEntrar } from './depois-de-entrar'

/** Segundos até liberar "Reenviar código" (o e-mail pode demorar um pouco). */
const ESPERA_PARA_REENVIAR_S = 60

/**
 * Entrar sem senha (Fase 4B): o e-mail recebe um código de 6 dígitos, que se digita aqui mesmo (bom no app
 * instalado no celular, onde o link abriria outro navegador). A resposta ao pedir é a mesma tenha o e-mail
 * acesso ou não.
 */
export function TelaEntrar() {
  const servicos = useServicos()
  const depoisDeEntrar = useDepoisDeEntrar()
  const [email, setEmail] = useState('')
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email')
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pedirAceite, setPedirAceite] = useState(false)
  const [aceita, setAceita] = useState(false)
  const [espera, setEspera] = useState(0)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  const pedir = async (e?: FormEvent) => {
    e?.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await servicos.entrada.pedir(email.trim())
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setMensagem(r.dados.mensagem)
    setEtapa('codigo')
    setCodigo('')
    setEspera(ESPERA_PARA_REENVIAR_S)
  }

  const so6 = codigo.replace(/\D/g, '')
  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await servicos.entrada.entrarComCodigo({
      email: email.trim(),
      codigo: so6,
      ...(pedirAceite ? { aceitaPrivacidade: aceita } : {}),
    })
    if (!r.ok) {
      setEnviando(false)
      if (r.erro.codigo === 'privacidade_obrigatoria') {
        setPedirAceite(true)
        return
      }
      setErro(r.erro.mensagem)
      return
    }
    await depoisDeEntrar(r.dados)
  }

  if (etapa === 'codigo') {
    return (
      <Centralizado
        titulo="Digite o código"
        descricao={`Enviamos um código de 6 dígitos para ${email.trim()}. Ele vale por 10 minutos.`}
      >
        <form onSubmit={(e) => void entrar(e)} className="flex flex-col gap-4" noValidate>
          {erro ? <Alert tone="danger" title={erro} /> : null}
          {mensagem && !erro ? <Alert tone="info">{mensagem}</Alert> : null}
          <TextField
            label="Código de acesso"
            autoComplete="one-time-code"
            inputMode="numeric"
            icon={KeyRound}
            maxLength={7}
            placeholder="000 000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/[^\d ]/g, ''))}
            autoFocus
          />
          {pedirAceite ? (
            <Checkbox
              checked={aceita}
              onChange={(e) => setAceita(e.target.checked)}
              label="Li e aceito o aviso de privacidade"
              description="Guardamos seu nome, e-mail, telefone, cargo e o que você escreve no portal para atender você e a sua empresa."
            />
          ) : null}
          <Button
            type="submit"
            variant="primary"
            loading={enviando}
            disabled={so6.length !== 6 || (pedirAceite && !aceita)}
            block
          >
            Entrar
          </Button>
        </form>
        <p className="mt-4 mb-0 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-5 text-ink-muted">
          <span>Não chegou? Veja a caixa de spam.</span>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-brand underline disabled:cursor-default disabled:text-ink-muted disabled:no-underline"
            disabled={espera > 0 || enviando}
            onClick={() => void pedir()}
          >
            {espera > 0 ? `Reenviar em ${espera} s` : 'Reenviar código'}
          </button>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-brand underline"
            onClick={() => {
              setEtapa('email')
              setErro(null)
              setPedirAceite(false)
            }}
          >
            Usar outro e-mail
          </button>
        </p>
      </Centralizado>
    )
  }

  return (
    <Centralizado
      titulo="Entrar"
      descricao="Informe o e-mail do seu acesso. Enviamos um código de 6 dígitos: não há senha para lembrar."
    >
      <form onSubmit={(e) => void pedir(e)} className="flex flex-col gap-4" noValidate>
        {erro ? <Alert tone="danger" title={erro} /> : null}
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          icon={Mail}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          loading={enviando}
          disabled={!email.includes('@')}
          block
        >
          Enviar código
        </Button>
      </form>
    </Centralizado>
  )
}
