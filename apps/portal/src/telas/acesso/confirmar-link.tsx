import type { PreviaDoLink } from '@leadtogo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'

import { CHAVE_DA_SESSAO } from '@/app/guardas'
import { Centralizado } from '@/components/centralizado'
import { useServicos } from '@/servicos/contexto'

const ROTULO_DA_FINALIDADE: Record<PreviaDoLink['finalidade'], { titulo: string; botao: string }> =
  {
    convite: { titulo: 'Ative seu acesso', botao: 'Confirmar acesso' },
    entrada: { titulo: 'Entrar no portal', botao: 'Entrar' },
    troca_email: { titulo: 'Confirme o novo e-mail', botao: 'Confirmar novo e-mail' },
  }

/** O token vem no fragmento (#): não vai para o servidor nem para o cabeçalho Referer. */
const lerToken = () => decodeURIComponent(window.location.hash.replace(/^#/, ''))

/**
 * Página de confirmação do link. Abrir a página NÃO consome o link (verificadores de e-mail abrem os links
 * antes da pessoa): só o botão, que faz um POST.
 */
export function TelaConfirmarLink() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const [token] = useState(lerToken)
  const [previa, setPrevia] = useState<PreviaDoLink | null>(null)
  const [erro, setErro] = useState<string | null>(() =>
    token ? null : 'Este link está incompleto. Peça um novo link de entrada.',
  )
  const [aceita, setAceita] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    // tira o token da barra de endereço e do histórico
    window.history.replaceState(null, '', window.location.pathname)
    if (!token) return
    void servicos.entrada.previa(token).then((r) => {
      if (r.ok) setPrevia(r.dados)
      else setErro(r.erro.mensagem)
    })
  }, [servicos, token])

  const confirmar = async () => {
    if (!previa) return
    setEnviando(true)
    setErro(null)
    const r = await servicos.entrada.consumir(token, aceita)
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    queryClient.setQueryData(CHAVE_DA_SESSAO, r.dados)
    await navegar({ to: r.dados.segundoFatorPendente ? '/verificacao' : '/' })
  }

  if (erro && !previa) {
    return (
      <Centralizado titulo="Link inválido">
        <Alert tone="danger" title={erro} />
        <div className="mt-4">
          <Button variant="primary" onClick={() => void navegar({ to: '/entrar' })} block>
            Pedir um novo link
          </Button>
        </div>
      </Centralizado>
    )
  }
  if (!previa) {
    return (
      <Centralizado titulo="Conferindo o link…">
        <Skeleton lines={3} />
      </Centralizado>
    )
  }
  const rotulo = ROTULO_DA_FINALIDADE[previa.finalidade]
  return (
    <Centralizado
      titulo={rotulo.titulo}
      descricao={`${previa.nomeDoPortal} · ${previa.empresaCliente}`}
    >
      <div className="flex flex-col gap-4">
        {erro ? <Alert tone="danger" title={erro} /> : null}
        {previa.exigeAceiteDePrivacidade ? (
          <Checkbox
            checked={aceita}
            onChange={(e) => setAceita(e.target.checked)}
            label="Li e aceito o aviso de privacidade"
            description="Guardamos seu nome, e-mail, telefone, cargo e o que você escreve no portal para atender você e a sua empresa."
          />
        ) : null}
        <Button
          variant="primary"
          loading={enviando}
          disabled={previa.exigeAceiteDePrivacidade && !aceita}
          onClick={() => void confirmar()}
          block
        >
          {rotulo.botao}
        </Button>
      </div>
    </Centralizado>
  )
}
