import type { CampoDeVisita, ContatoDaResposta, ProximoPassoDaResposta } from '@leadtogo/shared'
import { ROTULO_DO_CAMPO_DA_EMPRESA } from '@leadtogo/shared'

import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { cn } from '@leadtogo/ui/cn'

export type Valores = Record<string, unknown>

export interface OpcoesDoFormulario {
  contatos: { id: string; nome: string; cargo: string | null }[]
  tiposAtividade: { id: string; nome: string }[]
  verticais: { id: string; nome: string }[]
  tags: Map<string, string>
}

const NOVO_CONTATO = '__novo__'

/** "2026-10-23T09:00" (campo de data e hora, no fuso do aparelho) → ISO com o deslocamento. */
function isoDoCampo(local: string): string {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}
function campoDoIso(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/**
 * O formulário do relatório de visita, montado pelos campos da versão do modelo (G3b). Cada tipo tem o
 * seu controle; os de CRM (contato, próximo passo, tag e dados da empresa) aplicam o efeito ao concluir.
 */
export function FormularioDoRelatorio({
  campos,
  valores,
  erros,
  opcoes,
  desativado,
  aoMudar,
}: {
  campos: CampoDeVisita[]
  valores: Valores
  erros: Record<string, string>
  opcoes: OpcoesDoFormulario
  desativado?: boolean
  aoMudar: (campoId: string, valor: unknown) => void
}) {
  return (
    <fieldset disabled={desativado} className="m-0 flex flex-col gap-4 border-0 p-0">
      {campos.map((c) => (
        <Campo
          key={c.id}
          campo={c}
          valor={valores[c.id]}
          erro={erros[c.id]}
          opcoes={opcoes}
          aoMudar={(v) => aoMudar(c.id, v)}
        />
      ))}
    </fieldset>
  )
}

function Campo({
  campo: c,
  valor,
  erro,
  opcoes,
  aoMudar,
}: {
  campo: CampoDeVisita
  valor: unknown
  erro: string | undefined
  opcoes: OpcoesDoFormulario
  aoMudar: (v: unknown) => void
}) {
  const id = `campo-${c.id}`
  const comuns = { id, label: c.rotulo, required: c.obrigatorio, error: erro }
  switch (c.tipo) {
    case 'texto_curto':
      return (
        <TextField
          {...comuns}
          maxLength={200}
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )
    case 'texto_longo':
      return (
        <TextArea
          {...comuns}
          maxLength={5000}
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )
    case 'numero':
      return (
        <TextField
          {...comuns}
          inputMode="decimal"
          value={typeof valor === 'number' || typeof valor === 'string' ? String(valor) : ''}
          onChange={(e) => {
            const t = e.target.value.replace(',', '.').trim()
            aoMudar(t === '' ? null : Number.isNaN(Number(t)) ? t : Number(t))
          }}
        />
      )
    case 'data':
      return (
        <TextField
          {...comuns}
          type="date"
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )
    case 'sim_nao':
      return <Escolha {...comuns} valor={valor as boolean | undefined} aoMudar={aoMudar} />
    case 'tag': {
      const nome = opcoes.tags.get(c.tagId)
      return (
        <Escolha
          {...comuns}
          descricao={nome ? `Sim aplica a tag ${nome} na empresa.` : undefined}
          valor={valor as boolean | undefined}
          aoMudar={aoMudar}
        />
      )
    }
    case 'nota':
      return (
        <fieldset
          className="m-0 flex flex-col gap-1.5 border-0 p-0"
          aria-describedby={erro ? `${id}-msg` : undefined}
        >
          <legend className="mb-1 text-[13px] leading-[18px] font-semibold">
            {c.rotulo}
            {c.obrigatorio ? <span className="text-danger"> *</span> : null}
          </legend>
          <div role="radiogroup" aria-label={c.rotulo} className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={valor === n}
                aria-label={`Nota ${n}`}
                onClick={() => aoMudar(valor === n ? null : n)}
                className={cn(
                  'inline-flex size-10 cursor-pointer items-center justify-center rounded-sm border text-sm font-semibold tabular-nums',
                  valor === n ? 'border-brand bg-brand text-on-brand' : 'border-border bg-surface',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {erro ? (
            <span id={`${id}-msg`} className="text-xs text-danger">
              {erro}
            </span>
          ) : null}
        </fieldset>
      )
    case 'escolha_unica':
      return (
        <Select
          {...comuns}
          placeholder="Escolha"
          value={(valor as string) ?? ''}
          options={c.opcoes.map((o) => ({ value: o.id, label: o.rotulo }))}
          onChange={(e) => aoMudar(e.target.value || null)}
        />
      )
    case 'multipla_escolha': {
      const marcados = new Set((valor as string[] | undefined) ?? [])
      return (
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 text-[13px] leading-[18px] font-semibold">
            {c.rotulo}
            {c.obrigatorio ? <span className="text-danger"> *</span> : null}
          </legend>
          {c.opcoes.map((o) => (
            <Checkbox
              key={o.id}
              label={o.rotulo}
              checked={marcados.has(o.id)}
              onChange={(e) => {
                const novo = new Set(marcados)
                if (e.target.checked) novo.add(o.id)
                else novo.delete(o.id)
                aoMudar(c.opcoes.map((x) => x.id).filter((x) => novo.has(x)))
              }}
            />
          ))}
          {erro ? <span className="text-xs text-danger">{erro}</span> : null}
        </fieldset>
      )
    }
    case 'contato':
      return (
        <CampoDeContato
          {...comuns}
          valor={valor as ContatoDaResposta | undefined}
          contatos={opcoes.contatos}
          aoMudar={aoMudar}
        />
      )
    case 'proximo_passo':
      return (
        <CampoDeProximoPasso
          {...comuns}
          valor={valor as ProximoPassoDaResposta | undefined}
          tipos={opcoes.tiposAtividade}
          aoMudar={aoMudar}
        />
      )
    case 'dados_empresa': {
      const hint = `Atualiza ${ROTULO_DO_CAMPO_DA_EMPRESA[c.campoEmpresa].toLowerCase()} na ficha ao concluir.`
      if (c.campoEmpresa === 'vertical_id') {
        return (
          <Select
            {...comuns}
            hint={hint}
            placeholder="Escolha a vertical"
            value={(valor as string) ?? ''}
            options={opcoes.verticais.map((v) => ({ value: v.id, label: v.nome }))}
            onChange={(e) => aoMudar(e.target.value || null)}
          />
        )
      }
      if (c.campoEmpresa === 'numero_funcionarios') {
        return (
          <TextField
            {...comuns}
            hint={hint}
            inputMode="numeric"
            value={typeof valor === 'number' || typeof valor === 'string' ? String(valor) : ''}
            onChange={(e) => {
              const t = e.target.value.replace(/\D/g, '')
              aoMudar(t === '' ? null : Number(t))
            }}
          />
        )
      }
      return (
        <TextField
          {...comuns}
          hint={hint}
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )
    }
  }
}

/** Sim / Não em dois botões (marcar de novo desmarca: "sem resposta"). */
function Escolha({
  id,
  label,
  required,
  error,
  descricao,
  valor,
  aoMudar,
}: {
  id: string
  label: string
  required: boolean
  error: string | undefined
  descricao?: string | undefined
  valor: boolean | undefined
  aoMudar: (v: unknown) => void
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 text-[13px] leading-[18px] font-semibold">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </legend>
      {descricao ? <span className="text-xs text-ink-muted">{descricao}</span> : null}
      <div role="radiogroup" aria-label={label} className="flex gap-2">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            id={v ? id : undefined}
            type="button"
            role="radio"
            aria-checked={valor === v}
            onClick={() => aoMudar(valor === v ? null : v)}
            className={cn(
              'h-(--ctl) min-w-20 cursor-pointer rounded-sm border px-3 text-sm font-semibold',
              valor === v ? 'border-brand bg-brand text-on-brand' : 'border-border bg-surface',
            )}
          >
            {v ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </fieldset>
  )
}

function CampoDeContato({
  id,
  label,
  required,
  error,
  valor,
  contatos,
  aoMudar,
}: {
  id: string
  label: string
  required: boolean
  error: string | undefined
  valor: ContatoDaResposta | undefined
  contatos: OpcoesDoFormulario['contatos']
  aoMudar: (v: unknown) => void
}) {
  const novo = valor && 'novo' in valor ? valor.novo : null
  const escolha = novo ? NOVO_CONTATO : valor && 'contatoId' in valor ? valor.contatoId : ''
  return (
    <div className="flex flex-col gap-2">
      <Select
        id={id}
        label={label}
        required={required}
        error={error}
        placeholder="Escolha o contato"
        value={escolha}
        options={[
          ...contatos.map((c) => ({
            value: c.id,
            label: c.cargo ? `${c.nome} (${c.cargo})` : c.nome,
          })),
          { value: NOVO_CONTATO, label: '+ Cadastrar outro contato' },
        ]}
        onChange={(e) => {
          const v = e.target.value
          aoMudar(v === '' ? null : v === NOVO_CONTATO ? { novo: { nome: '' } } : { contatoId: v })
        }}
      />
      {novo ? (
        <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
          <TextField
            id={`${id}-nome`}
            label="Nome do contato"
            required
            maxLength={200}
            value={novo.nome}
            onChange={(e) => aoMudar({ novo: { ...novo, nome: e.target.value } })}
          />
          <TextField
            id={`${id}-cargo`}
            label="Cargo"
            maxLength={100}
            value={novo.cargo ?? ''}
            onChange={(e) => aoMudar({ novo: { ...novo, cargo: e.target.value || undefined } })}
          />
          <TextField
            id={`${id}-telefone`}
            label="Telefone"
            inputMode="tel"
            maxLength={30}
            value={novo.telefone ?? ''}
            onChange={(e) => aoMudar({ novo: { ...novo, telefone: e.target.value || undefined } })}
          />
          <TextField
            id={`${id}-email`}
            label="E-mail"
            type="email"
            maxLength={200}
            value={novo.email ?? ''}
            onChange={(e) => aoMudar({ novo: { ...novo, email: e.target.value || undefined } })}
          />
        </div>
      ) : null}
    </div>
  )
}

function CampoDeProximoPasso({
  id,
  label,
  required,
  error,
  valor,
  tipos,
  aoMudar,
}: {
  id: string
  label: string
  required: boolean
  error: string | undefined
  valor: ProximoPassoDaResposta | undefined
  tipos: OpcoesDoFormulario['tiposAtividade']
  aoMudar: (v: unknown) => void
}) {
  const atual = valor ?? { tipoAtividadeId: '', titulo: '', data: '', diaInteiro: false }
  const mudar = (parcial: Partial<ProximoPassoDaResposta>) => {
    const novo = { ...atual, ...parcial }
    // tudo vazio = sem próximo passo
    aoMudar(!novo.tipoAtividadeId && !novo.titulo && !novo.data ? null : novo)
  }
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-[13px] leading-[18px] font-semibold">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </legend>
      <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
        <Select
          id={`${id}-tipo`}
          label="Tipo"
          placeholder="Escolha"
          value={atual.tipoAtividadeId}
          options={tipos.map((t) => ({ value: t.id, label: t.nome }))}
          onChange={(e) => mudar({ tipoAtividadeId: e.target.value })}
        />
        <TextField
          id={id}
          label="O que fazer"
          maxLength={200}
          placeholder="Ex.: Enviar a proposta"
          value={atual.titulo}
          onChange={(e) => mudar({ titulo: e.target.value })}
        />
      </div>
      <TextField
        id={`${id}-data`}
        type="datetime-local"
        label="Quando"
        value={campoDoIso(atual.data)}
        onChange={(e) => mudar({ data: isoDoCampo(e.target.value) })}
        className="max-w-[260px]"
      />
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </fieldset>
  )
}
