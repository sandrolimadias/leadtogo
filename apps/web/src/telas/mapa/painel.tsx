import type { EmpresaCarteira } from '@leadtogo/api-client'
import { codigoDaRota, linkDeLigacao, linkDoWhatsapp } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Radar,
  Route as RotaIcone,
  User,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { IconButton } from '@leadtogo/ui/button'
import type { CorDeTag } from '@leadtogo/ui/cores'
import { Avatar, Tag } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { ConteudoDaAba, Tabs } from '@leadtogo/ui/tabs'
import { cn } from '@leadtogo/ui/cn'
import { AtividadesDaFicha } from '@/telas/atividades/na-ficha'
import { ContatosDaEmpresaAba } from '@/telas/empresas/ficha-contatos'
import { dataCurta, diasDesde, tempoRelativo } from '@/telas/empresas/formatos'
import { SeloDePosicao } from '@/telas/geolocalizacao/selo'
import { OportunidadesDaEmpresa } from '@/telas/oportunidades/na-ficha'
import { BotaoDeVisita } from '@/telas/visitas/campo/checkin'

const ABAS = [
  { value: 'atividades', label: 'Atividades' },
  { value: 'oportunidades', label: 'Oportunidades' },
  { value: 'contatos', label: 'Contatos' },
]

const classeDoBotao =
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-[13px] font-semibold whitespace-nowrap text-ink no-underline hover:bg-surface-hover'

/**
 * O painel da empresa no mapa: nome, tags, selo de precisão, carteira, última visita, próxima atividade,
 * as ações (Ligar, WhatsApp, Empresas próximas, Abrir ficha) e as abas Atividades, Oportunidades e Contatos.
 * O "Check-in" (G3b) abre a visita; "Adicionar à rota" / "Na rota · parada N" é do G4.
 */
export interface RotaNoPainel {
  /** Posição da empresa na rota aberta no editor (1, 2...), ou null */
  ordem: number | null
  podeAdicionar: boolean
  aoAdicionar: (e: EmpresaCarteira) => void
}

