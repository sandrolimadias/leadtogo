import type { FormularioParaResponder, Respostas } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'

import { Dialog } from '@leadtogo/ui/dialog'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { FormularioDinamico, type ResultadoDoEnvio } from '@leadtogo/ui/formulario'

import type { Resultado } from '@/servicos/resultado'

/**
 * Formulário do evento num diálogo (Fase 4G): a inscrição (preenchida com o cadastro para conferência) ou a
 * avaliação de quem esteve presente.
 */
export function DialogoDoFormularioDoEvento({
  chave,
  titulo,
  descricao,
  carregar,
  enviar,
  enviando,
  aoFechar,
}: {
  chave: readonly unknown[]
  titulo: string
  descricao: string
  carregar: () => Promise<Resultado<FormularioParaResponder>>
  enviar: (
    f: FormularioParaResponder,
    botao: string,
    respostas: Respostas,
  ) => Promise<ResultadoDoEnvio | undefined>
  enviando: boolean
  aoFechar: () => void
}) {
  const f = useQuery({
    queryKey: chave,
    retry: false,
    queryFn: async () => {
      const r = await carregar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !enviando) aoFechar()
      }}
      title={titulo}
      description={descricao}
      width={640}
    >
      {f.isError ? <Alert tone="danger">{f.error.message}</Alert> : null}
      {!f.data ? (
        f.isError ? null : (
          <Skeleton lines={5} />
        )
      ) : (
        <FormularioDinamico
          definicao={f.data.definicao}
          preenchidos={f.data.preenchidos}
          travados={f.data.travados}
          enviando={enviando}
          aoEnviar={(botao, respostas) => enviar(f.data, botao, respostas)}
        />
      )}
    </Dialog>
  )
}
