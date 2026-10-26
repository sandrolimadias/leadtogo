import type { PapelDecisao } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Checkbox, Switch } from '@leadtogo/ui/checkbox'
import { Badge } from '@leadtogo/ui/exibicao'
import { documentoFormatado } from '@/telas/empresas/formatos'

import {
  type EmailDoFormulario,
  type FormularioDeContato,
  novaChave,
  type TelefoneDoFormulario,
  type TipoDoTelefoneNaTela,
} from './formulario-dados'

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const DIAS = Array.from({ length: 31 }, (_, i) => String(i + 1))

const TIPOS_DE_TELEFONE: { value: TipoDoTelefoneNaTela; label: string }[] = [
  { value: '', label: 'Automático' },
  { value: 'celular', label: 'Celular' },
  { value: 'fixo', label: 'Fixo' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'outro', label: 'Outro' },
]

type Mudar = (patch: Partial<FormularioDeContato>) => void

/** Seção do formulário: título pequeno e o conteúdo. */
export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="m-0 text-[15px] leading-5 font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

/** Dados da pessoa: nome, papel, aniversário, LinkedIn e observações. */
export function DadosDaPessoa({
  f,
  mudar,
  papeis,
  erros,
}: {
  f: FormularioDeContato
  mudar: Mudar
  papeis: PapelDecisao[]
  erros: Record<string, string>
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-md:grid-cols-1">
      <TextField
        label="Nome"
        required
        className="col-span-full"
        value={f.nome}
        error={erros['nome']}
        onChange={(e) => mudar({ nome: e.target.value })}
      />
      <Select
        label="Papel na decisão"
        placeholder="Sem papel definido"
        options={papeis.filter((p) => p.ativo).map((p) => ({ value: p.id, label: p.nome }))}
        value={f.papelDecisaoId}
        onChange={(e) => mudar({ papelDecisaoId: e.target.value })}
      />
      <TextField
        label="LinkedIn"
        placeholder="https://www.linkedin.com/in/nome"
        value={f.linkedin}
        onChange={(e) => mudar({ linkedin: e.target.value })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] leading-[18px] font-semibold">Aniversário</span>
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Dia do aniversário"
            placeholder="Dia"
            options={DIAS}
            value={f.dia}
            onChange={(e) => mudar({ dia: e.target.value })}
          />
          <Select
            aria-label="Mês do aniversário"
            placeholder="Mês"
            options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
            value={f.mes}
            onChange={(e) => mudar({ mes: e.target.value })}
          />
        </div>
        {erros['aniversario'] ? (
          <span className="text-xs leading-4 font-medium text-danger">{erros['aniversario']}</span>
        ) : (
          <span className="text-xs leading-4 text-ink-muted">Só dia e mês, sem o ano.</span>
        )}
      </div>
      <TextArea
        label="Observações"
        className="col-span-full"
        value={f.observacoes}
        onChange={(e) => mudar({ observacoes: e.target.value })}
      />
    </div>
  )
}

/** Telefones: quantos quiser, um principal. O número é conferido ao salvar (vira E.164). */
export function ListaDeTelefones({ f, mudar }: { f: FormularioDeContato; mudar: Mudar }) {
  const trocar = (chave: string, patch: Partial<TelefoneDoFormulario>) =>
    mudar({ telefones: f.telefones.map((t) => (t.chave === chave ? { ...t, ...patch } : t)) })
  const marcarPrincipal = (chave: string) =>
    mudar({ telefones: f.telefones.map((t) => ({ ...t, principal: t.chave === chave })) })
  return (
    <div className="flex flex-col gap-2">
      {f.telefones.length === 0 ? (
        <span className="text-sm text-ink-muted">Nenhum telefone ainda.</span>
      ) : null}
      {f.telefones.map((t, i) => (
        <div key={t.chave} className="flex flex-wrap items-end gap-2">
          <TextField
            label={i === 0 ? 'Telefone' : undefined}
            aria-label={`Telefone ${i + 1}`}
            placeholder="(27) 99847-2210"
            className="min-w-44 flex-1"
            value={t.numero}
            onChange={(e) => trocar(t.chave, { numero: e.target.value })}
          />
          <Select
            label={i === 0 ? 'Tipo' : undefined}
            aria-label={`Tipo do telefone ${i + 1}`}
            options={TIPOS_DE_TELEFONE}
            value={t.tipo}
            onChange={(e) => trocar(t.chave, { tipo: e.target.value as TipoDoTelefoneNaTela })}
            className="w-36"
          />
          <Checkbox
            label="Principal"
            checked={t.principal}
            onChange={() => marcarPrincipal(t.chave)}
            className="h-(--ctl) items-center"
          />
          <IconButton
            icon={Trash2}
            label={`Remover telefone ${i + 1}`}
            onClick={() => mudar({ telefones: f.telefones.filter((x) => x.chave !== t.chave) })}
          />
        </div>
      ))}
      <div>
        <Button
          icon={Plus}
          onClick={() =>
            mudar({
              telefones: [
                ...f.telefones,
                {
                  chave: novaChave('tel'),
                  numero: '',
                  tipo: '',
                  principal: f.telefones.length === 0,
                },
              ],
            })
          }
        >
          Adicionar telefone
        </Button>
      </div>
    </div>
  )
}

