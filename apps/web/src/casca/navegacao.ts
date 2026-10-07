import {
  Building2,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  SquareKanban,
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
  { caminho: '/tarefas', titulo: 'Tarefas', icone: SquareKanban },
  { caminho: '/prospeccao', titulo: 'Prospecção', icone: Target, grupo: 'carteira' },
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
export const TELAS_DA_BARRA_INFERIOR = ['/', '/empresas', '/oportunidades', '/tarefas']

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
  if (tela.quem === 'administrador')
    return pessoa.administradorDeConta || pessoa.papelNaEmpresaAtiva === 'admin'
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
