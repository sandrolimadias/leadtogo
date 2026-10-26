import type { AreaDeAtendimento } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { TextArea, TextField } from '@leadtogo/ui/campos'
import { Checkbox, Switch } from '@leadtogo/ui/checkbox'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { useOpcoesDeConfiguracao } from './opcoes'

const minutos = (v: number | null) => (v === null ? 'sem meta' : `${v} min úteis`)

interface Formulario {
  id: string | null
  nome: string
  descricao: string
  metaRespostaMin: string
  metaResolucaoMin: string
  visivelNoPortal: boolean
  pulaTriagem: boolean
  ativa: boolean
}

const formularioDe = (a?: AreaDeAtendimento): Formulario =>
  a
    ? {
        id: a.id,
        nome: a.nome,
        descricao: a.descricao ?? '',
        metaRespostaMin: a.metaRespostaMin === null ? '' : String(a.metaRespostaMin),
        metaResolucaoMin: a.metaResolucaoMin === null ? '' : String(a.metaResolucaoMin),
        visivelNoPortal: a.visivelNoPortal,
        pulaTriagem: a.pulaTriagem,
        ativa: a.ativa,
      }
    : {
        id: null,
        nome: '',
        descricao: '',
        metaRespostaMin: '',
        metaResolucaoMin: '',
        visivelNoPortal: false,
        pulaTriagem: false,
        ativa: true,
      }

/** Meta em minutos úteis: vazio = sem meta (e sem alerta de prazo); senão um inteiro positivo. */
const lerMeta = (texto: string): number | null | 'invalida' => {
  const t = texto.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 && n <= 129_600 ? n : 'invalida'
}

