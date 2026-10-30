import { and, asc, desc, eq, inArray, isNull, schema, sql } from '@leadtogo/db'
import type {
  ConsultaDeContatos,
  TagDoContato,
  ItemDaListaDeContatos,
  ListaDeContatos,
  OpcoesDaListaDeContatos,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { buscaDoContato, semAcento } from './busca-texto.js'
import { tagsDosContatos } from './contato-tags.js'
import {
  condicaoDeVisibilidade,
  type EscopoDaCarteira,
  escopoDaCarteira,
} from './regras-de-carteira.js'
import { condicaoDeEdicaoDoContato, condicaoDeVisibilidadeDoContato } from './regras-de-contato.js'

const {
  contatos,
  contatoEmails,
  contatoTags,
  contatoTelefones,
  empresaContatos,
  empresas,
  empresaTags,
  papeisDecisao,
} = schema

/** Lista de contatos da carteira: busca, filtros e paginação. */
@Injectable()
export class ListaDeContatosService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async listar(consulta: ConsultaDeContatos): Promise<ListaDeContatos> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const onde = and(
      isNull(contatos.excluidoEm),
      condicaoDeVisibilidadeDoContato(escopo),
      ...this.filtros(escopo, consulta),
    )

    const [contagem] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(contatos)
      .where(onde)

    const linhas = await db
      .select({
        id: contatos.id,
        nome: contatos.nome,
        papelId: contatos.papelDecisaoId,
        papelNome: papeisDecisao.nome,
        aceitaWhatsapp: contatos.aceitaWhatsapp,
        aceitaEmail: contatos.aceitaEmail,
        consentimentoEm: contatos.consentimentoEm,
        editavel: sql<boolean>`${condicaoDeEdicaoDoContato(escopo) ?? sql`true`}`,
      })
      .from(contatos)
      .leftJoin(papeisDecisao, eq(papeisDecisao.id, contatos.papelDecisaoId))
      .where(onde)
      .orderBy(...this.ordem(consulta))
      .limit(consulta.porPagina)
      .offset((consulta.pagina - 1) * consulta.porPagina)

    const ids = linhas.map((l) => l.id)
    const [vinculos, telefones, emails, tags] =
      ids.length === 0
        ? [[], [], [], new Map<string, TagDoContato[]>()]
        : await Promise.all([
            // só as empresas que o usuário vê (o vendedor não descobre a carteira dos outros)
            db
              .select({
                contatoId: empresaContatos.contatoId,
                id: empresas.id,
                razaoSocial: empresas.razaoSocial,
                nomeFantasia: empresas.nomeFantasia,
                cargo: empresaContatos.cargo,
                principal: empresaContatos.principal,
                ativo: empresaContatos.ativo,
              })
              .from(empresaContatos)
              .innerJoin(empresas, eq(empresas.id, empresaContatos.empresaId))
              .where(
                and(
                  inArray(empresaContatos.contatoId, ids),
                  isNull(empresas.excluidoEm),
                  condicaoDeVisibilidade(escopo),
                ),
              )
              .orderBy(
                desc(empresaContatos.ativo),
                desc(empresaContatos.principal),
                asc(empresaContatos.criadoEm),
                asc(empresaContatos.id),
              ),
            db
              .select({
                contatoId: contatoTelefones.contatoId,
                e164: contatoTelefones.numeroE164,
                tipo: contatoTelefones.tipo,
                principal: contatoTelefones.principal,
              })
              .from(contatoTelefones)
              .where(inArray(contatoTelefones.contatoId, ids))
              .orderBy(
                desc(contatoTelefones.principal),
                asc(contatoTelefones.criadoEm),
                asc(contatoTelefones.id),
              ),
            db
              .select({
                contatoId: contatoEmails.contatoId,
                email: contatoEmails.email,
              })
              .from(contatoEmails)
              .where(inArray(contatoEmails.contatoId, ids))
              .orderBy(
                desc(contatoEmails.principal),
                asc(contatoEmails.criadoEm),
                asc(contatoEmails.id),
              ),
            // uma consulta para a página toda, já na ordem dos grupos e das tags
            tagsDosContatos(db, ids),
          ])

    const itens: ItemDaListaDeContatos[] = linhas.map((l) => {
      const dele = telefones.filter((t) => t.contatoId === l.id)
      return {
        id: l.id,
        nome: l.nome,
        papelDecisao:
          l.papelId !== null && l.papelNome !== null ? { id: l.papelId, nome: l.papelNome } : null,
        empresas: vinculos
          .filter((v) => v.contatoId === l.id)
          .map((v) => ({
            id: v.id,
            nome: v.nomeFantasia ?? v.razaoSocial,
            cargo: v.cargo,
            principal: v.principal,
            ativo: v.ativo,
          })),
        telefone: dele[0]?.e164 ?? null,
        temWhatsapp: dele.some((t) => t.tipo === 'whatsapp'),
        email: emails.find((e) => e.contatoId === l.id)?.email ?? null,
        naoQuerContato: l.consentimentoEm !== null && !l.aceitaWhatsapp && !l.aceitaEmail,
        tags: tags.get(l.id) ?? [],
        editavel: l.editavel,
      }
    })
    return {
      itens,
      total: contagem?.total ?? 0,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    }
  }

  /** Os cargos que existem nos vínculos ativos que o usuário vê, para o filtro. */
  async opcoes(): Promise<OpcoesDaListaDeContatos> {
    const escopo = await escopoDaCarteira(this.ctx)
    const linhas = await this.ctx
      .db()
      .selectDistinct({ cargo: empresaContatos.cargo })
      .from(empresaContatos)
      .innerJoin(empresas, eq(empresas.id, empresaContatos.empresaId))
      .innerJoin(contatos, eq(contatos.id, empresaContatos.contatoId))
      .where(
        and(
          eq(empresaContatos.ativo, true),
          isNull(empresas.excluidoEm),
          isNull(contatos.excluidoEm),
          condicaoDeVisibilidade(escopo),
          sql`${empresaContatos.cargo} IS NOT NULL`,
        ),
      )
      .orderBy(asc(empresaContatos.cargo))
    return { cargos: linhas.map((l) => l.cargo).filter((c): c is string => c !== null) }
  }

  // ---- apoio ----

  private filtros(escopo: EscopoDaCarteira, c: ConsultaDeContatos) {
    const condicoes = []
    if (c.papelDecisaoId) condicoes.push(eq(contatos.papelDecisaoId, c.papelDecisaoId))
    if (c.busca) condicoes.push(buscaDoContato(c.busca))
    if (c.tagContatoId) {
      condicoes.push(sql`EXISTS (
        SELECT 1 FROM ${contatoTags} ct WHERE ct.contato_id = ${contatos.id} AND ct.tag_id = ${c.tagContatoId})`)
    }

    // Empresa, cargo e tag valem juntos para o MESMO vínculo ativo ("Diretor na Usidantec")
    if (c.empresaId || c.cargo || c.tagId) {
      const dentro = [
        sql`ec.contato_id = ${contatos.id}`,
        sql`ec.ativo`,
        sql`${empresas.excluidoEm} IS NULL`,
        // o vendedor não descobre, pelo filtro, a carteira dos outros
        condicaoDeVisibilidade(escopo) ?? sql`true`,
      ]
      if (c.empresaId) dentro.push(sql`ec.empresa_id = ${c.empresaId}`)
      if (c.cargo) {
        dentro.push(sql`${semAcento(sql`ec.cargo`)} = ${semAcento(c.cargo)}`)
      }
      if (c.tagId) {
        dentro.push(sql`EXISTS (
          SELECT 1 FROM ${empresaTags} et WHERE et.empresa_id = ${empresas.id} AND et.tag_id = ${c.tagId})`)
      }
      condicoes.push(sql`EXISTS (
        SELECT 1 FROM ${empresaContatos} ec JOIN ${empresas} ON ${empresas.id} = ec.empresa_id
        WHERE ${sql.join(dentro, sql` AND `)})`)
    }
    return condicoes
  }

  /** Nome sem acento; e-mail por pedaço; telefone por pedaço dos dígitos (com ou sem máscara). */
  private ordem(c: ConsultaDeContatos) {
    const sentido = c.sentido === 'desc' ? desc : asc
    const desempate = asc(contatos.id)
    return c.ordem === 'criado_em'
      ? [sentido(contatos.criadoEm), desempate]
      : [sentido(semAcento(contatos.nome)), desempate]
  }
}
