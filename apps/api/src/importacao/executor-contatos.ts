import { schema, sql } from '@leadtogo/db'
import { lerLinhaDeContato, paraComparar } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import {
  ExecutorBase,
  type Importador,
  type LimitesDoBloco,
  type LinhaPendente,
  type Lote,
  type Resultado,
  type RetornoDaLinha,
} from './executor-base.js'

const { contatoEmails, contatoTelefones, contatos, empresaContatos } = schema

/** Sem Receita para esperar: o bloco é maior que o de empresas (10.000 linhas em ~50 blocos). */
export const LIMITES_DO_BLOCO_DE_CONTATOS: LimitesDoBloco = { linhas: 200, duracaoMs: 90_000 }

interface EstadoDeContatos {
  campos: Record<string, string>
  /** Papéis da decisão ativos, pelo nome sem acento e em minúsculas */
  papeis: Map<string, string>
}

/**
 * Executa um lote de importação de CONTATOS, uma linha por transação:
 *  - a empresa vem do CNPJ (não está na carteira: pula e lista);
 *  - e-mail ou telefone já de um contato existente: usa o existente e só o vincula à empresa da linha, SEM
 *    alterar os dados dele (o vínculo novo leva o cargo e o "principal" da linha);
 *  - senão cria o contato, os telefones e e-mails (E.164) e o vínculo, com o lote registrado em cada um.
 * O contato e o resultado da linha gravam juntos ou nenhum dos dois; é retomável e idempotente por linha.
 */
export class ExecutorDeContatos extends ExecutorBase<EstadoDeContatos> {
  protected readonly limitesPadrao = LIMITES_DO_BLOCO_DE_CONTATOS

  protected async preparar(
    tenantId: string,
    lote: Lote,
  ): Promise<{ falha: string } | { estado: EstadoDeContatos }> {
    const campos = (lote.mapeamento as { campos?: Record<string, string> }).campos ?? {}
    if (!campos['documento'] || !campos['nome']) {
      return { falha: 'O lote não está completo (indique as colunas de CNPJ e de Nome).' }
    }
    await this.prepararDocumentos(tenantId, lote.id, campos['documento'])
    const papeis = new Map<string, string>()
    const linhas = await this.noTenant(tenantId, (tx) =>
      tx.execute<{ id: string; nome: string }>(
        sql`SELECT id, nome FROM papeis_decisao WHERE ativo AND excluido_em IS NULL`,
      ),
    )
    for (const p of linhas) papeis.set(paraComparar(p.nome), p.id)
    return { estado: { campos, papeis } }
  }

  protected notificacao(
    lote: Lote,
    situacao: 'concluida' | 'falhou',
    totais: Record<string, number>,
    motivo?: string,
  ) {
    const novos = totais['criada'] ?? 0
    const vinculados = totais['vinculada'] ?? 0
    return {
      titulo:
        situacao === 'concluida'
          ? `Importação "${lote.nome}" concluída`
          : `Importação "${lote.nome}" parou`,
      mensagem:
        situacao === 'concluida'
          ? `${novos} contatos criados e ${vinculados} vinculados a contatos que já existiam.`
          : (motivo ?? 'A importação parou.'),
      link: `/importacao/${lote.id}`,
    }
  }

  protected async processarLinha(p: {
    tenantId: string
    lote: Lote
    linha: LinhaPendente
    importador: Importador
    estado: EstadoDeContatos
    restanteDoBlocoMs: () => number
  }): Promise<RetornoDaLinha> {
    const { tenantId, lote, linha, estado } = p
    const leitura = lerLinhaDeContato(linha.dados as Record<string, string>, estado.campos)
    if (!leitura.ok) {
      await this.gravar(tenantId, linha.id, {
        resultado: 'pulada_invalida',
        motivo: leitura.motivo,
      })
      return {}
    }
    await this.noTenant(tenantId, async (tx) => {
      // A transação é curta: trava a linha e confere que ainda está pendente (outro executor, ou um bloco
      // repetido, a deixa sem fazer nada).
      if (!(await this.travarPendente(tx, linha.id))) return
      const r = await this.importar(tx, tenantId, lote, p.importador, linha, leitura, estado)
      await this.gravarEm(tx, linha.id, r)
    })
    return {}
  }

