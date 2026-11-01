import { type Conexao, novoId, sql } from '@leadtogo/db'
import {
  type CheckinPublico,
  type DefinicaoDeFormulario,
  type EnviarRespostaEntrada,
  type EventoDoPortal,
  type FazerCheckinEntrada,
  type FormularioParaResponder,
  type ResultadoDoCheckin,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { EmailService } from '../email/email.service.js'
import { emailPortalCodigo } from '../email/modelos.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'
import {
  hashDoCodigoDeEntrada,
  novoCodigoDeEntrada,
  VALIDADE_DO_CODIGO_MIN,
} from './portal-entrada.service.js'
import { PortalEventosService } from './portal-eventos.service.js'
import { hashDoTokenDoPortal } from './portal-token.js'
import { dadosDaPessoa } from './pessoa-do-formulario.js'
import { ResponderFormularioService } from './responder-formulario.service.js'

const ERROS: Record<string, ErroApi> = {
  evento_nao_encontrado: new ErroApi('evento_nao_encontrado', 'Evento não encontrado.', 404),
  evento_cancelado: new ErroApi('evento_cancelado', 'Este evento foi cancelado.', 409),
  evento_encerrado: new ErroApi('evento_encerrado', 'As inscrições deste evento terminaram.', 409),
  prazo_encerrado: new ErroApi('prazo_encerrado', 'O prazo para se inscrever terminou.', 409),
  evento_so_associados: new ErroApi(
    'evento_so_associados',
    'Este evento é só para associados: entre no portal para se inscrever.',
    403,
  ),
  sem_presenca: new ErroApi('sem_presenca', 'Só quem esteve no evento avalia.', 409),
  ja_avaliado: new ErroApi('ja_avaliado', 'Você já avaliou este evento.', 409),
  sem_inscricao: new ErroApi(
    'sem_inscricao',
    'Não achamos sua inscrição confirmada neste evento. Fale com a equipe na recepção.',
    404,
  ),
}
function traduzir(e: unknown): never {
  for (let atual: unknown = e; atual; atual = (atual as { cause?: unknown }).cause) {
    const conhecido = ERROS[(atual as { message?: string }).message ?? '']
    if (conhecido) throw conhecido
  }
  throw e
}

/** Minutos de tolerância do check-in depois do fim do evento. */
const TOLERANCIA_DEPOIS_DO_FIM_MIN = 60

/**
 * Inscrição pelo formulário do evento (F-1), avaliação (B-15) e check-in pelo QR (B-18), pelo cliente logado e
 * pelas páginas sem login (QR e link pessoal da avaliação). Vagas e lista de espera continuam nas funções do banco.
 */
@Injectable()
export class EventosInscricaoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly formularios: ResponderFormularioService,
    private readonly eventos: PortalEventosService,
    private readonly email: EmailService,
  ) {}

  // ------------------------------------------------------------------------------------ logado

  /** Inscreve com o formulário do evento (preenchido com o cadastro para conferência). */
  async inscrever(eventoId: string, d: EnviarRespostaEntrada): Promise<EventoDoPortal> {
    const ev = await this.eventos.obter(eventoId)
    if (!ev.formularioInscricaoId) {
      throw new ErroApi('sem_formulario', 'Este evento não tem formulário: confirme direto.', 409)
    }
    if (!ev.podeConfirmar) {
      throw (
        ERROS[ev.motivoDoBloqueio ?? 'evento_encerrado'] ??
        new ErroApi('evento_encerrado', 'As inscrições deste evento estão encerradas.', 409)
      )
    }
    const r = await this.formularios.responderComoCliente(ev.formularioInscricaoId, d, {
      tipo: 'evento',
      id: eventoId,
    })
    const db = this.ctx.db()
    const [def] = await db.execute<{ definicao: DefinicaoDeFormulario }>(sql`
      SELECT v.definicao FROM formulario_respostas fr
      JOIN formulario_versoes v ON v.formulario_id = fr.formulario_id AND v.versao = fr.versao
      WHERE fr.id = ${r.id}`)
    const pessoa = def ? dadosDaPessoa(def.definicao, r.valores) : null
    try {
      await db.execute(
        sql`SELECT app_evento_inscrever(${eventoId}, ${novoId()}, ${JSON.stringify({
          nome: pessoa?.nome ?? null,
          email: pessoa?.email ?? null,
          telefone: pessoa?.telefone ?? null,
          cnpj: pessoa?.cnpj ?? null,
          resposta_id: r.id,
        })}::jsonb)`,
      )
    } catch (e) {
      traduzir(e)
    }
    const p = this.ctx.portal
    await auditarAtoDoPortal(db, {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'evento',
      entidadeId: eventoId,
      acao: 'inscrever_com_formulario',
      alteracoes: { respostaId: r.id },
      ip: this.ctx.ip,
    })
    return this.eventos.obter(eventoId)
  }

  async formularioDeAvaliacao(eventoId: string): Promise<FormularioParaResponder> {
    const ev = await this.eventos.obter(eventoId)
    if (!ev.avaliar) throw ERROS['sem_presenca'] as ErroApi
    return this.formularios.paraOCliente(ev.avaliar.formularioId)
  }

  /** A avaliação do evento (só presente, depois do encerramento, uma vez). */
  async avaliar(eventoId: string, d: EnviarRespostaEntrada): Promise<EventoDoPortal> {
    const ev = await this.eventos.obter(eventoId)
    if (!ev.avaliar) throw ERROS['sem_presenca'] as ErroApi
    const r = await this.formularios.responderComoCliente(ev.avaliar.formularioId, d, {
      tipo: 'evento',
      id: eventoId,
    })
    try {
      await this.ctx.db().execute(sql`SELECT app_evento_registrar_avaliacao(${eventoId}, ${r.id})`)
    } catch (e) {
      traduzir(e)
    }
    return this.eventos.obter(eventoId)
  }

  // ------------------------------------------------------------------------------------ sem login

  private async noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  private async eventoDoQr(token: string): Promise<{ tenantId: string; eventoId: string }> {
    const [r] = await this.banco.db.execute<{ tenant_id: string; evento_id: string }>(
      sql`SELECT tenant_id, evento_id FROM app_evento_por_checkin(${hashDoTokenDoPortal(token)})`,
    )
    if (!r)
      throw new ErroApi('checkin_invalido', 'Este QR não vale mais. Peça o atual na recepção.', 404)
    return { tenantId: r.tenant_id, eventoId: r.evento_id }
  }

  private async dadosDoCheckin(tx: Transacao, eventoId: string) {
    const [e] = await tx.execute<{
      titulo: string
      inicio_em: string | Date
      fim_em: string | Date
      local: string | null
      exige: boolean
      abre: number
    }>(sql`
      SELECT titulo, inicio_em, fim_em, local, checkin_exige_codigo AS exige, checkin_abre_minutos AS abre
      FROM eventos WHERE id = ${eventoId}`)
    if (!e) throw new ErroApi('checkin_invalido', 'Este QR não vale mais.', 404)
    const agora = Date.now()
    const aberto =
      agora >= new Date(e.inicio_em).getTime() - e.abre * 60_000 &&
      agora <= new Date(e.fim_em).getTime() + TOLERANCIA_DEPOIS_DO_FIM_MIN * 60_000
    return { ...e, aberto }
  }

  async checkinPublico(token: string): Promise<CheckinPublico> {
    const { tenantId, eventoId } = await this.eventoDoQr(token)
    const e = await this.noTenant(tenantId, (tx) => this.dadosDoCheckin(tx, eventoId))
    return {
      titulo: e.titulo,
      inicioEm: new Date(e.inicio_em).toISOString(),
      local: e.local,
      exigeCodigo: e.exige,
      aberto: e.aberto,
    }
  }

  /** Check-in pelo QR, logado no portal: um toque. */
  async checkinLogado(token: string): Promise<ResultadoDoCheckin> {
    const p = this.ctx.portal
    const { tenantId, eventoId } = await this.eventoDoQr(token)
    if (tenantId !== p.tenantId)
      throw new ErroApi('checkin_invalido', 'Este QR é de outro portal.', 404)
    const e = await this.dadosDoCheckin(this.ctx.db(), eventoId)
    if (!e.aberto)
      throw new ErroApi('checkin_fechado', 'O check-in deste evento não está aberto agora.', 409)
    let nome = ''
    try {
      const [r] = await this.ctx
        .db()
        .execute<{ nome: string }>(sql`SELECT app_evento_checkin_portal(${eventoId}) AS nome`)
      nome = r?.nome ?? ''
    } catch (erro) {
      traduzir(erro)
    }
    return { situacao: 'registrado', nome: nome || p.nome }
  }

  /**
   * Check-in pelo QR sem login: a pessoa informa o e-mail da inscrição. Se o evento exige código, o primeiro passo
   * manda o código de 6 dígitos ao e-mail e o segundo confere (o mesmo código da entrada no portal).
   */
  async fazerCheckin(token: string, d: FazerCheckinEntrada): Promise<ResultadoDoCheckin> {
    if (!d.email) throw new ErroApi('sem_email', 'Informe o e-mail da sua inscrição.', 400)
    const email = d.email.toLowerCase()
    const { tenantId, eventoId } = await this.eventoDoQr(token)
    // O código errado conta a tentativa: o erro sai depois do COMMIT, para o incremento valer
    const r = await this.noTenant(
      tenantId,
      async (tx): Promise<ResultadoDoCheckin | 'codigo_invalido'> => {
        const e = await this.dadosDoCheckin(tx, eventoId)
        if (!e.aberto) {
          throw new ErroApi(
            'checkin_fechado',
            'O check-in deste evento não está aberto agora.',
            409,
          )
        }
        const [c] = await tx.execute<{ id: string; nome: string | null }>(sql`
        SELECT c.id, coalesce(c.nome, ct.nome) AS nome FROM evento_confirmacoes c
        LEFT JOIN portal_acessos pa ON pa.id = c.acesso_id
        LEFT JOIN contatos ct ON ct.id = coalesce(c.contato_id, pa.contato_id)
        WHERE c.evento_id = ${eventoId} AND c.situacao = 'confirmado'
          AND (c.email = ${email} OR pa.email = ${email})
        LIMIT 1`)
        if (!c) throw ERROS['sem_inscricao'] as ErroApi
        if (e.exige) {
          if (!d.codigo) {
            const codigo = novoCodigoDeEntrada()
            await tx.execute(sql`
            UPDATE portal_codigos SET usado_em = now(), atualizado_em = now()
            WHERE email = ${email} AND usado_em IS NULL`)
            await tx.execute(sql`
            INSERT INTO portal_codigos (id, tenant_id, email, codigo_hash, expira_em)
            VALUES (${novoId()}, ${tenantId}, ${email}, ${hashDoCodigoDeEntrada(email, codigo)},
                    now() + ${`${VALIDADE_DO_CODIGO_MIN} minutes`}::interval)`)
            await this.email.enfileirar(
              email,
              emailPortalCodigo({ nome: c.nome ?? 'participante', portal: e.titulo, codigo }),
            )
            return { situacao: 'codigo_enviado' as const, nome: null }
          }
          const [gasto] = await tx.execute(sql`
          UPDATE portal_codigos SET usado_em = now(), atualizado_em = now()
          WHERE id = (SELECT id FROM portal_codigos WHERE email = ${email} AND usado_em IS NULL
                        AND expira_em > now() AND tentativas < 5
                        AND codigo_hash = ${hashDoCodigoDeEntrada(email, d.codigo)}
                      ORDER BY criado_em DESC LIMIT 1)
          RETURNING id`)
          if (!gasto) {
            await tx.execute(sql`
            UPDATE portal_codigos SET tentativas = tentativas + 1
            WHERE email = ${email} AND usado_em IS NULL AND expira_em > now() AND tentativas < 5`)
            return 'codigo_invalido'
          }
        }
        await tx.execute(sql`
        UPDATE evento_confirmacoes SET
          presenca = CASE WHEN presenca = 'nao_registrada' THEN 'checkin_qr'::presenca_evento ELSE presenca END,
          presenca_em = coalesce(presenca_em, now()), atualizado_em = now()
        WHERE id = ${c.id}`)
        return { situacao: 'registrado' as const, nome: c.nome }
      },
    )
    if (r === 'codigo_invalido') {
      throw new ErroApi(
        'codigo_invalido',
        'Código incorreto ou vencido. Confira e tente de novo.',
        401,
      )
    }
    return r
  }

  // ---------------------------------------------------------------- avaliação pelo link pessoal

  private async participacaoDoLink(token: string) {
    const [r] = await this.banco.db.execute<{
      tenant_id: string
      participacao_id: string
      evento_id: string
    }>(
      sql`SELECT tenant_id, participacao_id, evento_id FROM app_participacao_por_avaliacao(${hashDoTokenDoPortal(token)})`,
    )
    if (!r) throw new ErroApi('link_invalido', 'Este link não vale mais.', 404)
    return r
  }

  async avaliacaoPorLink(token: string): Promise<FormularioParaResponder & { evento: string }> {
    const r = await this.participacaoDoLink(token)
    return this.noTenant(r.tenant_id, async (tx) => {
      const [e] = await tx.execute<{
        titulo: string
        formulario: string | null
        avaliou: boolean
      }>(sql`
        SELECT e.titulo, e.formulario_avaliacao_id AS formulario, c.avaliacao_resposta_id IS NOT NULL AS avaliou
        FROM eventos e JOIN evento_confirmacoes c ON c.evento_id = e.id WHERE c.id = ${r.participacao_id}`)
      if (!e?.formulario) throw new ErroApi('link_invalido', 'Este evento não tem avaliação.', 404)
      if (e.avaliou) throw ERROS['ja_avaliado'] as ErroApi
      return { ...(await this.formularios.paraConvite(tx, e.formulario)), evento: e.titulo }
    })
  }

  async avaliarPorLink(
    token: string,
    d: EnviarRespostaEntrada,
    ip: string | undefined,
  ): Promise<{ id: string; mensagem: string }> {
    const r = await this.participacaoDoLink(token)
    return this.noTenant(r.tenant_id, async (tx) => {
      const [e] = await tx.execute<{ formulario: string | null; avaliou: boolean }>(sql`
        SELECT e.formulario_avaliacao_id AS formulario, c.avaliacao_resposta_id IS NOT NULL AS avaliou
        FROM eventos e JOIN evento_confirmacoes c ON c.evento_id = e.id WHERE c.id = ${r.participacao_id}
        FOR UPDATE OF c`)
      if (!e?.formulario) throw new ErroApi('link_invalido', 'Este evento não tem avaliação.', 404)
      if (e.avaliou) throw ERROS['ja_avaliado'] as ErroApi
      const resposta = await this.formularios.responderPorConvite(
        tx,
        r.tenant_id,
        e.formulario,
        d,
        { tipo: 'evento', id: r.evento_id },
        ip,
      )
      await tx.execute(sql`
        UPDATE evento_confirmacoes SET avaliacao_resposta_id = ${resposta.id}, atualizado_em = now()
        WHERE id = ${r.participacao_id}`)
      return { id: resposta.id, mensagem: resposta.mensagem }
    })
  }
}
