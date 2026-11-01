import type { SessaoDoPortal } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Lock, LogOut, Monitor, Moon, Plus, Sun } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'
import { Tabs, ConteudoDaAba } from '@leadtogo/ui/tabs'
import { toast } from '@leadtogo/ui/toast'

import { CHAVE_DA_SESSAO } from '@/app/guardas'
import { useSessaoAtual } from '@/app/sessao'
import { dataEHora } from '@/casca/rotulos'
import { guardarTema, type Tema, temaGuardado } from '@/casca/tema'
import { useServicos } from '@/servicos/contexto'
import { AtivarSegundoFator } from '../acesso/verificacao'
import { Preferencias } from './preferencias'

function useAtualizarSessao() {
  const queryClient = useQueryClient()
  return (alteracao: Partial<SessaoDoPortal>) =>
    queryClient.setQueryData<SessaoDoPortal>(CHAVE_DA_SESSAO, (atual) =>
      atual ? { ...atual, ...alteracao } : atual,
    )
}

const ROTULO_DO_TELEFONE = {
  fixo: 'Fixo',
  celular: 'Celular',
  whatsapp: 'WhatsApp',
  outro: 'Telefone',
} as const

/** Um dado só para leitura: rótulo pequeno em cima, valor embaixo. */
function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs leading-4 text-ink-muted">{rotulo}</dt>
      <dd className="m-0 text-sm leading-5 break-words">{children}</dd>
    </div>
  )
}

function Aparencia() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [tema, setTema] = useState<Tema>(temaGuardado)
  const mudar = async (novo: Tema) => {
    setTema(novo)
    guardarTema(novo)
    const r = await servicos.preferencias.salvarTema(novo)
    if (r.ok) queryClient.setQueryData(['preferencias'], r.dados)
  }
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <h2 className="m-0 text-[15px] leading-5 font-semibold">Aparência</h2>
      <p className="m-0 text-sm text-ink-muted">
        &quot;Sistema&quot; segue o modo claro ou escuro do seu aparelho.
      </p>
      <SegmentedControl
        label="Tema"
        value={tema}
        onChange={(v) => void mudar(v as Tema)}
        options={[
          { value: 'claro', label: 'Claro', icon: Sun },
          { value: 'escuro', label: 'Escuro', icon: Moon },
          { value: 'sistema', label: 'Sistema', icon: Monitor },
        ]}
      />
    </section>
  )
}

