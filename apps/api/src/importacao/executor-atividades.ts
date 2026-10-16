import { schema, sql } from '@leadtogo/db'
import { decidirAtividade, lerLinhaDeAtividade, paraComparar } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { recalcularCarteira } from '../carteira/atividades-efeitos.js'
import { fusoDaEmpresa } from '../carteira/atividades-leitura.js'
import {
  ExecutorBase,
  type Importador,
  type LimitesDoBloco,
  type LinhaPendente,
  type Lote,
  type RetornoDaLinha,
} from './executor-base.js'
import { type MapaDeTipos, montarMapaDeTipos } from './previa-novos-tipos.js'

const { atividades } = schema

/** Sem Receita para esperar: o bloco é maior que o de empresas (10.000 linhas em ~50 blocos). */
export const LIMITES_DO_BLOCO_DE_ATIVIDADES: LimitesDoBloco = { linhas: 200, duracaoMs: 90_000 }

interface EstadoDeAtividades {
  campos: Record<string, string>
  fuso: string
  /** O valor da coluna Tipo (sem acento e em minúsculas) → tipo de atividade; `null` = pular essas linhas */
  tipos: MapaDeTipos
  /** E-mail do responsável → membro ativo da empresa (ou nulo), lembrado entre as linhas do bloco */
  responsaveis: Map<string, string | null>
  /** Empresas que receberam atividade neste bloco: a carteira delas é recalculada uma vez, no fim */
  empresasTocadas: Set<string>
  importadorId: string
}

/**
 * Executa um lote de importação de ATIVIDADES, uma linha por transação, com as mesmas regras do registro
 * manual (Módulo 5): tipo pelo mapeamento de valores, data e hora no fuso da empresa (sem hora = dia
 * inteiro), situação pela data quando em branco, Realizada exige o resultado e não pode estar no futuro,
 * contato só pelo e-mail e com vínculo ativo, responsável pelo e-mail ou quem importa, e a atividade
 * idêntica que já existe é pulada. Atividade realizada mexe na carteira como a registrada à mão: a
 * última visita, o último contato, a próxima atividade e as tags são recalculados UMA vez por empresa no
 * fim de cada bloco (e numa varredura final do lote, caso um bloco tenha caído antes).
 */
export class ExecutorDeAtividades extends ExecutorBase<EstadoDeAtividades> {
  protected readonly limitesPadrao = LIMITES_DO_BLOCO_DE_ATIVIDADES

  protected async preparar(
    tenantId: string,
    lote: Lote,
    importador: Importador,
  ): Promise<{ falha: string } | { estado: EstadoDeAtividades }> {
    const campos = (lote.mapeamento as { campos?: Record<string, string> }).campos ?? {}
    if (!campos['documento'] || !campos['tipo'] || !campos['data']) {
      return { falha: 'O lote não está completo (indique as colunas de CNPJ, Tipo e Data).' }
    }
    await this.prepararDocumentos(tenantId, lote.id, campos['documento'])
    const escolhidos = (lote.mapeamento as { tipos?: Record<string, string | null> }).tipos ?? {}
    const { fuso, cadastrados } = await this.noTenant(tenantId, async (tx) => ({
      fuso: await fusoDaEmpresa(tx, tenantId),
      cadastrados: await tx.execute<{ id: string; nome: string }>(
        sql`SELECT id, nome FROM tipos_atividade WHERE ativo AND excluido_em IS NULL`,
      ),
    }))
    // O que a pessoa apontou vale; o resto casa pelo nome do tipo (sem maiúsculas nem acento)
    const tipos = montarMapaDeTipos(cadastrados, escolhidos)
    return {
      estado: {
        campos,
        fuso,
        tipos,
        responsaveis: new Map(),
        empresasTocadas: new Set(),
        importadorId: importador.id,
      },
    }
  }

  protected notificacao(
    lote: Lote,
    situacao: 'concluida' | 'falhou',
    totais: Record<string, number>,
    motivo?: string,
  ) {
    return {
      titulo:
        situacao === 'concluida'
          ? `Importação "${lote.nome}" concluída`
          : `Importação "${lote.nome}" parou`,
      mensagem:
        situacao === 'concluida'
          ? `${totais['criada'] ?? 0} atividades importadas.`
          : (motivo ?? 'A importação parou.'),
      link: `/importacao/${lote.id}`,
    }
  }