export function PainelDaEmpresa({
  empresaId,
  aoFechar,
  aoVerProximas,
  rota,
  className,
}: {
  empresaId: string
  aoFechar: () => void
  /** "Empresas próximas": abre a barra de raio em volta desta empresa */
  aoVerProximas: (e: EmpresaCarteira) => void
  rota?: RotaNoPainel
  className?: string
}) {
  const servicos = useServicos()
  const [aba, setAba] = useState('atividades')
  const consulta = useQuery({
    queryKey: ['carteira', 'empresa', empresaId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.carteira.detalhar(empresaId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  return (
    <aside
      aria-label="Empresa selecionada"
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg',
        className,
      )}
    >
      {consulta.isPending ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : consulta.isError ? (
        <div className="flex flex-col gap-3 p-4">
          <Alert tone="danger" actions={<IconButton icon={X} label="Fechar" onClick={aoFechar} />}>
            Não consegui abrir essa empresa. {consulta.error.message}
          </Alert>
        </div>
      ) : (
        <Conteudo
          e={consulta.data}
          aba={aba}
          aoMudarAba={setAba}
          aoFechar={aoFechar}
          aoVerProximas={aoVerProximas}
          {...(rota ? { rota } : {})}
        />
      )}
    </aside>
  )
}

function Conteudo({
  e,
  aba,
  aoMudarAba,
  aoFechar,
  aoVerProximas,
  rota,
}: {
  e: EmpresaCarteira
  aba: string
  aoMudarAba: (a: string) => void
  aoFechar: () => void
  aoVerProximas: (e: EmpresaCarteira) => void
  rota?: RotaNoPainel
}) {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  // as rotas salvas em aberto em que a empresa é parada (fora a aberta no editor)
  const rotasSalvas = useQuery({
    queryKey: ['rotas', 'empresa', e.id],
    enabled: pode('rotas.ver'),
    retry: false,
    queryFn: async () => {
      const r = await servicos.rotas.daEmpresa(e.id)
      return r.ok ? r.dados : []
    },
  })
  const salva = rotasSalvas.data?.[0]
  const telefone = e.telefones.find((t) => t.principal) ?? e.telefones[0]
  const ligar = telefone ? linkDeLigacao(telefone.e164) : null
  const whatsapp = telefone ? linkDoWhatsapp(telefone.e164) : null
  const dias = diasDesde(e.ultimaVisitaEm)
  const cidade = e.endereco.municipio
    ? `${e.endereco.municipio.nome}, ${e.endereco.municipio.uf}`
    : null
  const visitada = e.ultimaVisitaEm !== null
  return (
    <>
      <div className="flex flex-none flex-col gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-lg leading-6 font-semibold">{e.nome}</h2>
            {e.nome !== e.razaoSocial ? (
              <p className="m-0 truncate text-[13px] text-ink-muted">{e.razaoSocial}</p>
            ) : null}
          </div>
          <IconButton icon={X} label="Fechar painel da empresa" onClick={aoFechar} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {e.tags.map((t) => (
            <Tag key={t.id} color={t.cor as CorDeTag}>
              {t.nome}
            </Tag>
          ))}
          <SeloDePosicao posicao={e.posicao} />
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
          {cidade ? (
            <li className="flex items-center gap-2">
              <MapPin size={15} aria-hidden="true" className="flex-none text-ink-subtle" />
              {cidade}
            </li>
          ) : null}
          <li className="flex items-center gap-2">
            <User size={15} aria-hidden="true" className="flex-none text-ink-subtle" />
            <Avatar name={e.vendedor.nome} size="sm" />
            Carteira de {e.vendedor.nome}
          </li>
          <li className="flex items-center gap-2">
            <Check size={15} aria-hidden="true" className="flex-none text-ink-subtle" />
            {visitada
              ? `Visitada ${tempoRelativo(dias).toLocaleLowerCase('pt-BR')} (${dataCurta(e.ultimaVisitaEm)})`
              : 'Nunca visitada'}
          </li>
          <li className="flex items-center gap-2">
            <Clock size={15} aria-hidden="true" className="flex-none text-ink-subtle" />
            {e.proximaAtividadeEm
              ? `Próxima atividade em ${dataCurta(e.proximaAtividadeEm)}`
              : 'Sem próxima atividade'}
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          {rota?.ordem ? (
            <span className={cn(classeDoBotao, 'cursor-default border-brand text-brand')}>
              <Check size={14} aria-hidden="true" /> Na rota · parada {rota.ordem}
            </span>
          ) : rota?.podeAdicionar && e.posicao.latitude !== null ? (
            <button type="button" className={classeDoBotao} onClick={() => rota.aoAdicionar(e)}>
              <RotaIcone size={14} aria-hidden="true" /> Adicionar à rota
            </button>
          ) : null}
          {!rota?.ordem && salva ? (
            <Link
              to="/mapa"
              search={{ rota: salva.rotaId }}
              className={cn(classeDoBotao, 'text-brand')}
            >
              <Check size={14} aria-hidden="true" /> Na rota {codigoDaRota(salva.codigo)} · parada{' '}
              {salva.ordem}
            </Link>
          ) : null}
          {e.permissoes.editar ? (
            <BotaoDeVisita empresa={{ id: e.id, nome: e.nome }} compacto />
          ) : null}
          {ligar ? (
            <a href={ligar} className={classeDoBotao}>
              <Phone size={14} aria-hidden="true" /> Ligar
            </a>
          ) : null}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer" className={classeDoBotao}>
              <MessageCircle size={14} aria-hidden="true" /> WhatsApp
            </a>
          ) : null}
          {e.posicao.latitude !== null ? (
            <button type="button" className={classeDoBotao} onClick={() => aoVerProximas(e)}>
              <Radar size={14} aria-hidden="true" /> Empresas próximas
            </button>
          ) : null}
          <Link
            to="/empresas/$empresaId"
            params={{ empresaId: e.id }}
            className={cn(classeDoBotao, 'text-brand')}
          >
            Abrir ficha <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <Tabs
        items={ABAS}
        value={aba}
        onChange={aoMudarAba}
        label="Detalhes da empresa"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ConteudoDaAba value="atividades">
            <AtividadesDaFicha
              filtro={{ empresaId: e.id }}
              inicio={{ empresa: { id: e.id, nome: e.nome } }}
              podeRegistrar={e.permissoes.editar}
              mostrarEmpresa={false}
            />
          </ConteudoDaAba>
          <ConteudoDaAba value="oportunidades">
            <OportunidadesDaEmpresa
              empresa={{ id: e.id, nome: e.nome }}
              podeCriar={e.permissoes.editar}
            />
          </ConteudoDaAba>
          <ConteudoDaAba value="contatos">
            <ContatosDaEmpresaAba
              empresaId={e.id}
              nomeDaEmpresa={e.nome}
              podeEditar={e.permissoes.editar}
            />
          </ConteudoDaAba>
        </div>
      </Tabs>
    </>
  )
}
