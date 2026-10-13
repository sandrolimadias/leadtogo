import type { ConsultaReceita } from '@leadtogo/api-client'
import { cnpjValido, cpfValido, normalizarCnpj, normalizarCpf } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { useDispositivo } from '@/casca/dispositivo'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Badge } from '@/components/ui/exibicao'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

import { dataCurta } from './formatos'
import {
  corpoDoCadastro,
  type Formulario,
  formularioDaReceita,
  formularioVazio,
  mascararCnpj,
  mascararCpf,
  type TipoDeDocumento,
} from './nova-empresa-dados'
import { DadosDaCarteira, DadosDaEmpresa, Passo } from './nova-empresa-partes'

/**
 * Onde a tela está:
 *  - `inicio`: ainda sem consulta · `consultando` · `encontrada` (dados da Receita, empresa ativa)
 *  - `bloqueada`: a Receita diz que a empresa não está ativa e a empresa bloqueia esse cadastro
 *  - `duplicada`: o documento já está na carteira · `falha`: a Receita não respondeu
 *  - `manual`: sem a Receita (a pessoa escolheu preencher à mão)
 */
type Fase =
  | { fase: 'inicio' }
  | { fase: 'consultando' }
  | { fase: 'encontrada' }
  | { fase: 'bloqueada'; motivo: string }
  | { fase: 'duplicada'; existente: { id: string | null; nome: string | null } }
  | { fase: 'falha' }
  | { fase: 'manual' }

const OPCOES_DE_DOCUMENTO = [
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'cpf', label: 'CPF' },
  { value: 'nenhum', label: 'Sem documento' },
]

/** Descrição da situação cadastral: "Ativa desde 19/06/2015". */
function descricaoDaSituacao(c: ConsultaReceita): string {
  const s = c.dados.situacao
  const nome = s.descricao.charAt(0) + s.descricao.slice(1).toLowerCase()
  const desde = s.desde ? ` desde ${dataCurta(`${s.desde}T12:00:00`)}` : ''
  const motivo = s.motivo && !s.ativa ? ` (${s.motivo})` : ''
  return `${nome}${desde}${motivo}`
}

