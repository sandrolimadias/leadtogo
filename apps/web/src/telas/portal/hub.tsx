import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { PaginaDeTabela } from '@leadtogo/ui/pagina'
import { Tabs } from '@leadtogo/ui/tabs'

import { AcessosDoPortal } from './acessos'
import { AgendaDoPortal } from './agenda'
import { AvisosDoPortal } from './avisos'
import { ChamadosDoPortal } from './chamados'
import { DocumentosDoPortal } from './documentos'
import { FormulariosDoPortal } from './formularios'
import { PublicacoesDoPortal } from './publicacoes'

type Aba =
  'publicacoes' | 'chamados' | 'documentos' | 'agenda' | 'avisos' | 'formularios' | 'acessos'

/**
 * O hub do Portal do Cliente: o que a equipe publica e vê do que acontece no portal. Hoje: publicações (3B),
 * documentos (3C), agenda (3D), avisos (3E), chamados dos clientes e acessos (3A).
 */
export function TelaDoPortal() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const verHub = pode('portal.ver')
  const [escolha, setAba] = useState<Aba | null>(null)
  // A aba de entrada é Publicações para todos (Fase 4A, B-2)
  const aba: Aba = escolha ?? 'publicacoes'
  const pedidos = useQuery({
    queryKey: ['portal', 'pedidos'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.pedidos.listar('pendente')
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const configuracao = useQuery({
    queryKey: ['portal', 'configuracao'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.configuracao.obter()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const pendentes = pedidos.data?.length ?? 0
  return (
    <PaginaDeTabela>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] leading-8 font-semibold max-md:text-[22px]">
          Portal do Cliente
        </h1>
        <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          O que as empresas clientes abrem e acompanham com a sua equipe.
          {configuracao.data && !configuracao.data.ativo ? (
            <span className="inline-flex items-center gap-1 font-semibold text-warning">
              <ExternalLink size={13} aria-hidden="true" /> Portal desligado: ligue em Configurações
              → Portal.
            </span>
          ) : null}
        </p>
      </header>
      <Tabs
        quebrar
        label="Portal do Cliente"
        value={aba}
        onChange={(v) => setAba(v as Aba)}
        items={[
          { value: 'publicacoes', label: 'Publicações' },
          ...(verHub ? [{ value: 'chamados', label: 'Chamados' }] : []),
          ...(verHub || pode('portal.documentos')
            ? [{ value: 'documentos', label: 'Documentos' }]
            : []),
          ...(verHub || pode('portal.agenda') ? [{ value: 'agenda', label: 'Agenda' }] : []),
          ...(verHub || pode('portal.avisos') ? [{ value: 'avisos', label: 'Avisos' }] : []),
          ...(verHub || pode('portal.formularios')
            ? [{ value: 'formularios', label: 'Formulários' }]
            : []),
          ...(verHub || pode('portal.acessos')
            ? [
                {
                  value: 'acessos',
                  label: 'Acessos',
                  ...(pendentes > 0 ? { count: pendentes } : {}),
                },
              ]
            : []),
        ]}
      />
      {aba === 'publicacoes' ? (
        <PublicacoesDoPortal />
      ) : aba === 'chamados' ? (
        <ChamadosDoPortal />
      ) : aba === 'documentos' ? (
        <DocumentosDoPortal />
      ) : aba === 'agenda' ? (
        <AgendaDoPortal />
      ) : aba === 'avisos' ? (
        <AvisosDoPortal />
      ) : aba === 'formularios' ? (
        <FormulariosDoPortal />
      ) : (
        <AcessosDoPortal />
      )}
    </PaginaDeTabela>
  )
}
