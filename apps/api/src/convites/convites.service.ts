import { randomBytes } from 'node:crypto'

import type { Conexao } from '@leadtogo/db'
import { novoId, sql } from '@leadtogo/db'
import type {
  ConviteAceito,
  ConviteConsulta,
  ConviteCriado,
  ConviteResumo,
  CriarConviteEntrada,
  MembroDaEquipe,
  PapelMembro,
} from '@leadtogo/shared'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Request } from 'express'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { AuthService } from '../auth/auth.service.js'
import { EmailService } from '../email/email.service.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'

/** Validade do convite. */
const DIAS_DE_VALIDADE = 7

import { hashDoToken } from './token.js'
export { hashDoToken }

type Transacao = Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]
type LinhaConvite = {
  id: string
  email: string
  papel: PapelMembro
  // SQL cru do Drizzle devolve timestamptz como texto ISO (ou Date, conforme o driver): sempre via `emData`
  expira_em: string | Date
  criado_em: string | Date
  aceito_em: string | Date | null
  revogado_em: string | Date | null
  convidado_por: string
}

const emData = (valor: string | Date): Date => new Date(valor)

const convidadoNaoEncontrado = () =>
  new ErroApi('convite_invalido', 'Convite inválido ou expirado.', 404)

@Injectable()
export class ConvitesService {
  private readonly log = new Logger(ConvitesService.name)

  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  // ---------------------------------------------------------------- administrador (empresa ativa)

  /** Só administradores da empresa convidam, listam e cancelam convites. */
  private exigirAdministrador(): void {
    if (this.ctx.membro.papel !== 'admin') {
      throw new ErroApi(
        'acesso_negado',
        'Só administradores da empresa podem gerenciar convites.',
        403,
      )
    }
  }

  async criar(dados: CriarConviteEntrada): Promise<ConviteCriado> {
    this.exigirAdministrador()
    const db = this.ctx.db()

    const jaMembro = await db.execute(sql`
      SELECT 1 FROM membros m
      WHERE m.excluido_em IS NULL
        AND (m.email = ${dados.email}
             OR m.usuario_id IN (SELECT u.id FROM auth."user" u WHERE u.email = ${dados.email}))
      LIMIT 1`)
    if (jaMembro.length > 0)
      throw new ErroApi('ja_e_membro', 'Este e-mail já faz parte da equipe.', 409)

    // Reenviar = cancelar o pendente anterior (o token dele deixa de valer) e criar outro
    await db.execute(sql`
      UPDATE convites SET revogado_em = now(), atualizado_em = now()
      WHERE email = ${dados.email} AND aceito_em IS NULL AND revogado_em IS NULL`)

    // O token só nasce quando o worker envia o e-mail (e só o hash é gravado, então); até lá o hash é
    // de um valor aleatório que ninguém conhece, ou seja, o convite ainda não pode ser aceito.
    const id = novoId()
    const [linha] = await db.execute<LinhaConvite>(sql`
      INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${dados.email}, ${dados.papel},
              ${randomBytes(32).toString('hex')},
              now() + ${`${DIAS_DE_VALIDADE} days`}::interval, ${this.ctx.membro.id})
      RETURNING id, email, papel, expira_em, criado_em, aceito_em, revogado_em, convidado_por`)
    if (!linha) throw new Error('convite não foi gravado')

    // Pedido de envio no outbox, na mesma transação do convite: ou os dois existem, ou nenhum.
    // O payload leva só o id (o token não passa pelo outbox).
    await db.execute(sql`
      INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
      VALUES (${novoId()}, ${this.ctx.tenantId}, 'convite.enviar', ${id}, ${JSON.stringify({ conviteId: id })}::jsonb)`)
    await this.auditoria.registrar({
      entidade: 'convite',
      entidadeId: id,
      acao: 'convidar',
      alteracoes: { email: dados.email, papel: dados.papel },
    })
    const emailEnviado = this.email.configurado
    return { ...resumoDe(linha), emailEnviado }
  }

  async listar(): Promise<ConviteResumo[]> {
    this.exigirAdministrador()
    const linhas = await this.ctx.db().execute<LinhaConvite>(sql`
      SELECT id, email, papel, expira_em, criado_em, aceito_em, revogado_em, convidado_por
      FROM convites WHERE aceito_em IS NULL AND revogado_em IS NULL ORDER BY criado_em DESC`)
    return [...linhas].map(resumoDe)
  }