function MeuPerfil({ sessao }: { sessao: SessaoDoPortal }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const atualizar = useAtualizarSessao()
  const cadastro = useQuery({
    queryKey: ['cadastro', 'perfil'],
    queryFn: async () => {
      const r = await servicos.cadastro.perfil()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [nome, setNome] = useState<string | null>(null)
  const [cargo, setCargo] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const p = cadastro.data
  const nomeAtual = nome ?? p?.nome ?? sessao.contato.nome
  const cargoAtual = cargo ?? p?.cargo ?? ''
  const mudou = p ? nomeAtual.trim() !== p.nome || cargoAtual.trim() !== (p.cargo ?? '') : false

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const r = await servicos.sessao.salvarPerfil({
      nome: nomeAtual.trim(),
      cargo: cargoAtual.trim() || null,
    })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    atualizar({ contato: r.dados.contato })
    setNome(null)
    setCargo(null)
    void queryClient.invalidateQueries({ queryKey: ['cadastro', 'perfil'] })
    toast.success('Perfil atualizado')
  }

  return (
    <div className="flex flex-col gap-4">
      {cadastro.isError ? <Alert tone="danger" title={cadastro.error.message} /> : null}
      <form
        onSubmit={(e) => void salvar(e)}
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4"
        noValidate
      >
        {erro ? <Alert tone="danger" title={erro} /> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Nome"
            value={nomeAtual}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
          />
          <TextField
            label="Cargo"
            value={cargoAtual}
            onChange={(e) => setCargo(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            loading={salvando}
            disabled={!p || nomeAtual.trim().length < 2 || !mudou}
          >
            Salvar
          </Button>
        </div>
      </form>
      <section
        aria-label="Contato"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
      >
        <div className="flex items-start gap-2">
          <Lock size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 text-ink-muted" />
          <p className="m-0 text-sm text-ink-muted">
            E-mail e telefone só a equipe altera. Precisa mudar? Abra um chamado.
          </p>
        </div>
        <dl className="m-0 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Dado rotulo="E-mail de acesso">{sessao.contato.email}</Dado>
          {p?.emails
            .filter((e) => e.email.toLowerCase() !== sessao.contato.email.toLowerCase())
            .map((e) => (
              <Dado key={e.email} rotulo={e.tipo === 'pessoal' ? 'E-mail pessoal' : 'E-mail'}>
                {e.email}
              </Dado>
            ))}
          {p && p.telefones.length === 0 ? <Dado rotulo="Telefone">—</Dado> : null}
          {p?.telefones.map((t) => (
            <Dado key={t.numero} rotulo={ROTULO_DO_TELEFONE[t.tipo]}>
              {t.numero}
            </Dado>
          ))}
          {p?.aniversario ? (
            <Dado rotulo="Aniversário">
              {String(p.aniversario.dia).padStart(2, '0')}/
              {String(p.aniversario.mes).padStart(2, '0')}
            </Dado>
          ) : null}
        </dl>
      </section>
      <Aparencia />
    </div>
  )
}

const documentoFormatado = (tipo: string, doc: string | null): string => {
  if (!doc) return '—'
  if (tipo === 'cnpj' && doc.length === 14)
    return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`
  if (tipo === 'cpf' && doc.length === 11)
    return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`
  return doc
}

/** O cadastro da empresa-cliente, só para leitura (F-6). */
function CadastroDaEmpresa() {
  const servicos = useServicos()
  const empresa = useQuery({
    queryKey: ['cadastro', 'empresa'],
    queryFn: async () => {
      const r = await servicos.cadastro.empresa()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (empresa.isError) return <Alert tone="danger" title={empresa.error.message} />
  const e = empresa.data
  if (!e) return <Skeleton lines={6} />
  const end = e.endereco
  const linhaDoEndereco = [
    [end.logradouro, end.numero].filter(Boolean).join(', '),
    end.complemento,
    end.bairro,
    [end.municipio, end.uf].filter(Boolean).join('/'),
    end.cep ? `CEP ${end.cep.slice(0, 5)}-${end.cep.slice(5)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section
      aria-label="Cadastro da empresa"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
    >
      <div className="flex items-start gap-2">
        <Lock size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 text-ink-muted" />
        <p className="m-0 text-sm text-ink-muted">
          Estes dados são mantidos pela equipe. Encontrou algo errado? Abra um chamado.
        </p>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Dado rotulo="Razão social">{e.razaoSocial}</Dado>
        <Dado rotulo="Nome fantasia">{e.nomeFantasia ?? '—'}</Dado>
        <Dado rotulo={e.tipoDocumento === 'cpf' ? 'CPF' : 'CNPJ'}>
          {documentoFormatado(e.tipoDocumento, e.documento)}
          {e.matrizFilial ? ` (${e.matrizFilial === 'matriz' ? 'matriz' : 'filial'})` : ''}
        </Dado>
        <Dado rotulo="Porte">{e.porte ?? '—'}</Dado>
        <Dado rotulo="Início das atividades">
          {e.dataInicioAtividades ? e.dataInicioAtividades.split('-').reverse().join('/') : '—'}
        </Dado>
        <Dado rotulo="Site">{e.website ?? '—'}</Dado>
        <div className="md:col-span-2">
          <Dado rotulo="Endereço">{linhaDoEndereco || '—'}</Dado>
        </div>
        {e.telefones.length === 0 ? <Dado rotulo="Telefone">—</Dado> : null}
        {e.telefones.map((t) => (
          <Dado key={t.numero} rotulo={ROTULO_DO_TELEFONE[t.tipo]}>
            {t.numero}
          </Dado>
        ))}
        <div className="md:col-span-2">
          <Dado rotulo="Atividade principal (CNAE)">
            {e.cnaePrincipal ? `${e.cnaePrincipal.codigo} · ${e.cnaePrincipal.descricao}` : '—'}
          </Dado>
        </div>
        {e.cnaesSecundarios.length > 0 ? (
          <div className="md:col-span-2">
            <Dado rotulo="Atividades secundárias">
              <ul className="m-0 list-none p-0">
                {e.cnaesSecundarios.map((c) => (
                  <li key={c.codigo}>
                    {c.codigo} · {c.descricao}
                  </li>
                ))}
              </ul>
            </Dado>
          </div>
        ) : null}
        <Dado rotulo="Quem atende sua empresa">{e.responsavel ?? '—'}</Dado>
      </dl>
    </section>
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
      <CadastroDaEmpresa />
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
        quebrar
        label="Perfil e empresa"
        defaultValue="perfil"
        items={[
          { value: 'perfil', label: 'Meu perfil' },
          { value: 'empresa', label: 'Minha empresa' },
          { value: 'notificacoes', label: 'Notificações' },
          { value: 'seguranca', label: 'Segurança' },
        ]}
      >
        <ConteudoDaAba value="perfil" className="pt-4">
          <MeuPerfil sessao={sessao} />
        </ConteudoDaAba>
        <ConteudoDaAba value="empresa" className="pt-4">
          <MinhaEmpresa sessao={sessao} />
        </ConteudoDaAba>
        <ConteudoDaAba value="notificacoes" className="pt-4">
          <Preferencias />
        </ConteudoDaAba>
        <ConteudoDaAba value="seguranca" className="pt-4">
          <Seguranca sessao={sessao} />
        </ConteudoDaAba>
      </Tabs>
    </div>
  )
}
