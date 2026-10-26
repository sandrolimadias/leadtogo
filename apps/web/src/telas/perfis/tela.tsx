import type { PerfilDeAcesso } from '@leadtogo/api-client'
import {
  type Alcance,
  CATALOGO_DE_PERMISSOES,
  type DefinicaoDePermissao,
  PERMISSOES_PROTEGIDAS_DO_ADMIN,
  ROTULO_DO_ALCANCE,
  ROTULO_DO_MODULO,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, KeyRound, Plus, ShieldCheck, Table2, Trash2, Users } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import type { MatrizDePermissoes } from '@/auth/tipos'
import { useDispositivo } from '@/casca/dispositivo'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Checkbox, Switch } from '@leadtogo/ui/checkbox'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Tabs } from '@leadtogo/ui/tabs'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'
import { useEnvio } from '@/telas/acesso/comum'

import { chaveDosPerfis } from './chaves'

/** As permissões do catálogo, agrupadas por módulo, na ordem do catálogo. */
const MODULOS: { modulo: string; rotulo: string; permissoes: DefinicaoDePermissao[] }[] = []
for (const d of CATALOGO_DE_PERMISSOES) {
  let grupo = MODULOS.find((m) => m.modulo === d.modulo)
  if (!grupo) {
    grupo = { modulo: d.modulo, rotulo: ROTULO_DO_MODULO[d.modulo] ?? d.modulo, permissoes: [] }
    MODULOS.push(grupo)
  }
  grupo.permissoes.push(d)
}

const OPCOES_DE_ALCANCE = (Object.keys(ROTULO_DO_ALCANCE) as Alcance[]).map((a) => ({
  value: a,
  label: ROTULO_DO_ALCANCE[a],
}))

const protegida = (perfil: PerfilDeAcesso, chave: string) =>
  perfil.chaveSistema === 'admin' && PERMISSOES_PROTEGIDAS_DO_ADMIN.includes(chave)

const usuarios = (n: number) => (n === 1 ? '1 usuário' : `${n} usuários`)

/**
 * Configurações → Perfis de acesso (`perfis.gerir`): a lista dos perfis da empresa, o editor com a
 * matriz módulos × ações (com o alcance onde se aplica), os usuários de cada perfil, duplicar, criar,
 * excluir e a visão "quem pode o quê". No celular, a lista e o detalhe são telas separadas.
 */
export function TelaDePerfis() {
  const servicos = useServicos()
  const celular = useDispositivo() === 'celular'
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [visao, setVisao] = useState<'perfil' | 'quem-pode'>('perfil')
  const [criando, setCriando] = useState(false)
  const consulta = useQuery({
    queryKey: chaveDosPerfis,
    retry: false,
    queryFn: async () => {
      const r = await servicos.perfis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const cabecalho = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="m-0 text-[17px] leading-6 font-semibold">Perfis de acesso</h2>
        <p className="m-0 text-sm text-ink-muted">
          O que cada pessoa pode fazer nesta empresa: permissões por módulo e ação, com o alcance da
          carteira.
        </p>
      </div>
      <Button
        variant="ghost"
        icon={Table2}
        aria-pressed={visao === 'quem-pode'}
        onClick={() => setVisao(visao === 'quem-pode' ? 'perfil' : 'quem-pode')}
      >
        {visao === 'quem-pode' ? 'Voltar aos perfis' : 'Quem pode o quê'}
      </Button>
      <Button variant="primary" icon={Plus} onClick={() => setCriando(true)}>
        Novo perfil
      </Button>
    </div>
  )

  if (consulta.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Carregando os perfis">
        {cabecalho}
        <Skeleton lines={5} />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Alert
          tone="danger"
          title="Não foi possível carregar os perfis"
          actions={
            <Button size="sm" onClick={() => void consulta.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {consulta.error.message}
        </Alert>
      </div>
    )
  }

  const perfis = consulta.data
  const atual = perfis.find((p) => p.id === selecionado) ?? (celular ? undefined : perfis[0])

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      {visao === 'quem-pode' ? (
        <QuemPodeOQue perfis={perfis} />
      ) : (
        <div className="flex gap-4 max-md:flex-col">
          {!celular || !atual ? (
            <ListaDePerfis
              perfis={perfis}
              atual={atual?.id}
              aoEscolher={(id) => setSelecionado(id)}
            />
          ) : null}
          {atual ? (
            <div className="min-w-0 flex-1">
              {celular ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ArrowLeft}
                  className="mb-2"
                  onClick={() => setSelecionado(null)}
                >
                  Perfis
                </Button>
              ) : null}
              <DetalheDoPerfil
                key={atual.id}
                perfil={atual}
                aoDuplicar={(id) => setSelecionado(id)}
                aoExcluir={() => setSelecionado(null)}
              />
            </div>
          ) : null}
        </div>
      )}
      <DialogoDeNovoPerfil
        aberto={criando}
        aoFechar={() => setCriando(false)}
        aoCriar={(id) => {
          setVisao('perfil')
          setSelecionado(id)
        }}
      />
    </div>
  )
}

