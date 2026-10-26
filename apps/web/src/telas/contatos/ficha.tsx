import type { Contato } from '@leadtogo/api-client'
import { linkDeLigacao, linkDoWhatsapp } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import {
  Ban,
  ChevronRight,
  Ellipsis,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'

import { usePermissoes } from '@/auth/permissoes'
import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Button, IconButton } from '@leadtogo/ui/button'
import { Switch } from '@leadtogo/ui/checkbox'
import { Avatar, Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Menu } from '@leadtogo/ui/menu'
import { ConteudoDaAba, Tabs } from '@leadtogo/ui/tabs'
import { AtividadesDaFicha } from '@/telas/atividades/na-ficha'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'
import { DialogoDeConfirmacao } from '@/telas/cadastros/base'
import { dataEHora } from '@/telas/empresas/formatos'
import { LinkDeIcone } from '@/telas/empresas/ficha'
import { HistoricoAba } from '@/telas/empresas/ficha-historico'
import { Cartao } from '@/telas/empresas/ficha-resumo'

import { EmpresasVinculadas } from './ficha-vinculos'
import { telefoneParaTela } from './formatos'
import { rotaDeEdicaoDoContato } from './rotas'

const rota = getRouteApi('/_autenticado/contatos/$contatoId')

const ABAS = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'atividades', label: 'Atividades' },
  { value: 'historico', label: 'Histórico' },
]

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

const TIPO_DO_TELEFONE = { celular: 'Celular', fixo: 'Fixo', whatsapp: 'WhatsApp', outro: 'Outro' }
const TIPO_DO_EMAIL = { trabalho: 'Trabalho', pessoal: 'Pessoal' }

const naoQuerContato = (c: Contato) => !c.aceitaWhatsapp && !c.aceitaEmail

/** Origem do registro do consentimento, em palavras. */
const ORIGEM: Record<string, string> = { manual: 'Registrado manualmente' }

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-ink-muted">{rotulo}</dt>
      <dd className="m-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function DadosDaPessoa({ contato }: { contato: Contato }) {
  const c = contato
  return (
    <Cartao titulo="Dados da pessoa">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-muted">Telefones</span>
          {c.telefones.length === 0 ? <span className="text-ink-muted">Sem telefone</span> : null}
          {c.telefones.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{telefoneParaTela(t.e164)}</span>
              <span className="text-[13px] text-ink-muted">{TIPO_DO_TELEFONE[t.tipo]}</span>
              {t.principal ? <Badge tone="outline">Principal</Badge> : null}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-muted">E-mails</span>
          {c.emails.length === 0 ? <span className="text-ink-muted">Sem e-mail</span> : null}
          {c.emails.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2">
              <span className="[overflow-wrap:anywhere]">{e.email}</span>
              <span className="text-[13px] text-ink-muted">{TIPO_DO_EMAIL[e.tipo]}</span>
              {e.principal ? <Badge tone="outline">Principal</Badge> : null}
            </div>
          ))}
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3.5 max-md:grid-cols-1">
          <Campo rotulo="Papel na decisão">{c.papelDecisao?.nome ?? '—'}</Campo>
          <Campo rotulo="Aniversário">
            {c.aniversario ? `${c.aniversario.dia} de ${MESES[c.aniversario.mes - 1]}` : '—'}
          </Campo>
          <Campo rotulo="LinkedIn">
            {c.linkedinUrl ? (
              <a href={c.linkedinUrl} target="_blank" rel="noreferrer">
                {c.linkedinUrl.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            ) : (
              '—'
            )}
          </Campo>
          <Campo rotulo="Cadastrado em">{dataEHora(c.criadoEm)}</Campo>
        </dl>
        {c.observacoes ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Observações</span>
            <p className="m-0 whitespace-pre-wrap">{c.observacoes}</p>
          </div>
        ) : null}
      </div>
    </Cartao>
  )
}

/**
 * Consentimento (LGPD). A base legal mostrada é a padrão (legítimo interesse, B2B); quem define é a empresa
 * (docs/lgpd.md). "Pediu para não receber contato" só marca e avisa: não bloqueia Ligar nem WhatsApp.
 */
