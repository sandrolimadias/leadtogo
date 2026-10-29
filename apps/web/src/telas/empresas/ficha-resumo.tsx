import type { EmpresaCarteira } from '@leadtogo/api-client'
import { formatarTelefone } from '@leadtogo/shared'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'
import { Janela } from '@/telas/cadastros/base'
import { Avatar, Badge } from '@leadtogo/ui/exibicao'
import { cn } from '@leadtogo/ui/cn'

import { dataCurta, documentoFormatado } from './formatos'
import { PORTES } from './nova-empresa-dados'

const ORIGEM: Record<EmpresaCarteira['origemCadastro'], string> = {
  manual: 'Cadastro manual',
  receita: 'Consulta à Receita',
  importacao: 'Importação de planilha',
  prospeccao: 'Prospecção',
  whatsapp: 'WhatsApp',
  api: 'API',
}

const REGIME: Record<EmpresaCarteira['regimeTributario'], string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  imune_isenta: 'Imune/Isenta',
  nao_informado: 'Não informado',
}

/** Cartão da ficha: título, algo à direita do título e o conteúdo. */
export function Cartao({
  titulo,
  direita,
  children,
  semMargem,
}: {
  titulo: string
  direita?: ReactNode
  children: ReactNode
  semMargem?: boolean
}) {
  return (
    <section
      aria-label={titulo}
      className="flex flex-col rounded-lg border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3.5">
        <h2 className="m-0 flex-1 text-[15px] leading-5 font-semibold">{titulo}</h2>
        {direita}
      </div>
      <div className={cn(!semMargem && 'p-4')}>{children}</div>
    </section>
  )
}

function Campo({
  rotulo,
  children,
  mono,
  largo,
}: {
  rotulo: string
  children: ReactNode
  mono?: boolean
  largo?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', largo && 'col-span-full')}>
      <dt className="text-xs font-bold text-ink">{rotulo}</dt>
      <dd className={cn('m-0 text-sm [overflow-wrap:anywhere]', mono && 'font-mono text-[13px]')}>
        {children}
      </dd>
    </div>
  )
}

const vazio = <span className="text-ink-subtle">—</span>

/** "RUA DAS FLORES, 567 – GALPAO 2, CENTRO" (o que houver). */
function enderecoEmLinhas(e: EmpresaCarteira['endereco']): string | null {
  const rua = [e.tipoLogradouro, e.logradouro].filter(Boolean).join(' ')
  const numero = [e.numero, e.complemento].filter(Boolean).join(' – ')
  const linha = [[rua, numero].filter(Boolean).join(', '), e.bairro].filter(Boolean).join(', ')
  return linha || null
}

