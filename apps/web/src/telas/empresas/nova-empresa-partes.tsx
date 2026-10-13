import { formatarTelefone, ROTULO_DO_REGIME, type RegimeTributario } from '@leadtogo/shared'
import { Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select, TextArea, TextField } from '@/components/ui/campos'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/exibicao'
import { cn } from '@/lib/cn'

import {
  type Formulario,
  mascararCep,
  PORTES,
  type TelefoneDoFormulario,
  telefoneManual,
} from './nova-empresa-dados'

/** Seção do cadastro: círculo com o número do passo, título e, à direita, o que couber (selo, controle). */
export function Passo({
  numero,
  titulo,
  direita,
  children,
}: {
  numero: number
  titulo: string
  direita?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-brand"
        >
          {numero}
        </span>
        <h2 className="m-0 flex-1 text-[15px] leading-5 font-semibold">{titulo}</h2>
        {direita}
      </div>
      {children}
    </section>
  )
}

const sobretitulo =
  'text-[11px] leading-4 font-semibold tracking-[0.06em] text-ink-subtle uppercase pt-1.5'

const REGIMES = (Object.keys(ROTULO_DO_REGIME) as RegimeTributario[]).map((v) => ({
  value: v,
  label: ROTULO_DO_REGIME[v],
}))

type Mudar = (patch: Partial<Formulario>) => void

