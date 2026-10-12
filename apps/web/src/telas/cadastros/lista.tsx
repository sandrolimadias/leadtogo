import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import type { Resultado, ServicosDeAcesso, ServicosDeCadastro } from '@/auth/tipos'
import { Button, IconButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Switch } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { focarCampo, useEnvio } from '@/telas/acesso/comum'

import { BotoesDeOrdem, CabecalhoDeSecao, Carregamento, DialogoDeConfirmacao, Janela } from './base'
import { moverNaLista } from './ordem'

export interface ItemDeCadastro {
  id: string
  nome: string
  ativo: boolean
}

/** O que o sistema protege num item: inativar, excluir e uma nota que explica por quê. */
export interface Protecao {
  semInativar?: boolean
  semExcluir?: boolean
  nota?: string
}

export interface ConfigDaLista<
  Item extends ItemDeCadastro,
  Estado extends { nome: string },
  Criar,
  Alterar,
> {
  /** Identifica a lista (chave da consulta e ids dos campos) */
  chave: string
  titulo: string
  descricao: string
  icone: LucideIcon
  rotulos: {
    /** "vertical": entra nos nomes dos botões ("Editar vertical Indústria") */
    singular: string
    /** "as verticais": "Carregando as verticais" */
    plural: string
    /** "Nova vertical": botão e título do diálogo */
    novo: string
    vazioTitulo: string
    vazioDescricao: string
    criado: string
    atualizado: string
    /** "Vertical Indústria excluída" */
    excluido: (nome: string) => string
    /** Placeholder do nome */
    exemploDoNome: string
  }
  servicos: (s: ServicosDeAcesso) => ServicosDeCadastro<Item, Criar, Alterar>
  /** O que aparece na linha, à esquerda (chip, ícone, etiquetas) */
  linha: (item: Item) => ReactNode
  estadoInicial: (item: Item | null) => Estado
  /** Campos além do nome. `mudar` junta no estado */
  campos: (p: {
    estado: Estado
    mudar: (parcial: Partial<Estado>) => void
    item: Item | null
  }) => ReactNode
  /** Mensagem de erro do que o formulário exige além do nome (ex.: "Escolha ao menos um status.") */
  validar?: (estado: Estado) => string | undefined
  paraCriar: (estado: Estado) => Criar
  /** O que mudou no formulário; a situação (ativo) é acrescentada pela lista */
  paraAlterar: (estado: Estado, item: Item) => Omit<Alterar, 'ativo'>
  protecao?: (item: Item) => Protecao
}

type Janelas<Item> = { tipo: 'form'; item: Item | null } | { tipo: 'excluir'; item: Item }

const naoProtegido: Protecao = {}

/**
 * Lista de um cadastro simples da empresa ativa: linhas ordenáveis por botões, criar e editar num
 * diálogo (folha no celular), inativar pela edição e excluir com confirmação. Só o administrador
 * chega nesta tela (Configurações).
 */
export function ListaDeCadastro<
  Item extends ItemDeCadastro,
  Estado extends { nome: string },
  Criar,
  Alterar extends { ativo?: boolean | undefined },
