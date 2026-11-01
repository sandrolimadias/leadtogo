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
}

type Receita = { banco: Conexao; servico: ReceitaService }

/** A pessoa a levar ao CRM (inscrição do evento ou pedido de associação). */
export interface PessoaParaOCrm {
  cnpj: string
  nome: string | null
  email: string | null
  telefone: string | null
  empresaId?: string | null
  contatoId?: string | null
}

/** A tarefa do responsável: `apenasEmpresaNova` = só quando o CNPJ ainda não estava no CRM. */
export interface TarefaDoCrm {
  titulo: string
  observacoes: string
  /** Dia (AAAA-MM-DD) no fuso da empresa */
  dia: string
  apenasEmpresaNova: boolean
}

/**
 * O núcleo do vínculo com o CRM (Fase 4G, B-17; Fase 4H, associação). Só roda com a função ligada e um
 * responsável (administrador ou gestor) escolhido em Configurações → Portal:
 *  1. acha a empresa pelo documento ou cadastra pela consulta normal à Receita, com o status Lead e o responsável;
 *  2. acha o contato pelo e-mail ou cadastra, e liga à empresa;
 *  3. cria a tarefa do responsável (para a empresa nova, ou sempre, conforme o chamador).
 * Devolve a empresa e o contato, ou nulo se a função está desligada.
 */