  protected async processarLinha(p: {
    tenantId: string
    lote: Lote
    linha: LinhaPendente
    importador: Importador
    estado: EstadoDeAtividades
    restanteDoBlocoMs: () => number
  }): Promise<RetornoDaLinha> {
    const { tenantId, lote, linha, estado, importador } = p
    const leitura = lerLinhaDeAtividade(linha.dados as Record<string, string>, estado.campos)
    if (!leitura.ok) {
      await this.gravar(tenantId, linha.id, {
        resultado: 'pulada_invalida',
        motivo: leitura.motivo,
      })
      return {}
    }
    const a = leitura.atividade
    const tipo = estado.tipos.get(paraComparar(a.tipo))
    if (!tipo) {
      await this.gravar(tenantId, linha.id, {
        resultado: 'pulada_tipo_inexistente',
        motivo: `Tipo "${a.tipo.slice(0, 40)}" não está cadastrado nem foi apontado para um tipo existente.`,
      })
      return {}
    }
    const decisao = decidirAtividade(a, new Date(), estado.fuso)
    if (!decisao.ok) {
      await this.gravar(tenantId, linha.id, {
        resultado: decisao.resultado,
        motivo: decisao.motivo,
      })
      return {}
    }
    const avisos = [...leitura.avisos, ...decisao.avisos]

    await this.noTenant(tenantId, async (tx) => {
      // Transação curta: trava a linha e confere que ainda está pendente (outro executor, ou um bloco repetido)
      if (!(await this.travarPendente(tx, linha.id))) return
      const [empresa] = await tx.execute<{ id: string }>(
        sql`SELECT id FROM empresas WHERE documento = ${linha.documento} AND excluido_em IS NULL LIMIT 1`,
      )
      if (!empresa) {
        await this.gravarEm(tx, linha.id, {
          resultado: 'pulada_empresa_inexistente',
          motivo: 'O CNPJ não está na carteira.',
        })
        return
      }
      const titulo = a.titulo ?? tipo.nome
      // Duas linhas idênticas (neste ou em outro lote) não criam duas atividades
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:atividade:${empresa.id}:${tipo.id}:${decisao.dataInicio.toISOString()}:${titulo}`}, 0))`,
      )
      const [igual] = await tx.execute<{ id: string }>(sql`
        SELECT id FROM atividades
        WHERE empresa_id = ${empresa.id} AND tipo_atividade_id = ${tipo.id}
          AND data_inicio = ${decisao.dataInicio.toISOString()}::timestamptz
          AND dia_inteiro = ${decisao.diaInteiro} AND titulo = ${titulo} AND excluido_em IS NULL
        LIMIT 1`)
      if (igual) {
        await this.gravarEm(tx, linha.id, {
          resultado: 'pulada_duplicada',
          motivo: 'Já existe uma atividade igual (empresa, tipo, data, hora e título).',
          empresaId: empresa.id,
          atividadeId: igual.id,
        })
        return
      }

      const responsavel = await this.responsavel(tx, estado, a.emailResponsavel)
      if (a.emailResponsavel && !responsavel) {
        avisos.push(
          `Responsável ${a.emailResponsavel} não é usuário da empresa: ficou com quem importou.`,
        )
      }
      let contatoId: string | null = null
      if (a.emailContato) {
        const [c] = await tx.execute<{ id: string }>(sql`
          SELECT c.id FROM contato_emails e
          JOIN contatos c ON c.id = e.contato_id AND c.excluido_em IS NULL
          JOIN empresa_contatos ec ON ec.contato_id = c.id AND ec.empresa_id = ${empresa.id} AND ec.ativo
          WHERE e.email = ${a.emailContato} ORDER BY c.criado_em, c.id LIMIT 1`)
        contatoId = c?.id ?? null
        if (!contatoId) {
          avisos.push(
            `Contato ${a.emailContato} não tem vínculo ativo com a empresa: importada sem contato.`,
          )
        }
      }

      const [criada] = await tx
        .insert(atividades)
        .values({
          tenantId,
          tipoAtividadeId: tipo.id,
          titulo,
          empresaId: empresa.id,
          contatoId,
          responsavelId: responsavel ?? importador.id,
          dataInicio: decisao.dataInicio,
          diaInteiro: decisao.diaInteiro,
          situacao: decisao.situacao,
          realizadaEm: decisao.realizadaEm,
          resultado: decisao.resultado,
          importante: a.importante,
          urgente: a.urgente,
          observacoes: a.observacoes,
          origem: 'importacao',
          importacaoId: lote.id,
          criadoPor: importador.id,
          atualizadoPor: importador.id,
        })
        .returning({ id: atividades.id })
      if (!criada) throw new Error('INSERT de atividade sem retorno')
      estado.empresasTocadas.add(empresa.id)
      await this.gravarEm(tx, linha.id, {
        resultado: 'criada',
        empresaId: empresa.id,
        atividadeId: criada.id,
        contatoId,
        ...(avisos.length > 0 ? { avisos } : {}),
      })
    })
    return {}
  }

  /** O membro ativo com este e-mail (o do cadastro da equipe ou o do login), ou nulo. */
  private async responsavel(
    tx: Transacao,
    estado: EstadoDeAtividades,
    email: string | null,
  ): Promise<string | null> {
    if (!email) return null
    if (estado.responsaveis.has(email)) return estado.responsaveis.get(email) ?? null
    const [m] = await tx.execute<{ id: string }>(sql`
      SELECT m.id FROM membros m LEFT JOIN auth."user" u ON u.id = m.usuario_id
      WHERE m.ativo AND m.excluido_em IS NULL AND (m.email = ${email} OR lower(u.email) = ${email})
      ORDER BY m.criado_em LIMIT 1`)
    estado.responsaveis.set(email, m?.id ?? null)
    return m?.id ?? null
  }

  /**
   * No fim do bloco: a carteira de cada empresa tocada, uma vez (mesma função do registro manual, então o
   * resultado é o mesmo). Quando o lote acaba (ou é cancelado ou falha), varre as empresas de TODAS as
   * atividades do lote: cobre um bloco que caiu depois de gravar as linhas e antes de recalcular.
   */
  protected override async aoFimDoBloco(
    tenantId: string,
    lote: Lote,
    estado: EstadoDeAtividades,
    encerrando: boolean,
  ): Promise<void> {
    const ids = new Set(estado.empresasTocadas)
    estado.empresasTocadas.clear()
    if (encerrando) {
      const todas = await this.noTenant(tenantId, (tx) =>
        tx.execute<{ empresa_id: string }>(sql`
          SELECT DISTINCT empresa_id FROM atividades
          WHERE importacao_id = ${lote.id} AND excluido_em IS NULL AND empresa_id IS NOT NULL`),
      )
      for (const t of todas) ids.add(t.empresa_id)
    }
    for (const empresaId of ids) {
      await this.noTenant(tenantId, (tx) =>
        recalcularCarteira(tx, tenantId, empresaId, estado.importadorId),
      )
    }
  }
}
