import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { useServicos } from '@/servicos/contexto'

const NAO_SEI = ''

/** Abrir um chamado: assunto, área ("não sei" vai para a triagem) e descrição. A empresa vem da sua sessão. */
export function TelaNovoChamado() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const [assunto, setAssunto] = useState('')
  const [areaId, setAreaId] = useState(NAO_SEI)
  const [descricao, setDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const areas = useQuery({
    queryKey: ['areas'],
    queryFn: async () => {
      const r = await servicos.areas()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await servicos.chamados.abrir({
      assunto: assunto.trim(),
      descricao: descricao.trim() || null,
      areaId: areaId || null,
    })
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(`Chamado ${r.dados.codigo} aberto`)
    void queryClient.invalidateQueries({ queryKey: ['chamados'] })
    void queryClient.invalidateQueries({ queryKey: ['inicio'] })
    await navegar({ to: '/chamados/$chamadoId', params: { chamadoId: r.dados.id } })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="m-0 text-2xl leading-8 font-semibold">Abrir chamado</h1>
      <form
        onSubmit={(e) => void enviar(e)}
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4"
        noValidate
      >
        {erro ? <Alert tone="danger" title={erro} /> : null}
        <TextField
          label="Assunto"
          required
          maxLength={200}
          hint="Em poucas palavras: o que você precisa?"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
        />
        <Select
          label="Área"
          hint="Se não souber, deixe como está: a equipe encaminha."
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          options={[
            { value: NAO_SEI, label: 'Não sei' },
            ...(areas.data ?? []).map((a) => ({ value: a.id, label: a.nome })),
          ]}
        />
        <TextArea
          label="Descrição"
          hint="Conte o que aconteceu. Você poderá anexar arquivos na conversa, depois de abrir."
          maxLength={10000}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={() => void navegar({ to: '/chamados' })}>Cancelar</Button>
          <Button
            type="submit"
            variant="primary"
            loading={enviando}
            disabled={assunto.trim().length < 3}
          >
            Abrir chamado
          </Button>
        </div>
      </form>
    </div>
  )
}
