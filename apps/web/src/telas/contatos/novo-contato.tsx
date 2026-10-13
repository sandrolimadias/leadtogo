import type { ContatoExistente } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { useDispositivo } from '@/casca/dispositivo'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

import { AvisoDeDuplicado } from './aviso-de-duplicado'
import {
  corpoDoCadastroDeContato,
  type FormularioDeContato,
  formularioVazio,
  validarContato,
} from './formulario-dados'
import {
  Consentimento,
  DadosDaPessoa,
  EmpresaDoContato,
  ListaDeEmails,
  ListaDeTelefones,
  Secao,
} from './formulario'
import { rotaDoContato } from './rotas'

/** Novo contato: a pessoa, os telefones e e-mails, o consentimento e (opcional) a primeira empresa. */
export function NovoContato() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const celular = useDispositivo() === 'celular'
  const [f, setF] = useState<FormularioDeContato>(formularioVazio())
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erroAoSalvar, setErroAoSalvar] = useState<string>()
  const [duplicados, setDuplicados] = useState<ContatoExistente[] | null>(null)
  const mudar = (patch: Partial<FormularioDeContato>) => {
    setF((atual) => ({ ...atual, ...patch }))
    setDuplicados(null)
  }

  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me }).data
  const papel = me?.empresas.find((e) => e.ativa)?.papel
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
    if (papel === 'vendedor' && !f.empresaId) {
      encontrados['empresa'] = 'Escolha a empresa do contato.'
    }
    setErros(encontrados)
    if (Object.keys(encontrados).length > 0) return
    setSalvando(true)
    setErroAoSalvar(undefined)
    const r = await servicos.contatos.criar(corpoDoCadastroDeContato(f, ignorarDuplicado))
    setSalvando(false)
    if (r.ok) {
      toast.success('Contato criado', { description: `${r.dados.nome} entrou na carteira.` })
      await queryClient.invalidateQueries({ queryKey: ['contatos'] })
      void navegar(rotaDoContato(r.dados.id))
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
            <span className="text-ink">Novo contato</span>
          </nav>
          <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em]">
            Novo contato
          </h1>
        </div>

        <Secao titulo="Empresa">
          <EmpresaDoContato f={f} mudar={mudar} obrigatoria={papel === 'vendedor'} />
          {erros['empresa'] ? (
            <span className="text-xs leading-4 font-medium text-danger">{erros['empresa']}</span>
          ) : null}
        </Secao>
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
            rotuloDoBotao="Criar mesmo assim"
            enviando={salvando}
            aoAbrir={(id) => void navegar(rotaDoContato(id))}
            aoSalvarMesmoAssim={() => void salvar(true)}
          />
        ) : null}
        {erroAoSalvar ? (
          <Alert tone="danger" title="Não foi possível criar o contato">
            {erroAoSalvar}
          </Alert>
        ) : null}
      </main>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-6 py-3 max-md:px-4">
        <Button variant="ghost" onClick={() => void navegar({ to: '/contatos' })}>
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
