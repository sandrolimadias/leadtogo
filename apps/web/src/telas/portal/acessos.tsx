import type { AcessoDoPortal, PedidoDeAcesso } from '@leadtogo/api-client'
import {
  PAPEIS_DO_PORTAL,
  ROTULO_DA_SITUACAO_DO_ACESSO,
  ROTULO_DO_PAPEL_DO_PORTAL,
  type PapelDoPortal,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

import { dataCurta } from '../chamados/rotulos'

const TOM_DA_SITUACAO = {
  convidado: 'info',
  ativo: 'success',
  suspenso: 'warning',
  revogado: 'neutral',
} as const

/** Dar acesso ao portal: escolhe a empresa-cliente, o contato dela, o papel e, se preciso, o e-mail. */
function DarAcesso({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [empresa, setEmpresa] = useState<{ id: string; nome: string } | null>(null)
  const [contatoId, setContatoId] = useState('')
  const [papel, setPapel] = useState<PapelDoPortal>('colega')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const termo = useDeferredValue(busca.trim())

  const empresas = useQuery({
    queryKey: ['portal', 'empresas', termo],
    enabled: aberto && !empresa && termo.length >= 2,
    queryFn: async () => {
      const r = await servicos.carteira.listar({ busca: termo, porPagina: 8 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const contatos = useQuery({
    queryKey: ['portal', 'contatos', empresa?.id],
    enabled: aberto && empresa !== null,
    queryFn: async () => {
      const r = await servicos.contatos.daEmpresa(empresa?.id ?? '')
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.filter((c) => c.ativo)
    },
  })
  const fechar = () => {
    setBusca('')
    setEmpresa(null)
    setContatoId('')
    setPapel('colega')
    setEmail('')
    setErro(null)
    aoFechar()
  }
  const dar = async () => {
    if (!empresa) return
    setEnviando(true)
    setErro(null)
    const r = await servicos.portal.acessos.dar({
      contatoId,
      empresaClienteId: empresa.id,
      papel,
      ...(email.trim() ? { email: email.trim() } : {}),
    })
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Convite enviado')
    void queryClient.invalidateQueries({ queryKey: ['portal'] })
    fechar()
  }
  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => (a ? undefined : fechar())}
      title="Dar acesso ao portal"
      description="O contato recebe um convite por e-mail (vale 7 dias) e entra sem senha."
      footer={
        <>
          <Button onClick={fechar}>Cancelar</Button>
          <Button
            variant="primary"
            loading={enviando}
            disabled={!empresa || !contatoId}
            onClick={() => void dar()}
          >
            Enviar convite
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
        {empresa ? (
          <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-sunken px-3 py-2 text-sm">
            <span className="font-medium">{empresa.nome}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEmpresa(null)
                setContatoId('')
              }}
            >
              Trocar
            </Button>
          </div>
        ) : (
          <>
            <TextField
              label="Empresa-cliente"
              icon={Search}
              placeholder="Nome, razão social ou CNPJ"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {empresas.data && empresas.data.length > 0 ? (
              <ul
                aria-label="Empresas encontradas"
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {empresas.data.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded-sm border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-hover"
                      onClick={() => setEmpresa({ id: e.id, nome: e.nome })}
                    >
                      {e.nome}
                    </button>
                  </li>
                ))}
              </ul>
            ) : empresas.data ? (
              <p className="m-0 text-[13px] text-ink-muted">Nenhuma empresa encontrada.</p>
            ) : null}
          </>
        )}
        {empresa ? (
          <>
            <Select
              label="Contato"
              value={contatoId}
              placeholder={contatos.isPending ? 'Carregando…' : 'Escolha o contato'}
              options={(contatos.data ?? []).map((c) => ({
                value: c.id,
                label: `${c.nome}${c.cargo ? ` · ${c.cargo}` : ''}`,
              }))}
              onChange={(e) => setContatoId(e.target.value)}
            />
            <Select
              label="Papel no portal"
              value={papel}
              options={PAPEIS_DO_PORTAL.map((p) => ({
                value: p,
                label: ROTULO_DO_PAPEL_DO_PORTAL[p],
              }))}
              onChange={(e) => setPapel(e.target.value as PapelDoPortal)}
              hint="O Responsável pode pedir acesso para colegas; o Colega só usa."
            />
            <TextField
              label="E-mail de acesso (opcional)"
              type="email"
              hint="Em branco, usa o e-mail principal do contato."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        ) : null}
      </div>
    </Dialog>
  )
}

/** Pedidos de acesso que o Responsável fez para colegas: aprovar (cria contato e convite) ou recusar com motivo. */
function Pedidos() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { pode } = usePermissoes()
  const [recusando, setRecusando] = useState<PedidoDeAcesso | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const consulta = useQuery({
    queryKey: ['portal', 'pedidos'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.pedidos.listar('pendente')
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const tratar = async (p: PedidoDeAcesso, decisao: 'aprovar' | 'recusar') => {
    setOcupado(p.id)
    setErro(null)
    const r = await servicos.portal.pedidos.tratar(p.id, {
      decisao,
      ...(decisao === 'recusar' && motivo.trim() ? { motivo: motivo.trim() } : {}),
    })
    setOcupado(null)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(decisao === 'aprovar' ? 'Pedido aprovado: convite enviado' : 'Pedido recusado')
    setRecusando(null)
    setMotivo('')
    void queryClient.invalidateQueries({ queryKey: ['portal'] })
  }
  const itens = consulta.data ?? []
  if (itens.length === 0) return null
  return (
    <section
      aria-label="Pedidos de acesso"
      className="flex flex-col gap-2 rounded-md border border-warning bg-warning-soft p-3"
    >
      <h2 className="m-0 text-sm font-semibold">
        {itens.length} pedido{itens.length > 1 ? 's' : ''} de acesso para colegas
      </h2>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {itens.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-sm bg-surface px-3 py-2"
          >
            <div className="min-w-0 flex-1 basis-56">
              <p className="m-0 text-sm font-semibold">
                {p.nome}
                {p.cargo ? <span className="font-normal text-ink-muted"> · {p.cargo}</span> : null}
              </p>
              <p className="m-0 text-xs text-ink-muted">
                {p.email} · {p.empresaCliente.nome} · pedido por {p.pedidoPor.nome} em{' '}
                {dataCurta(p.criadoEm)}
              </p>
            </div>
            {pode('portal.acessos') ? (
              <>
                <Button size="sm" onClick={() => setRecusando(p)}>
                  Recusar
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={ocupado === p.id}
                  onClick={() => void tratar(p, 'aprovar')}
                >
                  Aprovar
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <Dialog
        open={recusando !== null}
        onOpenChange={(a) => (a ? undefined : setRecusando(null))}
        title="Recusar o pedido"
        description="O Responsável vê o motivo no portal."
        footer={
          <>
            <Button onClick={() => setRecusando(null)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={ocupado !== null}
              onClick={() => recusando && void tratar(recusando, 'recusar')}
            >
              Recusar pedido
            </Button>
          </>
        }
      >
        <TextArea
          label="Motivo (opcional)"
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Dialog>
    </section>
  )
}

/** Aba Acessos do hub: quem entra no portal, de qual empresa-cliente e com que papel. */
export function AcessosDoPortal() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { pode } = usePermissoes()
  const [busca, setBusca] = useState('')
  const [dando, setDando] = useState(false)
  const [revogando, setRevogando] = useState<AcessoDoPortal | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const termo = useDeferredValue(busca.trim())
  const lista = useQuery({
    queryKey: ['portal', 'acessos', termo],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.acessos.listar(termo ? { busca: termo } : {})
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const podeGerir = pode('portal.acessos')
  const rodar = async (
    id: string,
    chamada: () => Promise<{ ok: boolean; erro?: { mensagem: string } }>,
    sucesso: string,
  ) => {
    setOcupado(id)
    setErro(null)
    const r = await chamada()
    setOcupado(null)
    if (!r.ok) {
      setErro(r.erro?.mensagem ?? 'Não foi possível concluir.')
      return
    }
    toast.success(sucesso)
    void queryClient.invalidateQueries({ queryKey: ['portal'] })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Buscar"
          icon={Search}
          className="min-w-64 flex-1"
          placeholder="Nome ou e-mail"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {podeGerir ? (
          <Button variant="primary" icon={Plus} onClick={() => setDando(true)}>
            Dar acesso
          </Button>
        ) : null}
      </div>
      <Pedidos />
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      {lista.isError ? (
        <Alert tone="danger">Não consegui carregar os acessos. {lista.error.message}</Alert>
      ) : null}
      <div className="rounded-md border border-border bg-surface">
        {!lista.data ? (
          <div className="p-4">
            <Skeleton lines={4} />
          </div>
        ) : lista.data.itens.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum acesso ao portal"
            description="Dê acesso a um contato de uma empresa-cliente para ele abrir chamados pelo portal."
          />
        ) : (
          <ul aria-label="Acessos ao portal" className="m-0 list-none p-0">
            {lista.data.itens.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="m-0 text-sm font-semibold">{a.contato.nome}</p>
                  <p className="m-0 truncate text-xs text-ink-muted">
                    {a.email} · {a.empresaCliente.nome}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="outline">{ROTULO_DO_PAPEL_DO_PORTAL[a.papel]}</Badge>
                  <Badge tone={TOM_DA_SITUACAO[a.situacao]}>
                    {a.conviteVencido
                      ? 'Convite vencido'
                      : ROTULO_DA_SITUACAO_DO_ACESSO[a.situacao]}
                  </Badge>
                </span>
                <span className="min-w-[120px] text-xs text-ink-muted">
                  {a.ultimoAcessoEm
                    ? `Último acesso ${dataCurta(a.ultimoAcessoEm)}`
                    : 'Nunca entrou'}
                </span>
                {podeGerir ? (
                  <span className="flex flex-wrap gap-1.5">
                    {a.situacao === 'convidado' ? (
                      <Button
                        size="sm"
                        loading={ocupado === a.id}
                        onClick={() =>
                          void rodar(
                            a.id,
                            () => servicos.portal.acessos.reenviar(a.id),
                            'Convite reenviado',
                          )
                        }
                      >
                        Reenviar convite
                      </Button>
                    ) : null}
                    {a.situacao === 'ativo' ? (
                      <Button
                        size="sm"
                        loading={ocupado === a.id}
                        onClick={() =>
                          void rodar(
                            a.id,
                            () => servicos.portal.acessos.alterar(a.id, { situacao: 'suspenso' }),
                            'Acesso suspenso',
                          )
                        }
                      >
                        Suspender
                      </Button>
                    ) : null}
                    {a.situacao === 'suspenso' ? (
                      <Button
                        size="sm"
                        loading={ocupado === a.id}
                        onClick={() =>
                          void rodar(
                            a.id,
                            () => servicos.portal.acessos.alterar(a.id, { situacao: 'ativo' }),
                            'Acesso reativado',
                          )
                        }
                      >
                        Reativar
                      </Button>
                    ) : null}
                    {a.situacao !== 'convidado' ? (
                      <Button
                        size="sm"
                        loading={ocupado === a.id}
                        onClick={() =>
                          void rodar(
                            a.id,
                            () =>
                              servicos.portal.acessos.alterar(a.id, {
                                papel: a.papel === 'responsavel' ? 'colega' : 'responsavel',
                              }),
                            'Papel alterado',
                          )
                        }
                      >
                        {a.papel === 'responsavel' ? 'Tornar colega' : 'Tornar responsável'}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="danger-ghost" onClick={() => setRevogando(a)}>
                      Revogar
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <DarAcesso aberto={dando} aoFechar={() => setDando(false)} />
      <Dialog
        open={revogando !== null}
        onOpenChange={(a) => (a ? undefined : setRevogando(null))}
        title="Revogar o acesso?"
        description={
          revogando
            ? `${revogando.contato.nome} deixa de entrar no portal e perde as sessões abertas. Para voltar, será preciso um novo convite.`
            : ''
        }
        footer={
          <>
            <Button onClick={() => setRevogando(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => {
                const alvo = revogando
                setRevogando(null)
                if (alvo)
                  void rodar(
                    alvo.id,
                    () => servicos.portal.acessos.revogar(alvo.id),
                    'Acesso revogado',
                  )
              }}
            >
              Revogar acesso
            </Button>
          </>
        }
      />
    </div>
  )
}
