import type { SessaoDoPortal } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert } from '@leadtogo/ui/feedback'
import { Tabs, ConteudoDaAba } from '@leadtogo/ui/tabs'
import { toast } from '@leadtogo/ui/toast'

import { CHAVE_DA_SESSAO } from '@/app/guardas'
import { useSessaoAtual } from '@/app/sessao'
import { dataEHora } from '@/casca/rotulos'
import { useServicos } from '@/servicos/contexto'
import { AtivarSegundoFator } from '../acesso/verificacao'

function useAtualizarSessao() {
  const queryClient = useQueryClient()
  return (alteracao: Partial<SessaoDoPortal>) =>
    queryClient.setQueryData<SessaoDoPortal>(CHAVE_DA_SESSAO, (atual) =>
      atual ? { ...atual, ...alteracao } : atual,
    )
}

function MeuPerfil({ sessao }: { sessao: SessaoDoPortal }) {
  const servicos = useServicos()
  const atualizar = useAtualizarSessao()
  const [nome, setNome] = useState(sessao.contato.nome)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [trocando, setTrocando] = useState(false)
  const [novoEmail, setNovoEmail] = useState('')
  const [pedindo, setPedindo] = useState(false)
  const [erroEmail, setErroEmail] = useState<string | null>(null)

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const r = await servicos.sessao.corrigirNome(nome.trim())
    setSalvando(false)
    if (!r.ok) setErro(r.erro.mensagem)
    else {
      atualizar({ contato: r.dados.contato })
      toast.success('Nome atualizado')
    }
  }
  const pedirTroca = async () => {
    setPedindo(true)
    setErroEmail(null)
    const r = await servicos.sessao.trocarEmail(novoEmail.trim())
    setPedindo(false)
    if (!r.ok) {
      setErroEmail(r.erro.mensagem)
      return
    }
    setTrocando(false)
    setNovoEmail('')
    toast.success('Enviamos um link para o novo e-mail. O acesso só muda quando você o confirmar.')
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => void salvar(e)}
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4"
        noValidate
      >
        {erro ? <Alert tone="danger" title={erro} /> : null}
        <TextField
          label="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
        />
        <TextField
          label="E-mail de acesso"
          value={sessao.contato.email}
          readOnly
          suffix={
            <Button size="sm" variant="ghost" onClick={() => setTrocando(true)}>
              Alterar
            </Button>
          }
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            loading={salvando}
            disabled={nome.trim().length < 2 || nome.trim() === sessao.contato.nome}
          >
            Salvar
          </Button>
        </div>
      </form>
      <Dialog
        open={trocando}
        onOpenChange={setTrocando}
        title="Alterar o e-mail de acesso"
        description="Enviamos um link de confirmação para o novo endereço. O e-mail atual continua valendo até você confirmar."
        footer={
          <>
            <Button onClick={() => setTrocando(false)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={pedindo}
              disabled={!novoEmail.includes('@')}
              onClick={() => void pedirTroca()}
            >
              Enviar link
            </Button>
          </>
        }
      >
        {erroEmail ? <Alert tone="danger" title={erroEmail} /> : null}
        <TextField
          label="Novo e-mail"
          type="email"
          autoComplete="email"
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
        />
      </Dialog>
    </div>
  )
}