/** Nova empresa: documento (com consulta à Receita), conferência dos dados e carteira. */
export function NovaEmpresa() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const celular = useDispositivo() === 'celular'

  const [tipo, setTipo] = useState<TipoDeDocumento>('cnpj')
  const [documento, setDocumento] = useState('')
  const [erroDoDocumento, setErroDoDocumento] = useState<string>()
  const [estado, setEstado] = useState<Fase>({ fase: 'inicio' })
  const [consulta, setConsulta] = useState<ConsultaReceita | null>(null)
  const [f, setF] = useState<Formulario>(formularioVazio())
  const [salvando, setSalvando] = useState(false)
  const [erroAoSalvar, setErroAoSalvar] = useState<string>()

  const mudar = (patch: Partial<Formulario>) => setF((atual) => ({ ...atual, ...patch }))

  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me }).data
  const papel = me?.empresas.find((e) => e.ativa)?.papel
  const opcoes = useQuery({
    queryKey: ['carteira', 'opcoes'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.opcoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  }).data
  const verticais = useQuery({
    queryKey: ['cadastros', 'verticais'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.verticais.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  }).data
  const grupos = useQuery({
    queryKey: ['cadastros', 'tags'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.tags.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  }).data

  const grupoStatus = grupos?.find((g) => g.tags.some((t) => t.chaveSistema === 'lead'))
  const status = (grupoStatus?.tags ?? [])
    .filter((t) => t.ativo)
    .map((t) => ({ value: t.id, label: t.nome }))
  const idDoLead = grupoStatus?.tags.find((t) => t.chaveSistema === 'lead')?.id ?? ''
  // O Status começa em Lead (decisão do cadastro)
  const statusEscolhido = f.statusTagId || idDoLead

  const mostraVendedor = opcoes ? !opcoes.unicoMembro && papel !== 'vendedor' : false
  const vendedores = mostraVendedor
    ? (opcoes?.vendedores ?? []).map((v) => ({ value: v.id, label: v.nome }))
    : null

  const reiniciar = (novoTipo: TipoDeDocumento) => {
    setTipo(novoTipo)
    setDocumento('')
    setErroDoDocumento(undefined)
    setEstado({ fase: 'inicio' })
    setConsulta(null)
    setF(formularioVazio())
    setErroAoSalvar(undefined)
  }

  const aoDigitar = (valor: string) => {
    setDocumento(tipo === 'cnpj' ? mascararCnpj(valor) : mascararCpf(valor))
    setErroDoDocumento(undefined)
    setErroAoSalvar(undefined)
    // mexeu no documento depois de consultar: os dados da consulta não valem mais
    if (estado.fase !== 'inicio' && estado.fase !== 'consultando') {
      setEstado({ fase: 'inicio' })
      setConsulta(null)
      setF(formularioVazio())
    }
  }

  const consultar = async () => {
    const cnpj = normalizarCnpj(documento)
    if (cnpj.length !== 14) {
      setErroDoDocumento('Informe os 14 caracteres do CNPJ, como 12.424.587/0001-45.')
      return
    }
    if (!cnpjValido(cnpj)) {
      setErroDoDocumento('CNPJ inválido. Confira os dígitos.')
      return
    }
    setErroDoDocumento(undefined)
    setErroAoSalvar(undefined)
    setEstado({ fase: 'consultando' })

    // Já está na carteira? A lista respeita a regra de carteira: só acha o que a pessoa vê
    const existentes = await servicos.carteira.listar({ busca: cnpj, porPagina: 5 })
    const repetida = existentes.ok ? existentes.dados.itens.find((i) => i.documento === cnpj) : null
    if (repetida) {
      setEstado({ fase: 'duplicada', existente: { id: repetida.id, nome: repetida.nome } })
      return
    }

    const r = await servicos.carteira.consultarCnpj(cnpj)
    if (!r.ok) {
      if (r.erro.codigo === 'receita_indisponivel' || r.erro.status === 0) {
        setEstado({ fase: 'falha' })
      } else {
        setEstado({ fase: 'inicio' })
        setErroDoDocumento(r.erro.mensagem)
      }
      return
    }
    setConsulta(r.dados)
    setF(formularioDaReceita(r.dados.dados))
    setEstado(
      r.dados.cadastroBloqueado
        ? { fase: 'bloqueada', motivo: descricaoDaSituacao(r.dados) }
        : { fase: 'encontrada' },
    )
  }

  const preencherAMao = () => {
    setConsulta(null)
    setF(formularioVazio())
    setEstado({ fase: 'manual' })
  }

  const cpfCompleto = normalizarCpf(documento).length === 11
  const erroDoCpf =
    tipo === 'cpf' && cpfCompleto && !cpfValido(documento)
      ? 'CPF inválido. Confira os 11 números.'
      : undefined
  const formularioVisivel =
    tipo === 'nenhum' ||
    (tipo === 'cpf' && cpfCompleto && !erroDoCpf) ||
    (tipo === 'cnpj' &&
      (estado.fase === 'encontrada' || estado.fase === 'bloqueada' || estado.fase === 'manual'))
  const daReceita = consulta !== null
  const podeSalvar =
    formularioVisivel &&
    estado.fase !== 'bloqueada' &&
    f.razaoSocial.trim().length >= 2 &&
    !salvando

  const salvar = async () => {
    setSalvando(true)
    setErroAoSalvar(undefined)
    const r = await servicos.carteira.criar(
      corpoDoCadastro(tipo, documento, { ...f, statusTagId: statusEscolhido }),
    )
    setSalvando(false)
    if (r.ok) {
      const nomeDoStatus = status.find((s) => s.value === statusEscolhido)?.label ?? 'Lead'
      toast.success('Empresa cadastrada', {
        description: `${r.dados.nome} entrou na carteira como ${nomeDoStatus}.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['carteira'] })
      void navegar({ to: '/empresas' })
      return
    }
    if (r.erro.codigo === 'empresa_ja_cadastrada') {
      const existente = (r.erro.dados?.['existente'] ?? {}) as {
        visivel?: boolean
        id?: string
        nome?: string
      }
      setEstado({
        fase: 'duplicada',
        existente: {
          id: existente.visivel ? (existente.id ?? null) : null,
          nome: existente.nome ?? null,
        },
      })
      return
    }
    if (r.erro.codigo === 'empresa_nao_ativa') {
      setEstado({ fase: 'bloqueada', motivo: r.erro.mensagem })
      return
    }
    setErroAoSalvar(r.erro.mensagem)
  }

  const abrirFicha = (id: string) =>
    void navegar({ to: '/empresas/$empresaId', params: { empresaId: id } })

  const consultando = estado.fase === 'consultando'
  const rotuloDoDocumento = tipo === 'cnpj' ? 'CNPJ' : 'CPF'

  return (
    <div className="flex min-h-full flex-col">
      <main className="flex w-full max-w-[980px] flex-1 flex-col gap-4 p-6 max-md:p-4">
        <div className={cn('flex flex-col gap-1', celular && 'sr-only')}>
          <nav
            aria-label="Você está em"
            className="flex items-center gap-1.5 text-[13px] text-ink-muted"
          >
            <Link to="/empresas" className="text-ink-muted">
              Empresas
            </Link>
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-ink">Nova empresa</span>
          </nav>
          <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em]">
            Nova empresa
          </h1>
        </div>

        <Passo
          numero={1}
          titulo="Documento"
          direita={
            <SegmentedControl
              label="Tipo de documento"
              options={OPCOES_DE_DOCUMENTO}
              value={tipo}
              onChange={(v) => reiniciar(v as TipoDeDocumento)}
            />
          }
        >
          {tipo === 'nenhum' ? (
            <p className="m-0 text-sm text-ink-muted">
              A empresa será cadastrada sem documento. Dá para informar o nome e os dados abaixo.
            </p>
          ) : (
            <div className="max-w-[520px]">
              <TextField
                label={rotuloDoDocumento}
                required
                mono
                placeholder={tipo === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                value={documento}
                onChange={(e) => aoDigitar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tipo === 'cnpj') void consultar()
                }}
                error={erroDoDocumento ?? erroDoCpf}
                hint={
                  tipo === 'cnpj'
                    ? 'Aceita o CNPJ alfanumérico. Os dados vêm da Minha Receita.'
                    : 'CPF não passa pela Receita: preencha os dados abaixo.'
                }
                suffix={
                  tipo === 'cnpj' ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={consultando ? undefined : Search}
                      loading={consultando}
                      onClick={() => void consultar()}
                    >
                      {consultando ? 'Consultando…' : 'Consultar'}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}

          {estado.fase === 'duplicada' ? (
            <Alert
              tone="warning"
              title="Esta empresa já está no CRM"
              actions={
                estado.existente.id ? (
                  <Button size="sm" onClick={() => abrirFicha(estado.existente.id as string)}>
                    Abrir ficha
                  </Button>
                ) : undefined
              }
            >
              {estado.existente.id
                ? `${estado.existente.nome ?? 'Esta empresa'} já está cadastrada. Abra a ficha em vez de cadastrar de novo.`
                : 'Este documento já está cadastrado na carteira de outro vendedor.'}
            </Alert>
          ) : null}
          {estado.fase === 'falha' ? (
            <Alert
              tone="danger"
              title="A Receita não respondeu"
              actions={
                <Button size="sm" onClick={preencherAMao}>
                  Preencher à mão
                </Button>
              }
            >
              Tente de novo em alguns minutos ou preencha à mão. A empresa fica marcada como
              "situação não verificada" e o sistema confere a Receita depois.
            </Alert>
          ) : null}
          {erroDoDocumento &&
          tipo === 'cnpj' &&
          estado.fase === 'inicio' &&
          documento.length === 18 ? (
            <div>
              <Button size="sm" onClick={preencherAMao}>
                Preencher à mão
              </Button>
            </div>
          ) : null}
          {consultando ? (
            <div
              role="status"
              aria-label="Consultando a Receita"
              className="grid grid-cols-2 gap-4 max-md:grid-cols-1"
            >
              <Skeleton lines={3} />
              <Skeleton lines={3} />
            </div>
          ) : null}
        </Passo>

        {estado.fase === 'bloqueada' ? (
          <Alert tone="danger" title="Empresa não ativa na Receita">
            {estado.motivo}. O cadastro de empresa que não está ativa na Receita está bloqueado
            nesta empresa; quem administra pode mudar isso em Configurações.
          </Alert>
        ) : null}
        {estado.fase === 'encontrada' && consulta ? (
          consulta.dados.situacao.ativa ? (
            <Alert tone="success" title="Dados preenchidos pela Receita">
              Situação cadastral: {descricaoDaSituacao(consulta)}. Confira e complete antes de
              salvar.
              {consulta.expirada
                ? ' A Receita não respondeu agora: estes dados são de uma consulta antiga e a situação pode ter mudado.'
                : ''}
            </Alert>
          ) : (
            <Alert tone="warning" title="Empresa não ativa na Receita">
              Situação cadastral: {descricaoDaSituacao(consulta)}. Esta empresa permite cadastrar
              empresa não ativa; confira antes de salvar.
            </Alert>
          )
        ) : null}

        {formularioVisivel ? (
          <>
            <Passo
              numero={2}
              titulo={daReceita ? 'Conferir dados da Receita' : 'Dados da empresa'}
              direita={
                consulta ? (
                  <>
                    <Badge
                      tone={consulta.dados.situacao.ativa ? 'success' : 'danger'}
                      {...(consulta.dados.situacao.ativa ? { icon: Check } : {})}
                    >
                      {consulta.dados.situacao.ativa ? 'Ativa' : consulta.dados.situacao.descricao}
                    </Badge>
                    <Badge tone="outline">
                      {consulta.dados.matrizFilial === 'matriz' ? 'Matriz' : 'Filial'}
                    </Badge>
                  </>
                ) : undefined
              }
            >
              <DadosDaEmpresa
                f={f}
                mudar={mudar}
                daReceita={daReceita}
                rotuloDoNome={tipo === 'cnpj' ? 'Razão social' : 'Nome'}
              />
            </Passo>

            {estado.fase === 'bloqueada' ? null : (
              <Passo numero={3} titulo="Carteira">
                <DadosDaCarteira
                  f={{ ...f, statusTagId: statusEscolhido }}
                  mudar={mudar}
                  vendedores={vendedores}
                  verticais={(verticais ?? [])
                    .filter((v) => v.ativo)
                    .map((v) => ({ value: v.id, label: v.nome }))}
                  status={status}
                />
              </Passo>
            )}
            {erroAoSalvar ? (
              <Alert tone="danger" title="Não foi possível cadastrar a empresa">
                {erroAoSalvar}
              </Alert>
            ) : null}
          </>
        ) : null}
      </main>

      {formularioVisivel ? (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-6 py-3 max-md:px-4">
          <Button variant="ghost" onClick={() => void navegar({ to: '/empresas' })}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={Check}
            block={celular}
            disabled={!podeSalvar}
            loading={salvando}
            onClick={() => void salvar()}
          >
            Salvar empresa
          </Button>
        </div>
      ) : null}
    </div>
  )
}
