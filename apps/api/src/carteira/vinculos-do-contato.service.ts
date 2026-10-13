import { and, asc, desc, eq, inArray, isNull, schema, sql } from '@leadtogo/db'
import type { AlterarVinculo, Contato, ContatoDaEmpresa, VincularContato } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { lerContato } from './contato-leitura.js'
import { ContatosService } from './contatos.service.js'
import {
  condicaoDeVisibilidade,
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
} from './regras-de-carteira.js'
import { condicaoDeVisibilidadeDoContato } from './regras-de-contato.js'

const { contatos, contatoEmails, contatoTelefones, empresaContatos, empresas, papeisDecisao } =
  schema

const contatoNaoEncontrado = () =>
  new ErroApi('contato_nao_encontrado', 'Contato não encontrado.', 404)
const empresaNaoEncontrada = () =>
  new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)

const hoje = (): string => new Date().toISOString().slice(0, 10)
const nomeDe = (e: { nomeFantasia: string | null; razaoSocial: string }): string =>
  e.nomeFantasia ?? e.razaoSocial

/**
 * Vínculos entre contato e empresa: vincular a outra empresa, mudar o cargo, escolher o principal e
 * inativar (a pessoa saiu da empresa; o histórico fica). Quem pode: ver o contato e editar a **empresa**
 * do vínculo (o vendedor, só a própria carteira). Não há exclusão de vínculo, só inativação.
 */