/** Passo 2: os dados (da Receita ou digitados), todos editáveis, menos a cidade. */
export function DadosDaEmpresa({
  f,
  mudar,
  daReceita,
  rotuloDoNome,
  mostrarOrigemDosTelefones = true,
}: {
  f: Formulario
  mudar: Mudar
  /** Os dados vieram da Receita (a dica "Da Receita" aparece nos campos) */
  daReceita: boolean
  rotuloDoNome: string
  /** Diz de onde veio cada telefone ("da Receita", "digitado"); na edição a origem não importa */
  mostrarOrigemDosTelefones?: boolean
}) {
  const dica = (texto: string) => (daReceita ? texto : undefined)
  const [novoTelefone, setNovoTelefone] = useState('')
  const [erroDoTelefone, setErroDoTelefone] = useState<string>()

  const adicionarTelefone = () => {
    const t = telefoneManual(novoTelefone, `manual-${f.telefones.length}-${Date.now()}`)
    if (!t) {
      setErroDoTelefone('Telefone inválido. Digite o DDD e o número, como (27) 3243-1907.')
      return
    }
    if (f.telefones.some((x) => x.e164 === t.e164)) {
      setErroDoTelefone('Este telefone já está na lista.')
      return
    }
    mudar({ telefones: [...f.telefones, t] })
    setNovoTelefone('')
    setErroDoTelefone(undefined)
  }
  const mudarTelefone = (chave: string, patch: Partial<TelefoneDoFormulario>) =>
    mudar({ telefones: f.telefones.map((t) => (t.chave === chave ? { ...t, ...patch } : t)) })

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-md:grid-cols-1">
        <TextField
          label={rotuloDoNome}
          required
          className="col-span-full"
          value={f.razaoSocial}
          onChange={(e) => mudar({ razaoSocial: e.target.value })}
          {...(dica('Da Receita') ? { hint: 'Da Receita' } : {})}
        />
        <TextField
          label="Nome fantasia"
          hint="Nome de exibição no CRM"
          value={f.nomeFantasia}
          onChange={(e) => mudar({ nomeFantasia: e.target.value })}
        />
        <Select
          label="Regime tributário"
          options={REGIMES}
          value={f.regimeTributario}
          onChange={(e) => mudar({ regimeTributario: e.target.value as RegimeTributario })}
          {...(dica('Da Receita, editável') ? { hint: 'Da Receita, editável' } : {})}
        />
        <TextField
          label="Início das atividades"
          type="date"
          value={f.dataInicio}
          onChange={(e) => mudar({ dataInicio: e.target.value })}
          {...(dica('Da Receita') ? { hint: 'Da Receita' } : {})}
        />
        {daReceita ? (
          <TextField
            label="Porte"
            readOnly
            value={`${f.porteCodigo === null ? 'Não informado' : (PORTES[f.porteCodigo] ?? String(f.porteCodigo))} · ${f.mei ? 'MEI' : 'não é MEI'}`}
            hint="Da Receita"
          />
        ) : null}
      </div>

      <span className={sobretitulo}>Endereço</span>
      <div className="grid grid-cols-[140px_90px_minmax(0,1fr)_110px] gap-x-4 gap-y-3.5 max-md:grid-cols-2">
        <TextField
          label="CEP"
          mono
          value={f.cep}
          onChange={(e) => mudar({ cep: mascararCep(e.target.value) })}
        />
        <TextField
          label="Tipo"
          placeholder="Rua"
          value={f.tipoLogradouro}
          onChange={(e) => mudar({ tipoLogradouro: e.target.value })}
        />
        <TextField
          label="Logradouro"
          className="max-md:col-span-full"
          value={f.logradouro}
          onChange={(e) => mudar({ logradouro: e.target.value })}
        />
        <TextField
          label="Número"
          value={f.numero}
          onChange={(e) => mudar({ numero: e.target.value })}
        />
        <TextField
          label="Complemento"
          className="col-span-2"
          value={f.complemento}
          onChange={(e) => mudar({ complemento: e.target.value })}
        />
        <TextField
          label="Bairro"
          className="col-span-2"
          value={f.bairro}
          onChange={(e) => mudar({ bairro: e.target.value })}
        />
        <TextField
          label="Cidade"
          className="col-span-full"
          readOnly
          value={f.municipioTexto}
          placeholder="Vem da consulta à Receita"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-1.5 max-md:grid-cols-1">
        <div className="flex flex-col gap-2">
          <span className={sobretitulo}>Telefones</span>
          {f.telefones.length === 0 ? (
            <span className="text-sm text-ink-muted">Nenhum telefone ainda.</span>
          ) : null}
          {f.telefones.map((t) => (
            <div key={t.chave} className="flex flex-col gap-1">
              <Checkbox
                label={formatarTelefone(t.numero)}
                description={`${t.tipo === 'celular' ? 'Celular' : t.tipo === 'fixo' ? 'Fixo' : 'Outro'}${mostrarOrigemDosTelefones ? ` · ${t.daReceita ? 'da Receita' : 'digitado'}` : ''}`}
                checked={t.incluir}
                onChange={(e) => mudarTelefone(t.chave, { incluir: e.target.checked })}
              />
              {t.tipo === 'celular' && t.incluir ? (
                <Checkbox
                  className="pl-6"
                  label="Também é WhatsApp"
                  checked={t.whatsapp}
                  onChange={(e) => mudarTelefone(t.chave, { whatsapp: e.target.checked })}
                />
              ) : null}
            </div>
          ))}
          <div className="flex items-start gap-2 pt-1">
            <TextField
              aria-label="Novo telefone"
              placeholder="(27) 3243-1907"
              className="flex-1"
              value={novoTelefone}
              error={erroDoTelefone}
              onChange={(e) => {
                setNovoTelefone(e.target.value)
                setErroDoTelefone(undefined)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  adicionarTelefone()
                }
              }}
            />
            <Button icon={Plus} onClick={adicionarTelefone}>
              Adicionar
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={sobretitulo}>Sócios</span>
          {f.socios.length === 0 ? (
            <span className="text-sm text-ink-muted">
              {daReceita
                ? 'A Receita não informou sócios.'
                : 'Os sócios vêm da consulta à Receita.'}
            </span>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {f.socios.map((s) => (
                <li key={`${s.nome}-${s.qualificacao}`} className="flex flex-col text-sm leading-5">
                  <span className="font-semibold">{s.nome}</span>
                  {s.qualificacao ? <span className="text-ink-muted">{s.qualificacao}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {f.cnaes.length > 0 ? (
        <div className="flex flex-col pt-1.5">
          <span className={cn(sobretitulo, 'pb-2')}>CNAEs</span>
          {f.cnaes.map((c) => (
            <div key={c.codigo} className="flex items-start gap-3 border-t border-border py-2">
              <span className="w-[88px] shrink-0 font-mono text-[13px] text-ink-muted">
                {String(c.codigo)
                  .padStart(7, '0')
                  .replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3')}
              </span>
              <span className="flex-1">{c.descricao}</span>
              {c.principal ? <Badge tone="outline">Principal</Badge> : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}

/** Passo 3: de quem é a empresa e como ela entra na carteira. */
export function DadosDaCarteira({
  f,
  mudar,
  vendedores,
  verticais,
  status,
}: {
  f: Formulario
  mudar: Mudar
  /** Nulo: o campo não aparece (vendedor padrão, ou quem não pode escolher) */
  vendedores: { value: string; label: string }[] | null
  verticais: { value: string; label: string }[]
  /** Nulo: o Status não se escolhe aqui (na edição, ele muda em "Editar tags") */
  status: { value: string; label: string }[] | null
}) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-3.5 max-md:grid-cols-1">
      {vendedores ? (
        <Select
          label="Vendedor"
          required
          {...(f.vendedorId === '' ? { placeholder: 'Eu mesmo (padrão)' } : {})}
          options={vendedores}
          value={f.vendedorId}
          onChange={(e) => mudar({ vendedorId: e.target.value })}
        />
      ) : null}
      <Select
        label="Vertical"
        placeholder="Sem vertical"
        options={verticais}
        value={f.verticalId}
        onChange={(e) => mudar({ verticalId: e.target.value })}
      />
      {status ? (
        <Select
          label="Status"
          required
          options={status}
          value={f.statusTagId}
          onChange={(e) => mudar({ statusTagId: e.target.value })}
        />
      ) : null}
      <TextField
        label="Website"
        placeholder="empresa.com.br"
        value={f.website}
        onChange={(e) => mudar({ website: e.target.value })}
      />
      <TextArea
        label="Observações"
        className="col-span-full"
        placeholder="Como chegou até nós, quem indicou, horários de visita"
        value={f.observacoes}
        onChange={(e) => mudar({ observacoes: e.target.value })}
      />
    </div>
  )
}