export async function levarAoCrm(
  tx: Transacao,
  tenantId: string,
  pessoa: PessoaParaOCrm,
  tarefa: TarefaDoCrm,
  receita?: Receita,
): Promise<{ empresaId: string; contatoId: string } | null> {
  const [config] = await tx.execute<{ ativo: boolean; responsavel_id: string | null }>(sql`
    SELECT portal_eventos_crm_ativo AS ativo, portal_eventos_crm_responsavel_id AS responsavel_id
    FROM tenant_configuracoes WHERE tenant_id = ${tenantId}`)
  if (!config?.ativo || !config.responsavel_id) return null
  const [resp] = await tx.execute<{
    id: string
    usuario_id: string
    papel: PapelMembro
    perfil_id: string | null
  }>(
    sql`SELECT id, usuario_id, papel::text AS papel, perfil_id FROM membros WHERE id = ${config.responsavel_id} AND ativo`,
  )
  if (!resp) return null

  // 1. A empresa
  let empresaId = pessoa.empresaId ?? null
  let empresaNova = false
  if (!empresaId) {
    const [existente] = await tx.execute<{ id: string }>(sql`
      SELECT id FROM empresas WHERE documento = ${pessoa.cnpj} AND excluido_em IS NULL LIMIT 1`)
    empresaId = existente?.id ?? null
  }
  if (!empresaId) {
    let consulta: Awaited<ReturnType<ReceitaService['consultar']>> | null = null
    if (receita) {
      try {
        consulta = await receita.servico.consultar(pessoa.cnpj)
      } catch {
        consulta = null
      }
    }
    const [lead] = await tx.execute<{ id: string }>(sql`
      SELECT id FROM tags WHERE chave_sistema = 'lead' AND excluido_em IS NULL LIMIT 1`)
    const montada = montarEmpresa({
      fonte: 'receita',
      documento: pessoa.cnpj,
      planilha: consulta ? {} : { razaoSocial: `CNPJ ${formatarCnpj(pessoa.cnpj)}` },
      receita: consulta?.dados ?? null,
      municipioDaPlanilha: null,
      vendedorId: resp.id,
      verticalId: null,
      statusTagId: lead?.id ?? '',
    })
    if (!montada.ok || !lead) return null
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
  let contatoId = pessoa.contatoId ?? null
  if (!contatoId && pessoa.email) {
    const [porEmail] = await tx.execute<{ contato_id: string }>(sql`
      SELECT ce.contato_id FROM contato_emails ce JOIN contatos c ON c.id = ce.contato_id AND c.excluido_em IS NULL
      WHERE ce.email = ${pessoa.email} ORDER BY ce.principal DESC LIMIT 1`)
    contatoId = porEmail?.contato_id ?? null
  }
  if (!contatoId) {
    contatoId = novoId()
    await tx.execute(sql`
      INSERT INTO contatos (id, tenant_id, nome, criado_por, atualizado_por)
      VALUES (${contatoId}, ${tenantId}, ${pessoa.nome ?? pessoa.email ?? 'Participante'}, ${resp.id}, ${resp.id})`)
    if (pessoa.email) {
      await tx.execute(sql`
        INSERT INTO contato_emails (id, tenant_id, contato_id, email, principal)
        VALUES (${novoId()}, ${tenantId}, ${contatoId}, ${pessoa.email}, true)`)
    }
    const digitos = (pessoa.telefone ?? '').replace(/\D/g, '')
    if (digitos.length >= 10) {
      await tx.execute(sql`
        INSERT INTO contato_telefones (id, tenant_id, contato_id, numero, numero_e164, tipo, principal)
        VALUES (${novoId()}, ${tenantId}, ${contatoId}, ${pessoa.telefone}, ${`+55${digitos.slice(-11)}`}, 'outro', true)`)
    }
  }
  await tx.execute(sql`
    INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id)
    SELECT ${novoId()}, ${tenantId}, ${empresaId}, ${contatoId}
    WHERE NOT EXISTS (SELECT 1 FROM empresa_contatos WHERE empresa_id = ${empresaId} AND contato_id = ${contatoId})`)

  // 3. A tarefa do responsável
  const [tipo] = await tx.execute<{ id: string }>(sql`
    SELECT id FROM tipos_atividade WHERE chave_sistema = 'tarefa' AND excluido_em IS NULL LIMIT 1`)
  if (tipo && (empresaNova || !tarefa.apenasEmpresaNova)) {
    await tx.execute(sql`
      INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, contato_id, responsavel_id,
        data_inicio, dia_inteiro, observacoes, criado_por, atualizado_por)
      VALUES (${novoId()}, ${tenantId}, ${tipo.id}, ${tarefa.titulo.slice(0, 200)}, ${empresaId},
        ${contatoId}, ${resp.id}, (${tarefa.dia}::date)::timestamp AT TIME ZONE ${FUSO}, true,
        ${tarefa.observacoes}, ${resp.id}, ${resp.id})`)
  }
  return { empresaId, contatoId }
}

/** Os feriados da empresa (para o dia útil seguinte). */
export async function feriadosDe(tx: Transacao): Promise<Set<string>> {
  const feriados = await tx.execute<{ data: string }>(sql`SELECT data::text AS data FROM feriados`)
  return new Set(feriados.map((f) => f.data))
}

/**
 * Inscrição com CNPJ: leva ao CRM; empresa NOVA ganha a tarefa "Contato pós-evento" no dia útil seguinte ao
 * evento (Q-2/Q-3: a empresa que já está no CRM tem quem cuide dela). Liga a participação à empresa e ao contato.
 * Idempotente (`crm_tratado_em`).
 */
export function manipuladorDoVinculoNoCrm(receita?: Receita): ManipuladorDeEvento {
  return async (evento, { tx }) => {
    const { participacaoId } = evento.payload as { participacaoId: string }
    const [p] = await tx.execute<Participacao>(sql`
      SELECT c.id, c.cnpj, c.nome, c.email::text AS email, c.telefone, c.contato_id, c.empresa_id, c.crm_tratado_em,
             e.titulo, e.fim_em
      FROM evento_confirmacoes c JOIN eventos e ON e.id = c.evento_id
      WHERE c.id = ${participacaoId}`)
    if (!p || p.crm_tratado_em || !p.cnpj) return
    const dia = diaUtilSeguinte(new Date(p.fim_em), await feriadosDe(tx))
    const r = await levarAoCrm(
      tx,
      evento.tenantId,
      {
        cnpj: p.cnpj,
        nome: p.nome,
        email: p.email,
        telefone: p.telefone,
        empresaId: p.empresa_id,
        contatoId: p.contato_id,
      },
      {
        titulo: `Contato pós-evento: ${p.titulo}`,
        observacoes: `Inscrição de ${p.nome ?? p.email ?? 'participante'} no evento "${p.titulo}". Redistribua ao vendedor da carteira.`,
        dia,
        apenasEmpresaNova: true,
      },
      receita,
    )
    if (!r) return
    await tx.execute(sql`
      UPDATE evento_confirmacoes SET empresa_id = ${r.empresaId}, contato_id = ${r.contatoId}, crm_tratado_em = now(),
        atualizado_em = now()
      WHERE id = ${participacaoId}`)
  }
}
