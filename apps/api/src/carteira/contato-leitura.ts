import { and, asc, eq, isNull, schema, sql } from '@leadtogo/db'
import type { Contato } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import {
  condicaoDeEdicaoDoContato,
  condicaoDeVisibilidadeDoContato,
  podeExcluirContato,
} from './regras-de-contato.js'
import { condicaoDeVisibilidade, type EscopoDaCarteira, podeEditar } from './regras-de-carteira.js'

const { contatos, contatoEmails, contatoTelefones, empresaContatos, empresas, papeisDecisao } =
  schema

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)
const nomeDe = (e: { nomeFantasia: string | null; razaoSocial: string }): string =>
  e.nomeFantasia ?? e.razaoSocial

/** O contato completo, ou `null` se não existe, foi excluído ou o usuário não o vê. */
export async function lerContato(
  tx: Transacao,
  escopo: EscopoDaCarteira,
  id: string,
  /** Quem acabou de inativar o último vínculo ainda recebe o contato na resposta, mesmo sem vê-lo mais */
  semChecarVisibilidade = false,
): Promise<Contato | null> {
  const [c] = await tx
    .select({ c: contatos, papelNome: papeisDecisao.nome })
    .from(contatos)
    .leftJoin(papeisDecisao, eq(papeisDecisao.id, contatos.papelDecisaoId))
    .where(
      and(
        eq(contatos.id, id),
        isNull(contatos.excluidoEm),
        semChecarVisibilidade ? undefined : condicaoDeVisibilidadeDoContato(escopo),
      ),
    )
  if (!c) return null
  const r = c.c

  const [telefones, emails, vinculos, editavel] = await Promise.all([
    tx
      .select()
      .from(contatoTelefones)
      .where(eq(contatoTelefones.contatoId, id))
      .orderBy(asc(contatoTelefones.criadoEm), asc(contatoTelefones.id)),
    tx
      .select()
      .from(contatoEmails)
      .where(eq(contatoEmails.contatoId, id))
      .orderBy(asc(contatoEmails.criadoEm), asc(contatoEmails.id)),
    // só os vínculos com empresas que o usuário vê (o vendedor não descobre a carteira dos outros)
    tx
      .select({
        v: empresaContatos,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        vendedorId: empresas.vendedorId,
      })
      .from(empresaContatos)
      .innerJoin(empresas, eq(empresas.id, empresaContatos.empresaId))
      .where(
        and(
          eq(empresaContatos.contatoId, id),
          isNull(empresas.excluidoEm),
          condicaoDeVisibilidade(escopo),
        ),
      )
      .orderBy(asc(empresaContatos.criadoEm), asc(empresaContatos.id)),
    tx
      .select({ id: contatos.id })
      .from(contatos)
      .where(and(eq(contatos.id, id), condicaoDeEdicaoDoContato(escopo) ?? sql`true`)),
  ])

  return {
    id: r.id,
    nome: r.nome,
    papelDecisao:
      r.papelDecisaoId !== null && c.papelNome !== null
        ? { id: r.papelDecisaoId, nome: c.papelNome }
        : null,
    aniversario:
      r.aniversarioDia !== null && r.aniversarioMes !== null
        ? { dia: r.aniversarioDia, mes: r.aniversarioMes }
        : null,
    linkedinUrl: r.linkedinUrl,
    observacoes: r.observacoes,
    aceitaWhatsapp: r.aceitaWhatsapp,
    aceitaEmail: r.aceitaEmail,
    consentimentoEm: iso(r.consentimentoEm),
    consentimentoOrigem: r.consentimentoOrigem,
    telefones: telefones.map((t) => ({
      id: t.id,
      numero: t.numero,
      e164: t.numeroE164,
      tipo: t.tipo,
      descricao: t.descricao,
      principal: t.principal,
    })),
    emails: emails.map((e) => ({ id: e.id, email: e.email, tipo: e.tipo, principal: e.principal })),
    vinculos: vinculos.map(({ v, razaoSocial, nomeFantasia, vendedorId }) => ({
      id: v.id,
      empresa: { id: v.empresaId, nome: nomeDe({ razaoSocial, nomeFantasia }) },
      cargo: v.cargo,
      principal: v.principal,
      ativo: v.ativo,
      desde: v.desde,
      ate: v.ate,
      editavel: podeEditar(escopo, vendedorId),
    })),
    criadoEm: r.criadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
    permissoes: { editar: editavel.length > 0, excluir: podeExcluirContato(escopo) },
  }
}
