import { createHash, randomInt } from 'node:crypto'

import { type Conexao, novoId, type SQL, sql } from '@leadtogo/db'
import type { PreviaDoLink } from '@leadtogo/shared'
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { EmailService } from '../email/email.service.js'
import { emailPortalCodigo } from '../email/modelos.js'
import { ErroApi } from '../http/erro-api.js'
import { ehViolacaoDeUnicidade } from '../http/sqlstate.js'
import { BANCO } from '../infra/infra.module.js'
import { LimitePorChave } from './limite-por-chave.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'
import { PortalLinksService } from './portal-links.service.js'
import type { ContextoDoPortal } from './portal.tipos.js'
import { PortalSessaoService } from './portal-sessao.service.js'
import { hashDoTokenDoPortal, tenantDoToken } from './portal-token.js'

const linkInvalido = () => new ErroApi('link_invalido', 'Link inválido ou expirado.', 404)
const codigoInvalido = () =>
  new ErroApi('codigo_invalido', 'Código inválido ou expirado. Peça um novo código.', 401)

/** O código de entrada vale 10 minutos (Fase 4B, B-23). */
export const VALIDADE_DO_CODIGO_MIN = 10

/** Seis dígitos aleatórios (000000 a 999999), do gerador criptográfico. */
export const novoCodigoDeEntrada = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** Só o hash fica no banco: SHA-256 do e-mail (minúsculo) e do código. */
export const hashDoCodigoDeEntrada = (email: string, codigo: string): string =>
  createHash('sha256').update(`${email.toLowerCase()}:${codigo}`).digest('hex')

export interface EmpresaDoAcesso {
  acessoId: string
  nome: string
  papel: 'responsavel' | 'colega'
  atual: boolean
}

type DadosDoLink = {
  link_id: string
  finalidade: 'convite' | 'entrada' | 'troca_email'
  email_destino: string | null
  acesso_id: string
  contato_id: string
  situacao: string
  privacidade_aceita_em: string | Date | null
  contato_nome: string
  empresa_nome: string
  portal_ativo: boolean | null
  portal_nome: string | null
  tenant_situacao: string
}

