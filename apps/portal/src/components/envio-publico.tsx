import type { FormularioParaResponder, Respostas } from '@leadtogo/shared'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

import { Checkbox } from '@leadtogo/ui/checkbox'
import { FormularioDinamico, type ResultadoDoEnvio } from '@leadtogo/ui/formulario'

import { Captcha } from '@/telas/formularios/captcha'

/**
 * Formulário sem login (página pública, Fase 4H): aceite de privacidade, captcha quando o formulário pede e o
 * campo isca (escondido de quem usa o site; robô preenche). Quem envia recebe a mensagem de sucesso.
 */
export function EnvioPublico({
  formulario,
  enviar,
}: {
  formulario: FormularioParaResponder
  enviar: (dados: {
    versao: number
    botao: string
    respostas: Respostas
    aceitaPrivacidade: true
    site?: string
    captcha?: string
  }) => Promise<{ ok: true; mensagem: string } | { ok: false; resultado: ResultadoDoEnvio }>
}) {
  const [aceita, setAceita] = useState(false)
  const [isca, setIsca] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState<string | null>(null)
  if (enviado) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
        <p className="m-0 text-base">{enviado}</p>
      </div>
    )
  }
  return (
    <FormularioDinamico
      definicao={formulario.definicao}
      enviando={enviando}
      aoEnviar={async (botao, respostas) => {
        if (!aceita) return { mensagem: 'Para enviar, aceite o aviso de privacidade.' }
        if (formulario.captchaChave && !captcha) {
          return { mensagem: 'Confirme que você não é um robô.' }
        }
        setEnviando(true)
        const r = await enviar({
          versao: formulario.versao,
          botao,
          respostas,
          aceitaPrivacidade: true,
          ...(isca ? { site: isca } : {}),
          ...(captcha ? { captcha } : {}),
        })
        setEnviando(false)
        if (r.ok) {
          setEnviado(r.mensagem)
          return undefined
        }
        return r.resultado
      }}
      rodape={
        <div className="flex flex-col gap-2">
          <Checkbox
            checked={aceita}
            onChange={(e) => setAceita(e.target.checked)}
            label="Li e aceito o aviso de privacidade"
            description="Usamos estes dados só para a sua inscrição e o contato sobre ela."
          />
          {formulario.captchaChave ? (
            <Captcha chave={formulario.captchaChave} aoResolver={setCaptcha} />
          ) : null}
          <input
            type="text"
            name="site"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
            value={isca}
            onChange={(e) => setIsca(e.target.value)}
          />
        </div>
      }
    />
  )
}