  /** Cancela um convite pendente DESTA empresa; o de outra empresa (ou inexistente) dá 404 igual. */
  async revogar(id: string): Promise<void> {
    this.exigirAdministrador()
    const feito = await this.ctx.db().execute<{ email: string; papel: PapelMembro }>(sql`
      UPDATE convites SET revogado_em = now(), atualizado_em = now()
      WHERE id = ${id} AND aceito_em IS NULL AND revogado_em IS NULL
      RETURNING email, papel`)
    const [cancelado] = feito
    if (!cancelado) throw new ErroApi('convite_nao_encontrado', 'Convite não encontrado.', 404)
    await this.auditoria.registrar({
      entidade: 'convite',
      entidadeId: id,
      acao: 'cancelar_convite',
      alteracoes: { email: cancelado.email, papel: cancelado.papel },
    })
  }

  /** Equipe da empresa ativa. O e-mail só aparece para administradores e gestores. */
  async equipe(incluirInativos: boolean): Promise<MembroDaEquipe[]> {
    const veEmail = this.ctx.membro.papel === 'admin' || this.ctx.membro.papel === 'gestor'
    const veAcesso = this.ctx.membro.papel === 'admin'
    const linhas = await this.ctx.db().execute<{
      id: string
      nome: string
      cargo: string | null
      email: string | null
      papel: PapelMembro
      ativo: boolean
      tem_login: boolean
      cor: string | null
      ultimo_acesso: string | null
    }>(sql`
      SELECT m.id, m.nome, m.cargo, m.email, m.papel, m.ativo, (m.usuario_id IS NOT NULL) AS tem_login, m.cor,
             (SELECT to_char(max(s.updated_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
              FROM auth.session s WHERE s.user_id = m.usuario_id) AS ultimo_acesso
      FROM membros m
      WHERE m.excluido_em IS NULL AND (${incluirInativos} OR m.ativo)
      ORDER BY lower(m.nome), m.id`)
    return [...linhas].map((m) => ({
      id: m.id,
      nome: m.nome,
      cargo: m.cargo,
      ...(veEmail ? { email: m.email } : {}),
      papel: m.papel,
      ativo: m.ativo,
      temLogin: m.tem_login,
      cor: m.cor,
      ...(veAcesso ? { ultimoAcesso: m.ultimo_acesso } : {}),
    }))
  }

  // -------------------------------------------------------------------- convidado (sem tenant ativo)

  /** Roda `fn` numa transação com o tenant do convite definido (o RLS vale como em qualquer requisição). */
  private noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  /** Acha o convite pelo token (função SECURITY DEFINER) e confere que ainda vale, já sob RLS. */
  private async convitePendente(
    token: string,
  ): Promise<{ tenantId: string; convite: LinhaConvite } | null> {
    const achados = await this.banco.cliente<{ id: string; tenant_id: string }[]>`
      SELECT id, tenant_id FROM app_convite_por_token(${hashDoToken(token)})`
    const achado = achados[0]
    if (!achado) return null
    const convite = await this.noTenant(achado.tenant_id, async (tx) => {
      const [c] = await tx.execute<LinhaConvite>(sql`
        SELECT id, email, papel, expira_em, criado_em, aceito_em, revogado_em, convidado_por
        FROM convites WHERE id = ${achado.id} AND aceito_em IS NULL AND revogado_em IS NULL AND expira_em > now()`)
      return c
    })
    return convite ? { tenantId: achado.tenant_id, convite } : null
  }

  /** O que o convidado vê antes de aceitar. Qualquer problema (não existe, expirou, já usado) dá o mesmo 404. */
  async consultar(token: string): Promise<ConviteConsulta> {
    const achado = await this.convitePendente(token)
    if (!achado) throw convidadoNaoEncontrado()
    const { tenantId, convite } = achado
    const empresa = await this.noTenant(tenantId, async (tx) => {
      const [t] = await tx.execute<{ razao_social: string; nome_fantasia: string | null }>(
        sql`SELECT razao_social, nome_fantasia FROM tenants`,
      )
      return t
    })
    const usuarios = await this.banco
      .cliente`SELECT 1 FROM auth."user" WHERE email = ${convite.email}`
    return {
      empresa: {
        razaoSocial: empresa?.razao_social ?? '',
        nomeFantasia: empresa?.nome_fantasia ?? null,
      },
      email: convite.email,
      papel: convite.papel,
      expiraEm: emData(convite.expira_em).toISOString(),
      contaExistente: usuarios.length > 0,
    }
  }

