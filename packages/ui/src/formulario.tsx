import {
  type Campo,
  camposVisiveis,
  type DefinicaoDeFormulario,
  paginasDoFormulario,
  type Respostas,
  TIPOS_DE_APRESENTACAO,
  validarRespostasDoFormulario,
  type ValorDeResposta,
} from '@leadtogo/shared'
import { Lock, Star } from 'lucide-react'
import { type FormEvent, type ReactNode, useMemo, useState } from 'react'

import { Button } from './button'
import { Select, TextArea, TextField } from './campos'
import { Checkbox } from './checkbox'
import { cn } from './cn'
import { Alert } from './feedback'
import { Markdown } from './markdown'

const LARGURA = {
  inteira: 'md:col-span-6',
  metade: 'md:col-span-3',
  terco: 'md:col-span-2',
} as const

/** Nota de 1 a 5 (estrelas) ou de 0 a 10 (NPS), em botões de alternância. */
function Notas({
  campo,
  valor,
  aoMudar,
  erro,
  desligado,
}: {
  campo: Campo
  valor: ValorDeResposta | undefined
  aoMudar: (v: number) => void
  erro?: string | undefined
  desligado: boolean
}) {
  const estrelas = campo.tipo === 'avaliacao'
  const opcoes = estrelas ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const atual = typeof valor === 'number' ? valor : null
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 text-[13px] font-semibold text-ink">
        {campo.rotulo}
        {campo.obrigatorio ? <span className="text-danger"> *</span> : null}
      </legend>
      <div role="radiogroup" aria-label={campo.rotulo} className="flex flex-wrap gap-1">
        {opcoes.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={atual === n}
            aria-label={estrelas ? `${n} de 5` : String(n)}
            disabled={desligado}
            onClick={() => aoMudar(n)}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center rounded-sm border border-border bg-surface',
              estrelas
                ? 'size-9 border-0 bg-transparent'
                : 'h-9 min-w-9 px-2 text-sm font-semibold',
              !estrelas && atual === n && 'border-brand bg-brand-soft text-brand',
            )}
          >
            {estrelas ? (
              <Star
                size={24}
                strokeWidth={1.75}
                aria-hidden="true"
                className={
                  atual !== null && n <= atual ? 'fill-warning text-warning' : 'text-ink-subtle'
                }
              />
            ) : (
              n
            )}
          </button>
        ))}
      </div>
      {campo.ajuda ? <p className="m-0 text-xs text-ink-muted">{campo.ajuda}</p> : null}
      {erro ? <p className="m-0 text-xs text-danger">{erro}</p> : null}
    </fieldset>
  )
}

function CampoDoFormulario({
  campo,
  valor,
  aoMudar,
  erro,
  travado,
}: {
  campo: Campo
  valor: ValorDeResposta | undefined
  aoMudar: (v: ValorDeResposta) => void
  erro?: string | undefined
  travado: boolean
}) {
  const comum = {
    label: campo.rotulo,
    hint: travado ? 'Preenchido com o seu cadastro' : campo.ajuda,
    error: erro,
    required: campo.obrigatorio,
    readOnly: travado,
  }
  const texto = typeof valor === 'string' || typeof valor === 'number' ? String(valor) : ''
  switch (campo.tipo) {
    case 'titulo':
      return <h3 className="m-0 pt-2 text-base font-semibold">{campo.rotulo}</h3>
    case 'informativo':
      return <Markdown texto={campo.texto ?? campo.rotulo} />
    case 'oculto':
    case 'quebra_de_pagina':
      return null
    case 'texto_longo':
      return (
        <TextArea {...comum} value={texto} rows={4} onChange={(e) => aoMudar(e.target.value)} />
      )
    case 'selecao':
      return (
        <Select
          {...comum}
          value={texto}
          placeholder="Escolha"
          options={(campo.opcoes ?? []).map((o) => ({ value: o.valor, label: o.rotulo }))}
          onChange={(e) => aoMudar(e.target.value)}
          disabled={travado}
        />
      )
    case 'multipla': {
      const lista = Array.isArray(valor) ? valor : []
      return (
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold text-ink">
            {campo.rotulo}
            {campo.obrigatorio ? <span className="text-danger"> *</span> : null}
          </legend>
          {(campo.opcoes ?? []).map((o) => (
            <Checkbox
              key={o.valor}
              label={o.rotulo}
              checked={lista.includes(o.valor)}
              disabled={travado}
              onChange={(e) =>
                aoMudar(e.target.checked ? [...lista, o.valor] : lista.filter((v) => v !== o.valor))
              }
            />
          ))}
          {erro ? <p className="m-0 text-xs text-danger">{erro}</p> : null}
        </fieldset>
      )
    }
    case 'sim_nao':
      return (
        <Select
          {...comum}
          value={valor === true ? 'sim' : valor === false ? 'nao' : ''}
          placeholder="Escolha"
          options={[
            { value: 'sim', label: 'Sim' },
            { value: 'nao', label: 'Não' },
          ]}
          onChange={(e) => aoMudar(e.target.value === '' ? null : e.target.value === 'sim')}
          disabled={travado}
        />
      )
    case 'aceite':
      return (
        <div className="flex flex-col gap-1">
          <Checkbox
            label={
              <>
                {campo.rotulo}
                {campo.obrigatorio ? <span className="text-danger"> *</span> : null}
              </>
            }
            {...(campo.ajuda ? { description: campo.ajuda } : {})}
            checked={valor === true}
            onChange={(e) => aoMudar(e.target.checked)}
          />
          {erro ? <p className="m-0 text-xs text-danger">{erro}</p> : null}
        </div>
      )
    case 'avaliacao':
    case 'nps':
      return <Notas campo={campo} valor={valor} aoMudar={aoMudar} erro={erro} desligado={travado} />
    default: {
      const tipoHtml =
        campo.tipo === 'email'
          ? 'email'
          : campo.tipo === 'telefone'
            ? 'tel'
            : campo.tipo === 'data'
              ? 'date'
              : campo.tipo === 'hora'
                ? 'time'
                : campo.tipo === 'numero' || campo.tipo === 'moeda'
                  ? 'number'
                  : 'text'
      return (
        <TextField
          {...comum}
          type={tipoHtml}
          inputMode={
            campo.tipo === 'cnpj' || campo.tipo === 'cpf' || campo.tipo === 'telefone'
              ? 'numeric'
              : undefined
          }
          {...(campo.tipo === 'moeda' ? { step: '0.01' } : {})}
          {...(travado ? { icon: Lock } : {})}
          value={texto}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )
    }
  }
}

