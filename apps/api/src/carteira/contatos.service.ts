import { and, eq, inArray, isNull, schema, sql } from '@leadtogo/db'
import type {
  AlterarContato,
  Contato,
  ContatoExistente,
  CriarContato,
  EmailEntrada,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { diferencas } from '../cadastros/cadastros.base.js'
import { ErroApi } from '../http/erro-api.js'
import { lerContato } from './contato-leitura.js'
import {
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
  podeVer,
} from './regras-de-carteira.js'
import {
  condicaoDeEdicaoDoContato,
  condicaoDeExclusaoDoContato,
  condicaoDeVisibilidadeDoContato,
  podeExcluirContato,
} from './regras-de-contato.js'
import { normalizarTelefonesDaEmpresa } from './telefones.js'

const { contatos, contatoEmails, contatoTelefones, empresaContatos, empresas, papeisDecisao } =
  schema

const naoEncontrado = () => new ErroApi('contato_nao_encontrado', 'Contato não encontrado.', 404)
const negado = (mensagem: string) => new ErroApi('acesso_negado', mensagem, 403)
const invalido = (campo: string, codigo: string, mensagem: string) =>
  new ErroApi(codigo, mensagem, 400, [{ campo, mensagem }])

interface EmailParaGravar {
  email: string
  tipo: 'pessoal' | 'trabalho'
  principal: boolean
}

/** E-mails sem repetição (vale o primeiro) e com exatamente um principal: o marcado, ou o primeiro. */
function normalizarEmails(entrada: EmailEntrada[]): EmailParaGravar[] {
  const saida: EmailParaGravar[] = []
  for (const e of entrada) {
    const repetido = saida.find((x) => x.email === e.email)
    if (repetido) {
      if (e.principal) repetido.principal = true
      continue
    }
    saida.push({ email: e.email, tipo: e.tipo ?? 'trabalho', principal: e.principal === true })
  }
  const indicePrincipal = Math.max(
    0,
    saida.findIndex((e) => e.principal),
  )
  saida.forEach((e, i) => {
    e.principal = i === indicePrincipal
  })
  return saida
}

/** Contatos da carteira: cadastro da pessoa, telefones, e-mails e consentimento. Vínculos: rotas próprias. */
@Injectable()
export class ContatosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async detalhar(id: string): Promise<Contato> {
    const escopo = await escopoDaCarteira(this.ctx)
    const contato = await lerContato(this.ctx.db(), escopo, id)
    if (!contato) throw naoEncontrado()
    return contato
  }

  async criar(dados: CriarContato): Promise<Contato> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    if (!escopo.contatoSemEmpresa && !dados.vinculo) {
      throw invalido(
        'vinculo',
        'empresa_obrigatoria',
        'Escolha a empresa do contato: sem empresa da sua carteira você não o veria.',
      )
    }
    if (dados.vinculo) await this.exigirEmpresaEditavel(db, escopo, dados.vinculo.empresaId)
    if (dados.papelDecisaoId) await this.exigirPapel(db, dados.papelDecisaoId)
    const telefones = normalizarTelefonesDaEmpresa(dados.telefones ?? [])
    const emails = normalizarEmails(dados.emails ?? [])
    if (!dados.ignorarDuplicado) {
      await this.avisarDuplicados(
        db,
        escopo,
        emails.map((e) => e.email),
        telefones.map((t) => t.numeroE164),
      )
    }

    const semConsentimento = dados.aceitaWhatsapp === false || dados.aceitaEmail === false
    const [criado] = await db
      .insert(contatos)
      .values({
        tenantId,
        nome: dados.nome,
        papelDecisaoId: dados.papelDecisaoId ?? null,
        aniversarioDia: dados.aniversario?.dia ?? null,
        aniversarioMes: dados.aniversario?.mes ?? null,
        linkedinUrl: dados.linkedinUrl ?? null,
        observacoes: dados.observacoes ?? null,
        aceitaWhatsapp: dados.aceitaWhatsapp ?? true,
        aceitaEmail: dados.aceitaEmail ?? true,
        ...(semConsentimento ? { consentimentoEm: new Date(), consentimentoOrigem: 'manual' } : {}),
        criadoPor: escopo.membroId,
        atualizadoPor: escopo.membroId,
      })
      .returning({ id: contatos.id })
    if (!criado) throw new Error('INSERT de contato sem retorno')
    const id = criado.id

    await this.gravarTelefones(db, tenantId, id, telefones)
    await this.gravarEmails(db, tenantId, id, emails)
    if (dados.vinculo) {
      await this.vincular(db, tenantId, id, dados.vinculo.empresaId, {
        cargo: dados.vinculo.cargo ?? null,
        principal: dados.vinculo.principal === true,
      })
    }
    await this.auditoria.registrar({
      entidade: 'contato',
      entidadeId: id,
      acao: 'criar',
      alteracoes: {
        nome: dados.nome,
        ...(dados.vinculo
          ? { empresaId: dados.vinculo.empresaId, cargo: dados.vinculo.cargo ?? null }
          : {}),
      },
    })
    return this.detalhar(id)
  }

  async alterar(id: string, dados: AlterarContato): Promise<Contato> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (dados.papelDecisaoId && dados.papelDecisaoId !== atual.papelDecisaoId) {
      await this.exigirPapel(db, dados.papelDecisaoId)
    }

    const {
      telefones: telefonesNovos,
      emails: emailsNovos,
      aniversario,
      ignorarDuplicado,
      ...escalares
    } = dados
    const novo: Record<string, unknown> = {
      ...escalares,
      ...(aniversario !== undefined && {
        aniversarioDia: aniversario?.dia ?? null,
        aniversarioMes: aniversario?.mes ?? null,
      }),
    }
    const mudancas = diferencas(atual, novo)

    const telefones = telefonesNovos ? normalizarTelefonesDaEmpresa(telefonesNovos) : null
    const telefonesAtuais = await db
      .select()
      .from(contatoTelefones)
      .where(eq(contatoTelefones.contatoId, id))
    const assinaturaT = (t: {
      numeroE164: string
      tipo: string
      principal: boolean
      descricao: string | null
    }) => `${t.numeroE164}|${t.tipo}|${t.descricao ?? ''}|${t.principal ? 1 : 0}`
    const mudouTelefones =
      telefones !== null &&
      JSON.stringify(telefonesAtuais.map(assinaturaT).sort()) !==
        JSON.stringify(telefones.map(assinaturaT).sort())

    const emails = emailsNovos ? normalizarEmails(emailsNovos) : null
    const emailsAtuais = await db
      .select()
      .from(contatoEmails)
      .where(eq(contatoEmails.contatoId, id))
    const assinaturaE = (e: { email: string; tipo: string; principal: boolean }) =>
      `${e.email}|${e.tipo}|${e.principal ? 1 : 0}`
    const mudouEmails =
      emails !== null &&
      JSON.stringify(emailsAtuais.map(assinaturaE).sort()) !==
        JSON.stringify(emails.map(assinaturaE).sort())

    if (Object.keys(mudancas).length === 0 && !mudouTelefones && !mudouEmails) {
      return this.detalhar(id)
    }

    if (!ignorarDuplicado) {
      // Só o que é novo: o que o contato já tinha não é duplicado de si mesmo
      const jaTinhaE = new Set(emailsAtuais.map((e) => e.email))
      const jaTinhaT = new Set(telefonesAtuais.map((t) => t.numeroE164))
      await this.avisarDuplicados(
        db,
        escopo,
        (emails ?? []).map((e) => e.email).filter((e) => !jaTinhaE.has(e)),
        (telefones ?? []).map((t) => t.numeroE164).filter((t) => !jaTinhaT.has(t)),
        id,
      )
    }

    const mudouConsentimento = 'aceitaWhatsapp' in mudancas || 'aceitaEmail' in mudancas
    await db
      .update(contatos)
      .set({
        ...(dados.nome !== undefined && { nome: dados.nome }),
        ...(dados.papelDecisaoId !== undefined && { papelDecisaoId: dados.papelDecisaoId }),
        ...(aniversario !== undefined && {
          aniversarioDia: aniversario?.dia ?? null,
          aniversarioMes: aniversario?.mes ?? null,
        }),
        ...(dados.linkedinUrl !== undefined && { linkedinUrl: dados.linkedinUrl }),
        ...(dados.observacoes !== undefined && { observacoes: dados.observacoes }),
        ...(dados.aceitaWhatsapp !== undefined && { aceitaWhatsapp: dados.aceitaWhatsapp }),
        ...(dados.aceitaEmail !== undefined && { aceitaEmail: dados.aceitaEmail }),
        ...(mudouConsentimento && { consentimentoEm: new Date(), consentimentoOrigem: 'manual' }),
        atualizadoPor: escopo.membroId,
      })
      .where(eq(contatos.id, id))
    if (mudouTelefones && telefones) await this.gravarTelefones(db, tenantId, id, telefones)
    if (mudouEmails && emails) await this.gravarEmails(db, tenantId, id, emails)

    const alteracoes: Record<string, unknown> = { ...mudancas }
    if (mudouTelefones) {
      alteracoes['telefones'] = {
        de: telefonesAtuais.map((t) => t.numeroE164),
        para: telefones?.map((t) => t.numeroE164),
      }
    }
    if (mudouEmails) {
      alteracoes['emails'] = {
        de: emailsAtuais.map((e) => e.email),
        para: emails?.map((e) => e.email),
      }
    }
    await this.auditoria.registrar({
      entidade: 'contato',
      entidadeId: id,
      acao: 'alterar',
      alteracoes,
    })
    return this.detalhar(id)
  }

  /** Exclusão lógica, só admin e gestor, sem lixeira. */
  async excluir(id: string): Promise<void> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [atual] = await db
      .select({ id: contatos.id, nome: contatos.nome })
      .from(contatos)
      .where(
        and(
          eq(contatos.id, id),
          isNull(contatos.excluidoEm),
          condicaoDeVisibilidadeDoContato(escopo),
        ),
      )
    if (!atual) throw naoEncontrado()
    if (!podeExcluirContato(escopo))
      throw negado('Seu perfil de acesso não permite excluir contatos.')
    const exclusao = condicaoDeExclusaoDoContato(escopo)
    if (exclusao) {
      const [alcancado] = await db
        .select({ id: contatos.id })
        .from(contatos)
        .where(and(eq(contatos.id, id), exclusao))
      if (!alcancado) throw negado('Este contato está fora da carteira que você pode excluir.')
    }
    await db
      .update(contatos)
      .set({ excluidoEm: new Date(), atualizadoPor: escopo.membroId })
      .where(eq(contatos.id, id))
    await this.auditoria.registrar({
      entidade: 'contato',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: atual.nome },
    })
  }

  // ---- apoio (usado também pelos vínculos e pela conversão de sócio) ----

  /** O contato que o usuário vê E edita; 404 se não vê, 403 se só vê. */
  async carregarEditavel(db: Transacao, escopo: EscopoDaCarteira, id: string) {
    const [linha] = await db
      .select()
      .from(contatos)
      .where(
        and(
          eq(contatos.id, id),
          isNull(contatos.excluidoEm),
          condicaoDeVisibilidadeDoContato(escopo),
        ),
      )
    if (!linha) throw naoEncontrado()
    const edita = await db
      .select({ id: contatos.id })
      .from(contatos)
      .where(and(eq(contatos.id, id), condicaoDeEdicaoDoContato(escopo) ?? sql`true`))
    if (edita.length === 0) throw negado('Você só edita contatos das empresas da sua carteira.')
    return linha
  }

  /** A empresa existe, o usuário a vê e pode editá-la (só se vincula contato a empresa que se edita). */
  async exigirEmpresaEditavel(db: Transacao, escopo: EscopoDaCarteira, empresaId: string) {
    const [e] = await db
      .select({ id: empresas.id, vendedorId: empresas.vendedorId })
      .from(empresas)
      .where(and(eq(empresas.id, empresaId), isNull(empresas.excluidoEm)))
    if (!e || !podeVer(escopo, e.vendedorId)) {
      throw invalido('vinculo.empresaId', 'empresa_invalida', 'Empresa não encontrada.')
    }
    if (!podeEditar(escopo, e.vendedorId)) {
      throw negado('Você só vincula contatos a empresas da sua carteira.')
    }
  }

  private async exigirPapel(db: Transacao, papelId: string): Promise<void> {
    const [p] = await db
      .select({ id: papeisDecisao.id })
      .from(papeisDecisao)
      .where(
        and(
          eq(papeisDecisao.id, papelId),
          eq(papeisDecisao.ativo, true),
          isNull(papeisDecisao.excluidoEm),
        ),
      )
    if (!p) {
      throw invalido('papelDecisaoId', 'papel_invalido', 'Papel na decisão inexistente ou inativo.')
    }
  }

  /**
   * Cria o vínculo (ou reativa o que existe). Contato principal é um só por empresa: marcar este tira o
   * selo do anterior.
   */
  async vincular(
    db: Transacao,
    tenantId: string,
    contatoId: string,
    empresaId: string,
    dados: { cargo: string | null; principal: boolean },
  ): Promise<void> {
    if (dados.principal) {
      await db
        .update(empresaContatos)
        .set({ principal: false })
        .where(and(eq(empresaContatos.empresaId, empresaId), eq(empresaContatos.principal, true)))
    }
    await db
      .insert(empresaContatos)
      .values({ tenantId, empresaId, contatoId, cargo: dados.cargo, principal: dados.principal })
      .onConflictDoUpdate({
        target: [empresaContatos.empresaId, empresaContatos.contatoId],
        set: { cargo: dados.cargo, principal: dados.principal, ativo: true, ate: null },
      })
  }

  /** 409 `contato_duplicado` se algum e-mail ou telefone já é de outro contato (o nome só vai se o usuário o vê). */
  private async avisarDuplicados(
    db: Transacao,
    escopo: EscopoDaCarteira,
    emails: string[],
    telefones: string[],
    exceto?: string,
  ): Promise<void> {
    if (emails.length === 0 && telefones.length === 0) return
    const achados: { id: string; nome: string; motivo: 'email' | 'telefone' }[] = []
    if (emails.length > 0) {
      const l = await db
        .selectDistinct({ id: contatos.id, nome: contatos.nome })
        .from(contatoEmails)
        .innerJoin(contatos, eq(contatos.id, contatoEmails.contatoId))
        .where(and(inArray(contatoEmails.email, emails), isNull(contatos.excluidoEm)))
      for (const c of l) achados.push({ ...c, motivo: 'email' })
    }
    if (telefones.length > 0) {
      const l = await db
        .selectDistinct({ id: contatos.id, nome: contatos.nome })
        .from(contatoTelefones)
        .innerJoin(contatos, eq(contatos.id, contatoTelefones.contatoId))
        .where(and(inArray(contatoTelefones.numeroE164, telefones), isNull(contatos.excluidoEm)))
      for (const c of l) achados.push({ ...c, motivo: 'telefone' })
    }
    const outros = achados.filter((a) => a.id !== exceto)
    if (outros.length === 0) return
    const visiveis = new Set(
      (
        await db
          .select({ id: contatos.id })
          .from(contatos)
          .where(
            and(
              inArray(contatos.id, [...new Set(outros.map((o) => o.id))]),
              condicaoDeVisibilidadeDoContato(escopo) ?? sql`true`,
            ),
          )
      ).map((v) => v.id),
    )
    const existentes: ContatoExistente[] = outros.map((o) =>
      visiveis.has(o.id)
        ? { visivel: true, id: o.id, nome: o.nome, motivo: o.motivo }
        : { visivel: false, motivo: o.motivo },
    )
    throw new ErroApi(
      'contato_duplicado',
      'Já existe um contato com este e-mail ou telefone.',
      409,
      undefined,
      { existentes },
    )
  }

  private async gravarTelefones(
    db: Transacao,
    tenantId: string,
    contatoId: string,
    telefones: ReturnType<typeof normalizarTelefonesDaEmpresa>,
  ): Promise<void> {
    await db.delete(contatoTelefones).where(eq(contatoTelefones.contatoId, contatoId))
    if (telefones.length === 0) return
    await db.insert(contatoTelefones).values(
      telefones.map((t) => ({
        tenantId,
        contatoId,
        numero: t.numero,
        numeroE164: t.numeroE164,
        tipo: t.tipo,
        descricao: t.descricao,
        principal: t.principal,
        origem: t.origem ?? ('manual' as const),
      })),
    )
  }

  private async gravarEmails(
    db: Transacao,
    tenantId: string,
    contatoId: string,
    emails: EmailParaGravar[],
  ): Promise<void> {
    await db.delete(contatoEmails).where(eq(contatoEmails.contatoId, contatoId))
    if (emails.length === 0) return
    await db.insert(contatoEmails).values(
      emails.map((e) => ({
        tenantId,
        contatoId,
        email: e.email,
        tipo: e.tipo,
        principal: e.principal,
      })),
    )
  }
}
