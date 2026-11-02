import type { DadosDaEmpresa } from '@leadtogo/api-client'
import { UFS } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { Select, TextField } from '@leadtogo/ui/campos'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { useEnvio } from '@/telas/acesso/comum'
import { mascararCep } from '@/telas/empresas/nova-empresa-dados'

const chaveDosDadosDaEmpresa = ['configuracoes', 'empresa'] as const

interface Formulario {
  razaoSocial: string
  nomeFantasia: string
  email: string
  telefone: string
  website: string
  cep: string
  tipoLogradouro: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  uf: string
  municipioCodigo: string
}

const doServidor = (d: DadosDaEmpresa): Formulario => ({
  razaoSocial: d.razaoSocial,
  nomeFantasia: d.nomeFantasia ?? '',
  email: d.email ?? '',
  telefone: d.telefone ?? '',
  website: d.website ?? '',
  cep: d.endereco.cep ? mascararCep(d.endereco.cep) : '',
  tipoLogradouro: d.endereco.tipoLogradouro ?? '',
  logradouro: d.endereco.logradouro ?? '',
  numero: d.endereco.numero ?? '',
  complemento: d.endereco.complemento ?? '',
  bairro: d.endereco.bairro ?? '',
  uf: d.endereco.municipio?.uf ?? '',
  municipioCodigo: d.endereco.municipio ? String(d.endereco.municipio.codigo) : '',
})

const sobretitulo = 'text-[13px] font-semibold tracking-[0.04em] text-ink-muted uppercase'

/**
 * Configurações → Empresa: os dados e o endereço da empresa que usa o CRM. A cidade diz o estado dos mapas
 * do Dashboard. Todo membro vê; só quem tem `empresa.configurar` altera. O CNPJ é só leitura.
 */
const Cabecalho = () => (
  <div className="flex flex-col gap-1">
    <h2 className="m-0 text-[17px] leading-6 font-semibold">Empresa</h2>
    <p className="m-0 text-sm text-ink-muted">
      Os dados e o endereço da sua empresa. A cidade define o estado mostrado nos mapas do
      Dashboard.
    </p>
  </div>
)

/**
 * Configurações → Empresa: os dados e o endereço da empresa que usa o CRM. A cidade diz o estado dos mapas
 * do Dashboard. Todo membro vê; só quem tem `empresa.configurar` altera. O CNPJ é só leitura.
 */
