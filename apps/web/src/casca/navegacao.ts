import {
  Building2,
  LayoutDashboard,
  LayoutGrid,
  Map as MapaIcone,
  MapPin,
  Settings,
  CalendarCheck,
  Handshake,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { PapelMembro } from '@leadtogo/shared'

/** Telas do app: o menu lateral, a barra inferior do celular e o título do cabeçalho saem desta lista. */
export interface TelaDoApp {
  caminho: string
  titulo: string
  icone: LucideIcon
  /** Rótulo curto da barra inferior do celular */
  rotuloCurto?: string
  grupo?: 'carteira'
  /** Só aparece para quem tem o papel (admin/gestor) ou administra a conta */
  quem?: 'administrador-da-conta' | 'administrador'
}

export const TELAS: TelaDoApp[] = [
  { caminho: '/', titulo: 'Dashboard', icone: LayoutDashboard, rotuloCurto: 'Início' },
  { caminho: '/empresas', titulo: 'Empresas', icone: Building2 },
  { caminho: '/contatos', titulo: 'Contatos', icone: Users },
  { caminho: '/oportunidades', titulo: 'Oportunidades', icone: Handshake, rotuloCurto: 'Funil' },
  { caminho: '/atividades', titulo: 'Atividades', icone: CalendarCheck },
  { caminho: '/mapa', titulo: 'Mapa', icone: MapaIcone },
  { caminho: '/prospeccao', titulo: 'Prospecção', icone: Target, grupo: 'carteira' },
  { caminho: '/geolocalizacao', titulo: 'Geolocalização', icone: MapPin, grupo: 'carteira' },
  // Rotas é da Fase 3: item de fase futura fica fora do menu até existir
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
    quem: 'administrador',
  },
]

/** Itens da barra inferior do celular (além de "Mais", que abre o perfil). */
export const TELAS_DA_BARRA_INFERIOR = ['/', '/empresas', '/oportunidades', '/atividades']

export function tituloDoCaminho(caminho: string): string {
  if (caminho === '/') return 'Início'
  if (caminho.startsWith('/perfil')) return 'Meu perfil'
  if (caminho.startsWith('/configuracoes')) return 'Configurações'
  const achada =
    TELAS.find((t) => t.caminho === caminho) ??
    TELAS.find((t) => t.caminho !== '/' && caminho.startsWith(t.caminho))
  return achada?.titulo ?? 'Leadtogo'
}

/** A tela aparece para esta pessoa? (Painel consolidado: administrador da conta; Configurações: administrador.) */
export function telaVisivel(
  tela: TelaDoApp,
  pessoa: { administradorDeConta: boolean; papelNaEmpresaAtiva: PapelMembro | null },
): boolean {
  if (tela.quem === 'administrador-da-conta') return pessoa.administradorDeConta
  // Configurações: só o administrador DA EMPRESA ativa (a API recusa os demais, inclusive quem só administra a conta)
  if (tela.quem === 'administrador') return pessoa.papelNaEmpresaAtiva === 'admin'
  return true
}

export function estaAtiva(tela: TelaDoApp, caminho: string): boolean {
  return tela.caminho === '/'
    ? caminho === '/'
    : caminho === tela.caminho || caminho.startsWith(`${tela.caminho}/`)
}

export const ROTULO_DO_PAPEL: Record<PapelMembro, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
}
