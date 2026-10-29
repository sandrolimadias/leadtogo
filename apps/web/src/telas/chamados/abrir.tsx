import {
  PRIORIDADES_DO_CHAMADO,
  ROTULO_DA_PRIORIDADE,
  type PrioridadeDoChamado,
} from '@leadtogo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { useAreasDeAtendimento } from './areas'

/**
 * "Abrir chamado": assunto, o que está acontecendo, a área (ou "não sei") e a prioridade. Da ficha da
 * empresa, o chamado já nasce ligado a ela (`empresa`).
 */
export function AbrirChamado({
  aberto,
  aoFechar,
  empresa,
}: {
  aberto: boolean
  aoFechar: () => void
  empresa?: { id: string; nome: string }
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const areas = useAreasDeAtendimento()
  const [assunto, setAssunto] = useState('')
  const [descricao, setDescricao] = useState('')
  const [areaId, setAreaId] = useState('')
  const [prioridade, setPrioridade] = useState<PrioridadeDoChamado>('normal')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [tentou, setTentou] = useState(false)
  const faltaAssunto = assunto.trim().length < 3

  const enviar = async () => {
    setTentou(true)
    if (faltaAssunto) return
    setEnviando(true)
    setErro(null)
    const r = await servicos.chamados.abrir({
      assunto: assunto.trim(),
      ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
      areaId: areaId || null,
      prioridade,
      ...(empresa ? { empresaClienteId: empresa.id } : {}),
    })
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['chamados'] })
    toast.success(`Chamado ${r.dados.codigo} aberto`)
    setAssunto('')
    setDescricao('')
    setAreaId('')
    setPrioridade('normal')
    setTentou(false)
    aoFechar()
    void navegar({ to: '/chamados/$chamadoId', params: { chamadoId: r.dados.id } })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => (a ? undefined : aoFechar())}
      title="Abrir chamado"
      description="Conte o que precisa. Se não souber a área, a triagem encaminha."
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" loading={enviando} onClick={() => void enviar()}>
            Abrir chamado
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        {empresa ? (
          <p className="m-0 text-sm">
            <span className="font-semibold">Empresa:</span> {empresa.nome}
          </p>
        ) : null}
        <TextField
          label="Assunto"
          required
          value={assunto}
          maxLength={200}
          onChange={(e) => setAssunto(e.target.value)}
          error={tentou && faltaAssunto ? 'Descreva o assunto em poucas palavras.' : undefined}
        />
        <TextArea
          label="O que está acontecendo"
          value={descricao}
          maxLength={10000}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Select
            label="Área"
            value={areaId}
            placeholder="Não sei (vai para a triagem)"
            options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
            onChange={(e) => setAreaId(e.target.value)}
          />
          <Select
            label="Prioridade"
            value={prioridade}
            options={PRIORIDADES_DO_CHAMADO.map((p) => ({
              value: p,
              label: ROTULO_DA_PRIORIDADE[p],
            }))}
            onChange={(e) => setPrioridade(e.target.value as PrioridadeDoChamado)}
          />
        </div>
      </div>
    </Dialog>
  )
}