export interface ResultadoDoEnvio {
  /** Erros que o servidor devolveu, por campo */
  erros?: Record<string, string>
  /** Erro geral (rede, versão desatualizada...) */
  mensagem?: string
}

/**
 * O formulário montado a partir da definição do construtor (Fase 4E): páginas (etapas), condicionais, notas,
 * campos travados (preenchidos pelo cadastro) e um botão por ação. A validação é a mesma do servidor, para mostrar
 * os erros antes de enviar; o servidor sempre confere de novo.
 */
export function FormularioDinamico({
  definicao,
  preenchidos = {},
  travados = [],
  aoEnviar,
  rodape,
  enviando = false,
  className,
}: {
  definicao: DefinicaoDeFormulario
  preenchidos?: Respostas
  travados?: string[]
  aoEnviar: (botao: string, respostas: Respostas) => Promise<ResultadoDoEnvio | void>
  /** Antes dos botões (aceite de privacidade, captcha) */
  rodape?: ReactNode
  enviando?: boolean
  className?: string
}) {
  const [respostas, setRespostas] = useState<Respostas>(() => {
    const iniciais: Respostas = {}
    for (const c of definicao.campos) {
      if (c.valorPadrao !== undefined) iniciais[c.id] = c.valorPadrao
    }
    return { ...iniciais, ...preenchidos }
  })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [pagina, setPagina] = useState(0)
  const paginas = useMemo(() => paginasDoFormulario(definicao), [definicao])
  const visiveis = camposVisiveis(definicao, respostas)
  const travadosSet = new Set(travados)
  const ultima = pagina >= paginas.length - 1
  const atuais = paginas[pagina] ?? []

  const mudar = (id: string, v: ValorDeResposta) => {
    setRespostas((r) => ({ ...r, [id]: v }))
    setErros((e) => {
      if (!(id in e)) return e
      const { [id]: _, ...resto } = e
      return resto
    })
  }

  /** Erros só dos campos desta página (para avançar) ou de todas (para enviar). */
  const errosDe = (campos: Campo[] | null) => {
    const r = validarRespostasDoFormulario(definicao, respostas)
    if (!campos) return r.erros
    const ids = new Set(campos.map((c) => c.id))
    return Object.fromEntries(Object.entries(r.erros).filter(([id]) => ids.has(id)))
  }

  const avancar = () => {
    const e = errosDe(atuais)
    setErros(e)
    if (Object.keys(e).length === 0) setPagina((p) => Math.min(p + 1, paginas.length - 1))
  }

  const enviar = async (botao: string) => {
    setMensagem(null)
    const e = errosDe(null)
    setErros(e)
    if (Object.keys(e).length > 0) {
      const primeira = paginas.findIndex((p) => p.some((c) => c.id in e))
      if (primeira >= 0) setPagina(primeira)
      return
    }
    const r = await aoEnviar(botao, respostas)
    if (r?.erros) setErros(r.erros)
    if (r?.mensagem) setMensagem(r.mensagem)
  }

  return (
    <form
      noValidate
      onSubmit={(e: FormEvent) => e.preventDefault()}
      className={cn('flex flex-col gap-4', className)}
    >
      {paginas.length > 1 ? (
        <p className="m-0 text-xs font-semibold text-ink-muted" aria-live="polite">
          Etapa {pagina + 1} de {paginas.length}
        </p>
      ) : null}
      {mensagem ? <Alert tone="danger">{mensagem}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {atuais
          .filter((c) => visiveis.has(c.id) && c.tipo !== 'oculto')
          .map((c) => (
            <div
              key={c.id}
              className={
                TIPOS_DE_APRESENTACAO.includes(c.tipo) ? 'md:col-span-6' : LARGURA[c.largura]
              }
            >
              <CampoDoFormulario
                campo={c}
                valor={respostas[c.id]}
                aoMudar={(v) => mudar(c.id, v)}
                erro={erros[c.id]}
                travado={travadosSet.has(c.id)}
              />
            </div>
          ))}
      </div>
      {ultima ? rodape : null}
      <div className="flex flex-wrap justify-end gap-2">
        {pagina > 0 ? (
          <Button onClick={() => setPagina((p) => p - 1)} disabled={enviando}>
            Voltar
          </Button>
        ) : null}
        {ultima ? (
          definicao.botoes.map((b) => (
            <Button
              key={b.id}
              variant={b.estilo === 'primario' ? 'primary' : 'secondary'}
              loading={enviando}
              onClick={() => void enviar(b.id)}
            >
              {b.rotulo}
            </Button>
          ))
        ) : (
          <Button variant="primary" onClick={avancar}>
            Continuar
          </Button>
        )}
      </div>
    </form>
  )
}