/** E-mails: quantos quiser, um principal. */
export function ListaDeEmails({ f, mudar }: { f: FormularioDeContato; mudar: Mudar }) {
  const trocar = (chave: string, patch: Partial<EmailDoFormulario>) =>
    mudar({ emails: f.emails.map((e) => (e.chave === chave ? { ...e, ...patch } : e)) })
  const marcarPrincipal = (chave: string) =>
    mudar({ emails: f.emails.map((e) => ({ ...e, principal: e.chave === chave })) })
  return (
    <div className="flex flex-col gap-2">
      {f.emails.length === 0 ? (
        <span className="text-sm text-ink-muted">Nenhum e-mail ainda.</span>
      ) : null}
      {f.emails.map((e, i) => (
        <div key={e.chave} className="flex flex-wrap items-end gap-2">
          <TextField
            label={i === 0 ? 'E-mail' : undefined}
            aria-label={`E-mail ${i + 1}`}
            type="email"
            placeholder="nome@empresa.com.br"
            className="min-w-52 flex-1"
            value={e.email}
            onChange={(ev) => trocar(e.chave, { email: ev.target.value })}
          />
          <Select
            label={i === 0 ? 'Tipo' : undefined}
            aria-label={`Tipo do e-mail ${i + 1}`}
            options={[
              { value: 'trabalho', label: 'Trabalho' },
              { value: 'pessoal', label: 'Pessoal' },
            ]}
            value={e.tipo}
            onChange={(ev) =>
              trocar(e.chave, { tipo: ev.target.value as EmailDoFormulario['tipo'] })
            }
            className="w-36"
          />
          <Checkbox
            label="Principal"
            checked={e.principal}
            onChange={() => marcarPrincipal(e.chave)}
            className="h-(--ctl) items-center"
          />
          <IconButton
            icon={Trash2}
            label={`Remover e-mail ${i + 1}`}
            onClick={() => mudar({ emails: f.emails.filter((x) => x.chave !== e.chave) })}
          />
        </div>
      ))}
      <div>
        <Button
          icon={Plus}
          onClick={() =>
            mudar({
              emails: [
                ...f.emails,
                {
                  chave: novaChave('email'),
                  email: '',
                  tipo: 'trabalho',
                  principal: f.emails.length === 0,
                },
              ],
            })
          }
        >
          Adicionar e-mail
        </Button>
      </div>
    </div>
  )
}

/** Consentimento (LGPD): a pessoa pediu para não ser contatada? Desliga WhatsApp e e-mail juntos. */
export function Consentimento({ f, mudar }: { f: FormularioDeContato; mudar: Mudar }) {
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="Pediu para não receber contato"
        checked={f.naoQuerContato}
        onChange={(e) => mudar({ naoQuerContato: e.target.checked, consentimentoMexido: true })}
      />
      <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
        Ligado: o contato não aceita WhatsApp nem e-mail. A ficha mostra o selo "Não quer contato" e
        guarda quando isso foi registrado.
      </p>
    </div>
  )
}

/**
 * Empresa do contato (no cadastro): busca na carteira, o cargo e se é o contato principal dela. Só
 * aparecem as empresas que o usuário edita.
 */
export function EmpresaDoContato({
  f,
  mudar,
  obrigatoria,
}: {
  f: FormularioDeContato
  mudar: Mudar
  obrigatoria: boolean
}) {
  const servicos = useServicos()
  const [texto, setTexto] = useState('')
  const [termo, setTermo] = useState('')
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), 300)
    return () => clearTimeout(espera)
  }, [texto])
  const achadas = useQuery({
    queryKey: ['contatos', 'busca-de-empresa', termo],
    enabled: termo.length >= 2 && !f.empresaId,
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.listar({ busca: termo, porPagina: 6 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens.filter((e) => e.editavel)
    },
  })

  if (f.empresaId) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border-strong bg-surface-sunken px-3 py-2">
          <span className="text-[13px] font-semibold">Empresa</span>
          <span className="flex-1 text-sm">{f.empresaNome}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => mudar({ empresaId: '', empresaNome: '', cargo: '', principal: false })}
          >
            Trocar
          </Button>
        </div>
        <TextField
          label="Cargo nesta empresa"
          placeholder="Ex.: Compradora"
          value={f.cargo}
          onChange={(e) => mudar({ cargo: e.target.value })}
        />
        <Checkbox
          label="Contato principal desta empresa"
          description="Só um por empresa: marcar este tira o selo do anterior."
          checked={f.principal}
          onChange={(e) => mudar({ principal: e.target.checked })}
        />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label={obrigatoria ? 'Empresa' : 'Empresa (opcional)'}
        required={obrigatoria}
        icon={Search}
        placeholder="Nome, CNPJ ou cidade"
        hint={
          obrigatoria
            ? 'Escolha uma empresa da sua carteira: sem ela você não veria o contato.'
            : 'Dá para vincular depois, na ficha do contato.'
        }
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {achadas.isError ? (
        <span className="text-sm text-danger">{achadas.error.message}</span>
      ) : null}
      {achadas.data && achadas.data.length === 0 ? (
        <span className="text-sm text-ink-muted">Nenhuma empresa sua com esse nome.</span>
      ) : null}
      {achadas.data && achadas.data.length > 0 ? (
        <ul aria-label="Empresas encontradas" className="m-0 flex list-none flex-col gap-1 p-0">
          {achadas.data.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  mudar({ empresaId: e.id, empresaNome: e.nome })
                  setTexto('')
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">{e.nome}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {documentoFormatado(e.tipoDocumento, e.documento)}
                  </span>
                </span>
                {e.cidade ? (
                  <Badge tone="neutral">{`${e.cidade.nome}/${e.cidade.uf}`}</Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
