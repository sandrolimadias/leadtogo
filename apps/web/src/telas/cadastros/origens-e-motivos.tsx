import type { Motivo, Origem } from '@leadtogo/api-client'
import type {
  AlterarMotivoEntrada,
  AlterarOrigemEntrada,
  CriarMotivoEntrada,
  CriarOrigemEntrada,
  StatusComMotivo,
} from '@leadtogo/shared'
import { CircleHelp, Compass } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/exibicao'

import { type ConfigDaLista, ListaDeCadastro } from './lista'

const ROTULO_DO_STATUS: Record<StatusComMotivo, string> = {
  perdido: 'Perdido',
  cancelado: 'Cancelado',
  suspenso: 'Suspenso',
}
const STATUS: StatusComMotivo[] = ['perdido', 'cancelado', 'suspenso']

interface EstadoDaOrigem {
  nome: string
}
type EstadoDoMotivo = { nome: string } & Record<StatusComMotivo, boolean>

const origens: ConfigDaLista<Origem, EstadoDaOrigem, CriarOrigemEntrada, AlterarOrigemEntrada> = {
  chave: 'origens',
  titulo: 'Origens',
  descricao: 'De onde vêm as oportunidades: indicação, site, evento...',
  icone: Compass,
  rotulos: {
    singular: 'origem',
    plural: 'as origens',
    novo: 'Nova origem',
    vazioTitulo: 'Nenhuma origem ainda',
    vazioDescricao: 'Crie as origens das suas oportunidades, como Indicação ou Site.',
    criado: 'Origem criada',
    atualizado: 'Origem atualizada',
    excluido: (nome) => `Origem ${nome} excluída`,
    exemploDoNome: 'Ex.: Indicação',
  },
  servicos: (s) => s.cadastros.origens,
  linha: (o) => <span className="font-semibold">{o.nome}</span>,
  estadoInicial: (o) => ({ nome: o?.nome ?? '' }),
  campos: () => null,
  paraCriar: (e) => ({ nome: e.nome }),
  paraAlterar: (e) => ({ nome: e.nome }),
  protecao: (o) =>
    o.chaveSistema
      ? {
          semInativar: true,
          semExcluir: true,
          nota: 'Usada pelo sistema na importação de planilhas',
        }
      : {},
}

const motivos: ConfigDaLista<Motivo, EstadoDoMotivo, CriarMotivoEntrada, AlterarMotivoEntrada> = {
  chave: 'motivos',
  titulo: 'Motivos',
  descricao: 'Por que uma oportunidade foi perdida, cancelada ou suspensa.',
  icone: CircleHelp,
  rotulos: {
    singular: 'motivo',
    plural: 'os motivos',
    novo: 'Novo motivo',
    vazioTitulo: 'Nenhum motivo ainda',
    vazioDescricao: 'Sem motivos, não dá para fechar uma oportunidade como perdida.',
    criado: 'Motivo criado',
    atualizado: 'Motivo atualizado',
    excluido: (nome) => `Motivo ${nome} excluído`,
    exemploDoNome: 'Ex.: Preço',
  },
  servicos: (s) => s.cadastros.motivos,
  linha: (m) => (
    <>
      <span className="font-semibold">{m.nome}</span>
      {m.aplicaA.map((s) => (
        <Badge key={s} tone="outline">
          {ROTULO_DO_STATUS[s]}
        </Badge>
      ))}
    </>
  ),
  estadoInicial: (m) => ({
    nome: m?.nome ?? '',
    perdido: m?.aplicaA.includes('perdido') ?? true,
    cancelado: m?.aplicaA.includes('cancelado') ?? false,
    suspenso: m?.aplicaA.includes('suspenso') ?? false,
  }),
  campos: ({ estado, mudar }) => (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-[13px] leading-[18px] font-semibold">Vale para</legend>
      {STATUS.map((s) => (
        <Checkbox
          key={s}
          label={ROTULO_DO_STATUS[s]}
          checked={estado[s]}
          onChange={(e) => mudar({ [s]: e.target.checked })}
        />
      ))}
    </fieldset>
  ),
  validar: (e) => (STATUS.some((s) => e[s]) ? undefined : 'Escolha ao menos um status.'),
  paraCriar: (e) => ({ nome: e.nome, aplicaA: STATUS.filter((s) => e[s]) }),
  paraAlterar: (e) => ({ nome: e.nome, aplicaA: STATUS.filter((s) => e[s]) }),
}

/** Configurações → Origens e motivos. */
export function TelaDeOrigensEMotivos() {
  return (
    <div className="flex flex-col gap-8">
      <ListaDeCadastro config={origens} />
      <ListaDeCadastro config={motivos} />
    </div>
  )
}
