import type { RelatorioDeVisita } from '@leadtogo/api-client'
import { type CampoDeVisita, type SalvarVisitaEntrada, validarRespostas } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, CloudOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/campos'

import { Alert, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import {
  empresaOffline,
  enfileirar,
  type ItemDaFila,
  relatorioLocal,
  sincronizar,
} from '@/lib/offline/visitas'
import { Janela } from '@/telas/cadastros/base'

import { useApoioDasVisitas } from './apoio'
import { FormularioDoRelatorio, type Valores } from './formulario'
import { SelosDaVisita, VisaoDoRelatorio } from './visao'

const rota = getRouteApi('/_autenticado/visitas/$relatorioId')

/** A rota /visitas/:id: a chave refaz a tela ao trocar de relatório (o rascunho é de um relatório só). */
export function RelatorioDaRota() {
  const { relatorioId } = rota.useParams()
  return <TelaDoRelatorio key={relatorioId} id={relatorioId} />
}

/** O relatório da visita (G3b): online ou sem sinal, com o rascunho salvo a cada alteração. */
export function TelaDoRelatorio({ id }: { id: string }) {
  const servicos = useServicos()
  const local = useQuery({
    queryKey: ['visitas', 'local', id],
    retry: false,
    networkMode: 'always',
    queryFn: () => relatorioLocal(id).catch(() => null),
  })
  const remoto = useQuery({
    queryKey: ['visitas', 'relatorio', id],
    retry: false,
    networkMode: 'always',
    enabled: local.isSuccess,
    queryFn: async () => {
      const r = await servicos.visitas.campo.obter(id)
      if (r.ok) return r.dados
      // sem sinal ou ainda não subiu: vale o do aparelho
      if (r.erro.status === 0 || r.erro.status === 404) return null
      throw new Error(r.erro.mensagem)
    },
  })
  const apoio = useApoioDasVisitas()

  if (local.isPending || remoto.isPending || apoio.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6" role="status" aria-label="Carregando o relatório">
        <Skeleton lines={6} />
      </div>
    )
  }
  if (apoio.isError) {
    return (
      <Moldura titulo="Relatório de visita">
        <Alert tone="danger" title="Não foi possível abrir o relatório">
          {apoio.error.message}
        </Alert>
      </Moldura>
    )
  }
  const item = local.data ?? null
  const rel = remoto.data ?? null
  if (!item && !rel) {
    return (
      <Moldura titulo="Relatório de visita">
        <Alert tone="warning" title="Relatório não encontrado">
          {remoto.isError
            ? remoto.error.message
            : 'Ele não está neste aparelho nem no servidor (ou você não tem acesso).'}
        </Alert>
      </Moldura>
    )
  }
  // concluído no servidor (e nada pendente no aparelho): só leitura
  if (rel?.situacao === 'concluido' && !item) {
    return (
      <Moldura titulo={`Visita a ${rel.empresa.nome}`} empresaId={rel.empresa.id}>
        <SelosDaVisita relatorio={rel} />
        <VisaoDoRelatorio relatorio={rel} />
      </Moldura>
    )
  }
  return <Edicao id={id} item={item} relatorio={rel} />
}

function Moldura({
  titulo,
  empresaId,
  children,
}: {
  titulo: string
  empresaId?: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 p-6 max-md:p-4">
      <div className="flex flex-col gap-1">
        {empresaId ? (
          <Link
            to="/empresas/$empresaId"
            params={{ empresaId }}
            className="inline-flex items-center gap-1 text-[13px] text-ink-muted"
          >
            <ArrowLeft size={14} aria-hidden="true" /> Ficha da empresa
          </Link>
        ) : (
          <Link to="/visitas" className="inline-flex items-center gap-1 text-[13px] text-ink-muted">
            <ArrowLeft size={14} aria-hidden="true" /> Relatórios pendentes
          </Link>
        )}
        <h1 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.01em] max-md:text-[22px] max-md:leading-7">
          {titulo}
        </h1>
      </div>
      {children}
    </div>
  )
}