function MinhaEmpresa({ sessao }: { sessao: SessaoDoPortal }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const responsavel = sessao.papel === 'responsavel'
  const pedidos = useQuery({
    queryKey: ['pedidos'],
    enabled: responsavel,
    queryFn: async () => {
      const r = await servicos.pedidos.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const [abrindo, setAbrindo] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cargo, setCargo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const pedir = async () => {
    setEnviando(true)
    setErro(null)
    const r = await servicos.pedidos.pedir({
      nome: nome.trim(),
      email: email.trim(),
      cargo: cargo.trim() || null,
    })
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setAbrindo(false)
    setNome('')
    setEmail('')
    setCargo('')
    toast.success('Pedido enviado. A equipe vai liberar o acesso e avisar a pessoa por e-mail.')
    void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
  }
  const SITUACAO = {
    pendente: 'Aguardando a equipe',
    aprovado: 'Aprovado',
    recusado: 'Recusado',
  } as const
  const TOM = { pendente: 'warning', aprovado: 'success', recusado: 'danger' } as const

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-surface p-4">
        <p className="m-0 text-xs leading-4 text-ink-muted">Sua empresa</p>
        <p className="m-0 text-lg leading-6 font-semibold">{sessao.empresaCliente.nome}</p>
        <p className="mt-1 mb-0 text-sm text-ink-muted">
          Você é {responsavel ? 'o responsável' : 'colega'} nesta empresa.
        </p>
      </section>
      {responsavel ? (
        <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="m-0 text-[15px] leading-5 font-semibold">Acesso para colegas</h2>
          <p className="m-0 text-sm leading-5 text-ink-muted">
            Você pode pedir à equipe que libere o portal para colegas. Cada pessoa tem o próprio
            acesso.
          </p>
          <div>
            <Button icon={Plus} onClick={() => setAbrindo(true)}>
              Pedir acesso para colega
            </Button>
          </div>
          {pedidos.data && pedidos.data.length > 0 ? (
            <ul
              aria-label="Pedidos de acesso"
              className="m-0 flex list-none flex-col divide-y divide-border p-0"
            >
              {pedidos.data.map((p) => (
                <li key={p.id} className="flex flex-col gap-0.5 py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {p.nome}
                    <Badge tone={TOM[p.situacao]}>{SITUACAO[p.situacao]}</Badge>
                  </span>
                  <span className="text-xs text-ink-muted">
                    {p.email}
                    {p.cargo ? ` · ${p.cargo}` : ''} · {dataEHora(p.criadoEm)}
                  </span>
                  {p.situacao === 'recusado' && p.motivo ? (
                    <span className="text-xs text-danger">Motivo: {p.motivo}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <Dialog
        open={abrindo}
        onOpenChange={setAbrindo}
        title="Pedir acesso para um colega"
        description="A equipe confere o pedido e libera o acesso. A pessoa recebe um convite por e-mail."
        footer={
          <>
            <Button onClick={() => setAbrindo(false)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={enviando}
              disabled={nome.trim().length < 2 || !email.includes('@')}
              onClick={() => void pedir()}
            >
              Enviar pedido
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {erro ? <Alert tone="danger" title={erro} /> : null}
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <TextField
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Cargo (opcional)"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
          />
        </div>
      </Dialog>
    </div>
  )
}

function Seguranca({ sessao }: { sessao: SessaoDoPortal }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const atualizar = useAtualizarSessao()
  const sessoes = useQuery({
    queryKey: ['sessoes'],
    queryFn: async () => {
      const r = await servicos.sessao.sessoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const [ligando, setLigando] = useState(false)
  const [desligando, setDesligando] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const desligar = async () => {
    setOcupado(true)
    setErro(null)
    const r = await servicos.segundoFator.desativar(codigo.trim())
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setDesligando(false)
    setCodigo('')
    atualizar({ segundoFatorAtivo: false, segundoFatorExigido: false })
    toast.success('Verificação em duas etapas desligada')
  }
  const encerrar = async (id: string) => {
    const r = await servicos.sessao.encerrar(id)
    if (!r.ok) toast.error(r.erro.mensagem)
    void queryClient.invalidateQueries({ queryKey: ['sessoes'] })
  }
  const encerrarOutras = async () => {
    const r = await servicos.sessao.encerrarOutras()
    if (!r.ok) toast.error(r.erro.mensagem)
    else toast.success('Você saiu dos outros dispositivos')
    void queryClient.invalidateQueries({ queryKey: ['sessoes'] })
  }
  const sair = async () => {
    await servicos.sessao.sair()
    queryClient.clear()
    await navegar({ to: '/entrar' })
  }

  const outras = (sessoes.data ?? []).filter((s) => !s.atual)
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <h2 className="m-0 flex items-center gap-2 text-[15px] leading-5 font-semibold">
          Verificação em duas etapas
          <Badge tone={sessao.segundoFatorAtivo ? 'success' : 'neutral'}>
            {sessao.segundoFatorAtivo ? 'Ligada' : 'Desligada'}
          </Badge>
        </h2>
        <p className="m-0 text-sm leading-5 text-ink-muted">
          Além do link do e-mail, a entrada pede um código do aplicativo autenticador. Protege a sua
          conta se alguém acessar o seu e-mail.
        </p>
        <div>
          {sessao.segundoFatorAtivo ? (
            <Button
              onClick={() => setDesligando(true)}
              disabled={sessao.segundoFatorExigido && sessao.papel === 'responsavel'}
            >
              Desligar
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setLigando(true)}>
              Ligar
            </Button>
          )}
          {sessao.segundoFatorExigido && sessao.papel === 'responsavel' ? (
            <span className="ml-2 text-xs text-ink-muted">
              A sua empresa exige a verificação do Responsável.
            </span>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <h2 className="m-0 text-[15px] leading-5 font-semibold">Dispositivos com acesso</h2>
        <ul
          aria-label="Sessões abertas"
          className="m-0 flex list-none flex-col divide-y divide-border p-0"
        >
          {(sessoes.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm leading-5 font-medium">
                  {s.agente ?? 'Dispositivo desconhecido'}{' '}
                  {s.atual ? <Badge tone="accent">Este dispositivo</Badge> : null}
                </p>
                <p className="m-0 text-xs leading-4 text-ink-muted">
                  {s.ip ? `${s.ip} · ` : ''}último uso {dataEHora(s.ultimoUsoEm)}
                </p>
              </div>
              {s.atual ? null : (
                <Button size="sm" onClick={() => void encerrar(s.id)}>
                  Encerrar
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {outras.length > 0 ? (
            <Button onClick={() => void encerrarOutras()}>Sair dos outros dispositivos</Button>
          ) : null}
          <Button icon={LogOut} onClick={() => void sair()}>
            Sair deste dispositivo
          </Button>
        </div>
      </section>

      <Dialog open={ligando} onOpenChange={setLigando} title="Ligar a verificação em duas etapas">
        {ligando ? (
          <AtivarSegundoFator
            aoConcluir={() => {
              setLigando(false)
              atualizar({ segundoFatorAtivo: true })
            }}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={desligando}
        onOpenChange={setDesligando}
        title="Desligar a verificação em duas etapas"
        description="Digite um código do aplicativo (ou um código de recuperação) para confirmar."
        footer={
          <>
            <Button onClick={() => setDesligando(false)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={ocupado}
              disabled={codigo.trim().length < 6}
              onClick={() => void desligar()}
            >
              Desligar
            </Button>
          </>
        }
      >
        {erro ? <Alert tone="danger" title={erro} /> : null}
        <TextField
          label="Código"
          mono
          autoComplete="one-time-code"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
      </Dialog>
    </div>
  )
}

/** Perfil e empresa: o próprio cadastro, a empresa (e os pedidos de acesso para colegas) e a segurança. */
export function TelaPerfil({ inicial }: { inicial: SessaoDoPortal }) {
  const sessao = useSessaoAtual(inicial)
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="m-0 text-2xl leading-8 font-semibold">{sessao.contato.nome}</h1>
        <p className="m-0 text-sm text-ink-muted">
          {sessao.empresaCliente.nome} · {sessao.papel === 'responsavel' ? 'Responsável' : 'Colega'}
        </p>
      </header>
      <Tabs
        label="Perfil e empresa"
        defaultValue="perfil"
        items={[
          { value: 'perfil', label: 'Meu perfil' },
          { value: 'empresa', label: 'Minha empresa' },
          { value: 'seguranca', label: 'Segurança' },
        ]}
      >
        <ConteudoDaAba value="perfil" className="pt-4">
          <MeuPerfil sessao={sessao} />
        </ConteudoDaAba>
        <ConteudoDaAba value="empresa" className="pt-4">
          <MinhaEmpresa sessao={sessao} />
        </ConteudoDaAba>
        <ConteudoDaAba value="seguranca" className="pt-4">
          <Seguranca sessao={sessao} />
        </ConteudoDaAba>
      </Tabs>
    </div>
  )
}
