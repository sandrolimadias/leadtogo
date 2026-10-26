import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { PaginaDeTabela } from '@leadtogo/ui/pagina'
import { Tabs } from '@leadtogo/ui/tabs'

import { AcessosDoPortal } from './acessos'
import { ChamadosDoPortal } from './chamados'

type Aba = 'chamados' | 'acessos'

/**
 * O hub do Portal do Cliente (Fase 3A): o que a equipe vê do que acontece no portal. Hoje: chamados dos clientes
 * e acessos; publicações, documentos, agenda e avisos entram nas próximas fases.
 */
export function TelaDoPortal() {
  const servicos = useServicos()
  const [aba, setAba] = useState<Aba>('chamados')
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
        label="Portal do Cliente"
        value={aba}
        onChange={(v) => setAba(v as Aba)}
        items={[
          { value: 'chamados', label: 'Chamados' },
          { value: 'acessos', label: 'Acessos', ...(pendentes > 0 ? { count: pendentes } : {}) },
        ]}
      />
      {aba === 'chamados' ? <ChamadosDoPortal /> : <AcessosDoPortal />}
    </PaginaDeTabela>
  )
}
