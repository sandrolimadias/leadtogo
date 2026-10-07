import {
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  Download,
  Ellipsis,
  Funnel,
  LayoutDashboard,
  List,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Repeat,
  Route,
  Search,
  Settings,
  Star,
  SquareKanban,
  Target,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Zap,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { Button, IconButton } from '@/components/ui/button'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { Select, TextArea, TextField } from '@/components/ui/campos'
import { CORES_DE_TAG } from '@/components/ui/cores'
import { PainelDoDialogo } from '@/components/ui/dialog'
import { Avatar, AvatarGroup, Badge, Tag } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton, Toast } from '@/components/ui/feedback'
import { Icon } from '@/components/ui/icone'
import { MenuList } from '@/components/ui/menu'
import { AppNav, TenantSwitcher } from '@/components/ui/navegacao'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tabs } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'

import marcaClara from '../../../../docs/design-system/assets/logos/leadtogo-mark.svg'
import marcaEscura from '../../../../docs/design-system/assets/logos/leadtogo-mark-dark.svg'

type Densidade = 'compact' | 'default' | 'touch'

const semEfeito = () => undefined

/**
 * Catálogo dos componentes, SÓ EM DESENVOLVIMENTO (rota /dev/catalogo, fora do build de produção).
 * Espelha docs/design-system/catalogo.html: mesmas seções, mesma ordem, mesmos exemplos. O que ainda
 * não foi recriado em React aparece como "pendente (etapa …)" e está listado em
 * docs/plano_implantacao.md ("Componentes do design system que ficam para as telas").
 */

function Grupo({ children }: { children: string }) {
  return (
    <h2 className="mt-6 mb-0 text-[11px] leading-4 font-bold tracking-[.06em] text-ink-subtle uppercase">
      {children}
    </h2>
  )
}

function Item({
  nome,
  semPadding,
  children,
}: {
  nome: string
  semPadding?: boolean
  children: ReactNode
}) {
  return (
    <section className="cat-item" data-componente={nome}>
      <h3 className="mt-0 mb-2 text-[15px] leading-5 font-bold">{nome}</h3>
      <div className="overflow-auto rounded-lg border border-border bg-bg">
        <div className={semPadding ? '' : 'p-4'}>{children}</div>
      </div>
    </section>
  )
}

/** Componente do design system que ainda não foi recriado: diz em qual etapa chega. */
function Pendente({
  nome,
  etapa,
  semPadding,
}: {
  nome: string
  etapa: string
  semPadding?: boolean
}) {
  return (
    <Item nome={nome} {...(semPadding ? { semPadding } : {})}>
      <p className="m-0 text-ink-muted">pendente (etapa {etapa})</p>
    </Item>
  )
}

const CALENDARIO = 'MVP · Atividades'
const FUNIL = 'MVP · Oportunidades'

const iconesDoCatalogo: [string, LucideIcon][] = [
  ['layout-dashboard', LayoutDashboard],
  ['building-2', Building2],
  ['users', Users],
  ['target', Target],
  ['square-kanban', SquareKanban],
  ['calendar', Calendar],
  ['phone', Phone],
  ['message-circle', MessageCircle],
  ['mail', Mail],
  ['map-pin', MapPin],
  ['route', Route],
  ['navigation', Navigation],
  ['bell', Bell],
  ['search', Search],
  ['funnel', Funnel],
  ['star', Star],
  ['zap', Zap],
  ['repeat', Repeat],
  ['paperclip', Paperclip],
  ['settings', Settings],
]

