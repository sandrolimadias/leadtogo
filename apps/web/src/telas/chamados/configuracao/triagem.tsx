import type { ConfiguracaoDeTriagem } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select } from '@leadtogo/ui/campos'
import { Checkbox, Switch } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { useOpcoesDeConfiguracao } from './opcoes'

function Formulario({ inicial }: { inicial: ConfiguracaoDeTriagem }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const opcoes = useOpcoesDeConfiguracao()
  const [ativa, setAtiva] = useState(inicial.ativa)
  const [perfilId, setPerfilId] = useState(inicial.perfilId ?? '')
  const [membroIds, setMembroIds] = useState(() => new Set(inicial.membros.map((m) => m.membroId)))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    const r = await servicos.chamados.triagem.alterar({
      ativa,
      perfilId: perfilId || null,
      membroIds: [...membroIds],
    })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Triagem salva')
    void queryClient.invalidateQueries({ queryKey: ['chamados'] })
  }

  return (
    <form
      aria-label="Triagem"
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void salvar()
      }}
    >
      <p className="m-0 text-sm text-ink-muted">
        Desligada, o chamado cai direto na área. Ligada, ele espera em "Aguardando triagem" e só
        quem tria o vê, até escolher a área. Chamado em que o solicitante não sabe a área sempre
        passa pela triagem. Áreas marcadas como "Pula a triagem" recebem o chamado direto.
      </p>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <Switch label="Triagem ligada" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
      {opcoes.isPending ? (
        <Skeleton lines={4} />
      ) : opcoes.isError ? (
        <Alert tone="danger">Não consegui carregar as pessoas e os perfis.</Alert>
      ) : (
        <>
          <Select
            label="Perfil de triagem"
            value={perfilId}
            placeholder="Nenhum perfil"
            hint="Quem tem este perfil (e a permissão de triar) faz a triagem."
            options={opcoes.data.perfis.map((p) => ({ value: p.id, label: p.nome }))}
            onChange={(e) => setPerfilId(e.target.value)}
          />
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1 text-[13px] font-semibold">Pessoas que fazem a triagem</legend>
            {opcoes.data.membros.map((m) => (
              <Checkbox
                key={m.id}
                label={m.nome}
                checked={membroIds.has(m.id)}
                onChange={(e) => {
                  const novo = new Set(membroIds)
                  if (e.target.checked) novo.add(m.id)
                  else novo.delete(m.id)
                  setMembroIds(novo)
                }}
              />
            ))}
          </fieldset>
        </>
      )}
      <div>
        <Button type="submit" variant="primary" loading={salvando}>
          Salvar
        </Button>
      </div>
    </form>
  )
}

/** Configurações → Chamados → Triagem (`chamados.gerir_areas`). */
export function TriagemDosChamados() {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['chamados', 'triagem'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.triagem.ver()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (consulta.isPending) return <Skeleton lines={4} />
  if (consulta.isError)
    return <Alert tone="danger">Não consegui carregar a triagem. {consulta.error.message}</Alert>
  // a chave refaz o formulário quando o servidor devolve outro estado
  return <Formulario key={JSON.stringify(consulta.data)} inicial={consulta.data} />
}
