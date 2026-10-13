import type { ContatoDaEmpresa } from '@leadtogo/api-client'
import { linkDeLigacao, linkDoWhatsapp } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Link2, Mail, MessageCircle, Phone, Plus, Search, Star, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { Janela } from '@/telas/cadastros/base'
import { telefoneParaTela } from '@/telas/contatos/formatos'

import { useContatosDaEmpresa } from './contatos-da-empresa'

function AcaoRapida({
  href,
  rotulo,
  icone: Icone,
  cor,
}: {
  href: string | null
  rotulo: string
  icone: typeof Phone
  cor: string
}) {
  const classes =
    'inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface'
  return href ? (
    <a
      href={href}
      aria-label={rotulo}
      title={rotulo}
      className={cn(classes, cor, 'hover:bg-surface-hover')}
    >
      <Icone size={15} strokeWidth={1.75} aria-hidden="true" />
    </a>
  ) : (
    <span
      role="link"
      aria-disabled="true"
      aria-label={rotulo}
      title={`${rotulo}: o contato não tem`}
      className={cn(classes, 'cursor-not-allowed text-ink-muted opacity-45')}
    >
      <Icone size={15} strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
}

function CartaoDoContato({ c }: { c: ContatoDaEmpresa }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface p-3.5',
        !c.ativo && 'bg-surface-sunken',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={c.nome} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            to="/contatos/$contatoId"
            params={{ contatoId: c.id }}
            className={cn('font-semibold', !c.ativo && 'text-ink-muted')}
          >
            {c.nome}
          </Link>
          <span className="text-[13px] text-ink-muted">{c.cargo ?? 'Sem cargo informado'}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {c.principal ? <Badge icon={Star}>Principal</Badge> : null}
            {c.papelDecisao ? <Badge tone="outline">{c.papelDecisao.nome}</Badge> : null}
            {c.ativo ? null : <Badge>Inativo</Badge>}
            {c.naoQuerContato ? <Badge tone="warning">Não quer contato</Badge> : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="tabular-nums">{c.telefone ? telefoneParaTela(c.telefone) : '—'}</span>
        <span className="[overflow-wrap:anywhere]">{c.email ?? '—'}</span>
      </div>
      <div className="flex items-center gap-2">
        <AcaoRapida
          href={c.telefone ? linkDeLigacao(c.telefone) : null}
          rotulo={`Ligar para ${c.nome}`}
          icone={Phone}
          cor="text-tag-blue-fg"
        />
        <AcaoRapida
          href={c.telefone ? linkDoWhatsapp(c.telefone) : null}
          rotulo={`WhatsApp de ${c.nome}`}
          icone={MessageCircle}
          cor="text-tag-green-fg"
        />
        <AcaoRapida
          href={c.email ? `mailto:${c.email}` : null}
          rotulo={`E-mail de ${c.nome}`}
          icone={Mail}
          cor="text-tag-orange-fg"
        />
      </div>
    </li>
  )
}

/** "Vincular contato": acha um contato que já existe e liga à empresa, com o cargo dela. */
function DialogoDeVincularContato({
  empresaId,
  nomeDaEmpresa,
  jaVinculados,
  aoFechar,
}: {
  empresaId: string
  nomeDaEmpresa: string
  jaVinculados: ReadonlySet<string>
  aoFechar: () => void
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState('')
  const [termo, setTermo] = useState('')
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null)
  const [cargo, setCargo] = useState('')
  const [principal, setPrincipal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), 300)
    return () => clearTimeout(espera)
  }, [texto])
  const achados = useQuery({
    queryKey: ['contatos', 'busca-de-contato', termo],
    enabled: termo.length >= 2 && !escolhido,
    retry: false,
    queryFn: async () => {
      const r = await servicos.contatos.listar({ busca: termo, porPagina: 8 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const opcoes = (achados.data ?? []).filter((c) => !jaVinculados.has(c.id))

  const vincular = async () => {
    if (!escolhido) return
    setSalvando(true)
    setErro(undefined)
    const r = await servicos.contatos.vincular(escolhido.id, {
      empresaId,
      ...(cargo.trim() ? { cargo: cargo.trim() } : {}),
      ...(principal ? { principal: true } : {}),
    })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Contato vinculado', {
      description: `${escolhido.nome} agora também é de ${nomeDaEmpresa}.`,
    })
    await queryClient.invalidateQueries({ queryKey: ['contatos'] })
    aoFechar()
  }

  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title="Vincular contato"
      description={`Liga uma pessoa que já está no cadastro a ${nomeDaEmpresa}.`}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={salvando}
            disabled={!escolhido}
            onClick={() => void vincular()}
          >
            Vincular
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {escolhido ? (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border-strong bg-surface-sunken px-3 py-2">
              <span className="text-[13px] font-semibold">Contato</span>
              <span className="flex-1 text-sm">{escolhido.nome}</span>
              <Button size="sm" variant="ghost" onClick={() => setEscolhido(null)}>
                Trocar
              </Button>
            </div>
            <TextField
              label="Cargo nesta empresa"
              placeholder="Ex.: Compradora"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
            <Checkbox
              label="Contato principal desta empresa"
              description="Só um por empresa: marcar este tira o selo do anterior."
              checked={principal}
              onChange={(e) => setPrincipal(e.target.checked)}
            />
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <TextField
              label="Contato"
              icon={Search}
              placeholder="Nome, telefone ou e-mail"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {achados.isError ? (
              <span className="text-sm text-danger">{achados.error.message}</span>
            ) : null}
            {achados.data && opcoes.length === 0 ? (
              <span className="text-sm text-ink-muted">
                Nenhum contato disponível com esse nome. Se ele ainda não existe, use "Novo
                contato".
              </span>
            ) : null}
            {opcoes.length > 0 ? (
              <ul
                aria-label="Contatos encontrados"
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {opcoes.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setEscolhido({ id: c.id, nome: c.nome })}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-left hover:bg-surface-hover"
                    >
                      <Avatar name={c.nome} size="sm" />
                      <span className="flex flex-1 flex-col">
                        <span className="text-sm font-semibold">{c.nome}</span>
                        <span className="text-xs text-ink-muted">
                          {c.empresas.find((v) => v.ativo)?.nome ?? 'Sem empresa'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        {erro ? (
          <Alert tone="danger" title="Não foi possível vincular">
            {erro}
          </Alert>
        ) : null}
      </div>
    </Janela>
  )
}

/** Aba Contatos da ficha da empresa: cartões dos vínculos, com "Novo contato" e "Vincular contato". */
export function ContatosDaEmpresaAba({
  empresaId,
  nomeDaEmpresa,
  podeEditar,
}: {
  empresaId: string
  nomeDaEmpresa: string
  podeEditar: boolean
}) {
  const navegar = useNavigate()
  const consulta = useContatosDaEmpresa(empresaId)
  const [vinculando, setVinculando] = useState(false)
  const novo = () => void navegar({ to: '/contatos/novo', search: { empresa: empresaId } })
  const acoes = podeEditar ? (
    <>
      <Button icon={Link2} onClick={() => setVinculando(true)}>
        Vincular contato
      </Button>
      <Button variant="primary" icon={Plus} onClick={novo}>
        Novo contato
      </Button>
    </>
  ) : null

  if (consulta.isPending) {
    return (
      <div
        role="status"
        aria-label="Carregando os contatos"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <Skeleton lines={4} />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <Alert
        tone="danger"
        title="Não foi possível carregar os contatos"
        actions={
          <Button size="sm" onClick={() => void consulta.refetch()}>
            Tentar de novo
          </Button>
        }
      >
        {consulta.error.message}
      </Alert>
    )
  }
  const lista = consulta.data
  const ativos = lista.filter((c) => c.ativo).length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[13px] text-ink-muted" aria-live="polite">
          {lista.length === 0
            ? ''
            : `${ativos} ${ativos === 1 ? 'contato ativo' : 'contatos ativos'}${
                lista.length > ativos
                  ? ` e ${lista.length - ativos} inativo${lista.length - ativos === 1 ? '' : 's'}`
                  : ''
              }`}
        </span>
        {acoes}
      </div>
      {lista.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={UserRound}
            title="Nenhum contato nesta empresa"
            description="Cadastre as pessoas com quem você fala: cargo, telefone e e-mail ficam à mão."
          />
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-0">
          {lista.map((c) => (
            <CartaoDoContato key={c.id} c={c} />
          ))}
        </ul>
      )}
      {vinculando ? (
        <DialogoDeVincularContato
          empresaId={empresaId}
          nomeDaEmpresa={nomeDaEmpresa}
          jaVinculados={new Set(lista.filter((c) => c.ativo).map((c) => c.id))}
          aoFechar={() => setVinculando(false)}
        />
      ) : null}
    </div>
  )
}