export function Catalogo() {
  const [tema, setTema] = useState<'light' | 'dark'>('light')
  const [densidade, setDensidade] = useState<Densidade>('default')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [tema])

  const empresa = { name: 'Leadtogo Comercial', role: 'Administrador', color: 'teal' } as const

  return (
    <>
      <header className="sticky top-0 z-100 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <b className="mr-auto flex items-center gap-2 text-base">
          <img src={tema === 'dark' ? marcaEscura : marcaClara} alt="" className="size-6" />
          Leadtogo · Catálogo
        </b>
        <SegmentedControl
          label="Tema"
          value={tema}
          onChange={(v) => setTema(v as 'light' | 'dark')}
          options={[
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
        />
        <SegmentedControl
          label="Densidade"
          value={densidade}
          onChange={(v) => setDensidade(v as Densidade)}
          options={[
            { value: 'compact', label: 'Compacta' },
            { value: 'default', label: 'Padrão' },
            { value: 'touch', label: 'Toque' },
          ]}
        />
      </header>
      <main
        id="main"
        data-density={densidade === 'default' ? undefined : densidade}
        className="mx-auto flex max-w-[1320px] flex-col gap-4 p-6"
      >
        <Grupo>Ações</Grupo>
        <Item nome="Button">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={Plus}>
                Nova oportunidade
              </Button>
              <Button>Importar planilha</Button>
              <Button variant="ghost" icon={Funnel}>
                Filtros
              </Button>
              <Button variant="danger-ghost" icon={Trash2}>
                Excluir
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm">
                Salvar
              </Button>
              <Button size="sm" iconRight={ChevronDown}>
                Ações
              </Button>
              <Button variant="primary" loading>
                Consultando Receita
              </Button>
              <Button disabled>Exportar</Button>
              <Button variant="danger">Excluir empresa</Button>
            </div>
          </div>
        </Item>
        <Item nome="IconButton">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon={Ellipsis} label="Mais ações" />
            <IconButton icon={Pencil} label="Editar" variant="secondary" />
            <IconButton icon={Plus} label="Nova atividade" variant="primary" />
            <IconButton icon={Bell} label="Notificações" size="sm" />
            <IconButton icon={Plus} label="Registrar atividade" variant="fab" />
          </div>
        </Item>
        <Item nome="SegmentedControl">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Visualização"
              options={[
                { value: 'kanban', label: 'Kanban', icon: SquareKanban },
                { value: 'lista', label: 'Lista', icon: List },
              ]}
            />
            <SegmentedControl
              label="Período"
              defaultValue="mes"
              options={[
                { value: 'hoje', label: 'Hoje' },
                { value: 'semana', label: 'Semana' },
                { value: 'mes', label: 'Mês' },
                { value: 'tri', label: 'Trimestre' },
              ]}
            />
          </div>
        </Item>

        <Grupo>Formulários</Grupo>
        <Item nome="TextField">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <TextField
              label="CNPJ"
              required
              mono
              placeholder="00.000.000/0000-00"
              defaultValue="12.424.587/0001-45"
              hint="Aceita o CNPJ alfanumérico."
              suffix={
                <Button size="sm" variant="ghost" icon={Search}>
                  Consultar
                </Button>
              }
            />
            <TextField label="Buscar empresas" icon={Search} placeholder="Nome, CNPJ ou cidade" />
            <TextField
              label="E-mail do contato"
              defaultValue="carolina@usidantec"
              error="Informe um e-mail válido, como nome@empresa.com.br."
            />
            <TextArea label="Observações" placeholder="O que aconteceu na visita?" />
          </div>
        </Item>
        <Item nome="Select">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <Select
              label="Vertical"
              defaultValue="Indústria"
              options={['Indústria', 'Saúde', 'Varejo', 'Serviços', 'Agronegócio']}
            />
            <Select
              label="Motivo da perda"
              required
              placeholder="Selecione"
              options={['Preço', 'Concorrência', 'Sem orçamento', 'Sem retorno']}
              hint="Obrigatório para status Perdido."
            />
            <Select
              label="Vendedor"
              options={['Alessandro Dias', 'Carolina Surlo', 'Daniel Surlo']}
            />
          </div>
        </Item>
        <Item nome="Checkbox">
          <div className="flex flex-col gap-3">
            <Checkbox label="Importante" defaultChecked />
            <Checkbox label="Urgente" />
            <Checkbox
              label="Aceita receber WhatsApp"
              description="Consentimento registrado em 05/10/2026 pelo vendedor."
              defaultChecked
            />
          </div>
        </Item>
        <Item nome="Switch">
          <div className="flex flex-col gap-3">
            <Switch label="Vendedores veem todas as empresas" />
            <Switch label="Ao conquistar, mudar o status da empresa para Cliente" defaultChecked />
          </div>
        </Item>

        <Grupo>Exibição</Grupo>
        <Item nome="Badge">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Pendente</Badge>
            <Badge tone="info">Em execução</Badge>
            <Badge tone="success" icon={Check}>
              Realizada
            </Badge>
            <Badge tone="danger" icon={TriangleAlert}>
              Atrasada
            </Badge>
            <Badge tone="warning">Baixada na Receita</Badge>
            <Badge tone="accent">Matriz</Badge>
            <Badge tone="outline">Filial</Badge>
          </div>
        </Item>
        <Item nome="Tag">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="teal">Lead</Tag>
              <Tag color="amber">Prospect</Tag>
              <Tag color="green">Cliente</Tag>
              <Tag color="gray">Inativo</Tag>
              <Tag color="orange">Visitada</Tag>
              <Tag color="blue">Contactada</Tag>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {CORES_DE_TAG.map((cor) => (
                <Tag key={cor} color={cor} onRemove={semEfeito}>
                  {cor}
                </Tag>
              ))}
            </div>
          </div>
        </Item>
        <Item nome="Avatar">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name="Alessandro Dias" size="lg" />
            <Avatar name="Carolina Surlo" />
            <Avatar name="Daniel Surlo" size="sm" />
            <AvatarGroup>
              <Avatar name="Ana Paula" />
              <Avatar name="Bruno Lima" />
              <Avatar name="Marcos Reis" />
            </AvatarGroup>
          </div>
        </Item>
        <Pendente nome="StatTile" etapa="MVP · Dashboard" />
        <Pendente nome="StatusPill" etapa={FUNIL} />
        <Item nome="Tooltip">
          <div className="flex flex-wrap items-center gap-2 pt-7">
            <Tooltip label="Última visita em 12/09/2026" open>
              <span tabIndex={0} className="inline-flex">
                <Tag color="orange">Visitada</Tag>
              </span>
            </Tooltip>
            <Tooltip label="Copiar CNPJ">
              <IconButton icon={Paperclip} label="Copiar CNPJ" />
            </Tooltip>
          </div>
        </Item>

        <Grupo>Atividades</Grupo>
        <Pendente nome="ActivityIcon" etapa={CALENDARIO} />
        <Pendente nome="PriorityMarks" etapa={CALENDARIO} />
        <Pendente nome="ActivityTimeline" etapa={CALENDARIO} />
        <Pendente nome="TaskCard" etapa="MVP · Tarefas" />

        <Grupo>Funil</Grupo>
        <Pendente nome="DealCard" etapa={FUNIL} />
        <Pendente nome="KanbanColumn" etapa={FUNIL} />

        <Grupo>Dados</Grupo>
        <Pendente nome="DataTable" etapa="MVP · Empresas" />
        <Item nome="Tabs">
          <Tabs
            label="Seções da empresa"
            items={[
              { value: 'resumo', label: 'Resumo' },
              { value: 'contatos', label: 'Contatos', count: 3 },
              { value: 'atividades', label: 'Atividades', count: 12 },
              { value: 'oportunidades', label: 'Oportunidades', count: 2 },
              { value: 'historico', label: 'Histórico' },
            ]}
          />
        </Item>

        <Grupo>Navegação</Grupo>
        <Item nome="AppNav" semPadding>
          <AppNav
            tenant={empresa}
            user={{ name: 'Alessandro Dias', role: 'Administrador' }}
            groups={[
              {
                items: [
                  { icon: LayoutDashboard, label: 'Dashboard', active: true },
                  { icon: Building2, label: 'Empresas', count: 342 },
                  { icon: Users, label: 'Contatos' },
                  { icon: Target, label: 'Oportunidades', count: 18 },
                  { icon: SquareKanban, label: 'Tarefas', count: 5 },
                ],
              },
              {
                label: 'Prospecção',
                items: [
                  { icon: Search, label: 'Buscar na Receita' },
                  { icon: Route, label: 'Roteiros' },
                ],
              },
            ]}
          />
        </Item>
        <Item nome="TenantSwitcher">
          <div className="flex max-w-[248px] flex-col gap-3">
            <TenantSwitcher current={empresa} />
            <MenuList
              label="Empresas"
              items={[
                { heading: 'Suas empresas' },
                { label: 'Leadtogo Comercial', checked: true },
                { label: 'Leadtogo Serviços' },
                { separator: true },
                { icon: LayoutDashboard, label: 'Painel consolidado' },
                { icon: Plus, label: 'Criar empresa' },
              ]}
            />
          </div>
        </Item>
        <Item nome="Menu">
          <MenuList
            label="Ações da empresa"
            items={[
              { icon: Pencil, label: 'Editar', shortcut: 'E' },
              { icon: Repeat, label: 'Atualizar pela Receita' },
              { icon: User, label: 'Transferir carteira' },
              { icon: Download, label: 'Exportar' },
              { separator: true },
              { icon: Trash2, label: 'Mover para a lixeira', danger: true },
            ]}
          />
        </Item>

        <Grupo>Feedback</Grupo>
        <Item nome="Alert">
          <div className="flex flex-col gap-3">
            <Alert
              tone="warning"
              title="Empresa baixada na Receita"
              actions={<Button size="sm">Ver dados</Button>}
            >
              A verificação mensal encontrou a situação BAIXADA em 01/10/2026.
            </Alert>
            <Alert tone="info">
              Esta filial está ligada à matriz Usidantec (12.424.587/0001-45).
            </Alert>
            <Alert tone="danger" title="Não foi possível consultar o CNPJ">
              A Receita não respondeu. Tente de novo em alguns minutos ou preencha à mão.
            </Alert>
            <Alert tone="success">42 empresas importadas como Lead.</Alert>
          </div>
        </Item>
        <Item nome="Toast">
          <div className="flex flex-col gap-3">
            <Toast
              title="Atividade concluída"
              description="Visita técnica · Usidantec"
              action={
                <Button size="sm" variant="ghost">
                  Agendar próxima
                </Button>
              }
            />
            <Toast
              tone="danger"
              title="Não foi possível salvar"
              description="Verifique a conexão. A atividade ficou na fila e será enviada."
            />
          </div>
        </Item>
        <Item nome="EmptyState">
          <EmptyState
            icon={MapPin}
            title="Nenhuma visita nesta semana"
            description="Filtre as empresas sem visita há 90 dias para montar o roteiro da semana."
            actions={
              <>
                <Button variant="primary" icon={Route}>
                  Montar roteiro
                </Button>
                <Button>Ver empresas</Button>
              </>
            }
          />
        </Item>
        <Item nome="Skeleton">
          <div className="grid max-w-[420px] grid-cols-[40px_1fr] items-center gap-3">
            <Skeleton width={40} height={40} circle />
            <Skeleton lines={3} />
          </div>
        </Item>
        <Item nome="Dialog" semPadding>
          <div className="flex items-center justify-center bg-overlay p-6">
            <PainelDoDialogo
              title="Marcar como perdida"
              description="A oportunidade sai do Kanban e fica registrada na fase Proposta."
              footer={
                <>
                  <Button>Cancelar</Button>
                  <Button variant="danger">Marcar como perdida</Button>
                </>
              }
            >
              <Select
                label="Motivo"
                required
                placeholder="Selecione"
                options={['Preço', 'Concorrência', 'Sem orçamento', 'Sem retorno']}
              />
              <TextArea label="Detalhe" placeholder="Opcional" />
            </PainelDoDialogo>
          </div>
        </Item>

        <Grupo>Base</Grupo>
        <Item nome="Icon">
          <div className="flex flex-wrap items-center gap-[14px] text-ink-muted">
            {iconesDoCatalogo.map(([nome, icone]) => (
              <Icon key={nome} icon={icone} size={20} label={nome} />
            ))}
          </div>
        </Item>

        <Grupo>Exemplos</Grupo>
        <Pendente nome="TelaFunil" etapa={FUNIL} semPadding />
      </main>
    </>
  )
}
