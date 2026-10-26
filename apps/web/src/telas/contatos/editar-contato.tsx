import type { Contato } from '@leadtogo/api-client'
import type { ContatoExistente } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight, UserRound } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Button } from '@leadtogo/ui/button'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { cn } from '@leadtogo/ui/cn'

import { AvisoDeDuplicado } from './aviso-de-duplicado'
import {
  corpoDaEdicaoDeContato,
  type FormularioDeContato,
  formularioDoContato,
  validarContato,
} from './formulario-dados'
import { Consentimento, DadosDaPessoa, ListaDeEmails, ListaDeTelefones, Secao } from './formulario'
import { rotaDoContato } from './rotas'

const rota = getRouteApi('/_autenticado/contatos/$contatoId_/editar')

/** O formulário já com os dados do contato (montado só depois de carregar, para o estado nascer certo). */
function Formulario({ contato }: { contato: Contato }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const celular = useDispositivo() === 'celular'
  const [f, setF] = useState<FormularioDeContato>(() => formularioDoContato(contato))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erroAoSalvar, setErroAoSalvar] = useState<string>()
  const [duplicados, setDuplicados] = useState<ContatoExistente[] | null>(null)
  const mudar = (patch: Partial<FormularioDeContato>) => {
    setF((atual) => ({ ...atual, ...patch }))
    setDuplicados(null)
  }
  const papeis = useQuery({
    queryKey: ['cadastros', 'papeis-decisao'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.papeisDecisao.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  }).data

  const salvar = async (ignorarDuplicado: boolean) => {
    const encontrados = validarContato(f)
    setErros(encontrados)
    if (Object.keys(encontrados).length > 0) return
    setSalvando(true)
    setErroAoSalvar(undefined)
    const r = await servicos.contatos.alterar(
      contato.id,
      corpoDaEdicaoDeContato(f, ignorarDuplicado),
    )
    setSalvando(false)
    if (r.ok) {
      toast.success('Contato atualizado', { description: `${r.dados.nome} foi salvo.` })
      await queryClient.invalidateQueries({ queryKey: ['contatos'] })
      queryClient.setQueryData(['contatos', 'contato', contato.id], r.dados)
      void navegar(rotaDoContato(contato.id))
      return
    }
    if (r.erro.codigo === 'contato_duplicado') {
      setDuplicados((r.erro.dados?.['existentes'] ?? []) as ContatoExistente[])
      return
    }
    setErroAoSalvar(r.erro.mensagem)
  }

  return (
    <div className="flex min-h-full flex-col">
      <main className="flex w-full max-w-[980px] flex-1 flex-col gap-4 p-6 max-md:p-4">
        <div className={cn('flex flex-col gap-1', celular && 'sr-only')}>
          <nav
            aria-label="Você está em"
            className="flex items-center gap-1.5 text-[13px] text-ink-muted"
          >
            <Link to="/contatos" className="text-ink-muted">
              Contatos
            </Link>
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-ink">{contato.nome}</span>
          </nav>
          <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em]">
            Editar contato
          </h1>
        </div>

        <Secao titulo="Dados da pessoa">
          <DadosDaPessoa f={f} mudar={mudar} papeis={papeis ?? []} erros={erros} />
        </Secao>
        <Secao titulo="Telefones">
          <ListaDeTelefones f={f} mudar={mudar} />
        </Secao>
        <Secao titulo="E-mails">
          <ListaDeEmails f={f} mudar={mudar} />
        </Secao>
        <Secao titulo="Consentimento (LGPD)">
          <Consentimento f={f} mudar={mudar} />
        </Secao>

        {duplicados ? (
          <AvisoDeDuplicado
            existentes={duplicados}
            rotuloDoBotao="Salvar mesmo assim"
            enviando={salvando}
            aoAbrir={(id) => void navegar(rotaDoContato(id))}
            aoSalvarMesmoAssim={() => void salvar(true)}
          />
        ) : null}
        {erroAoSalvar ? (
          <Alert tone="danger" title="Não foi possível salvar o contato">
            {erroAoSalvar}
          </Alert>
        ) : null}
      </main>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-6 py-3 max-md:px-4">
        <Button variant="ghost" onClick={() => void navegar(rotaDoContato(contato.id))}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          icon={Check}
          block={celular}
          loading={salvando && !duplicados}
          disabled={salvando}
          onClick={() => void salvar(false)}
        >
          Salvar contato
        </Button>
      </div>
    </div>
  )
}

/** Editar contato: carrega, confere a permissão e mostra o formulário. */
export function EditarContato() {
  const { contatoId } = rota.useParams()
  const servicos = useServicos()
  const navegar = useNavigate()
  const consulta = useQuery({
    queryKey: ['contatos', 'contato', contatoId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.contatos.detalhar(contatoId)
      if (!r.ok) throw Object.assign(new Error(r.erro.mensagem), { status: r.erro.status })
      return r.dados
    },
  })
  const voltar = (
    <Button onClick={() => void navegar({ to: '/contatos' })}>Voltar para Contatos</Button>
  )

  if (consulta.isPending) {
    return (
      <main className="flex w-full max-w-[980px] flex-col gap-4 p-6 max-md:p-4">
        <div
          role="status"
          aria-label="Carregando o contato"
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
              icon={UserRound}
              title="Contato não encontrado"
              description="Ele pode ter sido excluído ou ser de uma carteira que você não vê."
              actions={voltar}
            />
          ) : (
            <Alert
              tone="danger"
              title="Não foi possível carregar o contato"
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
            icon={UserRound}
            title="Você não edita este contato"
            description="Cada vendedor edita só os contatos das empresas da própria carteira."
            actions={voltar}
          />
        </div>
      </main>
    )
  }
  return <Formulario contato={consulta.data} />
}
