import { sql } from '@leadtogo/db'
import {
  type CampoComValores,
  type OportunidadeDaLinha,
  paraComparar,
  ROTULO_DO_STATUS,
  statusExigeMotivo,
} from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { type MapaDeTipos, montarMapaDeTipos } from './previa-novos-tipos.js'

/** O que o lote de oportunidades guarda em `importacoes.mapeamento`, além das colunas e dos campos. */
export interface MapeamentoDeOportunidades {
  campos?: Record<string, string>
  /** O funil do lote; sem ele, o funil padrão */
  funilId?: string
  /** Conquistadas mudam o Status da empresa para Cliente (desligado por padrão) */
  clienteAoConquistar?: boolean
  /** Por campo: o valor da coluna (sem acento e em minúsculas) → id do cadastro; nulo = pular (fase e
   * motivo) ou "sem" (origem e solução) */
  valores?: Partial<Record<CampoComValores, Record<string, string | null>>>
}

export interface FaseDoFunil {
  id: string
  nome: string
  probabilidadePadrao: number
}

/** Os cadastros que as linhas usam, lidos uma vez por bloco (prévia e executor leem igual). */
export interface CadastrosDaOportunidade {
  funil: { id: string; nome: string }
  /** A fase quando a planilha não diz (a primeira fase ativa do funil) */
  primeiraFase: FaseDoFunil
  fases: MapaDeTipos
  fasesPorId: Map<string, FaseDoFunil>
  motivos: MapaDeTipos
  /** Os status para os quais cada motivo vale */
  motivoValePara: Map<string, string[]>
  origens: MapaDeTipos
  solucoes: MapaDeTipos
  clienteAoConquistar: boolean
}

/**
 * Lê o funil do lote (ou o padrão) e os cadastros ativos, e monta os mapas de valores: o que a pessoa
 * apontou vale; o resto casa pelo nome. Devolve `falha` se o funil não serve mais.
 */
export async function carregarCadastros(
  db: Transacao,
  mapeamento: MapeamentoDeOportunidades,
): Promise<CadastrosDaOportunidade | { falha: string }> {
  const [funil] = await db.execute<{ id: string; nome: string; ativo: boolean }>(
    mapeamento.funilId
      ? sql`SELECT id, nome, ativo FROM funis WHERE id = ${mapeamento.funilId} AND excluido_em IS NULL`
      : sql`SELECT id, nome, ativo FROM funis WHERE padrao AND excluido_em IS NULL LIMIT 1`,
  )
  if (!funil) return { falha: 'O funil escolhido não existe mais.' }
  if (!funil.ativo) return { falha: `O funil "${funil.nome}" está inativo.` }
  const fases = await db.execute<{ id: string; nome: string; probabilidade_padrao: number }>(sql`
    SELECT id, nome, probabilidade_padrao FROM funil_fases
    WHERE funil_id = ${funil.id} AND ativo AND excluido_em IS NULL
    ORDER BY ordem, nome`)
  const primeira = fases[0]
  if (!primeira) return { falha: `O funil "${funil.nome}" não tem fase ativa.` }
  const motivos = await db.execute<{ id: string; nome: string; aplica_a: string[] }>(sql`
    SELECT id, nome, aplica_a::text[] AS aplica_a FROM motivos WHERE ativo AND excluido_em IS NULL`)
  const ativos = (tabela: 'origens' | 'solucoes') =>
    db.execute<{ id: string; nome: string }>(
      sql`SELECT id, nome FROM ${sql.identifier(tabela)} WHERE ativo AND excluido_em IS NULL`,
    )
  const escolhidos = mapeamento.valores ?? {}
  const daFase = (f: (typeof fases)[number]): FaseDoFunil => ({
    id: f.id,
    nome: f.nome,
    probabilidadePadrao: f.probabilidade_padrao,
  })
  return {
    funil: { id: funil.id, nome: funil.nome },
    primeiraFase: daFase(primeira),
    fases: montarMapaDeTipos(fases, escolhidos.fase ?? {}),
    fasesPorId: new Map(fases.map((f) => [f.id, daFase(f)])),
    motivos: montarMapaDeTipos(motivos, escolhidos.motivo ?? {}),
    motivoValePara: new Map(motivos.map((m) => [m.id, m.aplica_a])),
    origens: montarMapaDeTipos(await ativos('origens'), escolhidos.origem ?? {}),
    solucoes: montarMapaDeTipos(await ativos('solucoes'), escolhidos.solucao ?? {}),
    clienteAoConquistar: mapeamento.clienteAoConquistar ?? false,
  }
}

export type CadastrosDaLinha =
  | {
      ok: true
      fase: FaseDoFunil
      motivoId: string | null
      origem: { id: string; nome: string } | null
      solucao: { id: string; nome: string } | null
      avisos: string[]
    }
  | { ok: false; motivo: string }

/**
 * Os cadastros de uma linha: a fase (sem valor, a primeira; valor sem correspondência ou marcado para
 * pular, a linha pula), o motivo (obrigatório em Perdida, Cancelada e Suspensa, e precisa valer para o
 * status), a origem e a solução (sem correspondência: entra sem o campo, com aviso).
 */
export function resolverCadastros(
  o: OportunidadeDaLinha,
  c: CadastrosDaOportunidade,
): CadastrosDaLinha {
  let fase = c.primeiraFase
  if (o.fase) {
    const achada = c.fases.get(paraComparar(o.fase))
    if (!achada) {
      return {
        ok: false,
        motivo:
          achada === null
            ? `Fase "${o.fase.slice(0, 40)}" marcada para pular.`
            : `Fase "${o.fase.slice(0, 40)}" não existe no funil "${c.funil.nome}" nem foi apontada para uma fase.`,
      }
    }
    fase = c.fasesPorId.get(achada.id) ?? c.primeiraFase
  }

  let motivoId: string | null = null
  if (statusExigeMotivo(o.status)) {
    const rotulo = ROTULO_DO_STATUS[o.status]
    if (!o.motivo) return { ok: false, motivo: `Oportunidade ${rotulo} exige o Motivo.` }
    const achado = c.motivos.get(paraComparar(o.motivo))
    if (!achado) {
      return {
        ok: false,
        motivo: `Motivo "${o.motivo.slice(0, 40)}" não está cadastrado nem foi apontado para um motivo.`,
      }
    }
    if (!(c.motivoValePara.get(achado.id) ?? []).includes(o.status)) {
      return {
        ok: false,
        motivo: `O motivo "${achado.nome}" não vale para oportunidade ${rotulo}.`,
      }
    }
    motivoId = achado.id
  }

  const avisos: string[] = []
  const opcional = (valor: string | null, mapa: MapaDeTipos, rotulo: string) => {
    if (!valor) return null
    const chave = paraComparar(valor)
    const achado = mapa.get(chave)
    // apontado para "sem" (nulo no mapa): entra sem o campo, sem aviso
    if (achado === undefined) {
      avisos.push(
        `${rotulo} "${valor.slice(0, 40)}" não está cadastrada: entrou sem ${rotulo.toLowerCase()}.`,
      )
    }
    return achado ?? null
  }
  const origem = opcional(o.origem, c.origens, 'Origem')
  const solucao = opcional(o.solucao, c.solucoes, 'Solução')
  return { ok: true, fase, motivoId, origem, solucao, avisos }
}