  /**
   * Aceita o convite. Sem conta com o e-mail: cria (nome e senha obrigatórios; o e-mail já vale como
   * confirmado, o convite chegou nele). Com conta: só vale com a sessão DESSA conta (login antes).
   * Cria o membro e marca o convite como aceito na mesma transação; se algo falhar depois de criar a
   * conta, ela é desfeita.
   */
  async aceitar(
    req: Request,
    dados: { token: string; nome?: string; senha?: string },
  ): Promise<ConviteAceito> {
    const achado = await this.convitePendente(dados.token)
    if (!achado) throw convidadoNaoEncontrado()
    const { tenantId, convite } = achado

    const [existente] = await this.banco.cliente<{ id: string; name: string }[]>`
      SELECT id, name FROM auth."user" WHERE email = ${convite.email}`
    let usuarioId: string
    let nome: string
    let contaCriada = false
    if (existente) {
      // Se o convite acabou de ser usado por outra requisição, o certo é "inválido", não "faça login"
      if (!(await this.convitePendente(dados.token))) throw convidadoNaoEncontrado()
      const sessao = await this.auth.obterSessao(req)
      if (!sessao) {
        throw new ErroApi(
          'login_necessario',
          'Já existe uma conta com este e-mail: entre nela para aceitar o convite.',
          401,
        )
      }
      if (sessao.user.id !== existente.id) {
        throw new ErroApi(
          'convite_de_outro_email',
          'Este convite é para outro e-mail. Entre com a conta convidada.',
          403,
        )
      }
      usuarioId = existente.id
      nome = existente.name
    } else {
      if (!dados.nome || !dados.senha) {
        throw new ErroApi(
          'cadastro_necessario',
          'Informe seu nome e uma senha para criar a conta e aceitar o convite.',
          400,
        )
      }
      const novo = await this.auth.criarUsuarioComSenha({
        nome: dados.nome,
        email: convite.email,
        senha: dados.senha,
        emailVerificado: true,
      })
      usuarioId = novo.id
      nome = dados.nome
      contaCriada = true
    }

    try {
      const membroId = novoId()
      await this.noTenant(tenantId, async (tx) => {
        // Trava o convite: dois aceites simultâneos não passam os dois
        const [vivo] = await tx.execute<{ id: string }>(sql`
          SELECT id FROM convites
          WHERE id = ${convite.id} AND aceito_em IS NULL AND revogado_em IS NULL AND expira_em > now()
          FOR UPDATE`)
        if (!vivo) throw convidadoNaoEncontrado()
        const jaMembro = await tx.execute(sql`
          SELECT 1 FROM membros WHERE usuario_id = ${usuarioId} AND excluido_em IS NULL`)
        if (jaMembro.length > 0)
          throw new ErroApi('ja_e_membro', 'Você já faz parte desta empresa.', 409)
        await tx.execute(sql`
          INSERT INTO membros (id, tenant_id, nome, usuario_id, email, papel, criado_por, atualizado_por)
          VALUES (${membroId}, ${tenantId}, ${nome}, ${usuarioId}, ${convite.email}, ${convite.papel},
                  ${convite.convidado_por}, ${convite.convidado_por})`)
        await tx.execute(
          sql`UPDATE convites SET aceito_em = now(), atualizado_em = now() WHERE id = ${convite.id}`,
        )
      })
      this.log.log(`convite aceito (tenant ${tenantId}, papel ${convite.papel})`)
      return { tenantId, membroId, usuarioId, contaCriada }
    } catch (erro) {
      if (contaCriada) {
        await this.banco.cliente`DELETE FROM auth."user" WHERE id = ${usuarioId}`.catch(
          (e: unknown) =>
            this.log.error(`não foi possível desfazer a conta do convite: ${String(e)}`),
        )
      }
      throw erro
    }
  }
}

function resumoDe(l: LinhaConvite): ConviteResumo {
  return {
    id: l.id,
    email: l.email,
    papel: l.papel,
    expiraEm: emData(l.expira_em).toISOString(),
    criadoEm: emData(l.criado_em).toISOString(),
    situacao: emData(l.expira_em).getTime() > Date.now() ? 'pendente' : 'expirado',
  }
}
