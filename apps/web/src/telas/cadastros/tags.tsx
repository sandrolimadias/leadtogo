import type { TagGrupo } from '@leadtogo/api-client'
import { CHAVES_DE_TAG_COM_REGRA, type CorDeTag, type SelecaoDeTag } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import type { ErroDeAcesso, Resultado } from '@/auth/tipos'
import { Button, IconButton } from '@/components/ui/button'
import { Select, TextField } from '@/components/ui/campos'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { Badge, Tag } from '@/components/ui/exibicao'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { focarCampo, useEnvio } from '@/telas/acesso/comum'

import {
  BotoesDeOrdem,
  CabecalhoDeSecao,
  Carregamento,
  DialogoDeConfirmacao,
  Janela,
  SeletorDeCor,
} from './base'
import { moverNaLista } from './ordem'

const chaveDasTags = ['cadastros', 'tags'] as const

type Grupo = TagGrupo
type Etiqueta = TagGrupo['tags'][number]

/** A tag de que as regras do sistema dependem: renomeia e recolore, mas não inativa nem exclui. */
const temRegra = (t: Etiqueta) =>
  t.chaveSistema !== null && (CHAVES_DE_TAG_COM_REGRA as readonly string[]).includes(t.chaveSistema)

const OPCOES_DE_SELECAO = [
  { value: 'unica', label: 'Única: a empresa tem só uma tag do grupo' },
  { value: 'multipla', label: 'Múltipla: a empresa pode ter várias' },
]

type Janelas =
  | { tipo: 'grupo'; grupo: Grupo | null }
  | { tipo: 'tag'; grupo: Grupo; tag: Etiqueta | null }
  | { tipo: 'excluir-grupo'; grupo: Grupo }
  | { tipo: 'excluir-tag'; tag: Etiqueta }