function ListaDePerfis({
  perfis,
  atual,
  aoEscolher,
}: {
  perfis: PerfilDeAcesso[]
  atual: string | undefined
  aoEscolher: (id: string) => void
}) {
  return (
    <ul
      aria-label="Perfis"
      className="m-0 flex w-[260px] flex-none list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0 max-md:w-full"
    >
      {perfis.map((p) => (
        <li key={p.id} className="border-b border-border last:border-b-0">
          <button
            type="button"
            aria-current={p.id === atual ? 'true' : undefined}
            onClick={() => aoEscolher(p.id)}
            className={cn(
              'flex w-full cursor-pointer flex-col items-start gap-1 border-0 bg-transparent px-4 py-3 text-left text-ink hover:bg-surface-hover',
              p.id === atual && 'bg-surface-selected',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <span className={cn('min-w-0 flex-1 font-semibold', !p.ativo && 'text-ink-muted')}>
                {p.nome}
              </span>
              <Badge tone={p.sistema ? 'info' : 'outline'}>
                {p.sistema ? 'Sistema' : 'Da empresa'}
              </Badge>
            </span>
            <span className="text-xs text-ink-muted">
              {usuarios(p.membros)}
              {p.ativo ? '' : ' · inativo'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function DetalheDoPerfil({
  perfil,
  aoDuplicar,
  aoExcluir,
}: {
  perfil: PerfilDeAcesso
  aoDuplicar: (id: string) => void
  aoExcluir: () => void
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const [aba, setAba] = useState('permissoes')
  const [nome, setNome] = useState(perfil.nome)
  const [descricao, setDescricao] = useState(perfil.descricao ?? '')
  const [exige2fa, setExige2fa] = useState(perfil.exige2fa)
  const [ativo, setAtivo] = useState(perfil.ativo)
  const [permissoes, setPermissoes] = useState<MatrizDePermissoes>(perfil.permissoes)
  const [falha, setFalha] = useState<string>()
  const [confirmando, setConfirmando] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const mudou =
    nome.trim() !== perfil.nome ||
    (descricao.trim() || null) !== perfil.descricao ||
    exige2fa !== perfil.exige2fa ||
    ativo !== perfil.ativo ||
    JSON.stringify(Object.entries(permissoes).sort()) !==
      JSON.stringify(Object.entries(perfil.permissoes).sort())

  const marcar = (d: DefinicaoDePermissao, ligado: boolean) =>
    setPermissoes((atual) => {
      const novo = { ...atual }
      if (!ligado) delete novo[d.chave]
      else novo[d.chave] = d.admiteAlcance ? 'propria' : true
      return novo
    })

  const salvar = () =>
    executar(async () => {
      setFalha(undefined)
      const r = await servicos.perfis.editar(perfil.id, {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        exige2fa,
        ativo,
        permissoes,
      })
      setConfirmando(false)
      if (!r.ok) {
        setFalha(r.erro.mensagem)
        return
      }
      toast.success('Perfil salvo', {
        description:
          perfil.membros > 0 ? `Vale na próxima ação de ${usuarios(perfil.membros)}.` : undefined,
      })
      await queryClient.invalidateQueries({ queryKey: chaveDosPerfis })
    })

  const aoSalvar = (e: FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      setFalha('Informe o nome do perfil.')
      return
    }
    // aviso de impacto: quem já tem o perfil passa a ter o acesso novo na próxima ação
    if (perfil.membros > 0) setConfirmando(true)
    else void salvar()
  }

  return (
    <section
      aria-label={`Perfil ${perfil.nome}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 max-md:p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 min-w-0 flex-1 text-[17px] leading-6 font-semibold">{perfil.nome}</h3>
        <Badge tone={perfil.sistema ? 'info' : 'outline'}>
          {perfil.sistema ? 'Perfil de sistema' : 'Perfil da empresa'}
        </Badge>
        <Button variant="ghost" size="sm" icon={Copy} onClick={() => setDuplicando(true)}>
          Duplicar
        </Button>
        {perfil.sistema ? null : (
          <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setExcluindo(true)}>
            Excluir
          </Button>
        )}
      </div>
      {perfil.sistema ? (
        <p className="m-0 text-[13px] text-ink-muted">
          Os perfis de sistema podem ser editados, mas não excluídos.
          {perfil.chaveSistema === 'admin'
            ? ' O Administrador sempre gere a equipe e os perfis de acesso.'
            : ''}
        </p>
      ) : null}

      <Tabs
        label="Perfil"
        value={aba}
        onChange={setAba}
        items={[
          { value: 'permissoes', label: 'Permissões', icon: KeyRound },
          { value: 'usuarios', label: 'Usuários do perfil', icon: Users, count: perfil.membros },
        ]}
      />

      {aba === 'usuarios' ? (
        <UsuariosDoPerfil perfilId={perfil.id} />
      ) : (
        <form noValidate onSubmit={aoSalvar} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <TextField
              id="perfil-nome"
              label="Nome"
              required
              value={nome}
              maxLength={60}
              onChange={(e) => setNome(e.target.value)}
            />
            <TextArea
              id="perfil-descricao"
              label="Descrição"
              rows={2}
              maxLength={300}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <Switch
              label="Exige verificação em duas etapas"
              checked={exige2fa}
              onChange={(e) => setExige2fa(e.target.checked)}
            />
            {perfil.sistema ? null : (
              <Switch
                label="Perfil ativo"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
              />
            )}
          </div>

          <div className="flex flex-col gap-3">
            {MODULOS.map((m) => (
              <fieldset
                key={m.modulo}
                className="m-0 flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <legend className="px-1 text-sm font-semibold">{m.rotulo}</legend>
                {m.permissoes.map((d) => {
                  const valor = permissoes[d.chave]
                  const ligado = valor !== undefined
                  return (
                    <div key={d.chave} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Checkbox
                        className="min-w-[240px] flex-1"
                        label={d.rotulo}
                        checked={ligado}
                        disabled={protegida(perfil, d.chave)}
                        onChange={(e) => marcar(d, e.target.checked)}
                      />
                      {d.admiteAlcance && ligado ? (
                        <div className="w-[220px] max-md:w-full">
                          <Select
                            aria-label={`Alcance: ${d.rotulo}`}
                            value={valor === true ? 'propria' : valor}
                            options={OPCOES_DE_ALCANCE}
                            onChange={(e) =>
                              setPermissoes((atual) => ({
                                ...atual,
                                [d.chave]: e.target.value as Alcance,
                              }))
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </fieldset>
            ))}
          </div>

          {falha ? (
            <Alert tone="danger" title="Não foi possível salvar">
              {falha}
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              type="submit"
              icon={ShieldCheck}
              loading={enviando}
              disabled={!mudou}
            >
              Salvar perfil
            </Button>
          </div>
        </form>
      )}

      <Dialog
        open={confirmando}
        onOpenChange={(o) => {
          if (!o) setConfirmando(false)
        }}
        title={`${usuarios(perfil.membros)} ${perfil.membros === 1 ? 'será afetado' : 'serão afetados'}`}
        description={`Quem tem o perfil ${perfil.nome} passa a ter o acesso novo na próxima ação.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Voltar
            </Button>
            <Button variant="primary" loading={enviando} onClick={() => void salvar()}>
              Salvar mesmo assim
            </Button>
          </>
        }
      />
      <DialogoDeNome
        aberto={duplicando}
        titulo={`Duplicar ${perfil.nome}`}
        descricao="O perfil novo começa com as mesmas permissões, e você ajusta o que mudar."
        sugestao={`${perfil.nome} (cópia)`}
        botao="Duplicar"
        aoFechar={() => setDuplicando(false)}
        aoConfirmar={async (nomeNovo) => {
          const r = await servicos.perfis.duplicar(perfil.id, nomeNovo)
          if (!r.ok) return r.erro.mensagem
          toast.success(`Perfil ${r.dados.nome} criado`)
          await queryClient.invalidateQueries({ queryKey: chaveDosPerfis })
          aoDuplicar(r.dados.id)
          return null
        }}
      />
      <DialogoDeExclusao
        aberto={excluindo}
        perfil={perfil}
        aoFechar={() => setExcluindo(false)}
        aoExcluir={aoExcluir}
      />
    </section>
  )
}

function UsuariosDoPerfil({ perfilId }: { perfilId: string }) {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: [...chaveDosPerfis, perfilId, 'membros'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.perfis.membros(perfilId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (consulta.isPending) return <Skeleton lines={3} />
  if (consulta.isError) {
    return (
      <Alert tone="danger" title="Não foi possível carregar os usuários">
        {consulta.error.message}
      </Alert>
    )
  }
  if (consulta.data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Ninguém com este perfil"
        description="Troque o perfil das pessoas em Configurações → Usuários e equipe."
      />
    )
  }
  return (
    <ul aria-label="Usuários do perfil" className="m-0 flex list-none flex-col gap-0 p-0">
      {consulta.data.map((m) => (
        <li
          key={m.id}
          className="flex items-center gap-3 border-b border-border py-2 last:border-b-0"
        >
          <span className={cn('min-w-0 flex-1', !m.ativo && 'text-ink-muted')}>{m.nome}</span>
          {m.ativo ? null : <Badge tone="neutral">Inativo</Badge>}
          {m.temLogin ? null : <Badge tone="outline">Sem acesso</Badge>}
        </li>
      ))}
    </ul>
  )
}

/** "Quem pode o quê": as permissões (linhas) por perfil (colunas), com o alcance. */
function QuemPodeOQue({ perfis }: { perfis: PerfilDeAcesso[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Quem pode o quê</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold">
              Permissão
            </th>
            {perfis.map((p) => (
              <th
                key={p.id}
                scope="col"
                className="px-3 py-2 text-left font-semibold whitespace-nowrap"
              >
                {p.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULOS.flatMap((m) => [
            <tr key={m.modulo} className="bg-surface-sunken">
              <th
                scope="colgroup"
                colSpan={perfis.length + 1}
                className="px-3 py-1.5 text-left text-xs font-semibold text-ink-muted uppercase"
              >
                {m.rotulo}
              </th>
            </tr>,
            ...m.permissoes.map((d) => (
              <tr key={d.chave} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky left-0 min-w-[220px] bg-surface px-3 py-2 text-left font-normal"
                >
                  {d.rotulo}
                </th>
                {perfis.map((p) => {
                  const v = p.permissoes[d.chave]
                  return (
                    <td key={p.id} className="px-3 py-2 whitespace-nowrap">
                      {v === undefined ? (
                        <span className="text-ink-muted" aria-label="Não">
                          —
                        </span>
                      ) : v === true ? (
                        'Sim'
                      ) : (
                        ROTULO_DO_ALCANCE[v]
                      )}
                    </td>
                  )
                })}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  )
}

function DialogoDeNovoPerfil({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoCriar: (id: string) => void
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  return (
    <DialogoDeNome
      aberto={aberto}
      titulo="Novo perfil de acesso"
      descricao="O perfil começa sem permissões: marque o que ele pode fazer e salve. Para partir de um perfil pronto, use Duplicar."
      sugestao=""
      botao="Criar perfil"
      aoFechar={aoFechar}
      aoConfirmar={async (nome) => {
        const r = await servicos.perfis.criar({ nome })
        if (!r.ok) return r.erro.mensagem
        toast.success(`Perfil ${r.dados.nome} criado`)
        await queryClient.invalidateQueries({ queryKey: chaveDosPerfis })
        aoCriar(r.dados.id)
        return null
      }}
    />
  )
}

/** Pede um nome (criar e duplicar). `aoConfirmar` devolve a mensagem de erro, ou null se deu certo. */
function DialogoDeNome({
  aberto,
  titulo,
  descricao,
  sugestao,
  botao,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean
  titulo: string
  descricao: string
  sugestao: string
  botao: string
  aoFechar: () => void
  aoConfirmar: (nome: string) => Promise<string | null>
}) {
  const { enviando, executar } = useEnvio()
  const [nome, setNome] = useState<string | null>(null)
  const [falha, setFalha] = useState<string>()
  const valor = nome ?? sugestao
  const fechar = () => {
    setNome(null)
    setFalha(undefined)
    aoFechar()
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!valor.trim()) {
      setFalha('Informe o nome do perfil.')
      return
    }
    void executar(async () => {
      const erro = await aoConfirmar(valor.trim())
      if (erro) setFalha(erro)
      else fechar()
    })
  }
  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) fechar()
      }}
      title={titulo}
      description={descricao}
      footer={
        <>
          <Button variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-nome-perfil" loading={enviando}>
            {botao}
          </Button>
        </>
      }
    >
      <form id="form-nome-perfil" noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id="nome-do-perfil"
          label="Nome do perfil"
          required
          autoFocus
          maxLength={60}
          value={valor}
          onChange={(e) => setNome(e.target.value)}
        />
        {falha ? (
          <Alert tone="danger" title="Não foi possível concluir">
            {falha}
          </Alert>
        ) : null}
      </form>
    </Dialog>
  )
}

function DialogoDeExclusao({
  aberto,
  perfil,
  aoFechar,
  aoExcluir,
}: {
  aberto: boolean
  perfil: PerfilDeAcesso
  aoFechar: () => void
  aoExcluir: () => void
}) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const [falha, setFalha] = useState<string>()
  const fechar = () => {
    setFalha(undefined)
    aoFechar()
  }
  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) fechar()
      }}
      title={`Excluir o perfil ${perfil.nome}?`}
      description={
        perfil.membros > 0
          ? `${usuarios(perfil.membros)} ainda ${perfil.membros === 1 ? 'tem' : 'têm'} este perfil: troque o perfil deles antes de excluir.`
          : 'Só se exclui perfil sem membros nem convites pendentes.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={fechar}>
            Voltar
          </Button>
          <Button
            variant="danger"
            loading={enviando}
            disabled={perfil.membros > 0}
            onClick={() =>
              void executar(async () => {
                const r = await servicos.perfis.excluir(perfil.id)
                if (!r.ok) {
                  setFalha(r.erro.mensagem)
                  return
                }
                toast.success(`Perfil ${perfil.nome} excluído`)
                await queryClient.invalidateQueries({ queryKey: chaveDosPerfis })
                fechar()
                aoExcluir()
              })
            }
          >
            Excluir perfil
          </Button>
        </>
      }
    >
      {falha ? (
        <Alert tone="danger" title="Não foi possível excluir">
          {falha}
        </Alert>
      ) : null}
    </Dialog>
  )
}