>({ config }: { config: ConfigDaLista<Item, Estado, Criar, Alterar> }) {
  const servicos = useServicos()
  const cadastro = config.servicos(servicos)
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const chaveDaConsulta = ['cadastros', config.chave] as const
  const consulta = useQuery({
    queryKey: chaveDaConsulta,
    retry: false,
    queryFn: async () => {
      const r = await cadastro.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [janela, setJanela] = useState<Janelas<Item> | null>(null)
  const [erroDaExclusao, setErroDaExclusao] = useState<string | undefined>()
  const { rotulos: r } = config
  const protecaoDe = config.protecao ?? (() => naoProtegido)

  const recarregar = () => queryClient.invalidateQueries({ queryKey: chaveDaConsulta })
  const fechar = () => {
    setJanela(null)
    setErroDaExclusao(undefined)
  }
  const mover = (acao: () => Promise<Resultado<unknown>>) =>
    executar(async () => {
      const res = await acao()
      if (!res.ok) toast.error('Não foi possível reordenar', { description: res.erro.mensagem })
      await recarregar()
    })
  const excluir = (item: Item) =>
    executar(async () => {
      const res = await cadastro.excluir(item.id)
      if (!res.ok) {
        setErroDaExclusao(res.erro.mensagem)
        await recarregar()
        return
      }
      toast.success(r.excluido(item.nome))
      fechar()
      await recarregar()
    })

  const cabecalho = (
    <CabecalhoDeSecao
      titulo={config.titulo}
      descricao={config.descricao}
      acao={
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setJanela({ tipo: 'form', item: null })}
        >
          {r.novo}
        </Button>
      }
    />
  )
  const itens = consulta.data ?? []

  return (
    <section aria-label={config.titulo} className="flex flex-col gap-4">
      <Carregamento consulta={consulta} rotulo={r.plural} cabecalho={cabecalho}>
        {cabecalho}
        {itens.length ? (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0">
            {itens.map((item, i) => {
              const protecao = protecaoDe(item)
              return (
                <li
                  key={item.id}
                  aria-label={item.nome}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0"
                  style={item.ativo ? undefined : { background: 'var(--surface-sunken)' }}
                >
                  <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-2">
                    {config.linha(item)}
                    {item.ativo ? null : <Badge tone="neutral">Inativo</Badge>}
                    {protecao.nota ? (
                      <span className="text-xs text-ink-muted">{protecao.nota}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <BotoesDeOrdem
                      nome={`${r.singular} ${item.nome}`}
                      primeiro={i === 0}
                      ultimo={i === itens.length - 1}
                      desativado={enviando}
                      aoMover={(d) =>
                        void mover(() =>
                          cadastro.reordenar(
                            moverNaLista(
                              itens.map((x) => x.id),
                              i,
                              d,
                            ),
                          ),
                        )
                      }
                    />
                    <IconButton
                      size="sm"
                      icon={Pencil}
                      label={`Editar ${r.singular} ${item.nome}`}
                      onClick={() => setJanela({ tipo: 'form', item })}
                    />
                    {protecao.semExcluir ? null : (
                      <IconButton
                        size="sm"
                        icon={Trash2}
                        label={`Excluir ${r.singular} ${item.nome}`}
                        onClick={() => setJanela({ tipo: 'excluir', item })}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState
              icon={config.icone}
              title={r.vazioTitulo}
              description={r.vazioDescricao}
              actions={
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setJanela({ tipo: 'form', item: null })}
                >
                  {r.novo}
                </Button>
              }
            />
          </div>
        )}
      </Carregamento>

      <DialogoDoItem
        config={config}
        cadastro={cadastro}
        aberto={janela?.tipo === 'form'}
        item={janela?.tipo === 'form' ? janela.item : null}
        protecao={janela?.tipo === 'form' && janela.item ? protecaoDe(janela.item) : naoProtegido}
        aoFechar={fechar}
        aoSalvar={recarregar}
      />
      <DialogoDeConfirmacao
        aberto={janela?.tipo === 'excluir'}
        titulo={`Excluir ${r.singular} ${janela?.tipo === 'excluir' ? janela.item.nome : ''}?`}
        descricao="O item deixa de aparecer. Esta ação não pode ser desfeita por aqui."
        rotuloDoBotao="Excluir"
        erro={erroDaExclusao}
        enviando={enviando}
        aoFechar={fechar}
        aoConfirmar={() => {
          if (janela?.tipo === 'excluir') void excluir(janela.item)
        }}
      />
    </section>
  )
}

function DialogoDoItem<
  Item extends ItemDeCadastro,
  Estado extends { nome: string },
  Criar,
  Alterar extends { ativo?: boolean | undefined },
>({
  config,
  cadastro,
  aberto,
  item,
  protecao,
  aoFechar,
  aoSalvar,
}: {
  config: ConfigDaLista<Item, Estado, Criar, Alterar>
  cadastro: ServicosDeCadastro<Item, Criar, Alterar>
  aberto: boolean
  item: Item | null
  protecao: Protecao
  aoFechar: () => void
  aoSalvar: () => Promise<unknown>
}) {
  const { enviando, executar } = useEnvio()
  const editando = item !== null
  const { rotulos: r } = config
  const idDoForm = `form-${config.chave}`
  const idDoNome = `${config.chave}-nome`
  const [estado, setEstado] = useState<Estado>(() => config.estadoInicial(null))
  const [ativo, setAtivo] = useState(true)
  const [tentou, setTentou] = useState(false)
  const [erroDoNome, setErroDoNome] = useState<string | undefined>()
  const [aviso, setAviso] = useState<string | undefined>()
  const [aberturaVista, setAberturaVista] = useState<string | null>(null)

  // Preenche o formulário na abertura (e só nela): ajuste no render, sem efeito
  const chaveDaAbertura = aberto ? (item?.id ?? 'novo') : null
  if (chaveDaAbertura !== aberturaVista) {
    setAberturaVista(chaveDaAbertura)
    if (aberto) {
      setEstado(config.estadoInicial(item))
      setAtivo(item?.ativo ?? true)
      setTentou(false)
      setErroDoNome(undefined)
      setAviso(undefined)
    }
  }

  const nomeVazio = tentou && estado.nome.trim() === ''
  const erroDoForm = tentou ? config.validar?.(estado) : undefined

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (estado.nome.trim() === '') return focarCampo(idDoNome)
    if (config.validar?.(estado)) return
    setErroDoNome(undefined)
    setAviso(undefined)
    const limpo = { ...estado, nome: estado.nome.trim() }
    void executar(async () => {
      const res = item
        ? await cadastro.alterar(item.id, {
            ...config.paraAlterar(limpo, item),
            ativo,
          } as Alterar)
        : await cadastro.criar(config.paraCriar(limpo))
      if (!res.ok) {
        if (res.erro.codigo === 'nome_duplicado') {
          setErroDoNome('Já existe um item com esse nome.')
          focarCampo(idDoNome)
        } else {
          setAviso(res.erro.mensagem)
        }
        return
      }
      toast.success(editando ? r.atualizado : r.criado)
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
      title={editando ? `Editar ${r.singular} ${item.nome}` : r.novo}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form={idDoForm} loading={enviando}>
            {editando ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id={idDoForm} noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id={idDoNome}
          label="Nome"
          required
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder={r.exemploDoNome}
          value={estado.nome}
          onChange={(e) => setEstado((a) => ({ ...a, nome: e.target.value }))}
          error={nomeVazio ? 'Informe o nome.' : erroDoNome}
        />
        {config.campos({
          estado,
          mudar: (parcial) => setEstado((a) => ({ ...a, ...parcial })),
          item,
        })}
        {erroDoForm ? (
          <Alert tone="warning" title="Falta preencher">
            {erroDoForm}
          </Alert>
        ) : null}
        {editando ? (
          <div className="flex flex-col gap-1">
            <Switch
              label="Ativo"
              checked={ativo}
              disabled={protecao.semInativar}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <span className="text-xs text-ink-muted">
              {protecao.semInativar
                ? (protecao.nota ?? 'O sistema usa este item: dá para renomear, não inativar.')
                : 'Inativar tira das escolhas sem apagar o histórico.'}
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
