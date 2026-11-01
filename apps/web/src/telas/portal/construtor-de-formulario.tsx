import {
  type Acao,
  type Botao,
  type Campo,
  type Condicao,
  type DefinicaoDeFormulario,
  definicaoDeFormularioSchema,
  FINALIDADES_DE_FORMULARIO,
  FONTES_DE_PREENCHIMENTO,
  type Formulario,
  OPERADORES,
  ROTULO_DA_FINALIDADE,
  ROTULO_DA_FONTE,
  ROTULO_DO_CAMPO_DO_FORMULARIO,
  ROTULO_DO_OPERADOR,
  type SalvarFormularioEntrada,
  TIPOS_DE_APRESENTACAO,
  TIPOS_DE_CAMPO,
  type TipoDeCampo,
} from '@leadtogo/shared'
import { ArrowDown, ArrowUp, Copy, Eye, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { cn } from '@leadtogo/ui/cn'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert } from '@leadtogo/ui/feedback'
import { FormularioDinamico } from '@leadtogo/ui/formulario'
import { toast } from '@leadtogo/ui/toast'

const COM_OPCOES: TipoDeCampo[] = ['selecao', 'multipla']
const COM_FAIXA: TipoDeCampo[] = ['texto', 'texto_longo', 'numero', 'moeda']

/** Um id de campo a partir do rótulo (letras minúsculas, números e _), sem repetir os que já existem. */
function idDoRotulo(rotulo: string, usados: Set<string>): string {
  const base =
    rotulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 'c_$1')
      .slice(0, 32) || 'campo'
  let id = base
  for (let n = 2; usados.has(id); n++) id = `${base}_${n}`
  return id
}

