import type { ModeloDeVisita, ResultadoDeVisita } from '@leadtogo/api-client'
import type {
  AlterarResultadoDeVisitaEntrada,
  CriarResultadoDeVisitaEntrada,
} from '@leadtogo/shared'
import { ClipboardCheck } from 'lucide-react'

import { Select } from '@/components/ui/campos'
import { Badge } from '@/components/ui/exibicao'
import { type ConfigDaLista, ListaDeCadastro } from '@/telas/cadastros/lista'

interface Estado {
  nome: string
  modeloId: string
}

const NOTA_DO_SISTEMA: Record<NonNullable<ResultadoDeVisita['chaveSistema']>, string> = {
  nao_localizada: 'Do sistema: conta como atividade, mas não marca a empresa como visitada.',
  encerrada: 'Do sistema: pergunta se a empresa passa a Inativo.',
}

/**
 * Configurações → Visitas → Resultados: o resultado é escolhido pelo vendedor no relatório e define
 * o modelo do formulário. Os dois de sistema só se renomeiam e trocam de modelo.
 */
export function AbaDeResultados({ modelos }: { modelos: ModeloDeVisita[] }) {
  const nomeDoModelo = new Map(modelos.map((m) => [m.id, m.nome]))
  const ativos = modelos.filter((m) => m.ativo)
  const padrao = ativos.find((m) => m.padrao) ?? ativos[0]

  const config: ConfigDaLista<
    ResultadoDeVisita,
    Estado,
    CriarResultadoDeVisitaEntrada,
    AlterarResultadoDeVisitaEntrada
  > = {
    chave: 'visitas-resultados',
    titulo: 'Resultados da visita',
    descricao:
      'O vendedor escolhe o resultado ao fazer o relatório; cada resultado abre o seu modelo de relatório.',
    icone: ClipboardCheck,
    rotulos: {
      singular: 'resultado',
      plural: 'os resultados da visita',
      novo: 'Novo resultado',
      vazioTitulo: 'Nenhum resultado',
      vazioDescricao: 'Crie os resultados que o vendedor escolhe ao relatar a visita.',
      criado: 'Resultado criado',
      atualizado: 'Resultado atualizado',
      excluido: (nome) => `Resultado ${nome} excluído`,
      exemploDoNome: 'Ex.: Proposta entregue',
    },
    servicos: (s) => s.visitas.resultados,
    linha: (r) => (
      <>
        <span className="font-semibold">{r.nome}</span>
        <Badge tone="outline">{nomeDoModelo.get(r.modeloId) ?? 'Modelo excluído'}</Badge>
        {r.chaveSistema ? <Badge tone="accent">Sistema</Badge> : null}
      </>
    ),
    estadoInicial: (r) => ({ nome: r?.nome ?? '', modeloId: r?.modeloId ?? padrao?.id ?? '' }),
    campos: ({ estado, mudar, item }) => (
      <Select
        id="resultado-modelo"
        label="Modelo do relatório"
        hint="O formulário que o vendedor preenche quando escolhe este resultado."
        value={estado.modeloId}
        options={[
          ...ativos.map((m) => ({ value: m.id, label: m.padrao ? `${m.nome} (padrão)` : m.nome })),
          // o modelo atual do item, mesmo inativo, continua aparecendo
          ...(item && !ativos.some((m) => m.id === item.modeloId)
            ? [
                {
                  value: item.modeloId,
                  label: `${nomeDoModelo.get(item.modeloId) ?? 'Modelo'} (inativo)`,
                },
              ]
            : []),
        ]}
        onChange={(e) => mudar({ modeloId: e.target.value })}
      />
    ),
    validar: (e) => (e.modeloId ? undefined : 'Escolha o modelo do relatório.'),
    paraCriar: (e) => ({ nome: e.nome, modeloId: e.modeloId }),
    paraAlterar: (e) => ({ nome: e.nome, modeloId: e.modeloId }),
    protecao: (r) =>
      r.chaveSistema
        ? { semInativar: true, semExcluir: true, nota: NOTA_DO_SISTEMA[r.chaveSistema] }
        : {},
  }
  return <ListaDeCadastro config={config} />
}