/** Entrada sem senha: pedir o link por e-mail, conferir o link e trocá-lo pela sessão. */
@Injectable()
export class PortalEntradaService implements OnModuleDestroy {
  private readonly log = new Logger(PortalEntradaService.name)
  /** Pedidos de entrada em andamento: a resposta sai na hora (sempre igual); o trabalho segue aqui. */
  private readonly pendentes = new Set<Promise<void>>()

  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly links: PortalLinksService,
    private readonly sessoes: PortalSessaoService,
    private readonly email: EmailService,
    private readonly limites: LimitePorChave,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.pendentes])
  }

  /** Espera o que ficou em andamento (os testes aguardam o e-mail enfileirado). */
  async aguardarPendentes(): Promise<void> {
    await Promise.allSettled([...this.pendentes])
  }

  private async noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  // ------------------------------------------------------------------------------------ pedir o link

  /**
   * Responde sempre igual, tenha o e-mail acesso ou não (não revela quem é cliente). O trabalho roda em
   * segundo plano para o tempo de resposta também não revelar. Limite por e-mail além do limite por IP da rota.
   */
  /** Sem PORTAL_URL o portal está desligado: 503 (a configuração faltando não é segredo). */
  conferirPortal(): void {
    this.links.origemDoPortal()
  }

  pedirEntrada(email: string, ip: string | undefined): void {
    this.links.origemDoPortal() // sem PORTAL_URL: 503 (a configuração faltando não é segredo)
    const trabalho = this.processarPedido(email, ip)
      .catch((erro: unknown) => {
        this.log.error(
          `pedido de entrada falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
        )
      })
      .finally(() => this.pendentes.delete(trabalho))
    this.pendentes.add(trabalho)
  }

  private async processarPedido(email: string, ip: string | undefined): Promise<void> {
    const chave = createHash('sha256').update(email).digest('hex')
    if (!(await this.limites.permitir('entrada-email', chave, 5, 3600))) return

    const acessos = await this.banco.db.execute<{ tenant_id: string; acesso_id: string }>(
      sql`SELECT tenant_id, acesso_id FROM app_portal_acessos_por_email(${email}::citext)`,
    )
    // Um código por empresa da equipe (tenant): o mesmo e-mail em duas empresas-clientes do mesmo CRM
    // recebe UM código e escolhe a empresa depois de entrar (Fase 4B, B-1)
    const porTenant = new Map<string, string[]>()
    for (const a of acessos)
      porTenant.set(a.tenant_id, [...(porTenant.get(a.tenant_id) ?? []), a.acesso_id])
    for (const [tenantId, ids] of porTenant) {
      const enviar = await this.noTenant(tenantId, async (tx) => {
        const validos = await tx.execute<{
          contato_nome: string
          portal_nome: string | null
          empresa_nome: string
        }>(sql`
          SELECT c.nome AS contato_nome, tc.portal_nome, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome
          FROM portal_acessos a
          JOIN contatos c ON c.id = a.contato_id AND c.excluido_em IS NULL
          JOIN empresas e ON e.id = a.empresa_id AND e.excluido_em IS NULL
          JOIN tenants t ON t.id = a.tenant_id AND t.situacao IN ('teste', 'ativo')
          JOIN tenant_configuracoes tc ON tc.tenant_id = a.tenant_id AND tc.portal_ativo
          WHERE a.id = ANY (${`{${ids.join(',')}}`}::uuid[]) AND a.situacao = 'ativo' AND a.excluido_em IS NULL
          ORDER BY a.ultimo_acesso_em DESC NULLS LAST, a.criado_em`)
        const [d] = validos
        if (!d) return null
        const codigo = novoCodigoDeEntrada()
        // Um código vivo por e-mail e tenant: pedir de novo invalida o anterior
        await tx.execute(sql`
          UPDATE portal_codigos SET usado_em = now(), atualizado_em = now()
          WHERE email = ${email} AND usado_em IS NULL`)
        await tx.execute(sql`
          INSERT INTO portal_codigos (id, tenant_id, email, codigo_hash, expira_em, ip)
          VALUES (${novoId()}, ${tenantId}, ${email}, ${hashDoCodigoDeEntrada(email, codigo)},
                  now() + ${`${VALIDADE_DO_CODIGO_MIN} minutes`}::interval, ${ip ?? null})`)
        return {
          codigo,
          nome: d.contato_nome,
          portal: d.portal_nome ?? (validos.length > 1 ? 'Portal do Cliente' : d.empresa_nome),
        }
      })
      if (!enviar) continue
      await this.email.enfileirar(
        email,
        emailPortalCodigo({ nome: enviar.nome, portal: enviar.portal, codigo: enviar.codigo }),
      )
    }
  }

  // --------------------------------------------------------------------------- entrar com o código

  /**
   * Confere o código (uso único, 10 minutos, 5 tentativas) e abre a sessão no acesso usado por último. Se o
   * e-mail tem acesso a mais de uma empresa-cliente, a tela oferece a troca logo depois (`/portal/empresas`).
   */
  async entrarComCodigo(
    email: string,
    codigo: string,
    aceitaPrivacidade: boolean | undefined,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<{ cookie: string; portal: ContextoDoPortal }> {
    const [r] = await this.banco.db.execute<{ tenant_id: string; codigo_id: string }>(
      sql`SELECT tenant_id, codigo_id FROM app_portal_conferir_codigo(${email}::citext, ${hashDoCodigoDeEntrada(email, codigo)})`,
    )
    if (!r) throw codigoInvalido()
    return this.noTenant(r.tenant_id, async (tx) => {
      const [a] = await tx.execute<{
        acesso_id: string
        contato_id: string
        privacidade_aceita_em: string | Date | null
      }>(sql`
        SELECT a.id AS acesso_id, a.contato_id, a.privacidade_aceita_em FROM portal_acessos a
        JOIN contatos c ON c.id = a.contato_id AND c.excluido_em IS NULL
        JOIN empresas e ON e.id = a.empresa_id AND e.excluido_em IS NULL
        JOIN tenants t ON t.id = a.tenant_id AND t.situacao IN ('teste', 'ativo')
        JOIN tenant_configuracoes tc ON tc.tenant_id = a.tenant_id AND tc.portal_ativo
        WHERE a.email = ${email} AND a.situacao = 'ativo' AND a.excluido_em IS NULL
        ORDER BY a.ultimo_acesso_em DESC NULLS LAST, a.criado_em LIMIT 1`)
      if (!a) throw codigoInvalido()
      // O aceite é conferido ANTES de gastar o código: sem ele, a pessoa marca e manda o mesmo código de novo
      if (a.privacidade_aceita_em === null && aceitaPrivacidade !== true) {
        throw new ErroApi(
          'privacidade_obrigatoria',
          'Para continuar, aceite o aviso de privacidade do portal.',
          422,
        )
      }
      // Uso único e atômico: dois envios ao mesmo tempo, só um passa
      const [gasto] = await tx.execute(sql`
        UPDATE portal_codigos SET usado_em = now(), atualizado_em = now()
        WHERE id = ${r.codigo_id} AND usado_em IS NULL AND expira_em > now() RETURNING id`)
      if (!gasto) throw codigoInvalido()
      if (a.privacidade_aceita_em === null) {
        await tx.execute(sql`
          UPDATE portal_acessos SET privacidade_aceita_em = now(), atualizado_em = now() WHERE id = ${a.acesso_id}`)
      }
      return this.abrirSessao(
        tx,
        r.tenant_id,
        a.acesso_id,
        a.contato_id,
        'entrada_por_codigo',
        ip,
        agente,
      )
    })
  }

  private async abrirSessao(
    tx: Transacao,
    tenantId: string,
    acessoId: string,
    contatoId: string,
    acao: string,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<{ cookie: string; portal: ContextoDoPortal }> {
    const sessao = await this.sessoes.criar(tx, { tenantId, acessoId, ip, agente })
    await tx.execute(sql`UPDATE portal_acessos SET ultimo_acesso_em = now() WHERE id = ${acessoId}`)
    await auditarAtoDoPortal(tx, {
      tenantId,
      acessoId,
      contatoId,
      entidade: 'portal_acesso',
      entidadeId: acessoId,
      acao,
      ip,
    })
    const portal = await this.sessoes.resolver(tx, tenantId, sessao.token)
    return { cookie: sessao.token, portal }
  }

  // ------------------------------------------------------------------------ várias empresas (B-1)

  /** As empresas-clientes que o MESMO e-mail acessa neste CRM (só acessos ativos). */
  async empresasDoEmail(p: ContextoDoPortal): Promise<EmpresaDoAcesso[]> {
    return this.noTenant(p.tenantId, async (tx) => {
      const linhas = await tx.execute<{
        acesso_id: string
        empresa_nome: string
        papel: EmpresaDoAcesso['papel']
      }>(sql`
        SELECT a.id AS acesso_id, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome, a.papel::text AS papel
        FROM portal_acessos a
        JOIN empresas e ON e.id = a.empresa_id AND e.excluido_em IS NULL
        JOIN contatos c ON c.id = a.contato_id AND c.excluido_em IS NULL
        WHERE a.email = ${p.email} AND a.situacao = 'ativo' AND a.excluido_em IS NULL
        ORDER BY lower(coalesce(e.nome_fantasia, e.razao_social))`)
      return linhas.map((l) => ({
        acessoId: l.acesso_id,
        nome: l.empresa_nome,
        papel: l.papel,
        atual: l.acesso_id === p.acessoId,
      }))
    })
  }

  /**
   * Troca a empresa-cliente sem pedir outro código: só para outro acesso ATIVO do mesmo e-mail no mesmo CRM.
   * Abre uma sessão nova no acesso escolhido e encerra a atual (cada sessão é de um acesso só).
   */
  async trocarEmpresa(
    p: ContextoDoPortal,
    acessoId: string,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<{ cookie: string; portal: ContextoDoPortal }> {
    if (acessoId === p.acessoId)
      throw new ErroApi('mesma_empresa', 'Você já está nesta empresa.', 409)
    return this.noTenant(p.tenantId, async (tx) => {
      const [alvo] = await tx.execute<{ contato_id: string }>(sql`
        SELECT a.contato_id FROM portal_acessos a
        JOIN empresas e ON e.id = a.empresa_id AND e.excluido_em IS NULL
        JOIN contatos c ON c.id = a.contato_id AND c.excluido_em IS NULL
        WHERE a.id = ${acessoId} AND a.email = ${p.email} AND a.situacao = 'ativo' AND a.excluido_em IS NULL`)
      if (!alvo) {
        throw new ErroApi('empresa_indisponivel', 'Você não tem acesso a esta empresa.', 404)
      }
      await tx.execute(sql`
        UPDATE portal_sessoes SET revogada_em = now(), atualizado_em = now()
        WHERE id = ${p.sessaoId} AND revogada_em IS NULL`)
      return this.abrirSessao(
        tx,
        p.tenantId,
        acessoId,
        alvo.contato_id,
        'troca_de_empresa',
        ip,
        agente,
      )
    })
  }

  // ------------------------------------------------------------------------- conferir e consumir o link

  private async carregarLink(tx: Transacao, onde: SQL): Promise<DadosDoLink | undefined> {
    const [d] = await tx.execute<DadosDoLink>(sql`
      SELECT l.id AS link_id, l.finalidade::text AS finalidade, l.email_destino::text AS email_destino,
             a.id AS acesso_id, a.contato_id, a.situacao::text AS situacao, a.privacidade_aceita_em,
             c.nome AS contato_nome, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome,
             tc.portal_ativo, tc.portal_nome, t.situacao::text AS tenant_situacao
      FROM portal_links l
      JOIN portal_acessos a ON a.id = l.acesso_id AND a.excluido_em IS NULL
      JOIN contatos c ON c.id = a.contato_id AND c.excluido_em IS NULL
      JOIN empresas e ON e.id = a.empresa_id AND e.excluido_em IS NULL
      JOIN tenants t ON t.id = l.tenant_id
      LEFT JOIN tenant_configuracoes tc ON tc.tenant_id = l.tenant_id
      WHERE ${onde}`)
    return d
  }

  private valido(d: DadosDoLink | undefined): d is DadosDoLink {
    if (!d || d.portal_ativo !== true || !['teste', 'ativo'].includes(d.tenant_situacao))
      return false
    // Convite vale para quem ainda não ativou; entrada e troca de e-mail, para quem já está ativo
    return d.finalidade === 'convite' ? d.situacao === 'convidado' : d.situacao === 'ativo'
  }

  /** O que a página de confirmação mostra. Não consome o link (verificadores de e-mail podem abri-lo). */
  async previa(token: string): Promise<PreviaDoLink> {
    const tenantId = tenantDoToken(token)
    if (!tenantId) throw linkInvalido()
    const d = await this.noTenant(tenantId, (tx) =>
      this.carregarLink(
        tx,
        sql`l.token_hash = ${hashDoTokenDoPortal(token)} AND l.usado_em IS NULL AND l.expira_em > now()`,
      ),
    )
    if (!this.valido(d)) throw linkInvalido()
    return {
      finalidade: d.finalidade,
      nomeDoPortal: d.portal_nome ?? d.empresa_nome,
      empresaCliente: d.empresa_nome,
      exigeAceiteDePrivacidade: d.privacidade_aceita_em === null,
    }
  }

  /**
   * Consome o link (uso único, atômico) e cria a sessão. Convite ativa o acesso; troca de e-mail grava o
   * endereço novo. Qualquer falha desfaz tudo, inclusive o consumo: o link continua valendo.
   */
  async consumir(
    token: string,
    aceitaPrivacidade: boolean | undefined,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<{ cookie: string; portal: ContextoDoPortal }> {
    const tenantId = tenantDoToken(token)
    if (!tenantId) throw linkInvalido()
    const hash = hashDoTokenDoPortal(token)
    return this.noTenant(tenantId, async (tx) => {
      // Consumo atômico: dois cliques ao mesmo tempo, só um passa
      const [consumido] = await tx.execute<{ id: string }>(sql`
        UPDATE portal_links SET usado_em = now(), atualizado_em = now(), ip = ${ip ?? null}
        WHERE token_hash = ${hash} AND usado_em IS NULL AND expira_em > now() RETURNING id`)
      if (!consumido) throw linkInvalido()
      const d = await this.carregarLink(tx, sql`l.id = ${consumido.id}`)
      if (!this.valido(d)) throw linkInvalido()

      if (d.privacidade_aceita_em === null && aceitaPrivacidade !== true) {
        throw new ErroApi(
          'privacidade_obrigatoria',
          'Para continuar, aceite o aviso de privacidade do portal.',
          422,
        )
      }
      if (d.finalidade === 'convite') {
        await tx.execute(sql`
          UPDATE portal_acessos SET situacao = 'ativo', aceito_em = now(), atualizado_em = now()
          WHERE id = ${d.acesso_id}`)
      }
      if (d.privacidade_aceita_em === null) {
        await tx.execute(sql`
          UPDATE portal_acessos SET privacidade_aceita_em = now(), atualizado_em = now() WHERE id = ${d.acesso_id}`)
      }
      if (d.finalidade === 'troca_email' && d.email_destino) {
        try {
          await tx.execute(sql`
            UPDATE portal_acessos SET email = ${d.email_destino}, atualizado_em = now() WHERE id = ${d.acesso_id}`)
        } catch (erro) {
          if (!ehViolacaoDeUnicidade(erro)) throw erro
          throw new ErroApi(
            'email_em_uso',
            'Este e-mail já é usado por outro acesso desta empresa.',
            409,
          )
        }
      }
      const sessao = await this.sessoes.criar(tx, { tenantId, acessoId: d.acesso_id, ip, agente })
      await tx.execute(sql`
        UPDATE portal_acessos SET ultimo_acesso_em = now() WHERE id = ${d.acesso_id}`)
      await auditarAtoDoPortal(tx, {
        tenantId,
        acessoId: d.acesso_id,
        contatoId: d.contato_id,
        entidade: 'portal_acesso',
        entidadeId: d.acesso_id,
        acao: `link_${d.finalidade}_consumido`,
        ip,
      })
      const portal = await this.sessoes.resolver(tx, tenantId, sessao.token)
      return { cookie: sessao.token, portal }
    })
  }
}
