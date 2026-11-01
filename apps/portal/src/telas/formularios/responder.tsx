import type { FormularioParaResponder, Respostas } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

import { Checkbox } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { FormularioDinamico, type ResultadoDoEnvio } from '@leadtogo/ui/formulario'

import { Centralizado } from '@/components/centralizado'
import type { Resultado } from '@/servicos/resultado'
import { useServicos } from '@/servicos/contexto'

import { Captcha } from './captcha'

/** O resultado da API vira o que o formulário mostra: erros por campo ou a mensagem geral. */
function comoResultado(r: Resultado<{ mensagem: string }>): ResultadoDoEnvio | null {
  if (r.ok) return null
  return {
    mensagem: r.erro.mensagem,
    ...(r.erro.detalhes
      ? { erros: Object.fromEntries(r.erro.detalhes.map((d) => [d.campo, d.mensagem])) }
      : {}),
  }
}

function Enviado({ mensagem }: { mensagem: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
      <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
      <p className="m-0 text-base">{mensagem}</p>
    </div>
  )
}

/** Formulário dentro do portal, para quem está logado (com o preenchimento automático do cadastro). */
export function TelaResponderFormulario({ id }: { id: string }) {
  const servicos = useServicos()
  const [enviado, setEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const f = useQuery({
    queryKey: ['formulario', id],
    retry: false,
    queryFn: async () => {
      const r = await servicos.formularios.abrir(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const enviar = async (dados: FormularioParaResponder, botao: string, respostas: Respostas) => {
    setEnviando(true)
    const r = await servicos.formularios.responder(id, { versao: dados.versao, botao, respostas })
    setEnviando(false)
    if (r.ok) setEnviado(r.dados.mensagem)
    return comoResultado(r) ?? undefined
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      {f.isError ? <Alert tone="danger">{f.error.message}</Alert> : null}
      {!f.data ? (
        f.isError ? null : (
          <Skeleton lines={6} />
        )
      ) : (
        <>
          <h1 className="m-0 text-2xl leading-8 font-semibold">{f.data.nome}</h1>
          <section className="rounded-md border border-border bg-surface p-4">
            {enviado ? (
              <Enviado mensagem={enviado} />
            ) : (
              <FormularioDinamico
                definicao={f.data.definicao}
                preenchidos={f.data.preenchidos}
                travados={f.data.travados}
                enviando={enviando}
                aoEnviar={(botao, respostas) => enviar(f.data, botao, respostas)}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

/**
 * Formulário público (`/f/<endereço>`): sem login, com o aceite de privacidade e o campo isca (escondido de quem
 * usa o site; robô preenche). O captcha entra quando o formulário pede e a chave está configurada.
 */
export function TelaFormularioPublico({ slug }: { slug: string }) {
  const servicos = useServicos()
  const [enviado, setEnviado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [aceita, setAceita] = useState(false)
  const [isca, setIsca] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const f = useQuery({
    queryKey: ['formulario-publico', slug],
    retry: false,
    queryFn: async () => {
      const r = await servicos.formularios.abrirPublico(slug)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (f.isError) {
    return (
      <Centralizado titulo="Formulário indisponível">
        <Alert tone="danger">{f.error.message}</Alert>
      </Centralizado>
    )
  }
  if (!f.data) {
    return (
      <Centralizado titulo="Carregando…">
        <Skeleton lines={4} />
      </Centralizado>
    )
  }
  const dados = f.data
  const enviar = async (botao: string, respostas: Respostas) => {
    if (!aceita) return { mensagem: 'Para enviar, aceite o aviso de privacidade.' }
    if (dados.captchaChave && !captcha) {
      return { mensagem: 'Confirme que você não é um robô.' }
    }
    setEnviando(true)
    const r = await servicos.formularios.responderPublico(slug, {
      versao: dados.versao,
      botao,
      respostas,
      aceitaPrivacidade: true,
      ...(isca ? { site: isca } : {}),
      ...(captcha ? { captcha } : {}),
    })
    setEnviando(false)
    if (r.ok) setEnviado(r.dados.mensagem)
    return comoResultado(r) ?? undefined
  }
  return (
    <main className="min-h-dvh overflow-y-auto bg-bg px-4 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h1 className="m-0 text-2xl leading-8 font-semibold">{dados.nome}</h1>
        {enviado ? (
          <Enviado mensagem={enviado} />
        ) : (
          <FormularioDinamico
            definicao={dados.definicao}
            enviando={enviando}
            aoEnviar={enviar}
            rodape={
              <div className="flex flex-col gap-2">
                <Checkbox
                  checked={aceita}
                  onChange={(e) => setAceita(e.target.checked)}
                  label="Li e aceito o aviso de privacidade"
                  description="Usamos os dados deste formulário só para responder ao seu pedido."
                />
                {dados.captchaChave ? (
                  <Captcha chave={dados.captchaChave} aoResolver={setCaptcha} />
                ) : null}
                {/* Campo isca: escondido de quem usa o site */}
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
        )}
      </div>
    </main>
  )
}
