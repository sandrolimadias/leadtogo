import { type Conexao, novoId, sql } from '@leadtogo/db'
import { criarEmpresaCarteiraSchema, formatarCnpj, type PapelMembro } from '@leadtogo/shared'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import { carregarPermissoes } from '../acesso/permissoes-do-membro.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { EmpresasDaCarteiraService } from '../carteira/empresas.service.js'
import { montarEmpresa } from '../importacao/montar-empresa.js'
import type { ReceitaService } from '../receita/receita.service.js'
import type { ManipuladorDeEvento } from '../worker/outbox/relay.js'

/** Evento do outbox: levar ao CRM a empresa (pelo CNPJ) e o contato de uma inscrição (Fase 4G, B-17). */
export const EVENTO_VINCULAR_CRM = 'portal.evento_vincular_crm'

export async function agendarVinculoNoCrm(
  tx: Transacao,
  tenantId: string,
  participacaoId: string,
): Promise<void> {
  // Só com a função ligada NA HORA da inscrição (o manipulador confere de novo ao processar)
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    SELECT ${novoId()}, ${tenantId}, ${EVENTO_VINCULAR_CRM}, ${participacaoId},
           ${JSON.stringify({ participacaoId })}::jsonb
    WHERE EXISTS (SELECT 1 FROM tenant_configuracoes
                  WHERE tenant_id = ${tenantId} AND portal_eventos_crm_ativo
                    AND portal_eventos_crm_responsavel_id IS NOT NULL)`)
}

const FUSO = 'America/Sao_Paulo'

/** O dia útil seguinte ao fim do evento (segunda a sexta, sem os feriados da empresa), como AAAA-MM-DD. */
export function diaUtilSeguinte(fim: Date, feriados: Set<string>): string {
  const local = new Date(fim.toLocaleString('en-US', { timeZone: FUSO }))
  const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()))
  for (let i = 0; i < 30; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dia = d.getUTCDay()
    const texto = d.toISOString().slice(0, 10)
    if (dia !== 0 && dia !== 6 && !feriados.has(texto)) return texto
  }
  return d.toISOString().slice(0, 10)
}

type Participacao = {
  id: string
  cnpj: string | null
  nome: string | null
  email: string | null
  telefone: string | null
  contato_id: string | null
  empresa_id: string | null
  crm_tratado_em: string | Date | null
  titulo: string
  fim_em: string | Date
  crm_ativo: boolean
  responsavel_id: string | null
}

/**
 * Inscrição com CNPJ (só quando a empresa ligou a função e o formulário tem o campo CNPJ):
 *  1. acha a empresa pelo documento ou cadastra pela consulta normal à Receita, com o status Lead e o responsável
 *     escolhido em Configurações → Portal (administrador ou gestor, que redistribui ao vendedor);
 *  2. acha o contato pelo e-mail ou cadastra, e liga à empresa;
 *  3. empresa NOVA: cria a tarefa "Contato pós-evento" para o dia útil seguinte ao evento;
 *  4. liga a participação à empresa e ao contato. Idempotente (`crm_tratado_em`).
 */
export function manipuladorDoVinculoNoCrm(receita?: {
  banco: Conexao
  servico: ReceitaService
}): ManipuladorDeEvento {
  return async (evento, { tx }) => {
    const { participacaoId } = evento.payload as { participacaoId: string }
    const [p] = await tx.execute<Participacao>(sql`
      SELECT c.id, c.cnpj, c.nome, c.email::text AS email, c.telefone, c.contato_id, c.empresa_id, c.crm_tratado_em,
             e.titulo, e.fim_em, tc.portal_eventos_crm_ativo AS crm_ativo,
             tc.portal_eventos_crm_responsavel_id AS responsavel_id
      FROM evento_confirmacoes c
      JOIN eventos e ON e.id = c.evento_id
      JOIN tenant_configuracoes tc ON tc.tenant_id = c.tenant_id
      WHERE c.id = ${participacaoId}`)
    if (!p || p.crm_tratado_em || !p.crm_ativo || !p.responsavel_id || !p.cnpj) return
    const tenantId = evento.tenantId
    const [resp] = await tx.execute<{
      id: string
      usuario_id: string
      papel: PapelMembro
      perfil_id: string | null
    }>(
      sql`SELECT id, usuario_id, papel::text AS papel, perfil_id FROM membros WHERE id = ${p.responsavel_id} AND ativo`,
    )
    if (!resp) return

    // 1. A empresa
    let empresaId = p.empresa_id
    let empresaNova = false
    if (!empresaId) {
      const [existente] = await tx.execute<{ id: string }>(sql`
        SELECT id FROM empresas WHERE documento = ${p.cnpj} AND excluido_em IS NULL LIMIT 1`)
      empresaId = existente?.id ?? null
    }
    if (!empresaId) {
      let consulta: Awaited<ReturnType<ReceitaService['consultar']>> | null = null
      if (receita) {
        try {
          consulta = await receita.servico.consultar(p.cnpj)
        } catch {
          consulta = null
        }
      }
      const [lead] = await tx.execute<{ id: string }>(sql`
        SELECT id FROM tags WHERE chave_sistema = 'lead' AND excluido_em IS NULL LIMIT 1`)
      const montada = montarEmpresa({
        fonte: 'receita',
        documento: p.cnpj,
        planilha: consulta ? {} : { razaoSocial: `CNPJ ${formatarCnpj(p.cnpj)}` },
        receita: consulta?.dados ?? null,
        municipioDaPlanilha: null,
        vendedorId: resp.id,
        verticalId: null,
        statusTagId: lead?.id ?? '',
      })
      if (!montada.ok || !lead) return
      const ctx = new ContextoTenantService()
      const servico = new EmpresasDaCarteiraService(
        ctx,
        new AuditoriaService(ctx),
        receita?.servico as ReceitaService,
      )
      const criada = await ctx.executar(
        {
          usuarioId: resp.usuario_id,
          tx,
          tenantId,
          membro: await carregarPermissoes(tx, {
            id: resp.id,
            papel: resp.papel,
            perfil_id: resp.perfil_id,
          }),
        },
        () =>
          servico.criar(criarEmpresaCarteiraSchema.parse(montada.dados), {
            origemCadastro: 'api',
            ...(consulta ? { consulta } : { receitaIndisponivel: true }),
          }),
      )
      empresaId = criada.id
      empresaNova = true
    }

    // 2. O contato (pelo e-mail)
    let contatoId = p.contato_id
    if (!contatoId && p.email) {
      const [porEmail] = await tx.execute<{ contato_id: string }>(sql`
        SELECT ce.contato_id FROM contato_emails ce JOIN contatos c ON c.id = ce.contato_id AND c.excluido_em IS NULL
        WHERE ce.email = ${p.email} ORDER BY ce.principal DESC LIMIT 1`)
      contatoId = porEmail?.contato_id ?? null
    }
    if (!contatoId) {
      contatoId = novoId()
      await tx.execute(sql`
        INSERT INTO contatos (id, tenant_id, nome, criado_por, atualizado_por)
        VALUES (${contatoId}, ${tenantId}, ${p.nome ?? p.email ?? 'Participante'}, ${resp.id}, ${resp.id})`)
      if (p.email) {
        await tx.execute(sql`
          INSERT INTO contato_emails (id, tenant_id, contato_id, email, principal)
          VALUES (${novoId()}, ${tenantId}, ${contatoId}, ${p.email}, true)`)
      }
      const digitos = (p.telefone ?? '').replace(/\D/g, '')
      if (digitos.length >= 10) {
        await tx.execute(sql`
          INSERT INTO contato_telefones (id, tenant_id, contato_id, numero, numero_e164, tipo, principal)
          VALUES (${novoId()}, ${tenantId}, ${contatoId}, ${p.telefone}, ${`+55${digitos.slice(-11)}`}, 'outro', true)`)
      }
    }
    await tx.execute(sql`
      INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id)
      SELECT ${novoId()}, ${tenantId}, ${empresaId}, ${contatoId}
      WHERE NOT EXISTS (SELECT 1 FROM empresa_contatos WHERE empresa_id = ${empresaId} AND contato_id = ${contatoId})`)

    // 3. A tarefa para o dia útil seguinte ao evento
    const feriados = await tx.execute<{ data: string }>(
      sql`SELECT data::text AS data FROM feriados`,
    )
    const dia = diaUtilSeguinte(new Date(p.fim_em), new Set(feriados.map((f) => f.data)))
    const [tipo] = await tx.execute<{ id: string }>(sql`
      SELECT id FROM tipos_atividade WHERE chave_sistema = 'tarefa' AND excluido_em IS NULL LIMIT 1`)
    // Só para CNPJ novo (Q-2/Q-3): a empresa que já está no CRM tem quem cuide dela
    if (tipo && empresaNova) {
      await tx.execute(sql`
        INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, contato_id, responsavel_id,
          data_inicio, dia_inteiro, observacoes, criado_por, atualizado_por)
        VALUES (${novoId()}, ${tenantId}, ${tipo.id}, ${`Contato pós-evento: ${p.titulo}`.slice(0, 200)}, ${empresaId},
          ${contatoId}, ${resp.id}, (${dia}::date)::timestamp AT TIME ZONE ${FUSO}, true,
          ${`Inscrição de ${p.nome ?? p.email ?? 'participante'} no evento "${p.titulo}". Redistribua ao vendedor da carteira.`},
          ${resp.id}, ${resp.id})`)
    }

    // 4. A participação fica ligada à empresa e ao contato
    await tx.execute(sql`
      UPDATE evento_confirmacoes SET empresa_id = ${empresaId}, contato_id = ${contatoId}, crm_tratado_em = now(),
        atualizado_em = now()
      WHERE id = ${participacaoId}`)
  }
}
