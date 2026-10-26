import { novoId, sql } from '@leadtogo/db'
import type {
  ConsultaDePedidosDeAcesso,
  ListaDePedidosDeAcesso,
  ListaDePedidosDoCliente,
  PedirAcessoParaColegaEntrada,
  TratarPedidoDeAcessoEntrada,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'
import { PortalAcessosService } from './portal-acessos.service.js'

type LinhaDoPedido = {
  id: string
  empresa_id: string
  empresa_nome: string
  pedido_por: string
  pedido_por_nome: string
  nome: string
  email: string
  cargo: string | null
  situacao: 'pendente' | 'aprovado' | 'recusado'
  motivo: string | null
  criado_em: string | Date
}

/** Pedidos de acesso: o Responsável pede para um colega; a equipe aprova (cria contato e convite) ou recusa. */
@Injectable()
export class PortalPedidosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly acessos: PortalAcessosService,
  ) {}

  // --------------------------------------------------------------------------- lado do cliente

  /** Só o Responsável pede, e só para a própria empresa-cliente (o corpo nunca traz a empresa). */
  async pedir(dados: PedirAcessoParaColegaEntrada): Promise<void> {
    const p = this.ctx.portal
    if (p.papel !== 'responsavel') {
      throw new ErroApi('acesso_negado', 'Só o Responsável pode pedir acesso para um colega.', 403)
    }
    const db = this.ctx.db()
    const [ja] = await db.execute(sql`
      SELECT 1 FROM portal_acessos
      WHERE empresa_id = ${p.empresaId} AND email = ${dados.email} AND situacao <> 'revogado' AND excluido_em IS NULL`)
    if (ja) throw new ErroApi('email_em_uso', 'Este e-mail já tem acesso ao portal.', 409)
    const [pendente] = await db.execute(sql`
      SELECT 1 FROM portal_pedidos_acesso
      WHERE empresa_id = ${p.empresaId} AND email = ${dados.email} AND situacao = 'pendente'`)
    if (pendente)
      throw new ErroApi('pedido_ja_existe', 'Já há um pedido pendente para este e-mail.', 409)
    const id = novoId()
    await db.execute(sql`
      INSERT INTO portal_pedidos_acesso (id, tenant_id, empresa_id, pedido_por, nome, email, cargo)
      VALUES (${id}, ${p.tenantId}, ${p.empresaId}, ${p.acessoId}, ${dados.nome}, ${dados.email}, ${dados.cargo ?? null})`)
    await auditarAtoDoPortal(db, {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'portal_pedido_acesso',
      entidadeId: id,
      acao: 'pedir_acesso_para_colega',
      alteracoes: { email: dados.email },
      ip: this.ctx.ip,
    })
  }

  async doCliente(): Promise<ListaDePedidosDoCliente> {
    const p = this.ctx.portal
    if (p.papel !== 'responsavel') {
      throw new ErroApi('acesso_negado', 'Só o Responsável vê os pedidos de acesso.', 403)
    }
    const linhas = await this.ctx.db().execute<LinhaDoPedido>(sql`
      SELECT pa.id, pa.empresa_id, '' AS empresa_nome, pa.pedido_por, '' AS pedido_por_nome, pa.nome,
             pa.email::text AS email, pa.cargo, pa.situacao::text AS situacao, pa.motivo, pa.criado_em
      FROM portal_pedidos_acesso pa WHERE pa.empresa_id = ${p.empresaId} ORDER BY pa.criado_em DESC LIMIT 100`)
    return {
      itens: [...linhas].map((l) => ({
        id: l.id,
        nome: l.nome,
        email: l.email,
        cargo: l.cargo,
        situacao: l.situacao,
        motivo: l.situacao === 'recusado' ? l.motivo : null,
        criadoEm: new Date(l.criado_em).toISOString(),
      })),
    }
  }

  // ------------------------------------------------------------------------------ lado da equipe

  async listar(consulta: ConsultaDePedidosDeAcesso): Promise<ListaDePedidosDeAcesso> {
    const linhas = await this.ctx.db().execute<LinhaDoPedido>(sql`
      SELECT pa.id, pa.empresa_id, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome, pa.pedido_por,
             c.nome AS pedido_por_nome, pa.nome, pa.email::text AS email, pa.cargo, pa.situacao::text AS situacao,
             pa.motivo, pa.criado_em
      FROM portal_pedidos_acesso pa
      JOIN empresas e ON e.id = pa.empresa_id
      JOIN portal_acessos a ON a.id = pa.pedido_por
      JOIN contatos c ON c.id = a.contato_id
      WHERE pa.situacao = ${consulta.situacao}::situacao_pedido_acesso
      ORDER BY pa.criado_em`)
    const itens = [...linhas].map((l) => ({
      id: l.id,
      empresaCliente: { id: l.empresa_id, nome: l.empresa_nome },
      pedidoPor: { id: l.pedido_por, nome: l.pedido_por_nome },
      nome: l.nome,
      email: l.email,
      cargo: l.cargo,
      situacao: l.situacao,
      criadoEm: new Date(l.criado_em).toISOString(),
    }))
    return { itens, total: itens.length }
  }

  /**
   * Aprovar cria o contato, o vínculo com a empresa-cliente (com o cargo) e o acesso (Colega) com o convite,
   * numa transação só: se o convite falhar, nada fica pela metade. Recusar guarda o motivo, que o Responsável vê.
   */
  async tratar(id: string, dados: TratarPedidoDeAcessoEntrada): Promise<void> {
    const db = this.ctx.db()
    const [pedido] = await db.execute<LinhaDoPedido>(sql`
      SELECT id, empresa_id, '' AS empresa_nome, pedido_por, '' AS pedido_por_nome, nome, email::text AS email,
             cargo, situacao::text AS situacao, motivo, criado_em
      FROM portal_pedidos_acesso WHERE id = ${id} FOR UPDATE`)
    if (!pedido) throw new ErroApi('pedido_nao_encontrado', 'Pedido não encontrado.', 404)
    if (pedido.situacao !== 'pendente') {
      throw new ErroApi('pedido_ja_tratado', 'Este pedido já foi tratado.', 409)
    }
    if (dados.decisao === 'recusar') {
      await db.execute(sql`
        UPDATE portal_pedidos_acesso
        SET situacao = 'recusado', tratado_por = ${this.ctx.membro.id}, tratado_em = now(),
            motivo = ${dados.motivo ?? null}, atualizado_em = now()
        WHERE id = ${id}`)
      await this.auditoria.registrar({
        entidade: 'portal_pedido_acesso',
        entidadeId: id,
        acao: 'recusar_pedido',
        alteracoes: { email: pedido.email },
      })
      return
    }

    const contatoId = novoId()
    await db.execute(sql`
        INSERT INTO contatos (id, tenant_id, nome, criado_por, observacoes)
        VALUES (${contatoId}, ${this.ctx.tenantId}, ${pedido.nome}, ${this.ctx.membro.id},
                'Criado a partir de um pedido de acesso ao portal do cliente.')`)
    await db.execute(sql`
        INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id, cargo)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${pedido.empresa_id}, ${contatoId}, ${pedido.cargo})`)
    await db.execute(sql`
        INSERT INTO contato_emails (id, tenant_id, contato_id, email, principal)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${contatoId}, ${pedido.email}, true)`)
    await this.acessos.darAcesso({
      contatoId,
      empresaClienteId: pedido.empresa_id,
      email: pedido.email,
      papel: 'colega',
    })
    await db.execute(sql`
      UPDATE portal_pedidos_acesso
      SET situacao = 'aprovado', tratado_por = ${this.ctx.membro.id}, tratado_em = now(), atualizado_em = now()
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'portal_pedido_acesso',
      entidadeId: id,
      acao: 'aprovar_pedido',
      alteracoes: { email: pedido.email, contatoId },
    })
  }
}
