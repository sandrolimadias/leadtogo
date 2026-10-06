import {
  Building2,
  Download,
  Inbox,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Button, IconButton } from '@/components/ui/button'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { Select, TextArea, TextField } from '@/components/ui/campos'
import { Dialog, Sheet } from '@/components/ui/dialog'
import { Avatar, Badge, Tag } from '@/components/ui/exibicao'
import { CORES_DE_TAG } from '@/components/ui/cores'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Menu } from '@/components/ui/menu'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tabs } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/tooltip'

type Tema = 'sistema' | 'claro' | 'escuro'
type Densidade = 'compact' | 'default' | 'touch'

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sec-${titulo}`} className="flex flex-col gap-3">
      <h2 id={`sec-${titulo}`} className="title-md m-0">
        {titulo}
      </h2>
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-surface p-4">
        {children}
      </div>
    </section>
  )
}

/**
 * Catálogo dos componentes, SÓ EM DESENVOLVIMENTO (rota /dev/catalogo, fora do build de produção).
 * Troca o tema e a densidade para ver cada componente como o app o mostra.
 */
export function Catalogo() {
  const [tema, setTema] = useState<Tema>('sistema')
  const [densidade, setDensidade] = useState<Densidade>('default')
  const [dialogo, setDialogo] = useState(false)
  const [folha, setFolha] = useState(false)

  const aplicarTema = (novo: Tema) => {
    setTema(novo)
    const raiz = document.documentElement
    if (novo === 'sistema') raiz.removeAttribute('data-theme')
    else raiz.setAttribute('data-theme', novo === 'claro' ? 'light' : 'dark')
  }

  return (
    <div
      data-density={densidade === 'default' ? undefined : densidade}
      className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display m-0">Catálogo de componentes</h1>
          <p className="body-sm m-0 text-ink-muted">
            Só em desenvolvimento. Tokens de docs/design-system/.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SegmentedControl
            label="Tema"
            value={tema}
            onChange={(v) => aplicarTema(v as Tema)}
            options={[
              { value: 'sistema', label: 'Sistema' },
              { value: 'claro', label: 'Claro' },
              { value: 'escuro', label: 'Escuro' },
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
        </div>
      </header>

      <Secao titulo="Botões">
        <Button variant="primary" icon={Plus}>
          Nova oportunidade
        </Button>
        <Button>Cancelar</Button>
        <Button variant="ghost" icon={Upload}>
          Importar planilha
        </Button>
        <Button variant="danger" icon={Trash2}>
          Excluir
        </Button>
        <Button variant="danger-ghost">Excluir</Button>
        <Button variant="primary" loading>
          Consultando Receita…
        </Button>
        <Button variant="primary" disabled>
          Desativado
        </Button>
        <Button size="sm">Pequeno</Button>
        <Button size="lg" variant="primary">
          Grande
        </Button>
        <Button variant="primary" block className="max-w-xs">
          Largura total
        </Button>
        <IconButton icon={Pencil} label="Editar" />
        <IconButton icon={Settings} label="Configurações" variant="secondary" />
        <IconButton icon={Plus} label="Registrar atividade" variant="fab" />
      </Secao>

      <Secao titulo="Campos">
        <div className="grid w-full gap-4 md:grid-cols-2">
          <TextField label="Empresa" placeholder="Nome, CNPJ ou cidade" icon={Search} />
          <TextField
            label="CNPJ"
            mono
            defaultValue="12.424.587/0001-45"
            hint="Aceita o CNPJ alfanumérico."
            suffix={
              <Button variant="primary" size="sm">
                Consultar
              </Button>
            }
          />
          <TextField
            label="E-mail"
            required
            error="Informe um e-mail válido, como nome@empresa.com.br."
            defaultValue="ana@"
          />
          <Select
            label="Status"
            placeholder="Escolha"
            options={['Lead', 'Prospect', 'Cliente', 'Inativo']}
          />
          <TextArea label="Observações" hint="Só a equipe vê." />
          <div className="flex flex-col gap-3">
            <Checkbox label="Converter em contato" description="O sócio vira contato da empresa." />
            <Switch label="Vendedores veem todas as empresas" />
            <SegmentedControl
              label="Visão"
              options={[
                { value: 'k', label: 'Kanban' },
                { value: 'l', label: 'Lista' },
              ]}
            />
          </div>
        </div>
      </Secao>

      <Secao titulo="Exibição">
        <Badge>Pendente</Badge>
        <Badge tone="accent">Ativo</Badge>
        <Badge tone="success">Ativa na Receita</Badge>
        <Badge tone="warning">Parada</Badge>
        <Badge tone="danger">Atrasada</Badge>
        <Badge tone="info">Novo</Badge>
        <Badge tone="outline">Matriz</Badge>
        <div className="flex w-full flex-wrap gap-2">
          {CORES_DE_TAG.map((cor) => (
            <Tag key={cor} color={cor}>
              {cor}
            </Tag>
          ))}
          <Tag color="teal" onRemove={() => toast.info('Tag removida')}>
            Removível
          </Tag>
          <Tag color="gray" variant="outline" dot={false}>
            Contorno
          </Tag>
        </div>
        <div className="flex items-center gap-2">
          <Avatar name="Alessandro Dias" size="sm" />
          <Avatar name="Maria Souza" />
          <Avatar name="João Pedro Lima" size="lg" />
        </div>
      </Secao>

      <Secao titulo="Navegação e menus">
        <div className="w-full">
          <Tabs
            label="Minhas atividades"
            items={[
              { value: 'hoje', label: 'Hoje', count: 3 },
              { value: 'atrasadas', label: 'Atrasadas', count: 1 },
              { value: 'proximos', label: 'Próximos 7 dias' },
            ]}
          />
        </div>
        <Menu
          trigger={<Button icon={Building2}>Suas empresas</Button>}
          items={[
            { heading: 'Suas empresas' },
            { label: 'Aurora Móveis · Administrador', checked: true },
            { label: 'Borealis Logística · Vendedor' },
            { separator: true },
            { label: 'Painel consolidado' },
            { icon: Trash2, label: 'Sair', danger: true },
          ]}
        />
        <Tooltip label="Baixar relatório">
          <IconButton icon={Download} label="Baixar" />
        </Tooltip>
      </Secao>

      <Secao titulo="Avisos e estados">
        <div className="flex w-full flex-col gap-3">
          <Alert tone="info" title="Informação">
            Dados atualizados há 5 minutos.
          </Alert>
          <Alert tone="success" title="Dados preenchidos pela Receita">
            Situação cadastral: ativa.
          </Alert>
          <Alert tone="warning" title="Atenção">
            Esta empresa não tem contato há 60 dias.
          </Alert>
          <Alert tone="danger" title="Não foi possível entrar">
            E-mail ou senha incorretos.
          </Alert>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => toast.success('Empresa ativa trocada')}>Toast de sucesso</Button>
          <Button
            onClick={() =>
              toast.error('Não foi possível salvar', { description: 'Tente de novo.' })
            }
          >
            Toast de erro
          </Button>
        </div>
        <div className="w-full">
          <EmptyState
            icon={Inbox}
            title="Nenhuma empresa ainda"
            description="Cadastre a primeira para começar a montar a carteira."
            actions={
              <Button variant="primary" icon={Plus}>
                Nova empresa
              </Button>
            }
          />
        </div>
        <div className="flex w-64 flex-col gap-2">
          <Skeleton height={16} width="70%" />
          <Skeleton lines={3} />
          <Skeleton circle width={40} height={40} />
        </div>
      </Secao>

      <Secao titulo="Diálogo e folha">
        <Button onClick={() => setDialogo(true)}>Abrir diálogo (desktop)</Button>
        <Button onClick={() => setFolha(true)}>Abrir folha (celular)</Button>
        <Dialog
          open={dialogo}
          onOpenChange={setDialogo}
          title="Fechar oportunidade"
          description="Proposta Aurora · Aurora Móveis"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogo(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => setDialogo(false)}>
                Fechar oportunidade
              </Button>
            </>
          }
        >
          <Select
            label="Motivo"
            placeholder="Escolha o motivo"
            options={['Preço', 'Prazo', 'Concorrente']}
          />
        </Dialog>
        <Sheet
          open={folha}
          onOpenChange={setFolha}
          title="Registrar atividade"
          footer={
            <Button variant="primary" onClick={() => setFolha(false)}>
              Salvar
            </Button>
          }
        >
          <TextField label="Título" placeholder="Visita de relacionamento" />
        </Sheet>
      </Secao>
    </div>
  )
}
