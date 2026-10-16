import type { Funil } from '@leadtogo/api-client'
import { type CorDeTag, MAX_FASES_ATIVAS_POR_FUNIL } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Funnel, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import type { Resultado } from '@/auth/tipos'
import { Button, IconButton } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Switch } from '@/components/ui/checkbox'
import { classeDaCor } from '@/components/ui/cores'
import { Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
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

const chaveDosFunis = ['cadastros', 'funis'] as const

type Fase = Funil['fases'][number]

type Janelas =
  | { tipo: 'funil'; funil: Funil | null }
  | { tipo: 'fase'; funil: Funil; fase: Fase | null }
  | { tipo: 'excluir-funil'; funil: Funil }
  | { tipo: 'excluir-fase'; funil: Funil; fase: Fase }

const textoDoAlerta = (f: Fase) =>
  f.diasAlertaParada === null
    ? 'Sem alerta de parada'
    : `Alerta de parada após ${f.diasAlertaParada} ${f.diasAlertaParada === 1 ? 'dia' : 'dias'}`

/** Configurações → Funis e fases: os funis de venda e as fases de andamento de cada um. Só o administrador. */
export function TelaDeFunis() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const consulta = useQuery({
    queryKey: chaveDosFunis,
    retry: false,
    queryFn: async () => {
      const r = await servicos.funis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [janela, setJanela] = useState<Janelas | null>(null)
  const [erroDaExclusao, setErroDaExclusao] = useState<string | undefined>()

  const recarregar = () => queryClient.invalidateQueries({ queryKey: chaveDosFunis })
  const fechar = () => {
    setJanela(null)
    setErroDaExclusao(undefined)
  }
  /** Ação direta da lista (ordem, tornar padrão): o erro vira aviso e a lista é relida. */
  const agir = (acao: () => Promise<Resultado<unknown>>, ok: string | null, titulo: string) =>
    executar(async () => {
      const r = await acao()
      if (!r.ok) toast.error(titulo, { description: r.erro.mensagem })
      else if (ok) toast.success(ok)
      await recarregar()
    })
  const excluir = (acao: () => Promise<Resultado<unknown>>, ok: string) =>
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
      titulo="Funis e fases"
      descricao="As etapas do andamento de uma venda. O fechamento (conquistada, perdida...) é o status da oportunidade, não uma fase."
      acao={
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setJanela({ tipo: 'funil', funil: null })}
        >
          Novo funil
        </Button>
      }
    />
  )
  const funis = consulta.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <Carregamento consulta={consulta} rotulo="os funis" cabecalho={cabecalho}>
        {cabecalho}
        {funis.length ? (
          funis.map((f, i) => (
            <CartaoDoFunil
              key={f.id}
              funil={f}
              primeiro={i === 0}
              ultimo={i === funis.length - 1}
              desativado={enviando}
              aoMoverFunil={(d) =>
                void agir(
                  () =>
                    servicos.funis.reordenar(
                      moverNaLista(
                        funis.map((x) => x.id),
                        i,
                        d,
                      ),
                    ),
                  null,
                  'Não foi possível reordenar',
                )
              }
              aoMoverFase={(indice, d) =>
                void agir(
                  () =>
                    servicos.funis.reordenarFases(
                      f.id,
                      moverNaLista(
                        f.fases.map((x) => x.id),
                        indice,
                        d,
                      ),
                    ),
                  null,
                  'Não foi possível reordenar',
                )
              }
              aoTornarPadrao={() =>
                void agir(
                  () => servicos.funis.alterar(f.id, { padrao: true }),
                  `${f.nome} agora é o funil padrão`,
                  'Não foi possível tornar padrão',
                )
              }
              aoEditar={() => setJanela({ tipo: 'funil', funil: f })}
              aoExcluir={() => setJanela({ tipo: 'excluir-funil', funil: f })}
              aoCriarFase={() => setJanela({ tipo: 'fase', funil: f, fase: null })}
              aoEditarFase={(fase) => setJanela({ tipo: 'fase', funil: f, fase })}
              aoExcluirFase={(fase) => setJanela({ tipo: 'excluir-fase', funil: f, fase })}
              aoAlternarFase={(fase) =>
                void agir(
                  () => servicos.funis.alterarFase(fase.id, { ativo: !fase.ativo }),
                  fase.ativo ? `Fase ${fase.nome} inativada` : `Fase ${fase.nome} reativada`,
                  fase.ativo
                    ? 'Não foi possível inativar a fase'
                    : 'Não foi possível reativar a fase',
                )
              }
            />
          ))
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState
              icon={Funnel}
              title="Nenhum funil"
              description="Crie o funil de vendas com a primeira fase; as outras entram depois."
              actions={
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setJanela({ tipo: 'funil', funil: null })}
                >
                  Novo funil
                </Button>
              }
            />
          </div>
        )}
      </Carregamento>

      <DialogoDeFunil
        aberto={janela?.tipo === 'funil'}
        funil={janela?.tipo === 'funil' ? janela.funil : null}
        aoFechar={fechar}
        aoSalvar={recarregar}
      />
      <DialogoDeFase
        aberto={janela?.tipo === 'fase'}
        funil={janela?.tipo === 'fase' ? janela.funil : null}
        fase={janela?.tipo === 'fase' ? janela.fase : null}
        aoFechar={fechar}
        aoSalvar={recarregar}
      />
      <DialogoDeConfirmacao
        aberto={janela?.tipo === 'excluir-funil'}
        titulo={`Excluir o funil ${janela?.tipo === 'excluir-funil' ? janela.funil.nome : ''}?`}
        descricao="O funil e as fases dele deixam de aparecer. Esta ação não pode ser desfeita por aqui."
        rotuloDoBotao="Excluir funil"
        erro={erroDaExclusao}
        enviando={enviando}
        aoFechar={fechar}
        aoConfirmar={() => {
          if (janela?.tipo !== 'excluir-funil') return
          const { funil } = janela
          void excluir(() => servicos.funis.excluir(funil.id), `Funil ${funil.nome} excluído`)
        }}
      />
      <DialogoDeConfirmacao
        aberto={janela?.tipo === 'excluir-fase'}
        titulo={`Excluir a fase ${janela?.tipo === 'excluir-fase' ? janela.fase.nome : ''}?`}
        descricao="A fase deixa de aparecer no funil. Esta ação não pode ser desfeita por aqui. Fase que já teve oportunidades não se exclui: use Inativar."
        rotuloDoBotao="Excluir fase"
        erro={erroDaExclusao}
        enviando={enviando}
        aoFechar={fechar}
        aoConfirmar={() => {
          if (janela?.tipo !== 'excluir-fase') return
          const { fase } = janela
          void excluir(() => servicos.funis.excluirFase(fase.id), `Fase ${fase.nome} excluída`)
        }}
      />
    </div>
  )
}

