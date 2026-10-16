import type { Me } from '@leadtogo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { ChevronDown, LayoutGrid, LogOut, Plus, ShieldCheck } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { AppNav, TenantSwitcher, type GrupoDaNavegacao } from '@/components/ui/navegacao'
import { Avatar } from '@/components/ui/exibicao'
import { corDoNome } from '@/components/ui/cores'
import { Menu, type ItemDeMenu } from '@/components/ui/menu'
import { cn } from '@/lib/cn'

import { Logo } from '@/components/acesso/logo'
import { RegistrarAtividadeProvider } from '@/telas/atividades/registrar'
import { FormularioDeOportunidadeProvider } from '@/telas/oportunidades/formulario'
import { useDispositivo } from './dispositivo'
import { useTrocarEmpresa } from './empresas'
import { ROTULO_DO_PAPEL, TELAS, estaAtiva, telaVisivel, tituloDoCaminho } from './navegacao'
import {
  BarraInferior,
  BarraSuperior,
  CabecalhoDoCelular,
  FolhaDePerfil,
  PularParaOConteudo,
  VersaoDoApp,
} from './partes'
import { usePreferencias } from './preferencias'
import { SeletorDeEmpresa } from './seletor-de-empresa'
import { nomeDaEmpresa, papelDe } from './utilidades'

/**
 * A casca do app (E9c): menu lateral recolhível no desktop, trilho de ícones no tablet e, no celular,
 * cabeçalho + barra inferior + folha de perfil. Sem empresa ativa (várias e nenhuma usada antes), mostra
 * o seletor de empresa no lugar do app.
 */