const respostasDe = (valores: Valores) =>
  Object.entries(valores)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([campoId, valor]) => ({ campoId, valor }))

function Edicao({
  id,
  item,
  relatorio,
}: {
  id: string
  item: ItemDaFila | null
  relatorio: RelatorioDeVisita | null
}) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const apoio = useApoioDasVisitas()
  const empresaId = item?.dados.empresaId ?? relatorio?.empresa.id ?? ''
  const empresaNome = item?.empresaNome ?? relatorio?.empresa.nome ?? 'empresa'
  const empresa = useQuery({
    queryKey: ['visitas', 'empresa', empresaId],
    retry: false,
    networkMode: 'always',
    queryFn: async () => {
      // com sinal, atualiza o que o aparelho guarda da empresa (contatos novos, por exemplo)
      if (navigator.onLine) {
        const r = await servicos.visitas.campo.offline([empresaId])
        if (r.ok && r.dados.empresas[0]) return r.dados.empresas[0]
      }
      return empresaOffline(empresaId).catch(() => null)
    },
  })

  const [resultadoId, setResultadoId] = useState<string>(
    item?.dados.resultadoId ?? relatorio?.resultado?.id ?? '',
  )
  const [valores, setValores] = useState<Valores>(() =>
    Object.fromEntries(
      (item?.dados.respostas ?? relatorio?.respostas ?? []).map((r) => [r.campoId, r.valor]),
    ),
  )
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | undefined>(item?.erro)
  const [enviando, setEnviando] = useState(false)
  const [perguntarInativo, setPerguntarInativo] = useState(false)
  const [salvoEm, setSalvoEm] = useState<Date | null>(null)

  const dados = apoio.data
  const resultado = dados?.resultados.find((r) => r.id === resultadoId)
  const campos: CampoDeVisita[] = useMemo(() => {
    if (!resultado || !dados) return []
    // o rascunho que já tinha esta versão continua nela; senão, a atual do modelo do resultado
    if (relatorio?.resultado?.id === resultadoId && relatorio.modeloVersao) {
      return relatorio.modeloVersao.campos
    }
    const modelo = dados.modelos.find((m) => m.id === resultado.modeloId)
    return modelo?.versaoAtual.campos ?? []
  }, [resultado, dados, relatorio, resultadoId])

  const base: Omit<SalvarVisitaEntrada, 'resultadoId' | 'respostas' | 'concluir'> = item?.dados ?? {
    empresaId,
    checkin: null,
  }

  // Rascunho: grava no aparelho a cada alteração (0,8 s depois da última) e sobe se houver sinal
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      return
    }
    const t = setTimeout(() => {
      void (async () => {
        await enfileirar({
          id,
          empresaNome,
          dados: {
            ...base,
            resultadoId: resultadoId || null,
            respostas: respostasDe(valores),
            concluir: false,
          },
        })
        setSalvoEm(new Date())
        if (navigator.onLine) await sincronizar(servicos)
      })()
    }, 800)
    return () => clearTimeout(t)
    // `base` muda junto com `item`; o que dispara é o que a pessoa altera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultadoId, valores])

  const concluir = async (inativarEmpresa: boolean) => {
    setErroGeral(undefined)
    if (!resultadoId) {
      setErroGeral('Escolha o resultado da visita.')
      return
    }
    const respostas = respostasDe(valores)
    const v = validarRespostas(campos, respostas, true)
    if (v.erros.length > 0) {
      setErros(Object.fromEntries(v.erros.map((e) => [e.campoId, e.mensagem])))
      setErroGeral('Confira os campos destacados.')
      document.getElementById(`campo-${v.erros[0]?.campoId}`)?.focus()
      return
    }
    setErros({})
    setEnviando(true)
    await enfileirar({
      id,
      empresaNome,
      dados: { ...base, resultadoId, respostas, concluir: true, inativarEmpresa },
    })
    const r = navigator.onLine ? await sincronizar(servicos) : null
    setEnviando(false)
    const recusa = r?.recusados.find((x) => x.id === id)
    if (recusa) {
      setErroGeral(recusa.mensagem)
      return
    }
    const subiu = r?.enviados.some((x) => x.id === id) ?? false
    toast.success(
      'Relatório concluído',
      subiu
        ? undefined
        : { description: 'Sem sinal: fica no aparelho e sobe quando a conexão voltar.' },
    )
    await queryClient.invalidateQueries({ queryKey: ['visitas'] })
    await queryClient.invalidateQueries({ queryKey: ['carteira'] })
    await navegar(
      subiu ? { to: '/empresas/$empresaId', params: { empresaId } } : { to: '/visitas' },
    )
  }

  const pedirConclusao = () => {
    if (resultado?.chaveSistema === 'encerrada') setPerguntarInativo(true)
    else void concluir(false)
  }

  if (!dados) return null
  const opcoes = {
    contatos: empresa.data?.contatos ?? [],
    tiposAtividade: dados.tiposAtividade,
    verticais: dados.verticais,
    tags: new Map((empresa.data?.tags ?? []).map((t) => [t.id, t.nome] as const)),
  }

  return (
    <Moldura titulo={`Visita a ${empresaNome}`} empresaId={empresaId}>
      {relatorio ? <SelosDaVisita relatorio={relatorio} /> : null}
      {!relatorio && item ? (
        <p className="m-0 inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
          <CloudOff size={14} aria-hidden="true" /> Ainda no aparelho: sobe quando houver sinal.
        </p>
      ) : null}
      {erroGeral ? (
        <Alert tone="danger" title="Não foi possível concluir">
          {erroGeral}
        </Alert>
      ) : null}
      <form
        noValidate
        aria-label="Relatório da visita"
        onSubmit={(e) => {
          e.preventDefault()
          pedirConclusao()
        }}
        className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4"
      >
        <Select
          id="relatorio-resultado"
          label="Resultado da visita"
          required
          placeholder="Escolha o resultado"
          value={resultadoId}
          options={dados.resultados.map((r) => ({ value: r.id, label: r.nome }))}
          onChange={(e) => setResultadoId(e.target.value)}
        />
        {resultado?.chaveSistema === 'nao_localizada' ? (
          <Alert tone="info" title="Empresa não localizada">
            A visita conta como atividade realizada, mas a empresa não fica como visitada: ela
            recebe "Endereço a confirmar" e aparece como visita tentada no mapa. Explique no
            relatório o que aconteceu.
          </Alert>
        ) : null}
        {resultado ? (
          campos.length ? (
            <FormularioDoRelatorio
              campos={campos}
              valores={valores}
              erros={erros}
              opcoes={opcoes}
              desativado={enviando}
              aoMudar={(campoId, valor) => setValores((v) => ({ ...v, [campoId]: valor }))}
            />
          ) : (
            <p className="m-0 text-sm text-ink-muted">Este resultado não pede mais nada.</p>
          )
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={enviando} disabled={!resultadoId}>
            Concluir relatório
          </Button>
          <span className="text-xs text-ink-muted" aria-live="polite">
            {salvoEm
              ? `Rascunho salvo às ${salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </span>
        </div>
      </form>
      <Janela
        open={perguntarInativo}
        onOpenChange={(o) => {
          if (!o) setPerguntarInativo(false)
        }}
        title="Mudar a empresa para Inativo?"
        description="A empresa encerrou as atividades. O Status passa a Inativo (dá para mudar depois na ficha)."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPerguntarInativo(false)
                void concluir(false)
              }}
            >
              Não, só concluir
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setPerguntarInativo(false)
                void concluir(true)
              }}
            >
              Sim, mudar para Inativo
            </Button>
          </>
        }
      />
    </Moldura>
  )
}