function EditorDeCondicoes({
  regra,
  anteriores,
  aoMudar,
  rotulo,
}: {
  regra: Campo['visivelQuando']
  anteriores: Campo[]
  aoMudar: (r: Campo['visivelQuando']) => void
  rotulo: string
}) {
  const condicoes = regra?.condicoes ?? []
  const mudar = (lista: Condicao[], combinacao = regra?.combinacao ?? 'todas') =>
    aoMudar(lista.length > 0 ? { combinacao, condicoes: lista } : undefined)
  if (anteriores.length === 0) {
    return <p className="m-0 text-xs text-ink-muted">{rotulo}: sem campos antes deste para usar.</p>
  }
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-[13px] font-semibold">{rotulo}</legend>
      {condicoes.length > 1 ? (
        <Select
          label="Combinar"
          value={regra?.combinacao ?? 'todas'}
          options={[
            { value: 'todas', label: 'Todas as condições valem' },
            { value: 'qualquer', label: 'Qualquer condição vale' },
          ]}
          onChange={(e) => mudar(condicoes, e.target.value as 'todas' | 'qualquer')}
        />
      ) : null}
      {condicoes.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <Select
            label="Campo"
            value={c.campo}
            options={anteriores.map((a) => ({ value: a.id, label: a.rotulo }))}
            onChange={(e) =>
              mudar(condicoes.map((x, j) => (j === i ? { ...x, campo: e.target.value } : x)))
            }
          />
          <Select
            label="Condição"
            value={c.operador}
            options={OPERADORES.map((o) => ({ value: o, label: ROTULO_DO_OPERADOR[o] }))}
            onChange={(e) =>
              mudar(
                condicoes.map((x, j) =>
                  j === i ? { ...x, operador: e.target.value as Condicao['operador'] } : x,
                ),
              )
            }
          />
          {c.operador === 'preenchido' || c.operador === 'vazio' ? (
            <span />
          ) : (
            <TextField
              label="Valor"
              value={c.valor ?? ''}
              onChange={(e) =>
                mudar(condicoes.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))
              }
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label="Tirar a condição"
            onClick={() => mudar(condicoes.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <div>
        <Button
          size="sm"
          icon={Plus}
          onClick={() =>
            mudar([...condicoes, { campo: anteriores[0]?.id ?? '', operador: 'preenchido' }])
          }
        >
          Condição
        </Button>
      </div>
    </fieldset>
  )
}

function PropriedadesDoCampo({
  campo,
  anteriores,
  aoMudar,
}: {
  campo: Campo
  anteriores: Campo[]
  aoMudar: (c: Campo) => void
}) {
  const mudar = (parte: Partial<Campo>) => aoMudar({ ...campo, ...parte })
  const apresentacao = TIPOS_DE_APRESENTACAO.includes(campo.tipo)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label="Rótulo"
          value={campo.rotulo}
          maxLength={200}
          onChange={(e) => mudar({ rotulo: e.target.value })}
        />
        <TextField
          label="Identificador"
          hint="Usado nas condições, no e-mail ({{id}}) e no webhook"
          value={campo.id}
          maxLength={40}
          onChange={(e) => mudar({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
        />
      </div>
      {campo.tipo === 'informativo' ? (
        <TextArea
          label="Texto"
          hint="Markdown simples: **negrito**, listas e links"
          rows={4}
          value={campo.texto ?? ''}
          onChange={(e) => mudar({ texto: e.target.value })}
        />
      ) : null}
      {apresentacao ? null : (
        <>
          <TextField
            label="Ajuda (opcional)"
            value={campo.ajuda ?? ''}
            maxLength={300}
            onChange={(e) => mudar({ ajuda: e.target.value || undefined })}
          />
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox
              label="Obrigatório"
              checked={campo.obrigatorio}
              onChange={(e) => mudar({ obrigatorio: e.target.checked })}
            />
            <Select
              label="Largura"
              value={campo.largura}
              options={[
                { value: 'inteira', label: 'Linha inteira' },
                { value: 'metade', label: 'Metade' },
                { value: 'terco', label: 'Um terço' },
              ]}
              onChange={(e) => mudar({ largura: e.target.value as Campo['largura'] })}
            />
          </div>
        </>
      )}
      {COM_OPCOES.includes(campo.tipo) ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">Opções</legend>
          {(campo.opcoes ?? []).map((o, i) => (
            <div key={i} className="flex items-end gap-2">
              <TextField
                label={`Opção ${i + 1}`}
                value={o.rotulo}
                onChange={(e) =>
                  mudar({
                    opcoes: (campo.opcoes ?? []).map((x, j) =>
                      j === i
                        ? { rotulo: e.target.value, valor: idDoRotulo(e.target.value, new Set()) }
                        : x,
                    ),
                  })
                }
              />
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                aria-label={`Tirar a opção ${i + 1}`}
                onClick={() => mudar({ opcoes: (campo.opcoes ?? []).filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          <div>
            <Button
              size="sm"
              icon={Plus}
              onClick={() => {
                const n = (campo.opcoes?.length ?? 0) + 1
                mudar({
                  opcoes: [...(campo.opcoes ?? []), { rotulo: `Opção ${n}`, valor: `opcao_${n}` }],
                })
              }}
            >
              Opção
            </Button>
          </div>
        </fieldset>
      ) : null}
      {COM_FAIXA.includes(campo.tipo) ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={campo.tipo.startsWith('texto') ? 'Mínimo de caracteres' : 'Mínimo'}
            type="number"
            value={campo.minimo ?? ''}
            onChange={(e) =>
              mudar({ minimo: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
          <TextField
            label={campo.tipo.startsWith('texto') ? 'Máximo de caracteres' : 'Máximo'}
            type="number"
            value={campo.maximo ?? ''}
            onChange={(e) =>
              mudar({ maximo: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </div>
      ) : null}
      {apresentacao ? null : (
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2">
          <Select
            label="Preencher para quem está logado"
            value={campo.preenchimento?.fonte ?? ''}
            placeholder="Não preencher"
            options={FONTES_DE_PREENCHIMENTO.map((f) => ({ value: f, label: ROTULO_DA_FONTE[f] }))}
            onChange={(e) =>
              mudar({
                preenchimento: e.target.value
                  ? {
                      fonte: e.target.value as (typeof FONTES_DE_PREENCHIMENTO)[number],
                      travado: campo.preenchimento?.travado ?? false,
                    }
                  : undefined,
              })
            }
          />
          {campo.preenchimento ? (
            <Checkbox
              label="Travar (só conferência)"
              checked={campo.preenchimento.travado}
              onChange={(e) =>
                campo.preenchimento &&
                mudar({ preenchimento: { ...campo.preenchimento, travado: e.target.checked } })
              }
            />
          ) : null}
        </div>
      )}
      <EditorDeCondicoes
        rotulo="Mostrar só quando"
        regra={campo.visivelQuando}
        anteriores={anteriores.filter((a) => !TIPOS_DE_APRESENTACAO.includes(a.tipo))}
        aoMudar={(visivelQuando) => mudar({ visivelQuando })}
      />
    </div>
  )
}

function EditorDeAcao({
  acao,
  campos,
  aoMudar,
  aoTirar,
}: {
  acao: Acao
  campos: Campo[]
  aoMudar: (a: Acao) => void
  aoTirar: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border p-3">
      <div className="flex items-center gap-2">
        <Badge tone="info">{acao.tipo === 'webhook' ? 'Webhook' : 'E-mail'}</Badge>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          className="ml-auto"
          aria-label="Tirar a ação"
          onClick={aoTirar}
        />
      </div>
      {acao.tipo === 'webhook' ? (
        <TextField
          label="Endereço (https)"
          hint="Recebe as respostas em JSON, assinadas com o segredo do formulário"
          value={acao.url}
          onChange={(e) => aoMudar({ ...acao, url: e.target.value })}
        />
      ) : (
        <>
          <Select
            label="Para"
            value={acao.para}
            options={[
              { value: 'fixo', label: 'Endereços fixos' },
              { value: 'campo', label: 'O e-mail digitado no formulário' },
            ]}
            onChange={(e) => aoMudar({ ...acao, para: e.target.value as 'fixo' | 'campo' })}
          />
          {acao.para === 'fixo' ? (
            <TextField
              label="E-mails (separados por vírgula)"
              value={(acao.enderecos ?? []).join(', ')}
              onChange={(e) =>
                aoMudar({
                  ...acao,
                  enderecos: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : (
            <Select
              label="Campo de e-mail"
              value={acao.campo ?? ''}
              placeholder="Escolha"
              options={campos
                .filter((c) => c.tipo === 'email')
                .map((c) => ({ value: c.id, label: c.rotulo }))}
              onChange={(e) => aoMudar({ ...acao, campo: e.target.value })}
            />
          )}
          <TextField
            label="Assunto"
            value={acao.assunto}
            onChange={(e) => aoMudar({ ...acao, assunto: e.target.value })}
          />
          <TextArea
            label="Mensagem"
            hint="Use {{id_do_campo}} para pôr a resposta no texto"
            rows={4}
            value={acao.mensagem}
            onChange={(e) => aoMudar({ ...acao, mensagem: e.target.value })}
          />
        </>
      )}
      <EditorDeCondicoes
        rotulo="Só executar quando"
        regra={acao.condicao}
        anteriores={campos.filter((c) => !TIPOS_DE_APRESENTACAO.includes(c.tipo))}
        aoMudar={(condicao) => aoMudar({ ...acao, condicao })}
      />
    </div>
  )
}

function EditorDeBotoes({
  botoes,
  campos,
  aoMudar,
}: {
  botoes: Botao[]
  campos: Campo[]
  aoMudar: (b: Botao[]) => void
}) {
  const mudar = (i: number, b: Botao) => aoMudar(botoes.map((x, j) => (j === i ? b : x)))
  return (
    <div className="flex flex-col gap-4">
      {botoes.map((b, i) => (
        <section
          key={i}
          aria-label={`Botão ${b.rotulo}`}
          className="flex flex-col gap-3 rounded-md border border-border p-3"
        >
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
            <TextField
              label="Texto do botão"
              value={b.rotulo}
              maxLength={60}
              onChange={(e) => mudar(i, { ...b, rotulo: e.target.value })}
            />
            <Select
              label="Estilo"
              value={b.estilo}
              options={[
                { value: 'primario', label: 'Principal' },
                { value: 'secundario', label: 'Secundário' },
              ]}
              onChange={(e) => mudar(i, { ...b, estilo: e.target.value as Botao['estilo'] })}
            />
            {botoes.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                aria-label={`Tirar o botão ${b.rotulo}`}
                onClick={() => aoMudar(botoes.filter((_, j) => j !== i))}
              />
            ) : null}
          </div>
          {b.acoes.map((a, j) => (
            <EditorDeAcao
              key={j}
              acao={a}
              campos={campos}
              aoMudar={(nova) =>
                mudar(i, { ...b, acoes: b.acoes.map((x, k) => (k === j ? nova : x)) })
              }
              aoTirar={() => mudar(i, { ...b, acoes: b.acoes.filter((_, k) => k !== j) })}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={Plus}
              onClick={() =>
                mudar(i, {
                  ...b,
                  acoes: [
                    ...b.acoes,
                    {
                      tipo: 'email',
                      para: 'fixo',
                      enderecos: [],
                      assunto: 'Nova resposta',
                      mensagem: '',
                    },
                  ],
                })
              }
            >
              Enviar e-mail
            </Button>
            <Button
              size="sm"
              icon={Plus}
              onClick={() =>
                mudar(i, { ...b, acoes: [...b.acoes, { tipo: 'webhook', url: 'https://' }] })
              }
            >
              Disparar webhook
            </Button>
          </div>
        </section>
      ))}
      {botoes.length < 3 ? (
        <div>
          <Button
            icon={Plus}
            onClick={() =>
              aoMudar([
                ...botoes,
                {
                  id: idDoRotulo(`botao_${botoes.length + 1}`, new Set(botoes.map((b) => b.id))),
                  rotulo: 'Outro botão',
                  estilo: 'secundario',
                  acoes: [],
                },
              ])
            }
          >
            Botão
          </Button>
        </div>
      ) : null}
    </div>
  )
}

type Aba = 'campos' | 'botoes' | 'configuracoes'

/**
 * O construtor (Fase 4E): campos à esquerda (com ordem, inclusão e exclusão), propriedades do campo escolhido
 * (validação, preenchimento automático e condição), botões com ações e configurações. Salvar guarda o rascunho;
 * publicar congela uma versão nova.
 */
export function ConstrutorDeFormulario({
  formulario,
  aoMudar,
  aoFechar,
}: {
  formulario: Formulario
  aoMudar: (f: Formulario) => void
  aoFechar: () => void
}) {
  const servicos = useServicos()
  const [nome, setNome] = useState(formulario.nome)
  const [finalidade, setFinalidade] = useState(formulario.finalidade)
  const [acesso, setAcesso] = useState(formulario.acesso)
  const [captcha, setCaptcha] = useState(formulario.captcha)
  const [def, setDef] = useState<DefinicaoDeFormulario>(formulario.definicao)
  const [escolhido, setEscolhido] = useState(0)
  const [aba, setAba] = useState<Aba>('campos')
  const [novoTipo, setNovoTipo] = useState<TipoDeCampo>('texto')
  const [previa, setPrevia] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [segredo, setSegredo] = useState<string | null>(null)
  const campo = def.campos[escolhido]

  const dados = (): SalvarFormularioEntrada => ({
    nome,
    finalidade,
    acesso,
    captcha,
    definicao: def,
  })
  const valida = definicaoDeFormularioSchema.safeParse(def)

  const mudarCampos = (campos: Campo[]) => setDef({ ...def, campos })
  const mover = (de: number, para: number) => {
    if (para < 0 || para >= def.campos.length) return
    const lista = [...def.campos]
    const [c] = lista.splice(de, 1)
    if (c) lista.splice(para, 0, c)
    mudarCampos(lista)
    setEscolhido(para)
  }
  const acrescentar = () => {
    const usados = new Set(def.campos.map((c) => c.id))
    const rotulo = ROTULO_DO_CAMPO_DO_FORMULARIO[novoTipo]
    const novo: Campo = {
      id: idDoRotulo(rotulo, usados),
      tipo: novoTipo,
      rotulo,
      obrigatorio: false,
      largura: 'inteira',
      ...(COM_OPCOES.includes(novoTipo)
        ? {
            opcoes: [
              { valor: 'opcao_1', rotulo: 'Opção 1' },
              { valor: 'opcao_2', rotulo: 'Opção 2' },
            ],
          }
        : {}),
    }
    mudarCampos([...def.campos, novo])
    setEscolhido(def.campos.length)
  }

  const salvar = async (publicar: boolean) => {
    setErro(null)
    setOcupado(true)
    const r = await servicos.portal.formularios.salvar(formulario.id, dados())
    if (!r.ok) {
      setOcupado(false)
      setErro(r.erro.mensagem)
      return
    }
    const final = publicar ? await servicos.portal.formularios.publicar(formulario.id) : r
    setOcupado(false)
    if (!final.ok) {
      setErro(final.erro.mensagem)
      return
    }
    aoMudar(final.dados)
    toast.success(publicar ? `Publicado (versão ${final.dados.versaoPublicada})` : 'Rascunho salvo')
  }

  const endereco = `${globalThis.location?.origin.replace('crm.', 'portal.') ?? ''}/f/${formulario.slug}`
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-auto text-lg font-semibold">{nome || 'Formulário'}</h2>
        <Badge tone={formulario.situacao === 'publicado' ? 'success' : 'neutral'}>
          {formulario.situacao === 'publicado'
            ? `Publicado · versão ${formulario.versaoPublicada}`
            : formulario.situacao === 'arquivado'
              ? 'Arquivado'
              : 'Rascunho'}
        </Badge>
        <Button icon={Eye} onClick={() => setPrevia(true)} disabled={!valida.success}>
          Pré-visualizar
        </Button>
        <Button loading={ocupado} onClick={() => void salvar(false)}>
          Salvar rascunho
        </Button>
        <Button
          variant="primary"
          loading={ocupado}
          disabled={!valida.success}
          onClick={() => void salvar(true)}
        >
          Publicar
        </Button>
        <Button variant="ghost" onClick={aoFechar}>
          Fechar
        </Button>
      </header>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      {!valida.success ? (
        <Alert tone="warning" title="Ainda não dá para publicar">
          {valida.error.issues[0]?.message}
        </Alert>
      ) : null}
      <div role="group" aria-label="Seções do construtor" className="flex gap-1">
        {(
          [
            ['campos', 'Campos'],
            ['botoes', 'Botões e ações'],
            ['configuracoes', 'Configurações'],
          ] as const
        ).map(([v, r]) => (
          <button
            key={v}
            type="button"
            aria-pressed={aba === v}
            onClick={() => setAba(v)}
            className={cn(
              'cursor-pointer rounded-sm border-0 px-3 py-1 text-[13px] font-semibold',
              aba === v ? 'bg-brand-soft text-brand' : 'bg-transparent text-ink-muted',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {aba === 'campos' ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
          <div className="flex flex-col gap-2">
            <ol aria-label="Campos do formulário" className="m-0 flex list-none flex-col gap-1 p-0">
              {def.campos.map((c, i) => (
                <li
                  key={`${c.id}-${i}`}
                  className={cn(
                    'flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1.5',
                    i === escolhido && 'border-brand bg-brand-soft',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEscolhido(i)}
                    className="flex min-w-0 flex-1 cursor-pointer flex-col border-0 bg-transparent p-0 text-left"
                  >
                    <span className="truncate text-sm font-semibold">
                      {c.rotulo}
                      {c.obrigatorio ? <span className="text-danger"> *</span> : null}
                    </span>
                    <span className="truncate text-xs text-ink-muted">
                      {ROTULO_DO_CAMPO_DO_FORMULARIO[c.tipo]}
                      {c.visivelQuando ? ' · condicional' : ''}
                      {c.preenchimento ? ' · preenchido' : ''}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ArrowUp}
                    aria-label={`Subir ${c.rotulo}`}
                    disabled={i === 0}
                    onClick={() => mover(i, i - 1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ArrowDown}
                    aria-label={`Descer ${c.rotulo}`}
                    disabled={i === def.campos.length - 1}
                    onClick={() => mover(i, i + 1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    aria-label={`Tirar ${c.rotulo}`}
                    disabled={def.campos.length === 1}
                    onClick={() => {
                      mudarCampos(def.campos.filter((_, j) => j !== i))
                      setEscolhido(Math.max(0, i - 1))
                    }}
                  />
                </li>
              ))}
            </ol>
            <div className="flex items-end gap-2">
              <Select
                label="Novo campo"
                value={novoTipo}
                options={TIPOS_DE_CAMPO.map((t) => ({
                  value: t,
                  label: ROTULO_DO_CAMPO_DO_FORMULARIO[t],
                }))}
                onChange={(e) => setNovoTipo(e.target.value as TipoDeCampo)}
              />
              <Button icon={Plus} onClick={acrescentar}>
                Acrescentar
              </Button>
            </div>
          </div>
          {campo ? (
            <section
              aria-label="Propriedades do campo"
              className="rounded-md border border-border bg-surface p-4"
            >
              <PropriedadesDoCampo
                key={escolhido}
                campo={campo}
                anteriores={def.campos.slice(0, escolhido)}
                aoMudar={(c) => mudarCampos(def.campos.map((x, j) => (j === escolhido ? c : x)))}
              />
            </section>
          ) : null}
        </div>
      ) : aba === 'botoes' ? (
        <EditorDeBotoes
          botoes={def.botoes}
          campos={def.campos}
          aoMudar={(botoes) => setDef({ ...def, botoes })}
        />
      ) : (
        <div className="flex max-w-2xl flex-col gap-3">
          <TextField
            label="Nome"
            value={nome}
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
          />
          <Select
            label="Finalidade"
            value={finalidade}
            options={FINALIDADES_DE_FORMULARIO.map((f) => ({
              value: f,
              label: ROTULO_DA_FINALIDADE[f],
            }))}
            onChange={(e) => setFinalidade(e.target.value as typeof finalidade)}
          />
          <Select
            label="Quem responde"
            value={acesso}
            options={[
              { value: 'logado', label: 'Só clientes logados no portal' },
              { value: 'publico', label: 'Qualquer pessoa, pelo endereço público' },
            ]}
            onChange={(e) => setAcesso(e.target.value as typeof acesso)}
          />
          {acesso === 'publico' ? (
            <>
              <TextField label="Endereço público" value={endereco} readOnly />
              <div>
                <Button
                  size="sm"
                  icon={Copy}
                  onClick={() =>
                    void globalThis.navigator.clipboard
                      ?.writeText(endereco)
                      .then(() => toast.success('Endereço copiado'))
                  }
                >
                  Copiar endereço
                </Button>
              </div>
              <Checkbox
                label="Pedir o captcha (contra robôs)"
                checked={captcha}
                onChange={(e) => setCaptcha(e.target.checked)}
              />
            </>
          ) : null}
          <TextArea
            label="Mensagem depois de enviar"
            rows={3}
            value={def.mensagemDeSucesso}
            onChange={(e) => setDef({ ...def, mensagemDeSucesso: e.target.value })}
          />
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <p className="m-0 text-sm">
              Segredo dos webhooks: o destino confere a assinatura{' '}
              <code>X-Leadtogo-Assinatura</code>.
            </p>
            {segredo ? (
              <TextField label="Segredo (aparece só agora)" value={segredo} readOnly />
            ) : null}
            <div>
              <Button
                size="sm"
                icon={KeyRound}
                onClick={() =>
                  void servicos.portal.formularios.segredo(formulario.id).then((r) => {
                    if (r.ok) setSegredo(r.dados.segredo)
                    else toast.error(r.erro.mensagem)
                  })
                }
              >
                Gerar novo segredo
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={previa}
        onOpenChange={setPrevia}
        title={`Pré-visualização: ${nome}`}
        description="Como quem responde vê. Nada é gravado."
        width={720}
      >
        {valida.success ? (
          <FormularioDinamico
            definicao={valida.data}
            aoEnviar={() => {
              toast.info('Pré-visualização: a resposta não foi enviada.')
              return Promise.resolve()
            }}
          />
        ) : null}
      </Dialog>
    </div>
  )
}