export function Casca({ me, children }: { me: Me; children: ReactNode }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const trocarEmpresa = useTrocarEmpresa()
  const dispositivo = useDispositivo()
  const caminho = useRouterState({ select: (s) => s.location.pathname })
  const { prefs, alterar } = usePreferencias(me.empresaAtivaId)
  const [perfilAberto, setPerfilAberto] = useState(false)

  if (me.precisaEscolherEmpresa) return <SeletorDeEmpresa me={me} />

  const ativa = me.empresas.find((e) => e.ativa)
  const sair = async () => {
    setPerfilAberto(false)
    await servicos.sair()
    await queryClient.invalidateQueries({ queryKey: chaveDoMe })
    await navegar({ to: '/login', search: { redirect: undefined } })
  }
  const empresaDoMenu = ativa
    ? { name: nomeDaEmpresa(ativa), role: papelDe(me), color: corDoNome(nomeDaEmpresa(ativa)) }
    : null

  if (dispositivo === 'celular') {
    return (
      <RegistrarAtividadeProvider>
        <FormularioDeOportunidadeProvider>
          <div
            data-density="touch"
            className="relative flex h-dvh flex-col overflow-hidden bg-bg text-ink"
          >
            <PularParaOConteudo />
            <CabecalhoDoCelular
              titulo={tituloDoCaminho(caminho)}
              me={me}
              aoAbrirPerfil={() => setPerfilAberto(true)}
            />
            <div
              id="conteudo"
              tabIndex={-1}
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto outline-none"
            >
              <div className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col">
                {children}
              </div>
            </div>
            <BarraInferior caminho={caminho} aoAbrirPerfil={() => setPerfilAberto(true)} />
            <FolhaDePerfil
              aberta={perfilAberto}
              aoFechar={() => setPerfilAberto(false)}
              me={me}
              tema={prefs.tema}
              aoMudarTema={(tema) => alterar({ tema })}
              aoTrocarEmpresa={(id) => void trocarEmpresa(id).then(() => setPerfilAberto(false))}
              aoSair={() => void sair()}
            />
          </div>
        </FormularioDeOportunidadeProvider>
      </RegistrarAtividadeProvider>
    )
  }

  // desktop e tablet: menu lateral (no tablet sempre recolhido, no desktop conforme a preferência)
  const recolhido = dispositivo === 'tablet' || prefs.menuRecolhido
  const pessoa = {
    administradorDeConta: me.administradorDeConta,
    papelNaEmpresaAtiva: ativa?.papel ?? null,
  }
  const grupo = (g: 'carteira' | undefined) =>
    TELAS.filter((t) => t.grupo === g && telaVisivel(t, pessoa)).map((t) => ({
      icon: t.icone,
      label: t.titulo,
      href: t.caminho,
      active: estaAtiva(t, caminho),
      ...(g === 'carteira' ? { suave: true } : {}),
    }))
  const grupos: GrupoDaNavegacao[] = [
    { items: grupo(undefined) },
    { label: 'Carteira', items: grupo('carteira') },
  ]

  const itensDeEmpresas: ItemDeMenu[] = [
    { heading: 'Suas empresas' },
    ...me.empresas.map((e) => ({
      label: `${nomeDaEmpresa(e)} · ${ROTULO_DO_PAPEL[e.papel]}`,
      checked: e.ativa,
      onSelect: () => {
        if (!e.ativa) void trocarEmpresa(e.id)
      },
    })),
    // administrador da conta: o painel consolidado e a criação de empresas (as telas chegam depois)
    ...(me.administradorDeConta
      ? ([
          { separator: true },
          {
            icon: LayoutGrid,
            label: 'Painel consolidado',
            onSelect: () => void navegar({ to: '/consolidado' }),
          },
          {
            icon: Plus,
            label: 'Criar empresa',
            onSelect: () => void navegar({ to: '/criar-empresa' }),
          },
        ] satisfies ItemDeMenu[])
      : []),
  ]
  const itensDoUsuario: ItemDeMenu[] = [
    {
      icon: ShieldCheck,
      label: 'Meu perfil → Segurança',
      onSelect: () => void navegar({ to: '/perfil/seguranca' }),
    },
    { separator: true },
    { heading: 'Tema' },
    ...(['claro', 'escuro', 'sistema'] as const).map((t) => ({
      label: { claro: 'Claro', escuro: 'Escuro', sistema: 'Sistema' }[t],
      checked: prefs.tema === t,
      onSelect: () => alterar({ tema: t }),
    })),
    { separator: true },
    { icon: LogOut, label: 'Sair', danger: true, onSelect: () => void sair() },
  ]

  const rodape = (
    <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
      <div className={cn('flex items-center gap-2.5 px-2', recolhido && 'justify-center px-0')}>
        <Menu
          side={recolhido ? 'right' : 'top'}
          align="start"
          items={itensDoUsuario}
          trigger={
            <button
              type="button"
              aria-label={`Menu de ${me.usuario.nome}`}
              className={cn(
                'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-sm border-0 bg-transparent p-0 text-left text-ink',
                !recolhido && 'flex-1',
              )}
            >
              <Avatar name={me.usuario.nome} />
              {recolhido ? null : (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{me.usuario.nome}</span>
                  <span className="text-[12px] text-ink-muted">{papelDe(me)}</span>
                </span>
              )}
              {recolhido ? null : (
                <ChevronDown
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="flex-none text-ink-muted"
                />
              )}
            </button>
          }
        />
      </div>
      {recolhido ? null : <VersaoDoApp className="px-2.5" />}
    </div>
  )

  return (
    <RegistrarAtividadeProvider>
      <FormularioDeOportunidadeProvider>
        <div
          data-density={dispositivo === 'tablet' ? 'touch' : undefined}
          className="relative flex h-dvh overflow-hidden bg-bg text-ink"
        >
          <PularParaOConteudo />
          <AppNav
            className="h-full flex-none overflow-x-hidden overflow-y-auto"
            recolhido={recolhido}
            espacoso
            marca={<Logo tamanho={24} />}
            {...(dispositivo === 'desktop'
              ? { aoAlternarRecolhimento: () => alterar({ menuRecolhido: !prefs.menuRecolhido }) }
              : {})}
            groups={grupos}
            renderLink={({ item, className, children: conteudo, ...resto }) => (
              <Link to={(item.href ?? '/') as '/'} className={className} {...resto}>
                {conteudo}
              </Link>
            )}
            tenantSlot={
              empresaDoMenu ? (
                <Menu
                  side={recolhido ? 'right' : 'bottom'}
                  align="start"
                  className="w-[264px]"
                  items={itensDeEmpresas}
                  trigger={<TenantSwitcher current={empresaDoMenu} recolhido={recolhido} />}
                />
              ) : null
            }
            rodape={rodape}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BarraSuperior />
            <div
              id="conteudo"
              tabIndex={-1}
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto outline-none"
            >
              <div className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col">
                {children}
              </div>
            </div>
          </div>
        </div>
      </FormularioDeOportunidadeProvider>
    </RegistrarAtividadeProvider>
  )
}