  private async importar(
    tx: Transacao,
    tenantId: string,
    lote: Lote,
    importador: Importador,
    linha: LinhaPendente,
    leitura: Extract<ReturnType<typeof lerLinhaDeContato>, { ok: true }>,
    estado: EstadoDeContatos,
  ): Promise<Resultado> {
    const c = leitura.contato
    const avisos = [...leitura.avisos]
    const [empresa] = await tx.execute<{ id: string }>(
      sql`SELECT id FROM empresas WHERE documento = ${linha.documento} AND excluido_em IS NULL LIMIT 1`,
    )
    if (!empresa) {
      return { resultado: 'pulada_empresa_inexistente', motivo: 'O CNPJ não está na carteira.' }
    }

    // Dois executores (ou duas linhas do mesmo e-mail em blocos paralelos) não criam o mesmo contato duas vezes
    const chaves = [
      ...(c.email ? [`e:${c.email}`] : []),
      ...c.telefones.map((t) => `t:${t.e164}`),
    ].sort()
    for (const chave of chaves) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:contato:${chave}`}, 0))`,
      )
    }
    const existente = await this.acharExistente(
      tx,
      c.email,
      c.telefones.map((t) => t.e164),
    )
    if (existente)
      return this.vincularExistente(tx, tenantId, lote, empresa.id, existente, c, avisos)

    // Contato novo
    let papelId: string | null = null
    if (c.papel) {
      papelId = estado.papeis.get(paraComparar(c.papel)) ?? null
      if (!papelId)
        avisos.push(
          `Papel na decisão "${c.papel.slice(0, 40)}" não existe no cadastro: o contato entrou sem papel.`,
        )
    }
    const [criado] = await tx
      .insert(contatos)
      .values({
        tenantId,
        nome: c.nome,
        papelDecisaoId: papelId,
        aniversarioDia: c.aniversario?.dia ?? null,
        aniversarioMes: c.aniversario?.mes ?? null,
        linkedinUrl: c.linkedin,
        observacoes: c.observacoes,
        aceitaWhatsapp: !c.naoQuerContato,
        aceitaEmail: !c.naoQuerContato,
        ...(c.naoQuerContato
          ? { consentimentoEm: new Date(), consentimentoOrigem: 'importacao' }
          : {}),
        importacaoId: lote.id,
        criadoPor: importador.id,
        atualizadoPor: importador.id,
      })
      .returning({ id: contatos.id })
    if (!criado) throw new Error('INSERT de contato sem retorno')
    if (c.telefones.length > 0) {
      await tx.insert(contatoTelefones).values(
        c.telefones.map((t, i) => ({
          tenantId,
          contatoId: criado.id,
          numero: t.numero,
          numeroE164: t.e164,
          tipo: t.tipo,
          principal: i === 0,
          origem: 'importacao' as const,
        })),
      )
    }
    if (c.email) {
      await tx.insert(contatoEmails).values({
        tenantId,
        contatoId: criado.id,
        email: c.email,
        tipo: 'trabalho',
        principal: true,
      })
    }
    await this.criarVinculo(tx, tenantId, lote, empresa.id, criado.id, c, avisos)
    return {
      resultado: 'criada',
      empresaId: empresa.id,
      contatoId: criado.id,
      ...(avisos.length > 0 ? { avisos } : {}),
    }
  }

  /** O contato que já tem este e-mail (primeiro) ou algum destes telefones; os excluídos não contam. */
  private async acharExistente(
    tx: Transacao,
    email: string | null,
    e164: string[],
  ): Promise<string | null> {
    if (email) {
      const [r] = await tx.execute<{ id: string }>(sql`
        SELECT c.id FROM contato_emails e JOIN contatos c ON c.id = e.contato_id
        WHERE e.email = ${email} AND c.excluido_em IS NULL ORDER BY c.criado_em, c.id LIMIT 1`)
      if (r) return r.id
    }
    for (const numero of e164) {
      const [r] = await tx.execute<{ id: string }>(sql`
        SELECT c.id FROM contato_telefones t JOIN contatos c ON c.id = t.contato_id
        WHERE t.numero_e164 = ${numero} AND c.excluido_em IS NULL ORDER BY c.criado_em, c.id LIMIT 1`)
      if (r) return r.id
    }
    return null
  }

  private async vincularExistente(
    tx: Transacao,
    tenantId: string,
    lote: Lote,
    empresaId: string,
    contatoId: string,
    c: Extract<ReturnType<typeof lerLinhaDeContato>, { ok: true }>['contato'],
    avisos: string[],
  ): Promise<Resultado> {
    // "Não quer contato" numa linha duplicada não muda o consentimento do contato que já existe
    if (c.naoQuerContato) {
      avisos.push('"Não quer contato" ignorado: o contato já existia e os dados dele não mudam.')
    }
    const [vinculo] = await tx.execute<{ ativo: boolean }>(sql`
      SELECT ativo FROM empresa_contatos WHERE empresa_id = ${empresaId} AND contato_id = ${contatoId}`)
    if (vinculo?.ativo) {
      return {
        resultado: 'ja_vinculada',
        motivo: 'O contato já estava vinculado a esta empresa.',
        empresaId,
        contatoId,
        ...(avisos.length > 0 ? { avisos } : {}),
      }
    }
    if (vinculo) avisos.push('O vínculo estava inativo e foi reativado.')
    await this.criarVinculo(tx, tenantId, lote, empresaId, contatoId, c, avisos)
    return {
      resultado: 'vinculada',
      motivo:
        'Vinculada a contato que já existia (e-mail ou telefone iguais); os dados dele não mudaram.',
      empresaId,
      contatoId,
      ...(avisos.length > 0 ? { avisos } : {}),
    }
  }

  /**
   * O vínculo da empresa com o contato: leva o cargo da linha e, só se a empresa ainda NÃO tem contato
   * principal, o "principal". A empresa que já tem um principal o mantém (aviso).
   */
  private async criarVinculo(
    tx: Transacao,
    tenantId: string,
    lote: Lote,
    empresaId: string,
    contatoId: string,
    c: { cargo: string | null; principal: boolean },
    avisos: string[],
  ): Promise<void> {
    let principal = false
    if (c.principal) {
      const [ja] = await tx.execute<{ id: string }>(sql`
        SELECT id FROM empresa_contatos WHERE empresa_id = ${empresaId} AND principal AND ativo
          AND contato_id <> ${contatoId} LIMIT 1`)
      if (ja) avisos.push('A empresa já tem contato principal: o principal não foi trocado.')
      else principal = true
    }
    await tx
      .insert(empresaContatos)
      .values({ tenantId, empresaId, contatoId, cargo: c.cargo, principal, importacaoId: lote.id })
      .onConflictDoUpdate({
        target: [empresaContatos.empresaId, empresaContatos.contatoId],
        set: { cargo: c.cargo, principal, ativo: true, ate: null, importacaoId: lote.id },
      })
  }
}
