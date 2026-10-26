import type { Atividade } from '@leadtogo/api-client'
import { useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextArea, TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'
import { Janela } from '@/telas/cadastros/base'

import { paraCampoDeDataEHora } from './formatos'

/** Concluir: o resultado é obrigatório; a data em que aconteceu começa em "agora". */
export function JanelaDeConclusao({
  atividade,
  aoFechar,
  aoConcluir,
}: {
  atividade: Atividade
  aoFechar: () => void
  /** Devolve a mensagem de erro, ou nada se deu certo */
  aoConcluir: (
    resultado: string,
    quando: string,
    agendarProxima: boolean,
  ) => Promise<string | undefined>
}) {
  const [resultado, setResultado] = useState('')
  const [quando, setQuando] = useState(() => paraCampoDeDataEHora(new Date()))
  const [erroDoResultado, setErroDoResultado] = useState<string>()
  const [erro, setErro] = useState<string>()
  const [enviando, setEnviando] = useState(false)

  const enviar = async (agendarProxima: boolean) => {
    setErro(undefined)
    if (resultado.trim() === '') return setErroDoResultado('Informe o resultado.')
    setErroDoResultado(undefined)
    setEnviando(true)
    const mensagem = await aoConcluir(resultado.trim(), quando, agendarProxima)
    setEnviando(false)
    if (mensagem) setErro(mensagem)
  }

  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto && !enviando) aoFechar()
      }}
      title="Concluir atividade"
      description={atividade.titulo}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button disabled={enviando} onClick={() => void enviar(true)}>
            Concluir e agendar próxima
          </Button>
          <Button variant="primary" loading={enviando} onClick={() => void enviar(false)}>
            Concluir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        <TextArea
          label="Resultado"
          required
          rows={3}
          placeholder="O que aconteceu?"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          {...(erroDoResultado ? { error: erroDoResultado } : {})}
        />
        <TextField
          label="Quando aconteceu"
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
        />
      </div>
    </Janela>
  )
}