function CartaoDoFunil({
  funil,
  primeiro,
  ultimo,
  desativado,
  aoMoverFunil,
  aoMoverFase,
  aoTornarPadrao,
  aoEditar,
  aoExcluir,
  aoCriarFase,
  aoEditarFase,
  aoExcluirFase,
  aoAlternarFase,
}: {
  funil: Funil
  primeiro: boolean
  ultimo: boolean
  desativado: boolean
  aoMoverFunil: (d: -1 | 1) => void
  aoMoverFase: (indice: number, d: -1 | 1) => void
  aoTornarPadrao: () => void
  aoEditar: () => void
  aoExcluir: () => void
  aoCriarFase: () => void
  aoEditarFase: (fase: Fase) => void
  aoExcluirFase: (fase: Fase) => void
  /** Inativa (ou reativa) a fase: a que já teve oportunidade só se inativa, não se exclui */
  aoAlternarFase: (fase: Fase) => void
}) {
  const umaFase = funil.fases.length <= 1
  // Máximo de fases ATIVAS por funil (as inativas não contam): sem espaço, nova e reativar ficam desligadas
  const cheio = funil.fases.filter((f) => f.ativo).length >= MAX_FASES_ATIVAS_POR_FUNIL
  return (
    <section
      aria-label={funil.nome}
      className="overflow-hidden rounded-lg border border-border bg-surface"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h3 className="m-0 text-[15px] leading-5 font-semibold">{funil.nome}</h3>
          {funil.padrao ? (
            <Badge tone="accent" icon={Star}>
              Funil padrão
            </Badge>
          ) : null}
          {funil.ativo ? null : <Badge tone="neutral">Inativo</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-0.5">
          {funil.padrao || !funil.ativo ? null : (
            <Button size="sm" disabled={desativado} onClick={aoTornarPadrao}>
              Tornar padrão
            </Button>
          )}
          <BotoesDeOrdem
            nome={`o funil ${funil.nome}`}
            primeiro={primeiro}
            ultimo={ultimo}
            desativado={desativado}
            aoMover={aoMoverFunil}
          />
          <IconButton
            size="sm"
            icon={Pencil}
            label={`Editar o funil ${funil.nome}`}
            onClick={aoEditar}
          />
          {funil.padrao ? null : (
            <IconButton
              size="sm"
              icon={Trash2}
              label={`Excluir o funil ${funil.nome}`}
              onClick={aoExcluir}
            />
          )}
        </div>
      </header>

      <ol className="m-0 flex list-none flex-col p-0">
        {funil.fases.map((fase, i) => (
          <li
            key={fase.id}
            aria-label={fase.nome}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 last:border-b-0"
          >
            <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span
                aria-hidden="true"
                className={cn('size-3 flex-none rounded-full', classeDaCor[fase.cor])}
                style={{ boxShadow: 'inset 0 0 0 1.5px currentColor' }}
              />
              <span className={cn('font-semibold', !fase.ativo && 'text-ink-muted')}>
                {fase.nome}
              </span>
              {fase.ativo ? null : <Badge tone="neutral">Inativa</Badge>}
              <span className="text-[13px] text-ink-muted tabular-nums">
                Probabilidade {fase.probabilidadePadrao}%
              </span>
              <span className="text-[13px] text-ink-muted">{textoDoAlerta(fase)}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <BotoesDeOrdem
                nome={`a fase ${fase.nome}`}
                primeiro={i === 0}
                ultimo={i === funil.fases.length - 1}
                desativado={desativado}
                aoMover={(d) => aoMoverFase(i, d)}
              />
              <IconButton
                size="sm"
                icon={Pencil}
                label={`Editar a fase ${fase.nome}`}
                onClick={() => aoEditarFase(fase)}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={!fase.ativo && cheio}
                onClick={() => aoAlternarFase(fase)}
              >
                {fase.ativo ? 'Inativar' : 'Reativar'}
                <span className="sr-only"> a fase {fase.nome}</span>
              </Button>
              {umaFase ? null : (
                <IconButton
                  size="sm"
                  icon={Trash2}
                  label={`Excluir a fase ${fase.nome}`}
                  onClick={() => aoExcluirFase(fase)}
                />
              )}
            </div>
          </li>
        ))}
      </ol>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-sunken px-4 py-2">
        <Button size="sm" icon={Plus} disabled={cheio} onClick={aoCriarFase}>
          Nova fase em {funil.nome}
        </Button>
        {cheio ? (
          <span className="text-[13px] text-ink-muted">
            Este funil já tem {MAX_FASES_ATIVAS_POR_FUNIL} fases ativas, o máximo. Inative uma para
            criar ou reativar outra.
          </span>
        ) : null}
        {umaFase ? (
          <span className="text-[13px] text-ink-muted">
            O funil precisa ter ao menos uma fase: a última não pode ser excluída nem inativada.
          </span>
        ) : null}
      </footer>
    </section>
  )
}

function DialogoDeFunil({
  aberto,
  funil,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  funil: Funil | null
  aoFechar: () => void
  aoSalvar: () => Promise<unknown>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const editando = funil !== null
  const [nome, setNome] = useState('')
  const [primeiraFase, setPrimeiraFase] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [tentou, setTentou] = useState(false)
  const [erroDoNome, setErroDoNome] = useState<string | undefined>()
  const [aviso, setAviso] = useState<string | undefined>()
  const [aberturaVista, setAberturaVista] = useState<string | null>(null)

  const chaveDaAbertura = aberto ? (funil?.id ?? 'novo') : null
  if (chaveDaAbertura !== aberturaVista) {
    setAberturaVista(chaveDaAbertura)
    if (aberto) {
      setNome(funil?.nome ?? '')
      setPrimeiraFase('')
      setAtivo(funil?.ativo ?? true)
      setTentou(false)
      setErroDoNome(undefined)
      setAviso(undefined)
    }
  }

  const nomeVazio = tentou && nome.trim() === ''
  const faseVazia = tentou && !editando && primeiraFase.trim() === ''
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (nome.trim() === '') return focarCampo('funil-nome')
    if (!editando && primeiraFase.trim() === '') return focarCampo('funil-primeira-fase')
    setErroDoNome(undefined)
    setAviso(undefined)
    void executar(async () => {
      const r = funil
        ? await servicos.funis.alterar(funil.id, { nome: nome.trim(), ativo })
        : await servicos.funis.criar({
            nome: nome.trim(),
            fases: [{ nome: primeiraFase.trim() }],
          })
      if (!r.ok) {
        if (r.erro.codigo === 'nome_duplicado') {
          setErroDoNome('Já existe um item com esse nome.')
          focarCampo('funil-nome')
        } else {
          setAviso(r.erro.mensagem)
        }
        return
      }
      toast.success(editando ? 'Funil atualizado' : 'Funil criado')
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
      title={editando ? `Editar o funil ${funil.nome}` : 'Novo funil'}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-funil" loading={enviando}>
            {editando ? 'Salvar' : 'Criar funil'}
          </Button>
        </>
      }
    >
      <form id="form-funil" noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id="funil-nome"
          label="Nome do funil"
          required
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder="Ex.: Renovação"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          error={nomeVazio ? 'Informe o nome do funil.' : erroDoNome}
        />
        {editando ? (
          <div className="flex flex-col gap-1">
            <Switch
              label="Funil ativo"
              checked={ativo}
              disabled={funil.padrao}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <span className="text-xs text-ink-muted">
              {funil.padrao
                ? 'O funil padrão não pode ser inativado: torne outro funil o padrão antes.'
                : 'Inativar tira o funil das escolhas sem apagar o histórico.'}
            </span>
          </div>
        ) : (
          <TextField
            id="funil-primeira-fase"
            label="Primeira fase"
            required
            autoComplete="off"
            maxLength={80}
            placeholder="Ex.: Qualificação"
            hint="As outras fases você acrescenta depois, no próprio funil."
            value={primeiraFase}
            onChange={(e) => setPrimeiraFase(e.target.value)}
            error={faseVazia ? 'Informe o nome da primeira fase.' : undefined}
          />
        )}
        {aviso ? (
          <Alert tone="danger" title="Não foi possível salvar">
            {aviso}
          </Alert>
        ) : null}
      </form>
    </Janela>
  )
}

/** Número inteiro digitado, ou null se vazio, ou NaN se inválido. */
const inteiroOuNulo = (texto: string): number | null => {
  const t = texto.trim()
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

function DialogoDeFase({
  aberto,
  funil,
  fase,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  funil: Funil | null
  fase: Fase | null
  aoFechar: () => void
  aoSalvar: () => Promise<unknown>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const editando = fase !== null
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState<CorDeTag>('gray')
  const [probabilidade, setProbabilidade] = useState('0')
  const [dias, setDias] = useState('')
  const [tentou, setTentou] = useState(false)
  const [erroDoNome, setErroDoNome] = useState<string | undefined>()
  const [aviso, setAviso] = useState<string | undefined>()
  const [aberturaVista, setAberturaVista] = useState<string | null>(null)

  const chaveDaAbertura = aberto ? (fase?.id ?? `nova-${funil?.id ?? ''}`) : null
  if (chaveDaAbertura !== aberturaVista) {
    setAberturaVista(chaveDaAbertura)
    if (aberto) {
      setNome(fase?.nome ?? '')
      setCor(fase?.cor ?? 'gray')
      setProbabilidade(String(fase?.probabilidadePadrao ?? 0))
      setDias(fase?.diasAlertaParada === null || !fase ? '' : String(fase.diasAlertaParada))
      setTentou(false)
      setErroDoNome(undefined)
      setAviso(undefined)
    }
  }

  const prob = inteiroOuNulo(probabilidade)
  const probInvalida = prob === null || Number.isNaN(prob) || prob > 100
  const alerta = inteiroOuNulo(dias)
  const alertaInvalido = alerta !== null && (Number.isNaN(alerta) || alerta < 1 || alerta > 3650)
  const nomeVazio = tentou && nome.trim() === ''

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (nome.trim() === '') return focarCampo('fase-nome')
    if (probInvalida) return focarCampo('fase-probabilidade')
    if (alertaInvalido) return focarCampo('fase-dias')
    if (!funil || prob === null) return
    setErroDoNome(undefined)
    setAviso(undefined)
    void executar(async () => {
      const dados = {
        nome: nome.trim(),
        cor,
        probabilidadePadrao: prob,
        diasAlertaParada: alerta,
      }
      const r = fase
        ? await servicos.funis.alterarFase(fase.id, dados)
        : await servicos.funis.criarFase(funil.id, dados)
      if (!r.ok) {
        if (r.erro.codigo === 'nome_duplicado') {
          setErroDoNome('Já existe uma fase com esse nome neste funil.')
          focarCampo('fase-nome')
        } else {
          setAviso(r.erro.mensagem)
        }
        return
      }
      toast.success(editando ? 'Fase atualizada' : 'Fase criada')
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
      title={editando ? `Editar a fase ${fase.nome}` : `Nova fase em ${funil?.nome ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-fase" loading={enviando}>
            {editando ? 'Salvar' : 'Criar fase'}
          </Button>
        </>
      }
    >
      <form id="form-fase" noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id="fase-nome"
          label="Nome da fase"
          required
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder="Ex.: Proposta"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          error={nomeVazio ? 'Informe o nome da fase.' : erroDoNome}
        />
        <SeletorDeCor label="Cor" value={cor} onChange={setCor} />
        <TextField
          id="fase-probabilidade"
          label="Probabilidade padrão (%)"
          required
          inputMode="numeric"
          value={probabilidade}
          hint="Sugerida quando a oportunidade entra na fase."
          onChange={(e) => setProbabilidade(e.target.value)}
          error={tentou && probInvalida ? 'Informe um número inteiro de 0 a 100.' : undefined}
        />
        <TextField
          id="fase-dias"
          label="Alerta de parada (dias)"
          inputMode="numeric"
          value={dias}
          hint="Destaca a oportunidade sem atividade há tantos dias nesta fase. Deixe vazio para não alertar."
          onChange={(e) => setDias(e.target.value)}
          error={
            tentou && alertaInvalido
              ? 'Informe um número inteiro de 1 em diante, ou deixe vazio.'
              : undefined
          }
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
