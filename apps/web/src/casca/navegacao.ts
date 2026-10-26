import {
  Building2,
  LayoutDashboard,
  LayoutGrid,
  Map as MapaIcone,
  MapPin,
  Route as RotaIcone,
  Settings,
  CalendarCheck,
  ClipboardList,
  Handshake,
  Globe,
  LifeBuoy,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { PapelMembro } from '@leadtogo/shared'

import { type Permissoes, podeCom } from '@/auth/permissoes'

/** Telas do app: o menu lateral, a barra inferior do celular e o título do cabeçalho saem desta lista. */
export interface TelaDoApp {
  caminho: string
  titulo: string
  icone: LucideIcon
  /** Rótulo curto da barra inferior do celular */
  rotuloCurto?: string
  grupo?: 'carteira'
  /** Só para quem administra a conta (Painel consolidado) */
  quem?: 'administrador-da-conta'
  /** Só para quem tem ao menos uma destas permissões do perfil de acesso na empresa ativa */
  permissoes?: readonly string[]
}

/** As permissões que abrem alguma seção das Configurações (cada seção tem a sua). */
export const PERMISSOES_DAS_CONFIGURACOES = [
  'equipe.gerir',
  'perfis.gerir',
  'cadastros.gerir',
  'carteira.configurar',
  'geolocalizacao.regioes',
  'geolocalizacao.legenda',
  'seguranca.gerir',
  'chamados.gerir_areas',
  'portal.configurar',
] as const

export const TELAS: TelaDoApp[] = [
  { caminho: '/', titulo: 'Dashboard', icone: LayoutDashboard, rotuloCurto: 'Início' },
  { caminho: '/empresas', titulo: 'Empresas', icone: Building2, permissoes: ['empresas.ver'] },
  { caminho: '/contatos', titulo: 'Contatos', icone: Users, permissoes: ['contatos.ver'] },
  {
    caminho: '/oportunidades',
    titulo: 'Oportunidades',
    icone: Handshake,
    rotuloCurto: 'Funil',
    permissoes: ['oportunidades.ver'],
  },
  {
    caminho: '/atividades',
    titulo: 'Atividades',
    icone: CalendarCheck,
    permissoes: ['atividades.ver'],
  },
  { caminho: '/chamados', titulo: 'Chamados', icone: LifeBuoy, permissoes: ['chamados.ver'] },
  {
    caminho: '/portal',
    titulo: 'Portal do Cliente',
    icone: Globe,
    rotuloCurto: 'Portal',
    permissoes: ['portal.ver', 'portal.publicar', 'portal.moderar'],
  },
  { caminho: '/mapa', titulo: 'Mapa', icone: MapaIcone, permissoes: ['empresas.ver'] },
  {
    caminho: '/visitas',
    titulo: 'Relatórios de visita',
    icone: ClipboardList,
    permissoes: ['atividades.criar'],
  },
  { caminho: '/prospeccao', titulo: 'Prospecção', icone: Target, grupo: 'carteira' },
  {
    caminho: '/geolocalizacao',
    titulo: 'Geolocalização',
    icone: MapPin,
    grupo: 'carteira',
    permissoes: ['empresas.ver'],
  },
  {
    caminho: '/rotas',
    titulo: 'Rotas',
    icone: RotaIcone,
    grupo: 'carteira',
    permissoes: ['rotas.ver'],
  },
  {
    caminho: '/consolidado',
    titulo: 'Painel consolidado',
    icone: LayoutGrid,
    grupo: 'carteira',
    quem: 'administrador-da-conta',
  },
  {
    caminho: '/configuracoes',
    titulo: 'Configurações',
    icone: Settings,
    grupo: 'carteira',
    permissoes: PERMISSOES_DAS_CONFIGURACOES,
  },
]

/** Itens da barra inferior do celular (além de "Mais", que abre a folha com todo o resto). */
export const TELAS_DA_BARRA_INFERIOR = ['/', '/empresas', '/oportunidades', '/atividades']

/**
 * Telas da folha "Mais" do celular: todas as de `TELAS` que não estão na barra inferior e que esta pessoa
 * pode ver, na ordem do menu lateral (a ordem de `TELAS`). Gerada da lista: tela nova entra sozinha.
 */
export function telasDoMais(pessoa: {
  administradorDeConta: boolean
  permissoes: Permissoes
}): TelaDoApp[] {
  return TELAS.filter((t) => !TELAS_DA_BARRA_INFERIOR.includes(t.caminho) && telaVisivel(t, pessoa))
}

export function tituloDoCaminho(caminho: string): string {
  if (caminho === '/') return 'Início'
  if (caminho.startsWith('/perfil')) return 'Meu perfil'
  if (caminho.startsWith('/configuracoes')) return 'Configurações'
  const achada =
    TELAS.find((t) => t.caminho === caminho) ??
    TELAS.find((t) => t.caminho !== '/' && caminho.startsWith(t.caminho))
  return achada?.titulo ?? 'Leadtogo'
}

/**
 * A tela aparece para esta pessoa? Painel consolidado: administrador da conta; as demais com
 * `permissoes`: quem tem ao menos uma delas no perfil de acesso da empresa ativa (a API decide).
 */
export function telaVisivel(
  tela: TelaDoApp,
  pessoa: { administradorDeConta: boolean; permissoes: Permissoes },
): boolean {
  if (tela.quem === 'administrador-da-conta') return pessoa.administradorDeConta
  if (tela.permissoes) return podeCom(pessoa.permissoes, tela.permissoes)
  return true
}

export function estaAtiva(tela: TelaDoApp, caminho: string): boolean {
  return tela.caminho === '/'
    ? caminho === '/'
    : caminho === tela.caminho || caminho.startsWith(`${tela.caminho}/`)
}

/** Rótulo do papel legado: só onde o perfil de acesso ainda não chega (sem perfil). */
export const ROTULO_DO_PAPEL: Record<PapelMembro, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
}
