import type { ModeloDeVisita, TagGrupo } from '@leadtogo/api-client'
import {
  CAMPOS_DA_EMPRESA_NA_VISITA,
  type CampoDaEmpresaNaVisita,
  type CampoDeVisita,
  camposDeVisitaSchema,
  ROTULO_DO_CAMPO_DA_EMPRESA,
  ROTULO_DO_TIPO_DE_CAMPO,
  TIPOS_DE_CAMPO_DE_VISITA,
  type TipoDeCampoDeVisita,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@/components/ui/button'
import { Select, TextArea, TextField } from '@/components/ui/campos'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { useEnvio } from '@/telas/acesso/comum'
import { BotoesDeOrdem, CabecalhoDeSecao, DialogoDeConfirmacao } from '@/telas/cadastros/base'
import { moverNaLista } from '@/telas/cadastros/ordem'

/** Campo em edição: o mesmo formato do jsonb, com as partes de cada tipo opcionais. */
interface CampoEmEdicao {
  id: string
  rotulo: string
  tipo: TipoDeCampoDeVisita
  obrigatorio: boolean
  opcoes?: { id: string; rotulo: string }[]
  tagId?: string
  campoEmpresa?: CampoDaEmpresaNaVisita
}

const ESCOLHAS: readonly TipoDeCampoDeVisita[] = ['escolha_unica', 'multipla_escolha']
const novoId = () => crypto.randomUUID()

/** Troca o tipo guardando só o que o tipo novo usa (o id e o rótulo ficam). */
function comTipo(
  campo: CampoEmEdicao,
  tipo: TipoDeCampoDeVisita,
  usados: CampoEmEdicao[],
): CampoEmEdicao {
  const base = { id: campo.id, rotulo: campo.rotulo, tipo, obrigatorio: campo.obrigatorio }
  if (ESCOLHAS.includes(tipo)) {
    return {
      ...base,
      opcoes: campo.opcoes ?? [
        { id: novoId(), rotulo: '' },
        { id: novoId(), rotulo: '' },
      ],
    }
  }
  if (tipo === 'tag') return { ...base, tagId: campo.tagId ?? '' }
  if (tipo === 'dados_empresa') {
    const livre =
      CAMPOS_DA_EMPRESA_NA_VISITA.find((c) => !usados.some((u) => u.campoEmpresa === c)) ??
      'nome_fantasia'
    return { ...base, campoEmpresa: campo.campoEmpresa ?? livre }
  }
  return base
}

/** Só o que o tipo usa, como a API espera. */
function paraGravar(c: CampoEmEdicao): CampoDeVisita {
  const base = { id: c.id, rotulo: c.rotulo.trim(), obrigatorio: c.obrigatorio }
  if (c.tipo === 'escolha_unica' || c.tipo === 'multipla_escolha') {
    return {
      ...base,
      tipo: c.tipo,
      opcoes: (c.opcoes ?? []).map((o) => ({ id: o.id, rotulo: o.rotulo.trim() })),
    }
  }
  if (c.tipo === 'tag') return { ...base, tipo: 'tag', tagId: c.tagId ?? '' }
  if (c.tipo === 'dados_empresa') {
    return { ...base, tipo: 'dados_empresa', campoEmpresa: c.campoEmpresa ?? 'nome_fantasia' }
  }
  return { ...base, tipo: c.tipo }
}

/** Tags que um campo "tag" pode aplicar: ativas, de grupo ativo e que não é automático. */
function tagsAplicaveis(grupos: TagGrupo[]) {
  return grupos
    .filter((g) => g.ativo && !g.automatico)
    .flatMap((g) => g.tags.filter((t) => t.ativo).map((t) => ({ ...t, grupo: g.nome })))
}

type Janela =
  { tipo: 'editar'; modelo: ModeloDeVisita | null } | { tipo: 'excluir'; modelo: ModeloDeVisita }

/**
 * Configurações → Visitas → Modelos: a lista de modelos do relatório e o construtor (campos
 * ordenáveis, com prévia). Editar um modelo que já tem relatório publica uma versão nova.
 */
export function AbaDeModelos({ modelos }: { modelos: ModeloDeVisita[] }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const [janela, setJanela] = useState<Janela | null>(null)
  const [erroDaExclusao, setErroDaExclusao] = useState<string>()
  const tags = useQuery({
    queryKey: ['cadastros', 'tags'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.tags.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () => queryClient.invalidateQueries({ queryKey: ['visitas'] })

  const agir = (
    acao: () => Promise<{ ok: boolean; erro?: { mensagem: string } }>,
    sucesso: string,
  ) =>
    executar(async () => {
      const r = await acao()
      if (!r.ok) toast.error('Não foi possível concluir', { description: r.erro?.mensagem })
      else toast.success(sucesso)
      await recarregar()
    })

  if (janela?.tipo === 'editar') {
    return (
      <Construtor
        modelo={janela.modelo}
        tags={tagsAplicaveis(tags.data ?? [])}
        aoFechar={() => setJanela(null)}
        aoSalvar={async () => {
          setJanela(null)
          await recarregar()
        }}
      />
    )
  }

  return (
    <section aria-label="Modelos do relatório" className="flex flex-col gap-4">
      <CabecalhoDeSecao
        titulo="Modelos do relatório"
        descricao="Os campos que o vendedor preenche no relatório de visita. Cada resultado aponta para um modelo."
        acao={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setJanela({ tipo: 'editar', modelo: null })}
          >
            Novo modelo
          </Button>
        }
      />
      {modelos.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={ClipboardList}
            title="Nenhum modelo"
            description="Crie o modelo do relatório de visita."
          />
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0">
          {modelos.map((m, i) => (
            <li
              key={m.id}
              aria-label={m.nome}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0"
              style={m.ativo ? undefined : { background: 'var(--surface-sunken)' }}
            >
              <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{m.nome}</span>
                  {m.padrao ? <Badge tone="accent">Padrão</Badge> : null}
                  {m.ativo ? null : <Badge tone="neutral">Inativo</Badge>}
                </div>
                <span className="text-xs text-ink-muted">
                  {m.versaoAtual.campos.length === 1
                    ? '1 campo'
                    : `${m.versaoAtual.campos.length} campos`}{' '}
                  · versão {m.versaoAtual.numero} ·{' '}
                  {m.resultados === 0
                    ? 'nenhum resultado usa'
                    : m.resultados === 1
                      ? 'usado por 1 resultado'
                      : `usado por ${m.resultados} resultados`}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <BotoesDeOrdem
                  nome={`modelo ${m.nome}`}
                  primeiro={i === 0}
                  ultimo={i === modelos.length - 1}
                  desativado={enviando}
                  aoMover={(d) =>
                    void agir(
                      () =>
                        servicos.visitas.modelos.reordenar(
                          moverNaLista(
                            modelos.map((x) => x.id),
                            i,
                            d,
                          ),
                        ),
                      'Ordem atualizada',
                    )
                  }
                />
                {m.padrao || !m.ativo ? null : (
                  <IconButton
                    size="sm"
                    icon={Star}
                    label={`Tornar ${m.nome} o modelo padrão`}
                    disabled={enviando}
                    onClick={() =>
                      void agir(
                        () => servicos.visitas.modelos.alterar(m.id, { padrao: true }),
                        `${m.nome} agora é o modelo padrão`,
                      )
                    }
                  />
                )}
                <IconButton
                  size="sm"
                  icon={Pencil}
                  label={`Editar modelo ${m.nome}`}
                  onClick={() => setJanela({ tipo: 'editar', modelo: m })}
                />
                {m.padrao ? null : (
                  <IconButton
                    size="sm"
                    icon={Trash2}
                    label={`Excluir modelo ${m.nome}`}
                    onClick={() => setJanela({ tipo: 'excluir', modelo: m })}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <DialogoDeConfirmacao
        aberto={janela?.tipo === 'excluir'}
        titulo={`Excluir modelo ${janela?.tipo === 'excluir' ? janela.modelo.nome : ''}?`}
        descricao="Só se exclui o modelo que nenhum resultado usa e que nunca teve relatório."
        rotuloDoBotao="Excluir"
        erro={erroDaExclusao}
        enviando={enviando}
        aoFechar={() => {
          setJanela(null)
          setErroDaExclusao(undefined)
        }}
        aoConfirmar={() => {
          if (janela?.tipo !== 'excluir') return
          const { modelo } = janela
          void executar(async () => {
            const r = await servicos.visitas.modelos.excluir(modelo.id)
            if (!r.ok) {
              setErroDaExclusao(r.erro.mensagem)
              return
            }
            setJanela(null)
            toast.success(`Modelo ${modelo.nome} excluído`)
            await recarregar()
          })
        }}
      />
    </section>
  )
}

type TagAplicavel = ReturnType<typeof tagsAplicaveis>[number]

/** Construtor do modelo: nome, campos ordenáveis à esquerda e a prévia do formulário à direita. */
function Construtor({
  modelo,
  tags,
  aoFechar,
  aoSalvar,
}: {
  modelo: ModeloDeVisita | null
  tags: TagAplicavel[]
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [ativo, setAtivo] = useState(modelo?.ativo ?? true)
  const [campos, setCampos] = useState<CampoEmEdicao[]>(
    () => (modelo?.versaoAtual.campos as CampoEmEdicao[] | undefined)?.map((c) => ({ ...c })) ?? [],
  )
  const [erro, setErro] = useState<string>()
  const [erroDoNome, setErroDoNome] = useState<string>()

  const mudar = (i: number, novo: CampoEmEdicao) =>
    setCampos((atuais) => atuais.map((c, j) => (j === i ? novo : c)))
  const adicionar = () =>
    setCampos((atuais) => [
      ...atuais,
      { id: novoId(), rotulo: '', tipo: 'texto_curto', obrigatorio: false },
    ])

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    setErro(undefined)
    if (!nome.trim()) {
      setErroDoNome('Informe o nome do modelo.')
      document.getElementById('modelo-nome')?.focus()
      return
    }
    setErroDoNome(undefined)
    const gravar = campos.map(paraGravar)
    const v = camposDeVisitaSchema.safeParse(gravar)
    if (!v.success) {
      const problema = v.error.issues[0]
      const indice = typeof problema?.path[0] === 'number' ? problema.path[0] : undefined
      setErro(
        indice !== undefined
          ? `Campo ${indice + 1}${gravar[indice]?.rotulo ? ` ("${gravar[indice].rotulo}")` : ''}: ${problema?.message}`
          : (problema?.message ?? 'Confira os campos.'),
      )
      return
    }
    void executar(async () => {
      const r = modelo
        ? await servicos.visitas.modelos.alterar(modelo.id, {
            nome: nome.trim(),
            campos: v.data,
            ...(ativo !== modelo.ativo ? { ativo } : {}),
          })
        : await servicos.visitas.modelos.criar({ nome: nome.trim(), campos: v.data })
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      toast.success(
        modelo
          ? r.dados.versaoAtual.numero > modelo.versaoAtual.numero
            ? `Modelo atualizado: versão ${r.dados.versaoAtual.numero} publicada`
            : 'Modelo atualizado'
          : 'Modelo criado',
      )
      await aoSalvar()
    })
  }

  return (
    <form
      noValidate
      onSubmit={salvar}
      aria-label="Construtor do modelo"
      className="flex flex-col gap-4"
    >
      <CabecalhoDeSecao
        titulo={modelo ? `Editar modelo ${modelo.nome}` : 'Novo modelo'}
        descricao="Ordene os campos pelas setas, escolha o tipo de cada um e confira a prévia."
        acao={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={enviando}>
              Salvar modelo
            </Button>
          </div>
        }
      />
      {modelo?.emUso ? (
        <Alert tone="info" title="Este modelo já tem relatórios">
          Ao salvar mudanças nos campos, o sistema publica a versão {modelo.versaoAtual.numero + 1}.
          Os relatórios antigos continuam com a versão em que foram feitos.
        </Alert>
      ) : null}
      {erro ? (
        <Alert tone="danger" title="Não foi possível salvar">
          {erro}
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <TextField
              id="modelo-nome"
              label="Nome do modelo"
              placeholder="Ex.: Visita técnica"
              value={nome}
              maxLength={80}
              error={erroDoNome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
            {modelo && !modelo.padrao ? (
              <Switch label="Ativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            ) : null}
          </div>
          <div className="rounded-lg border border-dashed border-border-strong bg-surface-sunken px-4 py-3">
            <span className="text-[13px] font-semibold">Resultado da visita</span>
            <p className="m-0 text-[13px] text-ink-muted">
              Fixo no topo de todo relatório: o vendedor escolhe o resultado, e ele define o modelo.
            </p>
          </div>
          {campos.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">
              Sem campos, o relatório pede só o resultado. Adicione as perguntas abaixo.
            </p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {campos.map((c, i) => (
                <EditorDoCampo
                  key={c.id}
                  campo={c}
                  indice={i}
                  total={campos.length}
                  outros={campos.filter((_, j) => j !== i)}
                  tags={tags}
                  aoMudar={(novo) => mudar(i, novo)}
                  aoMover={(d) =>
                    setCampos((atuais) => {
                      const ordem = moverNaLista(
                        atuais.map((x) => x.id),
                        i,
                        d,
                      )
                      return ordem.map((id) => atuais.find((x) => x.id === id) as CampoEmEdicao)
                    })
                  }
                  aoRemover={() => setCampos((atuais) => atuais.filter((_, j) => j !== i))}
                />
              ))}
            </ol>
          )}
          <div>
            <Button icon={Plus} onClick={adicionar}>
              Adicionar campo
            </Button>
          </div>
        </div>
        <Previa campos={campos} tags={tags} />
      </div>
    </form>
  )
}

function EditorDoCampo({
  campo,
  indice,
  total,
  outros,
  tags,
  aoMudar,
  aoMover,
  aoRemover,
}: {
  campo: CampoEmEdicao
  indice: number
  total: number
  outros: CampoEmEdicao[]
  tags: TagAplicavel[]
  aoMudar: (c: CampoEmEdicao) => void
  aoMover: (d: -1 | 1) => void
  aoRemover: () => void
}) {
  const nome = campo.rotulo.trim() || `campo ${indice + 1}`
  const prefixo = `campo-${campo.id}`
  // contato e próximo passo só uma vez por modelo
  const tiposDisponiveis = TIPOS_DE_CAMPO_DE_VISITA.filter(
    (t) =>
      t === campo.tipo ||
      !(['contato', 'proximo_passo'] as const).some(
        (u) => u === t && outros.some((o) => o.tipo === u),
      ),
  )
  return (
    <li
      aria-label={`Campo ${indice + 1}: ${nome}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 text-xs font-semibold text-ink-muted tabular-nums">{indice + 1}</span>
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_200px]">
          <TextField
            id={`${prefixo}-rotulo`}
            label="Pergunta"
            placeholder="Ex.: Quantos turnos a fábrica tem?"
            maxLength={120}
            value={campo.rotulo}
            onChange={(e) => aoMudar({ ...campo, rotulo: e.target.value })}
          />
          <Select
            id={`${prefixo}-tipo`}
            label="Tipo"
            value={campo.tipo}
            options={tiposDisponiveis.map((t) => ({ value: t, label: ROTULO_DO_TIPO_DE_CAMPO[t] }))}
            onChange={(e) => aoMudar(comTipo(campo, e.target.value as TipoDeCampoDeVisita, outros))}
          />
        </div>
        <div className="flex items-center gap-0.5">
          <BotoesDeOrdem
            nome={`campo ${nome}`}
            primeiro={indice === 0}
            ultimo={indice === total - 1}
            aoMover={aoMover}
          />
          <IconButton size="sm" icon={Trash2} label={`Remover campo ${nome}`} onClick={aoRemover} />
        </div>
      </div>

      {campo.opcoes ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 pl-5">
          <legend className="mb-1 text-[13px] font-semibold">Opções</legend>
          {campo.opcoes.map((o, j) => (
            <div key={o.id} className="flex items-center gap-2">
              <TextField
                id={`${prefixo}-opcao-${o.id}`}
                aria-label={`Opção ${j + 1} de ${nome}`}
                placeholder={`Opção ${j + 1}`}
                maxLength={80}
                value={o.rotulo}
                className="flex-1"
                onChange={(e) =>
                  aoMudar({
                    ...campo,
                    opcoes: campo.opcoes?.map((x) =>
                      x.id === o.id ? { ...x, rotulo: e.target.value } : x,
                    ),
                  })
                }
              />
              <IconButton
                size="sm"
                icon={X}
                label={`Remover opção ${j + 1} de ${nome}`}
                disabled={(campo.opcoes?.length ?? 0) <= 2}
                onClick={() =>
                  aoMudar({ ...campo, opcoes: campo.opcoes?.filter((x) => x.id !== o.id) })
                }
              />
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() =>
                aoMudar({
                  ...campo,
                  opcoes: [...(campo.opcoes ?? []), { id: novoId(), rotulo: '' }],
                })
              }
            >
              Adicionar opção
            </Button>
          </div>
        </fieldset>
      ) : null}

      {campo.tipo === 'tag' ? (
        <Select
          id={`${prefixo}-tag`}
          label="Tag aplicada quando o vendedor marca Sim"
          placeholder="Escolha a tag"
          value={campo.tagId ?? ''}
          options={tags.map((t) => ({ value: t.id, label: `${t.grupo}: ${t.nome}` }))}
          onChange={(e) => aoMudar({ ...campo, tagId: e.target.value })}
          className="pl-5"
        />
      ) : null}

      {campo.tipo === 'dados_empresa' ? (
        <Select
          id={`${prefixo}-empresa`}
          label="Campo da ficha da empresa"
          hint="A resposta atualiza a ficha ao concluir o relatório."
          value={campo.campoEmpresa ?? ''}
          options={CAMPOS_DA_EMPRESA_NA_VISITA.filter(
            (c) => c === campo.campoEmpresa || !outros.some((o) => o.campoEmpresa === c),
          ).map((c) => ({ value: c, label: ROTULO_DO_CAMPO_DA_EMPRESA[c] }))}
          onChange={(e) =>
            aoMudar({ ...campo, campoEmpresa: e.target.value as CampoDaEmpresaNaVisita })
          }
          className="pl-5"
        />
      ) : null}

      <Switch
        className="pl-5"
        label="Obrigatório"
        checked={campo.obrigatorio}
        onChange={(e) => aoMudar({ ...campo, obrigatorio: e.target.checked })}
      />
    </li>
  )
}

/** Como o vendedor vai ver o formulário (só leitura). */
function Previa({ campos, tags }: { campos: CampoEmEdicao[]; tags: TagAplicavel[] }) {
  return (
    <aside
      aria-label="Prévia do relatório"
      className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-surface-sunken p-4 lg:sticky lg:top-4"
    >
      <span className="text-[13px] font-semibold text-ink-muted">Prévia do relatório</span>
      <fieldset disabled className="m-0 flex flex-col gap-4 border-0 p-0">
        <Select
          id="previa-resultado"
          label="Resultado da visita"
          required
          placeholder="Escolha o resultado"
          options={[]}
        />
        {campos.map((c, i) => {
          const rotulo = c.rotulo.trim() || `Campo ${i + 1}`
          const id = `previa-${c.id}`
          switch (c.tipo) {
            case 'texto_longo':
              return <TextArea key={c.id} id={id} label={rotulo} required={c.obrigatorio} />
            case 'numero':
              return (
                <TextField
                  key={c.id}
                  id={id}
                  label={rotulo}
                  inputMode="numeric"
                  required={c.obrigatorio}
                />
              )
            case 'data':
              return (
                <TextField key={c.id} id={id} type="date" label={rotulo} required={c.obrigatorio} />
              )
            case 'sim_nao':
              return <Switch key={c.id} label={rotulo} />
            case 'tag': {
              const tag = tags.find((t) => t.id === c.tagId)
              return (
                <Switch
                  key={c.id}
                  label={`${rotulo}${tag ? ` (Sim aplica a tag ${tag.nome})` : ''}`}
                />
              )
            }
            case 'nota':
              return (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">{rotulo}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-sm tabular-nums"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )
            case 'escolha_unica':
              return (
                <Select
                  key={c.id}
                  id={id}
                  label={rotulo}
                  required={c.obrigatorio}
                  placeholder="Escolha"
                  options={(c.opcoes ?? []).map((o) => ({ value: o.id, label: o.rotulo || '…' }))}
                />
              )
            case 'multipla_escolha':
              return (
                <fieldset key={c.id} className="m-0 flex flex-col gap-1.5 border-0 p-0">
                  <legend className="mb-1 text-[13px] font-semibold">{rotulo}</legend>
                  {(c.opcoes ?? []).map((o) => (
                    <Checkbox key={o.id} label={o.rotulo || '…'} />
                  ))}
                </fieldset>
              )
            case 'contato':
              return (
                <Select
                  key={c.id}
                  id={id}
                  label={rotulo}
                  required={c.obrigatorio}
                  placeholder="Confirme ou cadastre o contato"
                  options={[]}
                />
              )
            case 'proximo_passo':
              return (
                <TextField
                  key={c.id}
                  id={id}
                  label={rotulo}
                  required={c.obrigatorio}
                  placeholder="Agenda a próxima atividade ou o retorno"
                />
              )
            case 'dados_empresa':
              return (
                <TextField
                  key={c.id}
                  id={id}
                  label={rotulo}
                  required={c.obrigatorio}
                  hint={`Atualiza ${c.campoEmpresa ? ROTULO_DO_CAMPO_DA_EMPRESA[c.campoEmpresa].toLowerCase() : 'a ficha'} da empresa`}
                />
              )
            default:
              return <TextField key={c.id} id={id} label={rotulo} required={c.obrigatorio} />
          }
        })}
      </fieldset>
    </aside>
  )
}