function FormularioDaArea({
  inicial,
  aoFechar,
}: {
  inicial: Formulario
  aoFechar: (salvou: boolean) => void
}) {
  const servicos = useServicos()
  const [f, setF] = useState(inicial)
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const resposta = lerMeta(f.metaRespostaMin)
  const resolucao = lerMeta(f.metaResolucaoMin)
  const semNome = f.nome.trim() === ''

  const salvar = async () => {
    setTentou(true)
    if (semNome || resposta === 'invalida' || resolucao === 'invalida') return
    setSalvando(true)
    setErro(null)
    const dados = {
      nome: f.nome.trim(),
      descricao: f.descricao.trim() || null,
      metaRespostaMin: resposta,
      metaResolucaoMin: resolucao,
      visivelNoPortal: f.visivelNoPortal,
      pulaTriagem: f.pulaTriagem,
    }
    const r = f.id
      ? await servicos.chamados.areas.alterar(f.id, { ...dados, ativa: f.ativa })
      : await servicos.chamados.areas.criar(dados)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(f.id ? 'Área salva' : 'Área criada')
    aoFechar(true)
  }

  return (
    <Dialog
      open
      onOpenChange={(a) => (a ? undefined : aoFechar(false))}
      title={f.id ? 'Editar área' : 'Nova área'}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => aoFechar(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={salvando} onClick={() => void salvar()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        <TextField
          label="Nome"
          required
          value={f.nome}
          maxLength={80}
          onChange={(e) => setF({ ...f, nome: e.target.value })}
          error={tentou && semNome ? 'Informe o nome da área.' : undefined}
        />
        <TextArea
          label="Descrição"
          value={f.descricao}
          maxLength={500}
          onChange={(e) => setF({ ...f, descricao: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <TextField
            label="Meta de primeira resposta (min úteis)"
            inputMode="numeric"
            value={f.metaRespostaMin}
            hint="Vazio = sem meta e sem alerta de prazo."
            onChange={(e) => setF({ ...f, metaRespostaMin: e.target.value })}
            error={
              tentou && resposta === 'invalida' ? 'Use um número inteiro de minutos.' : undefined
            }
          />
          <TextField
            label="Meta de resolução (min úteis)"
            inputMode="numeric"
            value={f.metaResolucaoMin}
            hint="Vazio = sem meta e sem alerta de prazo."
            onChange={(e) => setF({ ...f, metaResolucaoMin: e.target.value })}
            error={
              tentou && resolucao === 'invalida' ? 'Use um número inteiro de minutos.' : undefined
            }
          />
        </div>
        <Switch
          label="Pula a triagem (com a triagem ligada, o chamado cai direto nesta área)"
          checked={f.pulaTriagem}
          onChange={(e) => setF({ ...f, pulaTriagem: e.target.checked })}
        />
        <Switch
          label="Visível no portal do cliente"
          checked={f.visivelNoPortal}
          onChange={(e) => setF({ ...f, visivelNoPortal: e.target.checked })}
        />
        {f.id ? (
          <Switch
            label="Ativa (inativa some das escolhas novas e continua nos chamados que já tem)"
            checked={f.ativa}
            onChange={(e) => setF({ ...f, ativa: e.target.checked })}
          />
        ) : null}
      </div>
    </Dialog>
  )
}

/** Quem atende a área: membros (com o gestor da área marcado) e perfis inteiros. */
function MembrosDaArea({
  area,
  aoFechar,
}: {
  area: AreaDeAtendimento
  aoFechar: (salvou: boolean) => void
}) {
  const servicos = useServicos()
  const opcoes = useOpcoesDeConfiguracao()
  const [membros, setMembros] = useState(
    () =>
      new Map(area.membros.filter((m) => m.membroId).map((m) => [m.membroId as string, m.gestor])),
  )
  const [perfis, setPerfis] = useState(
    () => new Set(area.membros.filter((m) => m.perfilId).map((m) => m.perfilId as string)),
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    const r = await servicos.chamados.areas.membros(area.id, {
      membros: [...membros].map(([membroId, gestor]) => ({ membroId, gestor })),
      perfilIds: [...perfis],
    })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Quem atende a área foi salvo')
    aoFechar(true)
  }

  return (
    <Dialog
      open
      onOpenChange={(a) => (a ? undefined : aoFechar(false))}
      title={`Quem atende · ${area.nome}`}
      description="Os membros e os perfis marcados recebem os chamados desta área. O gestor da área também atribui."
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => aoFechar(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={salvando} onClick={() => void salvar()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        {opcoes.isPending ? (
          <Skeleton lines={4} />
        ) : opcoes.isError ? (
          <Alert tone="danger">Não consegui carregar as pessoas e os perfis.</Alert>
        ) : (
          <>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 text-[13px] font-semibold">Pessoas</legend>
              {opcoes.data.membros.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <Checkbox
                    label={m.nome}
                    checked={membros.has(m.id)}
                    onChange={(e) => {
                      const novo = new Map(membros)
                      if (e.target.checked) novo.set(m.id, false)
                      else novo.delete(m.id)
                      setMembros(novo)
                    }}
                  />
                  {membros.has(m.id) ? (
                    <Checkbox
                      label="Gestor da área"
                      aria-label={`Gestor da área: ${m.nome}`}
                      checked={membros.get(m.id) === true}
                      onChange={(e) => setMembros(new Map(membros).set(m.id, e.target.checked))}
                    />
                  ) : null}
                </div>
              ))}
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 text-[13px] font-semibold">Perfis de acesso inteiros</legend>
              {opcoes.data.perfis.map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.nome}
                  checked={perfis.has(p.id)}
                  onChange={(e) => {
                    const novo = new Set(perfis)
                    if (e.target.checked) novo.add(p.id)
                    else novo.delete(p.id)
                    setPerfis(novo)
                  }}
                />
              ))}
            </fieldset>
          </>
        )}
      </div>
    </Dialog>
  )
}

/** Configurações → Chamados → Áreas (`chamados.gerir_areas`). */
export function AreasDeAtendimento() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const lista = useQuery({
    queryKey: ['chamados', 'areas', 'config'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.areas.listar(true)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [editando, setEditando] = useState<Formulario | null>(null)
  const [membros, setMembros] = useState<AreaDeAtendimento | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const atualizar = () => {
    void queryClient.invalidateQueries({ queryKey: ['chamados', 'areas'] })
  }
  const excluir = async (a: AreaDeAtendimento) => {
    setErro(null)
    const r = await servicos.chamados.areas.excluir(a.id)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Área excluída')
    atualizar()
  }

  return (
    <section aria-label="Áreas de atendimento" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="m-0 flex-1 text-sm text-ink-muted">
          As áreas recebem os chamados. Metas vazias não contam prazo. Área que já teve chamado só
          se inativa.
        </p>
        <Button variant="primary" icon={Plus} onClick={() => setEditando(formularioDe())}>
          Nova área
        </Button>
      </div>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      {lista.isPending ? (
        <Skeleton lines={4} />
      ) : lista.isError ? (
        <Alert tone="danger">Não consegui carregar as áreas. {lista.error.message}</Alert>
      ) : lista.data.length === 0 ? (
        <EmptyState title="Nenhuma área" description="Crie a primeira área de atendimento." />
      ) : (
        <ul
          aria-label="Áreas"
          className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
        >
          {lista.data.map((a) => (
            <li
              key={a.id}
              aria-label={a.nome}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
                <span className="flex items-center gap-2 font-semibold">
                  {a.nome}
                  {!a.ativa ? <Badge>Inativa</Badge> : null}
                  {a.pulaTriagem ? <Badge tone="info">Pula a triagem</Badge> : null}
                  {a.visivelNoPortal ? <Badge tone="accent">No portal</Badge> : null}
                </span>
                <span className="text-xs text-ink-muted">
                  Resposta: {minutos(a.metaRespostaMin)} · Resolução: {minutos(a.metaResolucaoMin)}{' '}
                  · {a.chamadosAbertos} aberto{a.chamadosAbertos === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-ink-muted">
                  {a.membros.length === 0
                    ? 'Ninguém definido (quem atende qualquer área pode receber)'
                    : a.membros
                        .map((m) => m.membroNome ?? `Perfil ${m.perfilNome ?? ''}`)
                        .join(', ')}
                </span>
              </div>
              <Button size="sm" icon={Users} onClick={() => setMembros(a)}>
                Quem atende
              </Button>
              <Button size="sm" icon={Pencil} onClick={() => setEditando(formularioDe(a))}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                icon={Trash2}
                aria-label={`Excluir ${a.nome}`}
                onClick={() => void excluir(a)}
              >
                Excluir
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editando ? (
        <FormularioDaArea
          inicial={editando}
          aoFechar={(salvou) => {
            setEditando(null)
            if (salvou) atualizar()
          }}
        />
      ) : null}
      {membros ? (
        <MembrosDaArea
          area={membros}
          aoFechar={(salvou) => {
            setMembros(null)
            if (salvou) atualizar()
          }}
        />
      ) : null}
    </section>
  )
}
