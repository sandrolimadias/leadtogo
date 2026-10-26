import type { TipoAtividade } from '@leadtogo/api-client'
import type {
  AlterarTipoAtividadeEntrada,
  ContaComo,
  CorDeTag,
  CriarTipoAtividadeEntrada,
} from '@leadtogo/shared'
import {
  Briefcase,
  Calendar,
  Clock,
  Flag,
  Globe,
  Handshake,
  Mail,
  MapPin,
  MessageCircle,
  Paperclip,
  Phone,
  Route,
  Star,
  SquareCheck,
  Target,
  Users,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react'

import { Select } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { classeDaCor } from '@leadtogo/ui/cores'
import { Badge } from '@leadtogo/ui/exibicao'
import { cn } from '@leadtogo/ui/cn'

import { SeletorDeCor } from './base'
import { type ConfigDaLista, ListaDeCadastro } from './lista'

/** Ícones que a tela oferece (todos do conjunto Lucide do design system), com o nome em português. */
const ICONES: { nome: string; rotulo: string; icone: LucideIcon }[] = [
  { nome: 'phone', rotulo: 'Telefone', icone: Phone },
  { nome: 'message-circle', rotulo: 'Mensagem', icone: MessageCircle },
  { nome: 'mail', rotulo: 'E-mail', icone: Mail },
  { nome: 'map-pin', rotulo: 'Local', icone: MapPin },
  { nome: 'users', rotulo: 'Pessoas', icone: Users },
  { nome: 'calendar', rotulo: 'Calendário', icone: Calendar },
  { nome: 'square-check', rotulo: 'Tarefa', icone: SquareCheck },
  { nome: 'handshake', rotulo: 'Negócio', icone: Handshake },
  { nome: 'briefcase', rotulo: 'Maleta', icone: Briefcase },
  { nome: 'flag', rotulo: 'Bandeira', icone: Flag },
  { nome: 'star', rotulo: 'Estrela', icone: Star },
  { nome: 'clock', rotulo: 'Relógio', icone: Clock },
  { nome: 'paperclip', rotulo: 'Anexo', icone: Paperclip },
  { nome: 'route', rotulo: 'Rota', icone: Route },
  { nome: 'globe', rotulo: 'Globo', icone: Globe },
  { nome: 'target', rotulo: 'Alvo', icone: Target },
]
const ICONE_POR_NOME: Record<string, LucideIcon> = Object.fromEntries(
  ICONES.map((i) => [i.nome, i.icone]),
)

interface Estado {
  nome: string
  icone: string
  cor: CorDeTag
  contaComo: ContaComo
  exigeEmpresa: boolean
}

const OPCOES_CONTA_COMO = [
  { value: 'visita', label: 'Visita: atualiza a última visita e aplica a tag Visitada' },
  { value: 'contato', label: 'Contato: atualiza o último contato e aplica a tag Contactada' },
  { value: 'nenhum', label: 'Nenhum: não altera a carteira' },
]

const ehTarefa = (t: TipoAtividade | null) => t?.chaveSistema === 'tarefa'

/** Bolha colorida com o ícone do tipo (como na linha do tempo e na agenda). */
export function BolhaDoTipo({ icone, cor }: { icone: string; cor: string }) {
  const Icone = ICONE_POR_NOME[icone] ?? CalendarCheck
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-7 flex-none items-center justify-center rounded-full',
        classeDaCor[cor as CorDeTag],
      )}
    >
      <Icone size={15} strokeWidth={1.75} />
    </span>
  )
}

const config: ConfigDaLista<
  TipoAtividade,
  Estado,
  CriarTipoAtividadeEntrada,
  AlterarTipoAtividadeEntrada
