import { Mail } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'

import { Centralizado } from '@/components/centralizado'
import { useServicos } from '@/servicos/contexto'

/** Pedir o link de entrada por e-mail. A resposta é a mesma tenha o e-mail acesso ou não. */
export function TelaEntrar() {
  const servicos = useServicos()
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await servicos.entrada.pedir(email.trim())
    setEnviando(false)
    if (!r.ok) setErro(r.erro.mensagem)
    else setMensagem(r.dados.mensagem)
  }

  if (mensagem) {
    return (
      <Centralizado titulo="Confira seu e-mail">
        <Alert tone="success" title="Pedido enviado">
          {mensagem}
        </Alert>
        <p className="mt-4 mb-0 text-sm leading-5 text-ink-muted">
          Não chegou? Veja a caixa de spam ou{' '}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-brand underline"
            onClick={() => setMensagem(null)}
          >
            peça de novo
          </button>
          .
        </p>
      </Centralizado>
    )
  }

  return (
    <Centralizado
      titulo="Entrar"
      descricao="Informe o e-mail do seu acesso. Enviamos um link de entrada: não há senha para lembrar."
    >
      <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-4" noValidate>
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
          Enviar link de entrada
        </Button>
      </form>
    </Centralizado>
  )
}