/** Dados cadastrais: tudo o que o cadastro guarda, em uma grade de rótulo e valor. */
export function DadosCadastrais({ e }: { e: EmpresaCarteira }) {
  const endereco = enderecoEmLinhas(e.endereco)
  return (
    <dl className="m-0 grid grid-cols-3 gap-x-6 gap-y-3.5 max-md:grid-cols-1">
      <Campo rotulo="Razão social" largo>
        {e.razaoSocial}
      </Campo>
      <Campo rotulo="Nome fantasia">{e.nomeFantasia ?? vazio}</Campo>
      <Campo
        rotulo={
          e.tipoDocumento === 'cpf' ? 'CPF' : e.tipoDocumento === 'cnpj' ? 'CNPJ' : 'Documento'
        }
        mono
      >
        {documentoFormatado(e.tipoDocumento, e.documento)}
      </Campo>
      {e.tipoDocumento === 'cnpj' && e.matrizFilial ? (
        <Campo rotulo="Matriz ou filial">
          {e.matrizFilial === 'matriz' ? (
            'Matriz'
          ) : e.matriz ? (
            <>
              Filial de{' '}
              <Link
                to="/empresas/$empresaId"
                params={{ empresaId: e.matriz.id }}
                className="font-semibold"
              >
                {e.matriz.nome}
              </Link>
            </>
          ) : (
            'Filial'
          )}
        </Campo>
      ) : null}
      {e.filiais.length > 0 ? (
        <Campo rotulo={e.filiais.length === 1 ? 'Filial cadastrada' : 'Filiais cadastradas'} largo>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {e.filiais.map((f) => (
              <li key={f.id}>
                <Link
                  to="/empresas/$empresaId"
                  params={{ empresaId: f.id }}
                  className="font-semibold"
                >
                  {f.nome}
                </Link>{' '}
                <span className="font-mono text-xs text-ink-muted">
                  {documentoFormatado('cnpj', f.documento)}
                </span>
              </li>
            ))}
          </ul>
        </Campo>
      ) : null}
      <Campo rotulo="Início das atividades">
        {e.dataInicioAtividades ? dataCurta(`${e.dataInicioAtividades}T12:00:00`) : vazio}
      </Campo>
      <Campo rotulo="Porte">
        {e.porte ? (PORTES[e.porte.codigo] ?? e.porte.descricao) : vazio}
      </Campo>
      <Campo rotulo="Regime tributário">{REGIME[e.regimeTributario]}</Campo>
      <Campo rotulo="MEI">{e.mei ? 'Sim' : 'Não'}</Campo>
      <Campo rotulo="Endereço" largo>
        {endereco ?? vazio}
      </Campo>
      <Campo rotulo="Cidade">
        {e.endereco.municipio ? `${e.endereco.municipio.nome}/${e.endereco.municipio.uf}` : vazio}
      </Campo>
      <Campo rotulo="CEP" mono>
        {e.endereco.cep ? `${e.endereco.cep.slice(0, 5)}-${e.endereco.cep.slice(5)}` : vazio}
      </Campo>
      <Campo rotulo="Telefones" largo>
        {e.telefones.length === 0 ? (
          vazio
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {e.telefones.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="tabular-nums">
                  {formatarTelefone(t.e164.startsWith('+55') ? t.e164.slice(3) : t.e164)}
                </span>
                {t.tipo === 'whatsapp' ? <Badge tone="success">WhatsApp</Badge> : null}
                {t.principal && e.telefones.length > 1 ? (
                  <Badge tone="outline">Principal</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Campo>
      <Campo rotulo="Website" largo>
        {e.website ? (
          <a
            href={/^https?:\/\//.test(e.website) ? e.website : `https://${e.website}`}
            target="_blank"
            rel="noreferrer"
          >
            {e.website}
          </a>
        ) : (
          vazio
        )}
      </Campo>
      <Campo rotulo="Cadastrada em">{dataCurta(e.criadoEm)}</Campo>
      <Campo rotulo="Origem do cadastro">{ORIGEM[e.origemCadastro]}</Campo>
    </dl>
  )
}

/** CNAEs: código com máscara (mono) e descrição; o principal leva o selo. */
export function CnaesDaEmpresa({ cnaes }: { cnaes: EmpresaCarteira['cnaes'] }) {
  if (cnaes.length === 0) {
    return <p className="m-0 px-4 py-3.5 text-sm text-ink-muted">Nenhum CNAE informado.</p>
  }
  // o principal sempre primeiro (a API já manda assim; aqui vale para qualquer origem)
  const ordenados = [...cnaes].sort((a, b) => Number(b.principal) - Number(a.principal))
  return (
    <ul className="m-0 list-none p-0">
      {ordenados.map((c) => (
        <li
          key={c.codigo}
          className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
        >
          <span className="w-[88px] shrink-0 font-mono text-[13px] text-ink-muted">
            {String(c.codigo)
              .padStart(7, '0')
              .replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3')}
          </span>
          <span className="flex-1 text-sm">{c.descricao}</span>
          {c.principal ? <Badge tone="outline">Principal</Badge> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * Sócios: só nome e qualificação (sem CPF, por LGPD). "Converter em contato" abre o diálogo de telefone e
 * e-mail (opcionais) e cria o contato; depois da conversão o sócio mostra o selo "Contato", que abre a ficha.
 */
export function SociosDaEmpresa({
  socios,
  podeConverter,
  convertendo,
  aoConverter,
}: {
  socios: EmpresaCarteira['socios']
  podeConverter: boolean
  convertendo: string | null
  aoConverter: (socio: { id: string; nome: string }) => void
}) {
  return (
    <ul className="m-0 list-none p-0">
      {socios.map((s) => (
        <li
          key={s.id}
          className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-b-0"
        >
          <Avatar name={s.nome} size="lg" className="!size-8" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">{s.nome}</span>
            {s.qualificacao ? (
              <span className="text-[13px] text-ink-muted">{s.qualificacao}</span>
            ) : null}
          </span>
          {s.contatoId ? (
            <Link
              to="/contatos/$contatoId"
              params={{ contatoId: s.contatoId }}
              aria-label={`Abrir o contato ${s.nome}`}
            >
              <Badge tone="success">Contato</Badge>
            </Link>
          ) : podeConverter ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={convertendo !== null}
              onClick={() => aoConverter({ id: s.id, nome: s.nome })}
            >
              {convertendo === s.id ? 'Convertendo…' : 'Converter em contato'}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** "Converter em contato": telefone e e-mail, os dois opcionais (em branco, ficam para depois). */
export function DialogoDeConverterSocio({
  socio,
  convertendo,
  erro,
  aoConverter,
  aoFechar,
}: {
  socio: { id: string; nome: string }
  convertendo: boolean
  erro: string | undefined
  aoConverter: (dados: { telefone: string; email: string }) => void
  aoFechar: () => void
}) {
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto && !convertendo) aoFechar()
      }}
      title={`Converter ${socio.nome} em contato`}
      description="Telefone e e-mail não são obrigatórios: em branco, o contato é criado sem eles e você completa depois."
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar} disabled={convertendo}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={convertendo}
            onClick={() => aoConverter({ telefone: telefone.trim(), email: email.trim() })}
          >
            Converter em contato
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Telefone (opcional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(27) 99999-9999"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
        <TextField
          label="E-mail (opcional)"
          type="email"
          autoComplete="off"
          placeholder="nome@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {erro ? (
          <Alert tone="danger" title="Não foi possível converter">
            {erro}
          </Alert>
        ) : null}
      </div>
    </Janela>
  )
}