> = {
  chave: 'tipos-atividade',
  titulo: 'Tipos de atividade',
  descricao: 'Ligação, visita, reunião... O tipo diz se a atividade conta como visita ou contato.',
  icone: CalendarCheck,
  rotulos: {
    singular: 'tipo',
    plural: 'os tipos de atividade',
    novo: 'Novo tipo',
    vazioTitulo: 'Nenhum tipo de atividade',
    vazioDescricao: 'Crie os tipos de atividade que você registra, como Visita ou Ligação.',
    criado: 'Tipo criado',
    atualizado: 'Tipo atualizado',
    excluido: (nome) => `Tipo ${nome} excluído`,
    exemploDoNome: 'Ex.: Visita técnica',
  },
  servicos: (s) => s.cadastros.tiposAtividade,
  linha: (t) => (
    <>
      <BolhaDoTipo icone={t.icone} cor={t.cor} />
      <span className="font-semibold">{t.nome}</span>
      {t.contaComo === 'visita' ? <Badge tone="accent">Conta como visita</Badge> : null}
      {t.contaComo === 'contato' ? <Badge tone="accent">Conta como contato</Badge> : null}
      {t.exigeEmpresa ? null : <Badge tone="outline">Empresa opcional</Badge>}
    </>
  ),
  estadoInicial: (t) => ({
    nome: t?.nome ?? '',
    icone: t?.icone ?? 'calendar',
    cor: t?.cor ?? 'gray',
    contaComo: t?.contaComo ?? 'nenhum',
    exigeEmpresa: t?.exigeEmpresa ?? true,
  }),
  campos: ({ estado, mudar, item }) => {
    const travado = ehTarefa(item)
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <span id="icone-rotulo" className="text-[13px] leading-[18px] font-semibold">
            Ícone
          </span>
          <div role="radiogroup" aria-labelledby="icone-rotulo" className="flex flex-wrap gap-1.5">
            {ICONES.map((i) => {
              const marcado = i.nome === estado.icone
              return (
                <button
                  key={i.nome}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  aria-label={i.rotulo}
                  title={i.rotulo}
                  onClick={() => mudar({ icone: i.nome })}
                  className={cn(
                    'inline-flex size-9 cursor-pointer items-center justify-center rounded-sm border bg-surface text-ink hover:bg-surface-hover',
                    marcado
                      ? 'border-brand bg-brand-soft text-brand outline-2 outline-offset-1 outline-brand'
                      : 'border-border-strong',
                  )}
                >
                  <i.icone size={17} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </div>
        <SeletorDeCor label="Cor" value={estado.cor} onChange={(cor) => mudar({ cor })} />
        <Select
          id="tipos-atividade-conta-como"
          label="Conta como"
          value={estado.contaComo}
          options={OPCOES_CONTA_COMO}
          disabled={travado}
          hint={travado ? 'O tipo Tarefa é interno: não conta como visita nem contato.' : undefined}
          onChange={(e) => mudar({ contaComo: e.target.value as ContaComo })}
        />
        <div className="flex flex-col gap-1">
          <Switch
            label="Exige empresa"
            checked={estado.exigeEmpresa}
            disabled={travado}
            onChange={(e) => mudar({ exigeEmpresa: e.target.checked })}
          />
          <span className="text-xs text-ink-muted">
            {travado
              ? 'O tipo Tarefa fica sempre com a empresa opcional.'
              : 'Desligado, a atividade pode ser registrada sem empresa (tarefa interna).'}
          </span>
        </div>
      </>
    )
  },
  paraCriar: (e) => ({
    nome: e.nome,
    icone: e.icone,
    cor: e.cor,
    contaComo: e.contaComo,
    exigeEmpresa: e.exigeEmpresa,
  }),
  paraAlterar: (e) => ({
    nome: e.nome,
    icone: e.icone,
    cor: e.cor,
    contaComo: e.contaComo,
    exigeEmpresa: e.exigeEmpresa,
  }),
  protecao: (t) =>
    ehTarefa(t) ? { semInativar: true, semExcluir: true, nota: 'Tipo interno do sistema' } : {},
}

/** Configurações → Tipos de atividade. */
export function TelaDeTiposDeAtividade() {
  return <ListaDeCadastro config={config} />
}