function ConsentimentoDoContato({
  contato,
  salvando,
  aoMudar,
}: {
  contato: Contato
  salvando: boolean
  aoMudar: (naoQuer: boolean) => void
}) {
  const nao = naoQuerContato(contato)
  return (
    <Cartao
      titulo="Consentimento (LGPD)"
      direita={
        nao ? (
          <Badge tone="warning" icon={Ban}>
            Não quer contato
          </Badge>
        ) : (
          <Badge tone="success">Pode ser contatado</Badge>
        )
      }
    >
      <dl className="m-0 flex flex-col gap-3">
        <div className="flex justify-between gap-3">
          <dt className="text-[13px] text-ink-muted">Base legal</dt>
          <dd className="m-0 text-right font-semibold">Legítimo interesse</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[13px] text-ink-muted">Origem</dt>
          <dd className="m-0 text-right font-semibold">
            {contato.consentimentoOrigem
              ? (ORIGEM[contato.consentimentoOrigem] ?? contato.consentimentoOrigem)
              : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[13px] text-ink-muted">Registrado em</dt>
          <dd className="m-0 font-semibold tabular-nums">{dataEHora(contato.consentimentoEm)}</dd>
        </div>
      </dl>
      {contato.permissoes.editar ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <Switch
            label="Pediu para não receber contato"
            checked={nao}
            disabled={salvando}
            onChange={(e) => aoMudar(e.target.checked)}
          />
          <span className="text-[13px] text-ink-muted">
            Ligado: o contato mostra o selo "Não quer contato" em todas as telas. Ligar e WhatsApp
            continuam disponíveis, mas pense antes de usar.
          </span>
        </div>
      ) : null}
    </Cartao>
  )
}