/** Configurações → Tags: grupos de tags (Status, Visitação...) e as tags de cada um. Só o administrador. */
export function TelaDeTags() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const consulta = useQuery({
    queryKey: chaveDasTags,
    retry: false,
    queryFn: async () => {
      const r = await servicos.tags.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [janela, setJanela] = useState<Janelas | null>(null)
  const [erroDaExclusao, setErroDaExclusao] = useState<string | undefined>()

  const recarregar = () => queryClient.invalidateQueries({ queryKey: chaveDasTags })
  const fechar = () => {
    setJanela(null)
    setErroDaExclusao(undefined)
  }

  /** Ação rápida (ordem): erro vira aviso e a lista é relida, que é o que a API considera certo. */
  const mover = (acao: () => Promise<Resultado<unknown>>) =>
    executar(async () => {
      const r = await acao()
      if (!r.ok) toast.error('Não foi possível reordenar', { description: r.erro.mensagem })
      await recarregar()
    })

  const excluir = (acao: () => Promise<Resultado>, ok: string) =>
    executar(async () => {
      const r = await acao()
      if (!r.ok) {
        setErroDaExclusao(r.erro.mensagem)
        await recarregar()
        return
      }
      toast.success(ok)
      fechar()
      await recarregar()
    })

  const cabecalho = (
    <CabecalhoDeSecao
      titulo="Tags"
      descricao="Os grupos e as tags que classificam as empresas da carteira."
      acao={
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setJanela({ tipo: 'grupo', grupo: null })}
        >
          Novo grupo
        </Button>
      }
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <Carregamento consulta={consulta} rotulo="as tags" cabecalho={cabecalho}>
        {cabecalho}
        {consulta.data?.length ? (
          <div className="flex flex-col gap-4">
            {consulta.data.map((g, i, todos) => (
              <CartaoDoGrupo
                key={g.id}
                grupo={g}
                primeiro={i === 0}
                ultimo={i === todos.length - 1}
                desativado={enviando}
                aoMoverGrupo={(d) =>
                  void mover(() =>
                    servicos.tags.reordenarGrupos(
                      moverNaLista(
                        todos.map((x) => x.id),
                        i,
                        d,
                      ),
                    ),
                  )
                }
                aoMoverTag={(indice, d) =>
                  void mover(() =>
                    servicos.tags.reordenarTags(
                      g.id,
                      moverNaLista(
                        g.tags.map((t) => t.id),
                        indice,
                        d,
                      ),
                    ),
                  )
                }
                aoEditarGrupo={() => setJanela({ tipo: 'grupo', grupo: g })}
                aoExcluirGrupo={() => setJanela({ tipo: 'excluir-grupo', grupo: g })}
                aoCriarTag={() => setJanela({ tipo: 'tag', grupo: g, tag: null })}
                aoEditarTag={(tag) => setJanela({ tipo: 'tag', grupo: g, tag })}
                aoExcluirTag={(tag) => setJanela({ tipo: 'excluir-tag', tag })}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState
              icon={Tags}
              title="Nenhum grupo de tags"
              description="Crie um grupo (por exemplo, Interesse) e depois as tags dele."
              actions={
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setJanela({ tipo: 'grupo', grupo: null })}
                >
                  Novo grupo
                </Button>
              }
            />
          </div>
        )}
      </Carregamento>

      <DialogoDeGrupo
        aberto={janela?.tipo === 'grupo'}
        grupo={janela?.tipo === 'grupo' ? janela.grupo : null}
        aoFechar={fechar}
        aoSalvar={recarregar}
      />
      <DialogoDeTag
        aberto={janela?.tipo === 'tag'}
        grupo={janela?.tipo === 'tag' ? janela.grupo : null}
        tag={janela?.tipo === 'tag' ? janela.tag : null}
        aoFechar={fechar}
        aoSalvar={recarregar}
      />
      <DialogoDeConfirmacao
        aberto={janela?.tipo === 'excluir-grupo'}
        titulo={`Excluir o grupo ${janela?.tipo === 'excluir-grupo' ? janela.grupo.nome : ''}?`}
        descricao="O grupo e as tags dele deixam de aparecer. Esta ação não pode ser desfeita por aqui."
        rotuloDoBotao="Excluir grupo"
        erro={erroDaExclusao}
        enviando={enviando}
        aoFechar={fechar}
        aoConfirmar={() => {
          if (janela?.tipo !== 'excluir-grupo') return
          const { grupo } = janela
          void excluir(() => servicos.tags.excluirGrupo(grupo.id), `Grupo ${grupo.nome} excluído`)
        }}
      />
      <DialogoDeConfirmacao
        aberto={janela?.tipo === 'excluir-tag'}
        titulo={`Excluir a tag ${janela?.tipo === 'excluir-tag' ? janela.tag.nome : ''}?`}
        descricao="A tag deixa de aparecer. Esta ação não pode ser desfeita por aqui."
        rotuloDoBotao="Excluir tag"
        erro={erroDaExclusao}
        enviando={enviando}
        aoFechar={fechar}
        aoConfirmar={() => {
          if (janela?.tipo !== 'excluir-tag') return
          const { tag } = janela
          void excluir(() => servicos.tags.excluirTag(tag.id), `Tag ${tag.nome} excluída`)
        }}
      />
    </div>
  )
}

function CartaoDoGrupo({
  grupo,
  primeiro,
  ultimo,
  desativado,
  aoMoverGrupo,
  aoMoverTag,
  aoEditarGrupo,
  aoExcluirGrupo,
  aoCriarTag,
  aoEditarTag,
  aoExcluirTag,
}: {
  grupo: Grupo
  primeiro: boolean
  ultimo: boolean
  desativado: boolean
  aoMoverGrupo: (d: -1 | 1) => void
  aoMoverTag: (indice: number, d: -1 | 1) => void
  aoEditarGrupo: () => void
  aoExcluirGrupo: () => void
  aoCriarTag: () => void
  aoEditarTag: (tag: Etiqueta) => void
  aoExcluirTag: (tag: Etiqueta) => void
}) {
  return (
    <section
      aria-label={grupo.nome}
      className="overflow-hidden rounded-lg border border-border bg-surface"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h3 className="m-0 text-[15px] leading-5 font-semibold">{grupo.nome}</h3>
          <Badge tone="outline">
            {grupo.selecao === 'unica' ? 'Seleção única' : 'Seleção múltipla'}
          </Badge>
          {grupo.obrigatorio ? <Badge tone="accent">Obrigatório</Badge> : null}
          {grupo.automatico ? <Badge tone="info">Aplicado pelo sistema</Badge> : null}
          {grupo.sistema ? (
            <Badge tone="neutral" icon={Lock}>
              Grupo do sistema
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          <BotoesDeOrdem
            nome={`o grupo ${grupo.nome}`}
            primeiro={primeiro}
            ultimo={ultimo}
            desativado={desativado}
            aoMover={aoMoverGrupo}
          />
          <IconButton
            size="sm"
            icon={Pencil}
            label={`Editar o grupo ${grupo.nome}`}
            onClick={aoEditarGrupo}
          />
          {grupo.sistema ? null : (
            <IconButton
              size="sm"
              icon={Trash2}
              label={`Excluir o grupo ${grupo.nome}`}
              onClick={aoExcluirGrupo}
            />
          )}
        </div>
      </header>

      {grupo.tags.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {grupo.tags.map((t, i) => (
            <li
              key={t.id}
              aria-label={t.nome}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 last:border-b-0"
              style={t.ativo ? undefined : { background: 'var(--surface-sunken)' }}
            >
              <div className="flex min-w-[160px] flex-1 flex-wrap items-center gap-2">
                <Tag color={t.cor} className={t.ativo ? undefined : 'opacity-60'}>
                  {t.nome}
                </Tag>
                {t.ativo ? null : <Badge tone="neutral">Inativa</Badge>}
                {temRegra(t) ? (
                  <span className="text-xs text-ink-muted">Usada pelas regras do sistema</span>
                ) : null}
              </div>
              <div className="flex items-center gap-0.5">
                <BotoesDeOrdem
                  nome={`a tag ${t.nome}`}
                  primeiro={i === 0}
                  ultimo={i === grupo.tags.length - 1}
                  desativado={desativado}
                  aoMover={(d) => aoMoverTag(i, d)}
                />
                <IconButton
                  size="sm"
                  icon={Pencil}
                  label={`Editar a tag ${t.nome}`}
                  onClick={() => aoEditarTag(t)}
                />
                {temRegra(t) ? null : (
                  <IconButton
                    size="sm"
                    icon={Trash2}
                    label={`Excluir a tag ${t.nome}`}
                    onClick={() => aoExcluirTag(t)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 px-4 py-3 text-sm text-ink-muted">Este grupo ainda não tem tags.</p>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-sunken px-4 py-2">
        {grupo.automatico ? (
          <span className="text-[13px] text-ink-muted">
            As tags deste grupo são aplicadas pelo sistema: não dá para criar outras.
          </span>
        ) : (
          <Button size="sm" icon={Plus} onClick={aoCriarTag}>
            Nova tag em {grupo.nome}
          </Button>
        )}
      </footer>
    </section>
  )
}

/** Mensagem de um erro de salvar: nome repetido vai no campo; o resto, no aviso do diálogo. */
function separarErro(erro: ErroDeAcesso): { campo?: string; aviso?: string } {
  return erro.codigo === 'nome_duplicado'
    ? { campo: 'Já existe um item com esse nome.' }
    : { aviso: erro.mensagem }
}

function DialogoDeGrupo({
  aberto,
  grupo,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  grupo: Grupo | null
  aoFechar: () => void
  aoSalvar: () => Promise<unknown>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const editando = grupo !== null
  const [nome, setNome] = useState('')
  const [selecao, setSelecao] = useState<SelecaoDeTag>('multipla')
  const [obrigatorio, setObrigatorio] = useState(false)
  const [tentou, setTentou] = useState(false)
  const [erroDoNome, setErroDoNome] = useState<string | undefined>()
  const [aviso, setAviso] = useState<string | undefined>()
  const [aberturaVista, setAberturaVista] = useState<string | null>(null)

  // Preenche o formulário na abertura (e só nela): ajuste no render, sem efeito
  const chaveDaAbertura = aberto ? (grupo?.id ?? 'novo') : null
  if (chaveDaAbertura !== aberturaVista) {
    setAberturaVista(chaveDaAbertura)
    if (aberto) {
      setNome(grupo?.nome ?? '')
      setSelecao(grupo?.selecao ?? 'multipla')
      setObrigatorio(grupo?.obrigatorio ?? false)
      setTentou(false)
      setErroDoNome(undefined)
      setAviso(undefined)
    }
  }

  const nomeVazio = tentou && nome.trim() === ''
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (nome.trim() === '') return focarCampo('grupo-nome')
    setErroDoNome(undefined)
    setAviso(undefined)
    void executar(async () => {
      const r = grupo
        ? await servicos.tags.alterarGrupo(grupo.id, {
            nome: nome.trim(),
            ...(grupo.sistema ? {} : { selecao, obrigatorio }),
          })
        : await servicos.tags.criarGrupo({ nome: nome.trim(), selecao, obrigatorio })
      if (!r.ok) {
        const { campo, aviso: a } = separarErro(r.erro)
        setErroDoNome(campo)
        setAviso(a)
        if (campo) focarCampo('grupo-nome')
        return
      }
      toast.success(editando ? 'Grupo atualizado' : 'Grupo criado')
      await aoSalvar()
      aoFechar()
    })
  }

  return (
    <Janela
      open={aberto}
      onOpenChange={(o) => {
        if (!o) aoFechar()
      }}
      title={editando ? `Editar o grupo ${grupo.nome}` : 'Novo grupo de tags'}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-grupo" loading={enviando}>
            {editando ? 'Salvar' : 'Criar grupo'}
          </Button>
        </>
      }
    >
      <form id="form-grupo" noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id="grupo-nome"
          label="Nome"
          required
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder="Ex.: Interesse"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          error={nomeVazio ? 'Informe o nome do grupo.' : erroDoNome}
        />
        <Select
          id="grupo-selecao"
          label="Seleção"
          value={selecao}
          options={OPCOES_DE_SELECAO}
          disabled={grupo?.sistema}
          hint={grupo?.sistema ? 'Grupo do sistema: só o nome pode mudar.' : undefined}
          onChange={(e) => setSelecao(e.target.value as SelecaoDeTag)}
        />
        <Checkbox
          label="Obrigatório"
          description="Toda empresa precisa ter uma tag deste grupo."
          checked={obrigatorio}
          disabled={grupo?.sistema}
          onChange={(e) => setObrigatorio(e.target.checked)}
        />
        {aviso ? (
          <Alert tone="danger" title="Não foi possível salvar">
            {aviso}
          </Alert>
        ) : null}
      </form>
    </Janela>
  )
}

function DialogoDeTag({
  aberto,
  grupo,
  tag,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  grupo: Grupo | null
  tag: Etiqueta | null
  aoFechar: () => void
  aoSalvar: () => Promise<unknown>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const editando = tag !== null
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState<CorDeTag>('gray')
  const [ativa, setAtiva] = useState(true)
  const [tentou, setTentou] = useState(false)
  const [erroDoNome, setErroDoNome] = useState<string | undefined>()
  const [aviso, setAviso] = useState<string | undefined>()
  const [aberturaVista, setAberturaVista] = useState<string | null>(null)

  const chaveDaAbertura = aberto ? (tag?.id ?? `nova-${grupo?.id ?? ''}`) : null
  if (chaveDaAbertura !== aberturaVista) {
    setAberturaVista(chaveDaAbertura)
    if (aberto) {
      setNome(tag?.nome ?? '')
      setCor(tag?.cor ?? 'gray')
      setAtiva(tag?.ativo ?? true)
      setTentou(false)
      setErroDoNome(undefined)
      setAviso(undefined)
    }
  }

  const nomeVazio = tentou && nome.trim() === ''
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (nome.trim() === '') return focarCampo('tag-nome')
    if (!grupo) return
    setErroDoNome(undefined)
    setAviso(undefined)
    void executar(async () => {
      const r = tag
        ? await servicos.tags.alterarTag(tag.id, { nome: nome.trim(), cor, ativo: ativa })
        : await servicos.tags.criarTag({ tagGrupoId: grupo.id, nome: nome.trim(), cor })
      if (!r.ok) {
        const { campo, aviso: a } = separarErro(r.erro)
        setErroDoNome(campo)
        setAviso(a)
        if (campo) focarCampo('tag-nome')
        return
      }
      toast.success(editando ? 'Tag atualizada' : 'Tag criada')
      await aoSalvar()
      aoFechar()
    })
  }

  return (
    <Janela
      open={aberto}
      onOpenChange={(o) => {
        if (!o) aoFechar()
      }}
      title={editando ? `Editar a tag ${tag.nome}` : `Nova tag em ${grupo?.nome ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-tag" loading={enviando}>
            {editando ? 'Salvar' : 'Criar tag'}
          </Button>
        </>
      }
    >
      <form id="form-tag" noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id="tag-nome"
          label="Nome"
          required
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder="Ex.: Retrofit"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          error={nomeVazio ? 'Informe o nome da tag.' : erroDoNome}
        />
        <SeletorDeCor label="Cor" value={cor} onChange={setCor} />
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          Como vai aparecer:
          <Tag color={cor}>{nome.trim() || 'Nome da tag'}</Tag>
        </div>
        {editando ? (
          <div className="flex flex-col gap-1">
            <Switch
              label="Tag ativa"
              checked={ativa}
              disabled={temRegra(tag)}
              onChange={(e) => setAtiva(e.target.checked)}
            />
            <span className="text-xs text-ink-muted">
              {temRegra(tag)
                ? 'Esta tag é usada pelas regras do sistema: pode mudar nome e cor, mas não ser inativada.'
                : 'Inativar tira a tag das escolhas sem apagar o histórico.'}
            </span>
          </div>
        ) : null}
        {aviso ? (
          <Alert tone="danger" title="Não foi possível salvar">
            {aviso}
          </Alert>
        ) : null}
      </form>
    </Janela>
  )
}
