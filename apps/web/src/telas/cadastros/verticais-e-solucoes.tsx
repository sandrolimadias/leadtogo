import type { Solucao, Vertical } from '@leadtogo/api-client'
import type {
  AlterarSolucaoEntrada,
  AlterarVerticalEntrada,
  CorDeTag,
  CriarSolucaoEntrada,
  CriarVerticalEntrada,
} from '@leadtogo/shared'
import { Lightbulb, Factory } from 'lucide-react'

import { TextArea } from '@/components/ui/campos'
import { Tag } from '@/components/ui/exibicao'

import { SeletorDeCor } from './base'
import { type ConfigDaLista, ListaDeCadastro } from './lista'

interface EstadoDaVertical {
  nome: string
  cor: CorDeTag
}
interface EstadoDaSolucao extends EstadoDaVertical {
  descricao: string
}

const verticais: ConfigDaLista<
  Vertical,
  EstadoDaVertical,
  CriarVerticalEntrada,
  AlterarVerticalEntrada
> = {
  chave: 'verticais',
  titulo: 'Verticais',
  descricao: 'O segmento de atuação de cada empresa da carteira (uma por empresa).',
  icone: Factory,
  rotulos: {
    singular: 'vertical',
    plural: 'as verticais',
    novo: 'Nova vertical',
    vazioTitulo: 'Nenhuma vertical ainda',
    vazioDescricao: 'Crie as verticais que você atende, como Indústria ou Saúde.',
    criado: 'Vertical criada',
    atualizado: 'Vertical atualizada',
    excluido: (nome) => `Vertical ${nome} excluída`,
    exemploDoNome: 'Ex.: Indústria',
  },
  servicos: (s) => s.cadastros.verticais,
  linha: (v) => <Tag color={v.cor}>{v.nome}</Tag>,
  estadoInicial: (v) => ({ nome: v?.nome ?? '', cor: v?.cor ?? 'gray' }),
  campos: ({ estado, mudar }) => (
    <SeletorDeCor label="Cor" value={estado.cor} onChange={(cor) => mudar({ cor })} />
  ),
  paraCriar: (e) => ({ nome: e.nome, cor: e.cor }),
  paraAlterar: (e) => ({ nome: e.nome, cor: e.cor }),
}

const solucoes: ConfigDaLista<
  Solucao,
  EstadoDaSolucao,
  CriarSolucaoEntrada,
  AlterarSolucaoEntrada
> = {
  chave: 'solucoes',
  titulo: 'Soluções',
  descricao: 'As linhas de solução que você vende; cada oportunidade aponta para uma.',
  icone: Lightbulb,
  rotulos: {
    singular: 'solução',
    plural: 'as soluções',
    novo: 'Nova solução',
    vazioTitulo: 'Nenhuma solução ainda',
    vazioDescricao: 'Crie as soluções que você vende, como Monitoramento de máquinas.',
    criado: 'Solução criada',
    atualizado: 'Solução atualizada',
    excluido: (nome) => `Solução ${nome} excluída`,
    exemploDoNome: 'Ex.: Monitoramento de máquinas',
  },
  servicos: (s) => s.cadastros.solucoes,
  linha: (s) => (
    <>
      <Tag color={s.cor}>{s.nome}</Tag>
      {s.descricao ? <span className="text-[13px] text-ink-muted">{s.descricao}</span> : null}
    </>
  ),
  estadoInicial: (s) => ({
    nome: s?.nome ?? '',
    cor: s?.cor ?? 'gray',
    descricao: s?.descricao ?? '',
  }),
  campos: ({ estado, mudar }) => (
    <>
      <SeletorDeCor label="Cor" value={estado.cor} onChange={(cor) => mudar({ cor })} />
      <TextArea
        id="solucoes-descricao"
        label="Descrição"
        rows={3}
        maxLength={500}
        hint="Opcional. Até 500 caracteres."
        value={estado.descricao}
        onChange={(e) => mudar({ descricao: e.target.value })}
      />
    </>
  ),
  paraCriar: (e) => ({ nome: e.nome, cor: e.cor, descricao: e.descricao.trim() || null }),
  paraAlterar: (e) => ({ nome: e.nome, cor: e.cor, descricao: e.descricao.trim() || null }),
}

/** Configurações → Verticais e soluções. */
export function TelaDeVerticaisESolucoes() {
  return (
    <div className="flex flex-col gap-8">
      <ListaDeCadastro config={verticais} />
      <ListaDeCadastro config={solucoes} />
    </div>
  )
}
