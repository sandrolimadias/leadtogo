import type { EmpresaCarteira } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { Building2, Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Button } from '@/components/ui/button'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

import { documentoFormatado } from './formatos'
import { corpoDaEdicao, type Formulario, formularioDaEmpresa } from './nova-empresa-dados'
import { DadosDaCarteira, DadosDaEmpresa, Passo } from './nova-empresa-partes'

const rota = getRouteApi('/_autenticado/empresas/$empresaId_/editar')

/** O formulário, já com os dados da empresa. Montado só depois de carregar, para o estado nascer certo. */
function Formulario_({ e }: { e: EmpresaCarteira }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const celular = useDispositivo() === 'celular'
  const [f, setF] = useState<Formulario>(() => formularioDaEmpresa(e))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()
  const mudar = (patch: Partial<Formulario>) => setF((atual) => ({ ...atual, ...patch }))

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

  const podeTransferir = e.permissoes.transferir && opcoes ? !opcoes.unicoMembro : false
  const vendedores = podeTransferir
    ? (opcoes?.vendedores ?? []).map((v) => ({ value: v.id, label: v.nome }))
    : null
  const ficha = () => void navegar({ to: '/empresas/$empresaId', params: { empresaId: e.id } })
  const eCnpj = e.tipoDocumento === 'cnpj'

  const salvar = async () => {
    setSalvando(true)
    setErro(undefined)
    const r = await servicos.carteira.alterar(e.id, corpoDaEdicao(f, { podeTransferir }))
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Empresa atualizada', { description: `${r.dados.nome} foi salva.` })
    await queryClient.invalidateQueries({ queryKey: ['carteira'] })
    ficha()
  }

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
            <Link to="/empresas/$empresaId" params={{ empresaId: e.id }} className="text-ink-muted">
              {e.nome}
            </Link>
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-ink">Editar</span>
          </nav>
          <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em]">
            Editar empresa
          </h1>
        </div>

        <p className="m-0 text-sm text-ink-muted">
          {e.tipoDocumento === 'nenhum' ? (
            'Empresa sem documento.'
          ) : (
            <>
              {eCnpj ? 'CNPJ' : 'CPF'}{' '}
              <span className="font-mono text-ink">
                {documentoFormatado(e.tipoDocumento, e.documento)}
              </span>
              : o documento não muda depois do cadastro.
            </>
          )}
        </p>

        <Passo numero={1} titulo="Dados da empresa">
          <DadosDaEmpresa
            f={f}
            mudar={mudar}
            daReceita={false}
            rotuloDoNome={eCnpj ? 'Razão social' : 'Nome'}
            mostrarOrigemDosTelefones={false}
          />
        </Passo>
        <Passo numero={2} titulo="Carteira">
          <DadosDaCarteira
            f={f}
            mudar={mudar}
            vendedores={vendedores}
            verticais={(verticais ?? [])
              .filter((v) => v.ativo || v.id === e.vertical?.id)
              .map((v) => ({ value: v.id, label: v.ativo ? v.nome : `${v.nome} (inativa)` }))}
            status={null}
          />
          <p className="m-0 text-[13px] text-ink-muted">
            O Status e as outras tags mudam em "Editar tags", na ficha da empresa.
          </p>
        </Passo>
        {erro ? (
          <Alert tone="danger" title="Não foi possível salvar a empresa">
            {erro}
          </Alert>
        ) : null}
      </main>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-6 py-3 max-md:px-4">
        <Button variant="ghost" onClick={ficha}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          icon={Check}
          block={celular}
          loading={salvando}
          disabled={f.razaoSocial.trim().length < 2 || salvando}
          onClick={() => void salvar()}
        >
          Salvar empresa
        </Button>
      </div>
    </div>
  )
}

/** Editar empresa: o mesmo formulário do cadastro, sem o passo da Receita e sem o documento. */
export function EditarEmpresa() {
  const { empresaId } = rota.useParams()
  const servicos = useServicos()
  const navegar = useNavigate()
  const consulta = useQuery({
    queryKey: ['carteira', 'empresa', empresaId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.detalhar(empresaId)
      if (!r.ok) throw Object.assign(new Error(r.erro.mensagem), { status: r.erro.status })
      return r.dados
    },
  })

  if (consulta.isPending) {
    return (
      <main className="flex w-full max-w-[980px] flex-col gap-4 p-6 max-md:p-4">
        <div
          role="status"
          aria-label="Carregando a empresa"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton lines={6} />
        </div>
      </main>
    )
  }
  if (consulta.isError) {
    const naoExiste = (consulta.error as { status?: number }).status === 404
    return (
      <main className="flex w-full max-w-[980px] flex-col gap-4 p-6 max-md:p-4">
        <div className="rounded-lg border border-border bg-surface">
          {naoExiste ? (
            <EmptyState
              icon={Building2}
              title="Empresa não encontrada"
              description="Ela pode ter sido excluída ou estar na carteira de outro vendedor."
              actions={
                <Button onClick={() => void navegar({ to: '/empresas' })}>
                  Voltar para Empresas
                </Button>
              }
            />
          ) : (
            <Alert
              tone="danger"
              title="Não foi possível carregar a empresa"
              actions={
                <Button size="sm" onClick={() => void consulta.refetch()}>
                  Tentar de novo
                </Button>
              }
            >
              {consulta.error.message}
            </Alert>
          )}
        </div>
      </main>
    )
  }
  if (!consulta.data.permissoes.editar) {
    return (
      <main className="flex w-full max-w-[980px] flex-col gap-4 p-6 max-md:p-4">
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Building2}
            title="Você não edita esta empresa"
            description="Cada vendedor edita só as empresas da própria carteira."
            actions={
              <Button
                onClick={() =>
                  void navegar({
                    to: '/empresas/$empresaId',
                    params: { empresaId: consulta.data.id },
                  })
                }
              >
                Voltar para a ficha
              </Button>
            }
          />
        </div>
      </main>
    )
  }
  return <Formulario_ e={consulta.data} />
}