@Injectable()
export class VinculosDoContatoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly contatosServico: ContatosService,
  ) {}

  async vincular(contatoId: string, dados: VincularContato): Promise<Contato> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const contato = await this.contatoVisivel(escopo, contatoId)
    await this.contatosServico.exigirEmpresaEditavel(db, escopo, dados.empresaId)

    const [existente] = await db
      .select()
      .from(empresaContatos)
      .where(
        and(
          eq(empresaContatos.contatoId, contatoId),
          eq(empresaContatos.empresaId, dados.empresaId),
        ),
      )
    if (existente?.ativo) {
      throw new ErroApi('vinculo_ja_existe', 'Este contato já está vinculado a esta empresa.', 409)
    }
    const cargo = dados.cargo ?? null
    const principal = dados.principal === true
    await this.contatosServico.vincular(db, this.ctx.tenantId, contatoId, dados.empresaId, {
      cargo,
      principal,
    })
    const [empresa] = await db
      .select({ razaoSocial: empresas.razaoSocial, nomeFantasia: empresas.nomeFantasia })
      .from(empresas)
      .where(eq(empresas.id, dados.empresaId))
    await this.auditoria.registrar({
      entidade: 'contato',
      entidadeId: contatoId,
      acao: existente ? 'reativar_vinculo' : 'vincular',
      alteracoes: { empresa: empresa ? nomeDe(empresa) : dados.empresaId, cargo, principal },
    })
    return this.devolver(escopo, contato.id)
  }

  async alterar(contatoId: string, empresaId: string, dados: AlterarVinculo): Promise<Contato> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    await this.contatoVisivel(escopo, contatoId)

    // O vínculo com empresa que o usuário não vê é como se não existisse
    const [linha] = await db
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
          eq(empresaContatos.contatoId, contatoId),
          eq(empresaContatos.empresaId, empresaId),
          isNull(empresas.excluidoEm),
          condicaoDeVisibilidade(escopo),
        ),
      )
    if (!linha) {
      throw new ErroApi('vinculo_nao_encontrado', 'Vínculo não encontrado.', 404)
    }
    if (!podeEditar(escopo, linha.vendedorId)) {
      throw new ErroApi(
        'acesso_negado',
        'Você só altera vínculos de empresas da sua carteira.',
        403,
      )
    }

    const atual = linha.v
    const ativo = dados.ativo ?? atual.ativo
    if (dados.principal === true && !ativo) {
      throw new ErroApi(
        'vinculo_inativo',
        'Só o vínculo ativo pode ser o contato principal da empresa.',
        400,
        [{ campo: 'principal', mensagem: 'Reative o vínculo antes de marcá-lo como principal.' }],
      )
    }
    // Inativar tira o selo de principal (a tabela não aceita principal inativo)
    const principal = ativo ? (dados.principal ?? atual.principal) : false
    const cargo = dados.cargo === undefined ? atual.cargo : dados.cargo

    const mudancas: Record<string, { de: unknown; para: unknown }> = {}
    if (cargo !== atual.cargo) mudancas['cargo'] = { de: atual.cargo, para: cargo }
    if (principal !== atual.principal)
      mudancas['principal'] = { de: atual.principal, para: principal }
    if (ativo !== atual.ativo) mudancas['ativo'] = { de: atual.ativo, para: ativo }
    if (Object.keys(mudancas).length === 0) return this.devolver(escopo, contatoId)

    if (principal && !atual.principal) {
      // Um principal por empresa: o selo sai do anterior
      await db
        .update(empresaContatos)
        .set({ principal: false })
        .where(and(eq(empresaContatos.empresaId, empresaId), eq(empresaContatos.principal, true)))
    }
    await db
      .update(empresaContatos)
      .set({
        cargo,
        principal,
        ativo,
        ...(ativo !== atual.ativo && { ate: ativo ? null : hoje() }),
      })
      .where(eq(empresaContatos.id, atual.id))
    await this.auditoria.registrar({
      entidade: 'contato',
      entidadeId: contatoId,
      acao: 'alterar_vinculo',
      alteracoes: { empresa: nomeDe(linha), ...mudancas },
    })
    return this.devolver(escopo, contatoId)
  }

  /** A aba Contatos da ficha da empresa: todos os vínculos dela (os ativos primeiro), sem os contatos excluídos. */
  async daEmpresa(empresaId: string): Promise<ContatoDaEmpresa[]> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [empresa] = await db
      .select({ id: empresas.id })
      .from(empresas)
      .where(
        and(
          eq(empresas.id, empresaId),
          isNull(empresas.excluidoEm),
          condicaoDeVisibilidade(escopo),
        ),
      )
    if (!empresa) throw empresaNaoEncontrada()

    const linhas = await db
      .select({
        id: contatos.id,
        nome: contatos.nome,
        papelId: contatos.papelDecisaoId,
        papelNome: papeisDecisao.nome,
        aceitaWhatsapp: contatos.aceitaWhatsapp,
        aceitaEmail: contatos.aceitaEmail,
        consentimentoEm: contatos.consentimentoEm,
        cargo: empresaContatos.cargo,
        principal: empresaContatos.principal,
        ativo: empresaContatos.ativo,
      })
      .from(empresaContatos)
      .innerJoin(contatos, eq(contatos.id, empresaContatos.contatoId))
      .leftJoin(papeisDecisao, eq(papeisDecisao.id, contatos.papelDecisaoId))
      .where(and(eq(empresaContatos.empresaId, empresaId), isNull(contatos.excluidoEm)))
      .orderBy(
        desc(empresaContatos.ativo),
        desc(empresaContatos.principal),
        asc(sql`lower(f_unaccent(${contatos.nome}))`),
        asc(contatos.id),
      )
    if (linhas.length === 0) return []
    const ids = linhas.map((l) => l.id)
    const [telefones, emails] = await Promise.all([
      db
        .select({
          contatoId: contatoTelefones.contatoId,
          e164: contatoTelefones.numeroE164,
          tipo: contatoTelefones.tipo,
        })
        .from(contatoTelefones)
        .where(inArray(contatoTelefones.contatoId, ids))
        .orderBy(
          desc(contatoTelefones.principal),
          asc(contatoTelefones.criadoEm),
          asc(contatoTelefones.id),
        ),
      db
        .select({ contatoId: contatoEmails.contatoId, email: contatoEmails.email })
        .from(contatoEmails)
        .where(inArray(contatoEmails.contatoId, ids))
        .orderBy(desc(contatoEmails.principal), asc(contatoEmails.criadoEm), asc(contatoEmails.id)),
    ])
    return linhas.map((l) => {
      const dele = telefones.filter((t) => t.contatoId === l.id)
      return {
        id: l.id,
        nome: l.nome,
        papelDecisao:
          l.papelId !== null && l.papelNome !== null ? { id: l.papelId, nome: l.papelNome } : null,
        cargo: l.cargo,
        principal: l.principal,
        ativo: l.ativo,
        telefone: dele[0]?.e164 ?? null,
        temWhatsapp: dele.some((t) => t.tipo === 'whatsapp'),
        email: emails.find((e) => e.contatoId === l.id)?.email ?? null,
        naoQuerContato: l.consentimentoEm !== null && !l.aceitaWhatsapp && !l.aceitaEmail,
      }
    })
  }

  // ---- apoio ----

  private async contatoVisivel(escopo: EscopoDaCarteira, id: string) {
    const [c] = await this.ctx
      .db()
      .select({ id: contatos.id })
      .from(contatos)
      .where(
        and(
          eq(contatos.id, id),
          isNull(contatos.excluidoEm),
          condicaoDeVisibilidadeDoContato(escopo),
        ),
      )
    if (!c) throw contatoNaoEncontrado()
    return c
  }

  /** O contato como o usuário o vê agora; quem perdeu a visão (inativou o último vínculo) ainda o recebe. */
  private async devolver(escopo: EscopoDaCarteira, id: string): Promise<Contato> {
    const contato = await lerContato(this.ctx.db(), escopo, id, true)
    if (!contato) throw contatoNaoEncontrado()
    return contato
  }
}