/** Ficha do contato: cabeçalho com as ações, empresas vinculadas, dados da pessoa e consentimento. */
export function FichaDoContato() {
  const { contatoId } = rota.useParams()
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const celular = useDispositivo() === 'celular'
  // contato sem empresa só fica visível com ver e editar contatos de todos (como o administrador)
  const { alcanceDe } = usePermissoes()
  const vendedor = !(
    alcanceDe('contatos.ver') === 'todas' && alcanceDe('contatos.editar') === 'todas'
  )
  const [aba, setAba] = useState('resumo')
  const [salvandoConsentimento, setSalvandoConsentimento] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erroDaExclusao, setErroDaExclusao] = useState<string>()

  const consulta = useQuery({
    queryKey: ['contatos', 'contato', contatoId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.contatos.detalhar(contatoId)
      if (!r.ok) throw Object.assign(new Error(r.erro.mensagem), { status: r.erro.status })
      return r.dados
    },
  })
  const voltar = () => void navegar({ to: '/contatos' })
  const larguraDaPagina = 'flex w-full flex-col gap-4 p-6 max-md:p-4'

  if (consulta.isPending) {
    return (
      <main className={larguraDaPagina}>
        <div
          role="status"
          aria-label="Carregando o contato"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton lines={6} />
        </div>
      </main>
    )
  }
  if (consulta.isError) {
    const naoExiste = (consulta.error as { status?: number }).status === 404
    return (
      <main className={larguraDaPagina}>
        <div className="rounded-lg border border-border bg-surface">
          {naoExiste ? (
            <EmptyState
              icon={UserRound}
              title="Contato não encontrado"
              description="Ele pode ter sido excluído ou ser de uma carteira que você não vê."
              actions={<Button onClick={voltar}>Voltar para Contatos</Button>}
            />
          ) : (
            <Alert
              tone="danger"
              title="Não foi possível carregar o contato"
              actions={
                <Button size="sm" onClick={() => void consulta.refetch()}>
                  Tentar de novo
                </Button>
              }
            >
              {consulta.error.message}
            </Alert>
          )}
        </div>
      </main>
    )
  }

  const c = consulta.data
  const telefone = c.telefones.find((t) => t.principal) ?? c.telefones[0]
  const email = c.emails.find((e) => e.principal) ?? c.emails[0]
  const ligar = telefone ? linkDeLigacao(telefone.e164) : null
  const whatsapp = telefone ? linkDoWhatsapp(telefone.e164) : null
  const escrever = email ? `mailto:${email.email}` : null
  const principal =
    c.vinculos.find((v) => v.ativo && v.principal) ?? c.vinculos.find((v) => v.ativo)
  const linhaDaEmpresa = principal
    ? [principal.cargo, principal.empresa.nome].filter(Boolean).join(' · ')
    : c.vinculos.length > 0
      ? 'Sem vínculo ativo'
      : 'Sem empresa vinculada'

  const mudarConsentimento = async (naoQuer: boolean) => {
    setSalvandoConsentimento(true)
    const r = await servicos.contatos.alterar(c.id, {
      aceitaWhatsapp: !naoQuer,
      aceitaEmail: !naoQuer,
    })
    setSalvandoConsentimento(false)
    if (!r.ok) {
      toast.error('Não foi possível registrar o consentimento', { description: r.erro.mensagem })
      return
    }
    queryClient.setQueryData(['contatos', 'contato', c.id], r.dados)
    await queryClient.invalidateQueries({ queryKey: ['contatos', 'lista'] })
    toast.success(naoQuer ? 'Marcado como "Não quer contato"' : 'Contato liberado de novo')
  }

  const excluir = async () => {
    setExcluindo(true)
    setErroDaExclusao(undefined)
    const r = await servicos.contatos.excluir(c.id)
    setExcluindo(false)
    if (!r.ok) {
      setErroDaExclusao(r.erro.mensagem)
      return
    }
    toast.success('Contato excluído', { description: `${c.nome} saiu da carteira.` })
    setConfirmandoExclusao(false)
    queryClient.removeQueries({ queryKey: ['contatos', 'contato', c.id] })
    await queryClient.invalidateQueries({ queryKey: ['contatos'] })
    voltar()
  }

  const itensDoMenu = [
    ...(c.permissoes.editar
      ? [
          {
            icon: Pencil,
            label: 'Editar',
            onSelect: () => void navegar(rotaDeEdicaoDoContato(c.id)),
          },
        ]
      : []),
    ...(c.permissoes.editar && c.permissoes.excluir ? [{ separator: true as const }] : []),
    ...(c.permissoes.excluir
      ? [
          {
            icon: Trash2,
            label: 'Excluir contato',
            danger: true,
            onSelect: () => {
              setErroDaExclusao(undefined)
              setConfirmandoExclusao(true)
            },
          },
        ]
      : []),
  ]

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-border bg-surface px-6 pt-4 pb-4 max-md:px-4">
        {celular ? null : (
          <nav
            aria-label="Você está em"
            className="flex items-center gap-1.5 text-[13px] text-ink-muted"
          >
            <Link to="/contatos" className="text-ink-muted">
              Contatos
            </Link>
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-ink">{c.nome}</span>
          </nav>
        )}
        <div className="flex flex-wrap items-start gap-3.5">
          <Avatar name={c.nome} size="lg" />
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[22px] leading-7 font-semibold tracking-[-0.01em]">
                {c.nome}
              </h1>
              {c.papelDecisao ? <Badge tone="outline">{c.papelDecisao.nome}</Badge> : null}
              {naoQuerContato(c) ? (
                <Badge tone="warning" icon={Ban}>
                  Não quer contato
                </Badge>
              ) : null}
            </div>
            <span className="text-sm text-ink-muted">{linhaDaEmpresa}</span>
          </div>
          <div className="flex items-center gap-2">
            {celular ? null : (
              <>
                <LinkDeIcone
                  href={ligar}
                  label="Ligar"
                  icone={Phone}
                  semDestino="o contato não tem telefone"
                />
                <LinkDeIcone
                  href={whatsapp}
                  label="WhatsApp"
                  icone={MessageCircle}
                  semDestino="o contato não tem telefone"
                />
                <LinkDeIcone
                  href={escrever}
                  label="E-mail"
                  icone={Mail}
                  semDestino="o contato não tem e-mail"
                />
                {c.permissoes.editar ? (
                  <Button icon={Pencil} onClick={() => void navegar(rotaDeEdicaoDoContato(c.id))}>
                    Editar
                  </Button>
                ) : null}
              </>
            )}
            {itensDoMenu.length > 0 ? (
              <Menu
                align="end"
                items={itensDoMenu}
                trigger={<IconButton icon={Ellipsis} label="Mais ações" variant="secondary" />}
              />
            ) : null}
          </div>
        </div>
        {celular ? (
          <div className="grid grid-cols-3 gap-2" data-density="touch">
            {[
              { rotulo: 'Ligar', href: ligar, icone: Phone, cor: 'text-tag-blue-fg' },
              {
                rotulo: 'WhatsApp',
                href: whatsapp,
                icone: MessageCircle,
                cor: 'text-tag-green-fg',
              },
              { rotulo: 'E-mail', href: escrever, icone: Mail, cor: 'text-tag-orange-fg' },
            ].map((q) => {
              const classes =
                'flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface text-[13px] font-semibold text-ink'
              const Icone = q.icone
              const conteudo = (
                <>
                  <span className={cn('flex', q.cor)}>
                    <Icone size={20} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  {q.rotulo}
                </>
              )
              return q.href ? (
                <a key={q.rotulo} href={q.href} className={classes}>
                  {conteudo}
                </a>
              ) : (
                <span
                  key={q.rotulo}
                  role="link"
                  aria-disabled="true"
                  className={cn(classes, 'cursor-not-allowed opacity-45')}
                >
                  {conteudo}
                </span>
              )
            })}
          </div>
        ) : null}
      </header>

      <Tabs
        label="Seções do contato"
        items={ABAS}
        value={aba}
        onChange={setAba}
        className="flex flex-col [&>[role=tablist]]:bg-surface [&>[role=tablist]]:px-6 max-md:[&>[role=tablist]]:px-4"
      >
        <main className="w-full p-6 max-md:p-4">
          <ConteudoDaAba
            value="resumo"
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4 max-lg:grid-cols-1"
          >
            <div className="flex min-w-0 flex-col gap-4">
              <EmpresasVinculadas contato={c} vendedor={vendedor} />
              <DadosDaPessoa contato={c} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <ConsentimentoDoContato
                contato={c}
                salvando={salvandoConsentimento}
                aoMudar={(naoQuer) => void mudarConsentimento(naoQuer)}
              />
            </div>
          </ConteudoDaAba>
          <ConteudoDaAba value="atividades">
            <AtividadesDaFicha
              filtro={{ contatoId: c.id }}
              inicio={{
                contatoId: c.id,
                ...(principal ? { empresa: principal.empresa } : {}),
              }}
              podeRegistrar={c.permissoes.editar && principal !== undefined}
              mostrarEmpresa
            />
          </ConteudoDaAba>
          <ConteudoDaAba value="historico">
            <HistoricoAba
              chave={['contatos', 'historico', c.id]}
              buscar={(pagina) => servicos.contatos.historico(c.id, pagina)}
              rotulo="Histórico do contato"
              descricaoVazia="As alterações do contato vão aparecendo aqui."
            />
          </ConteudoDaAba>
        </main>
      </Tabs>

      <DialogoDeConfirmacao
        aberto={confirmandoExclusao}
        titulo="Excluir este contato?"
        descricao={`${c.nome} sai da carteira e deixa de aparecer nas listas. Por enquanto não há lixeira para recuperá-lo. Se a pessoa só saiu da empresa, inative o vínculo em vez de excluir.`}
        rotuloDoBotao="Excluir contato"
        erro={erroDaExclusao}
        enviando={excluindo}
        aoConfirmar={() => void excluir()}
        aoFechar={() => setConfirmandoExclusao(false)}
      />
    </div>
  )
}
