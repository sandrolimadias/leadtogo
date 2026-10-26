import type { PerfilDeImportacao } from '@leadtogo/api-client'
import {
  type AcaoForaDoPerfil,
  type CnaeInvalido,
  type EstabelecimentoDoPerfil,
  formatarCnae,
  interpretarCnaes,
  MAX_CNAES_DO_PERFIL,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { ACOES, ESTABELECIMENTOS, resumoDoPerfil } from './rotulos-do-perfil'
import { focarCampo, useEnvio } from '@/telas/acesso/comum'
import {
  CabecalhoDeSecao,
  Carregamento,
  DialogoDeConfirmacao,
  Janela,
} from '@/telas/cadastros/base'

type Janelas =
  | { tipo: 'form'; perfil: PerfilDeImportacao | null }
  | { tipo: 'excluir'; perfil: PerfilDeImportacao }

/** Configurações → Importação: os perfis de regras que a importação de planilha aplica. */
export function TelaDePerfisDeImportacao() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const chave = ['importacao', 'perfis'] as const
  const consulta = useQuery({
    queryKey: chave,
    retry: false,
    queryFn: async () => {
      const r = await servicos.importacao.perfis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [janela, setJanela] = useState<Janelas | null>(null)
  const [erroDaExclusao, setErroDaExclusao] = useState<string | undefined>()
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave })
  const fechar = () => {
    setJanela(null)
    setErroDaExclusao(undefined)
  }
  const excluir = (p: PerfilDeImportacao) =>
    executar(async () => {
      const res = await servicos.importacao.perfis.excluir(p.id)
      if (!res.ok) {
        setErroDaExclusao(res.erro.mensagem)
        return
      }
      toast.success(`Perfil ${p.nome} excluído`)
      fechar()
      await recarregar()
    })

  const cabecalho = (
    <CabecalhoDeSecao
      titulo="Importação"
      descricao="Perfis de regras: quais empresas da planilha entram na carteira e o que fazer com as que ficam de fora."
      acao={
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setJanela({ tipo: 'form', perfil: null })}
        >
          Novo perfil
        </Button>
      }
    />
  )
  const perfis = consulta.data ?? []

  return (
    <section aria-label="Importação" className="flex flex-col gap-4">
      <Carregamento consulta={consulta} rotulo="os perfis de importação" cabecalho={cabecalho}>
        {cabecalho}
        {perfis.length ? (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0">
            {perfis.map((p) => (
              <li
                key={p.id}
                aria-label={p.nome}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0"
                style={p.ativo ? undefined : { background: 'var(--surface-sunken)' }}
              >
                <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{p.nome}</span>
                    {p.ativo ? null : <Badge tone="neutral">Inativo</Badge>}
                  </div>
                  <span className="text-xs text-ink-muted">{resumoDoPerfil(p)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton
                    size="sm"
                    icon={Pencil}
                    label={`Editar perfil ${p.nome}`}
                    onClick={() => setJanela({ tipo: 'form', perfil: p })}
                  />
                  <IconButton
                    size="sm"
                    icon={Trash2}
                    label={`Excluir perfil ${p.nome}`}
                    onClick={() => setJanela({ tipo: 'excluir', perfil: p })}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState
              icon={FileSpreadsheet}
              title="Nenhum perfil ainda"
              description="Crie um perfil com as regras da sua carteira (situação, matriz ou filial, MEI e CNAEs) para aplicar nas importações. Também dá para importar sem regras."
              actions={
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setJanela({ tipo: 'form', perfil: null })}
                >
                  Novo perfil
                </Button>
              }
            />
          </div>
        )}
      </Carregamento>

      <DialogoDoPerfil
        aberto={janela?.tipo === 'form'}
        perfil={janela?.tipo === 'form' ? janela.perfil : null}
        aoFechar={fechar}
        aoSalvar={recarregar}
      />
      <DialogoDeConfirmacao
        aberto={janela?.tipo === 'excluir'}
        titulo={`Excluir perfil ${janela?.tipo === 'excluir' ? janela.perfil.nome : ''}?`}
        descricao="Só se exclui um perfil que nunca foi usado numa importação; os já usados só se inativam."
        rotuloDoBotao="Excluir"
        erro={erroDaExclusao}
        enviando={enviando}
        aoFechar={fechar}
        aoConfirmar={() => {
          if (janela?.tipo === 'excluir') void excluir(janela.perfil)
        }}
      />
    </section>
  )
}

interface Estado {
  nome: string
  exigeSituacaoAtiva: boolean
  estabelecimento: EstabelecimentoDoPerfil
  excluirMei: boolean
  cnaesTexto: string
  aceitarCnaeSecundario: boolean
  acaoForaDoPerfil: AcaoForaDoPerfil
  ativo: boolean
}

const estadoInicial = (p: PerfilDeImportacao | null): Estado => ({
  nome: p?.nome ?? '',
  exigeSituacaoAtiva: p?.exigeSituacaoAtiva ?? true,
  estabelecimento: p?.estabelecimento ?? 'ambas',
  excluirMei: p?.excluirMei ?? false,
  cnaesTexto: (p?.cnaes ?? []).map(formatarCnae).join('\n'),
  aceitarCnaeSecundario: p?.aceitarCnaeSecundario ?? false,
  acaoForaDoPerfil: p?.acaoForaDoPerfil ?? 'pular',
  ativo: p?.ativo ?? true,
})

/** O que a conferência dos CNAEs colados mostrou. */
interface ConferenciaDosCnaes {
  validos: number
  invalidos: CnaeInvalido[]
  repetidos: number
}

function DialogoDoPerfil({
  aberto,
  perfil,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  perfil: PerfilDeImportacao | null
  aoFechar: () => void
  aoSalvar: () => Promise<unknown>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const editando = perfil !== null
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(null))
  const [tentou, setTentou] = useState(false)
  const [erroDoNome, setErroDoNome] = useState<string | undefined>()
  const [aviso, setAviso] = useState<string | undefined>()
  const [conferencia, setConferencia] = useState<ConferenciaDosCnaes | undefined>()
  const [aberturaVista, setAberturaVista] = useState<string | null>(null)

  // Preenche o formulário na abertura (e só nela): ajuste no render, sem efeito
  const chaveDaAbertura = aberto ? (perfil?.id ?? 'novo') : null
  if (chaveDaAbertura !== aberturaVista) {
    setAberturaVista(chaveDaAbertura)
    if (aberto) {
      setEstado(estadoInicial(perfil))
      setTentou(false)
      setErroDoNome(undefined)
      setAviso(undefined)
      setConferencia(undefined)
    }
  }

  const mudar = (parcial: Partial<Estado>) => {
    setEstado((a) => ({ ...a, ...parcial }))
    // Mexeu na lista: a conferência anterior já não vale
    if ('cnaesTexto' in parcial) setConferencia(undefined)
  }

  /** Lê o texto e confere na tabela de CNAEs; devolve os códigos só se tudo for válido. */
  const conferir = async (): Promise<number[] | null> => {
    const lido = interpretarCnaes(estado.cnaesTexto)
    if (lido.codigos.length > MAX_CNAES_DO_PERFIL) {
      setConferencia({
        validos: lido.codigos.length,
        repetidos: lido.repetidos,
        invalidos: [
          { texto: `${lido.codigos.length} códigos`, motivo: `o limite é ${MAX_CNAES_DO_PERFIL}` },
        ],
      })
      return null
    }
    if (lido.codigos.length === 0 && lido.invalidos.length === 0) {
      setConferencia(undefined)
      return []
    }
    const res = await servicos.importacao.perfis.conferirCnaes(estado.cnaesTexto)
    if (!res.ok) {
      setAviso(res.erro.mensagem)
      return null
    }
    setConferencia({
      validos: res.dados.validos.length,
      invalidos: res.dados.invalidos,
      repetidos: res.dados.repetidos,
    })
    return res.dados.invalidos.length > 0 ? null : res.dados.validos.map((v) => v.codigo)
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (estado.nome.trim() === '') return focarCampo('perfil-nome')
    setErroDoNome(undefined)
    setAviso(undefined)
    void executar(async () => {
      const cnaes = await conferir()
      if (cnaes === null) return focarCampo('perfil-cnaes')
      const regras = {
        nome: estado.nome.trim(),
        exigeSituacaoAtiva: estado.exigeSituacaoAtiva,
        estabelecimento: estado.estabelecimento,
        excluirMei: estado.excluirMei,
        cnaes,
        aceitarCnaeSecundario: estado.aceitarCnaeSecundario,
        acaoForaDoPerfil: estado.acaoForaDoPerfil,
      }
      const res = perfil
        ? await servicos.importacao.perfis.alterar(perfil.id, { ...regras, ativo: estado.ativo })
        : await servicos.importacao.perfis.criar(regras)
      if (!res.ok) {
        if (res.erro.codigo === 'nome_duplicado') {
          setErroDoNome('Já existe um perfil com esse nome.')
          focarCampo('perfil-nome')
        } else setAviso(res.erro.mensagem)
        return
      }
      toast.success(editando ? 'Perfil atualizado' : 'Perfil criado')
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
      title={editando ? `Editar perfil ${perfil.nome}` : 'Novo perfil'}
      description="As regras valem depois da consulta à Receita. Empresa não ativa na Receita continua bloqueada enquanto o bloqueio de Configurações → Carteira estiver ligado, mesmo com a situação liberada aqui."
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-perfil" loading={enviando}>
            {editando ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="form-perfil" noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id="perfil-nome"
          label="Nome"
          required
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder="Ex.: Metalurgia do Sudeste"
          value={estado.nome}
          onChange={(e) => mudar({ nome: e.target.value })}
          error={tentou && estado.nome.trim() === '' ? 'Informe o nome.' : erroDoNome}
        />
        <Switch
          label="Só empresas com situação ativa na Receita"
          checked={estado.exigeSituacaoAtiva}
          onChange={(e) => mudar({ exigeSituacaoAtiva: e.target.checked })}
        />
        <Select
          label="Matriz ou filial"
          value={estado.estabelecimento}
          options={ESTABELECIMENTOS}
          onChange={(e) => mudar({ estabelecimento: e.target.value as EstabelecimentoDoPerfil })}
        />
        <Switch
          label="Excluir MEI"
          checked={estado.excluirMei}
          onChange={(e) => mudar({ excluirMei: e.target.checked })}
        />
        <div className="flex flex-col gap-2">
          <TextArea
            id="perfil-cnaes"
            label="CNAEs aceitos"
            mono
            rows={6}
            placeholder={
              'Cole os códigos, um por linha ou separados por vírgula.\nEx.: 0710-3/01, 2539001, 710301'
            }
            hint="Aceita 6 ou 7 dígitos, com ou sem pontuação. Vazio aceita qualquer CNAE."
            value={estado.cnaesTexto}
            onChange={(e) => mudar({ cnaesTexto: e.target.value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={enviando}
              onClick={() => void executar(async () => void (await conferir()))}
            >
              Conferir CNAEs
            </Button>
            {conferencia ? <ResumoDaConferencia c={conferencia} /> : null}
          </div>
          {conferencia && conferencia.invalidos.length > 0 ? (
            <Alert tone="warning" title="Corrija os códigos abaixo antes de salvar">
              <ul className="m-0 list-none p-0">
                {conferencia.invalidos.map((i) => (
                  <li key={`${i.texto}-${i.motivo}`}>
                    <span className="font-mono">{i.texto}</span>: {i.motivo}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
        </div>
        <Switch
          label="Aceitar o CNAE também entre os secundários"
          checked={estado.aceitarCnaeSecundario}
          onChange={(e) => mudar({ aceitarCnaeSecundario: e.target.checked })}
        />
        <Select
          label="Quem não passa nas regras"
          value={estado.acaoForaDoPerfil}
          options={ACOES}
          onChange={(e) => mudar({ acaoForaDoPerfil: e.target.value as AcaoForaDoPerfil })}
        />
        {editando ? (
          <div className="flex flex-col gap-1">
            <Switch
              label="Ativo"
              checked={estado.ativo}
              onChange={(e) => mudar({ ativo: e.target.checked })}
            />
            <span className="text-xs text-ink-muted">
              Inativar tira das escolhas da importação, sem apagar o histórico.
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

function ResumoDaConferencia({ c }: { c: ConferenciaDosCnaes }) {
  const partes = [`${c.validos} ${c.validos === 1 ? 'CNAE válido' : 'CNAEs válidos'}`]
  if (c.invalidos.length) {
    partes.push(`${c.invalidos.length} ${c.invalidos.length === 1 ? 'inválido' : 'inválidos'}`)
  }
  if (c.repetidos)
    partes.push(
      `${c.repetidos} ${c.repetidos === 1 ? 'repetido' : 'repetidos'} ignorado${c.repetidos === 1 ? '' : 's'}`,
    )
  return (
    <span role="status" className="text-xs text-ink-muted">
      {partes.join(' · ')}
    </span>
  )
}