export function TelaDosDadosDaEmpresa() {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: chaveDosDadosDaEmpresa,
    retry: false,
    queryFn: async () => {
      const r = await servicos.dadosDaEmpresa.obter()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (consulta.isPending) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="Carregando os dados da empresa"
      >
        <Cabecalho />
        <Skeleton lines={6} />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Cabecalho />
        <Alert
          tone="danger"
          title="Não foi possível carregar os dados da empresa"
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
  return <FormularioDaEmpresa dados={consulta.data} />
}

function FormularioDaEmpresa({ dados }: { dados: DadosDaEmpresa }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { pode } = usePermissoes()
  const podeEditar = pode('empresa.configurar')
  const { enviando, executar } = useEnvio()
  const [f, setF] = useState<Formulario>(() => doServidor(dados))
  const [erro, setErro] = useState<string>()

  const municipios = useQuery({
    queryKey: ['referencias', 'municipios', f.uf],
    enabled: f.uf !== '',
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const r = await servicos.dadosDaEmpresa.municipios(f.uf)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const mudar = (patch: Partial<Formulario>) => setF((atual) => ({ ...atual, ...patch }))
  const somenteLeitura = !podeEditar || enviando

  const salvar = () =>
    void executar(async () => {
      if (f.razaoSocial.trim().length < 2) return setErro('Informe a razão social.')
      if (f.uf && !f.municipioCodigo) return setErro('Escolha a cidade.')
      setErro(undefined)
      const r = await servicos.dadosDaEmpresa.alterar({
        razaoSocial: f.razaoSocial,
        nomeFantasia: f.nomeFantasia,
        email: f.email,
        telefone: f.telefone,
        website: f.website,
        endereco: {
          cep: f.cep,
          tipoLogradouro: f.tipoLogradouro,
          logradouro: f.logradouro,
          numero: f.numero,
          complemento: f.complemento,
          bairro: f.bairro,
          municipioCodigo: f.municipioCodigo ? Number(f.municipioCodigo) : null,
        },
      })
      if (!r.ok) return setErro(r.erro.mensagem)
      queryClient.setQueryData(chaveDosDadosDaEmpresa, r.dados)
      // o nome no seletor de empresa e os mapas do Dashboard dependem destes dados
      await Promise.all(
        [['me'], ['dashboard']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      toast.success('Dados da empresa salvos')
    })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Cabecalho />
      {!podeEditar ? (
        <Alert tone="info">Só quem pode configurar a empresa altera estes dados.</Alert>
      ) : null}

      <section className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4">
        <span className={sobretitulo}>Dados</span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-md:grid-cols-1">
          <TextField
            label="Razão social"
            required
            readOnly={somenteLeitura}
            value={f.razaoSocial}
            onChange={(e) => mudar({ razaoSocial: e.target.value })}
          />
          <TextField
            label="Nome fantasia"
            readOnly={somenteLeitura}
            value={f.nomeFantasia}
            onChange={(e) => mudar({ nomeFantasia: e.target.value })}
          />
          <TextField
            label="CNPJ"
            mono
            readOnly
            value={dados.cnpj ?? ''}
            placeholder="Não informado"
            hint="Não muda por aqui"
          />
          <TextField
            label="E-mail"
            type="email"
            readOnly={somenteLeitura}
            value={f.email}
            onChange={(e) => mudar({ email: e.target.value })}
          />
          <TextField
            label="Telefone"
            readOnly={somenteLeitura}
            value={f.telefone}
            onChange={(e) => mudar({ telefone: e.target.value })}
          />
          <TextField
            label="Site"
            readOnly={somenteLeitura}
            value={f.website}
            onChange={(e) => mudar({ website: e.target.value })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4">
        <span className={sobretitulo}>Endereço</span>
        <div className="grid grid-cols-[140px_90px_minmax(0,1fr)_110px] gap-x-4 gap-y-3.5 max-md:grid-cols-2">
          <TextField
            label="CEP"
            mono
            readOnly={somenteLeitura}
            value={f.cep}
            onChange={(e) => mudar({ cep: mascararCep(e.target.value) })}
          />
          <TextField
            label="Tipo"
            placeholder="Rua"
            readOnly={somenteLeitura}
            value={f.tipoLogradouro}
            onChange={(e) => mudar({ tipoLogradouro: e.target.value })}
          />
          <TextField
            label="Logradouro"
            className="max-md:col-span-full"
            readOnly={somenteLeitura}
            value={f.logradouro}
            onChange={(e) => mudar({ logradouro: e.target.value })}
          />
          <TextField
            label="Número"
            readOnly={somenteLeitura}
            value={f.numero}
            onChange={(e) => mudar({ numero: e.target.value })}
          />
          <TextField
            label="Complemento"
            className="col-span-2"
            readOnly={somenteLeitura}
            value={f.complemento}
            onChange={(e) => mudar({ complemento: e.target.value })}
          />
          <TextField
            label="Bairro"
            className="col-span-2"
            readOnly={somenteLeitura}
            value={f.bairro}
            onChange={(e) => mudar({ bairro: e.target.value })}
          />
          <Select
            label="Estado"
            placeholder="Escolha"
            disabled={somenteLeitura}
            value={f.uf}
            options={[...UFS]}
            onChange={(e) => mudar({ uf: e.target.value, municipioCodigo: '' })}
          />
          <Select
            label="Cidade"
            className="col-span-3 max-md:col-span-1"
            placeholder={
              !f.uf ? 'Escolha o estado' : municipios.isPending ? 'Carregando…' : 'Escolha'
            }
            disabled={somenteLeitura || !f.uf || municipios.isPending}
            value={f.municipioCodigo}
            options={(municipios.data ?? []).map((m) => ({
              value: String(m.codigo),
              label: m.nome,
            }))}
            onChange={(e) => mudar({ municipioCodigo: e.target.value })}
            hint="Define o estado dos mapas do Dashboard"
          />
        </div>
      </section>

      {erro ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {erro}
        </p>
      ) : null}
      {podeEditar ? (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={enviando}>
            Salvar
          </Button>
        </div>
      ) : null}
    </form>
  )
}
