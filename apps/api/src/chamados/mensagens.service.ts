import { novoId, sql } from '@leadtogo/db'
import type {
  Chamado,
  CriarNotaInternaEntrada,
  EnviarMensagemEntrada,
  StatusDoChamado,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { AcessoDeChamados } from './acesso-chamados.js'
import { ChamadosService } from './chamados.service.js'

/**
 * Conversa do chamado (visível ao cliente) e notas internas (só da equipe), em tabelas separadas de propósito.
 * Quem responde: quem atende o chamado ou o solicitante. A primeira resposta da EQUIPE marca a métrica de
 * primeira resposta; responder em Pendente passa o chamado a Em atendimento (e a pessoa assume, se não
 * havia responsável); o solicitante que responde em Aguardando cliente devolve o chamado ao atendimento.
 */
@Injectable()
export class MensagensService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly acesso: AcessoDeChamados,
    private readonly chamados: ChamadosService,
  ) {}

  async enviar(
    id: string,
    dados: EnviarMensagemEntrada,
    opcoes: { notificar?: boolean } = {},
  ): Promise<Chamado> {
    const l = await this.chamados.linhaVisivel(id)
    if (l.status === 'fechado') {
      throw new ErroApi('chamado_fechado', 'O chamado está fechado.', 409)
    }
    if (l.status === 'resolvido') {
      throw new ErroApi(
        'chamado_resolvido',
        'O chamado está resolvido: reabra-o para responder.',
        409,
      )
    }
    const a = this.chamados.paraAcesso(l)
    if (!(await this.acesso.podeResponder(a))) {
      throw new ErroApi('acesso_negado', 'Você não pode responder neste chamado.', 403)
    }
    const equipe = await this.acesso.podeAtender(a)
    const db = this.ctx.db()
    const eu = this.ctx.membro.id
    const anexoIds = [...new Set(dados.anexoIds)]
    if (anexoIds.length > 0) {
      const [{ n } = { n: 0 }] = await db.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM chamado_anexos
        WHERE id = ANY (${`{${anexoIds.join(',')}}`}::uuid[]) AND chamado_id = ${id}
          AND mensagem_id IS NULL AND enviado_em IS NOT NULL AND enviado_por_membro_id = ${eu}
          AND excluido_em IS NULL`)
      if (n !== anexoIds.length) {
        throw new ErroApi(
          'anexo_invalido',
          'Há anexos que não foram enviados por você, já estão em outra mensagem ou não terminaram o envio.',
          400,
        )
      }
    }
    const mensagemId = novoId()
    await db.execute(sql`
      INSERT INTO chamado_mensagens (id, tenant_id, chamado_id, autor_tipo, autor_membro_id, corpo, criado_por, atualizado_por)
      VALUES (${mensagemId}, ${this.ctx.tenantId}, ${id}, 'membro', ${eu}, ${dados.corpo}, ${eu}, ${eu})`)
    if (anexoIds.length > 0) {
      await db.execute(sql`
        UPDATE chamado_anexos SET mensagem_id = ${mensagemId}, atualizado_em = now()
        WHERE id = ANY (${`{${anexoIds.join(',')}}`}::uuid[])`)
    }
    await this.chamados.registrarEvento(id, {
      tipo: 'mensagem',
      dados: { mensagemId, anexos: anexoIds.length, equipe },
    })
    for (const anexoId of anexoIds) {
      await this.chamados.registrarEvento(id, { tipo: 'anexo', dados: { anexoId, mensagemId } })
    }

    // Efeitos da resposta no chamado
    let status: StatusDoChamado = l.status
    let responsavelId = l.responsavel_id
    if (equipe && l.primeira_resposta_em === null) {
      await db.execute(sql`UPDATE chamados SET primeira_resposta_em = now() WHERE id = ${id}`)
      await this.chamados.registrarEvento(id, { tipo: 'primeira_resposta', dados: { mensagemId } })
    }
    if (equipe && l.status === 'pendente') {
      status = 'em_atendimento'
      const assume = l.responsavel_id === null
      if (assume) responsavelId = eu
      await this.chamados.registrarEvento(id, {
        tipo: assume ? 'assumido' : 'status_alterado',
        statusDe: 'pendente',
        statusPara: 'em_atendimento',
        responsavelDeId: assume ? null : undefined,
        responsavelParaId: assume ? eu : undefined,
        dados: { motivo: 'resposta' },
      })
    } else if (!equipe && l.status === 'aguardando_cliente') {
      status = 'em_atendimento'
      await this.chamados.registrarEvento(id, {
        tipo: 'status_alterado',
        statusDe: 'aguardando_cliente',
        statusPara: 'em_atendimento',
        dados: { motivo: 'resposta_do_solicitante' },
      })
    }
    await db.execute(sql`
      UPDATE chamados SET status = ${status}::status_chamado, responsavel_id = ${responsavelId},
        status_alterado_em = CASE WHEN ${status} <> ${l.status} THEN now() ELSE status_alterado_em END,
        atualizado_em = now(), atualizado_por = ${eu}
      WHERE id = ${id}`)
    if (opcoes.notificar !== false) await this.chamados.notificar(id, 'mensagem', { mensagemId })
    return this.chamados.obter(id, true)
  }

  /**
   * "Aguardar resposta do cliente": escreve ao cliente e passa o chamado a Aguardando cliente numa ação só (o
   * relógio do prazo pausa). O cliente recebe UM aviso, com a mensagem, e não dois. Só vale para chamado aberto
   * pelo portal (sem cliente no portal não há quem responder).
   */
  async aguardarCliente(id: string, dados: EnviarMensagemEntrada): Promise<Chamado> {
    const l = await this.chamados.linhaVisivel(id)
    if (l.origem !== 'portal') {
      throw new ErroApi(
        'chamado_sem_cliente',
        'Este chamado não foi aberto pelo portal: não há cliente para aguardar.',
        409,
      )
    }
    const depois = await this.enviar(id, dados, { notificar: false })
    const mensagemId = depois.mensagens.at(-1)?.id
    return this.chamados.alterarStatus(id, 'aguardando_cliente', mensagemId ? { mensagemId } : {})
  }

  async anotar(id: string, dados: CriarNotaInternaEntrada): Promise<Chamado> {
    const l = await this.chamados.linhaVisivel(id)
    if (!this.acesso.podeAnotar()) {
      throw new ErroApi('acesso_negado', 'Só quem atende os chamados faz notas internas.', 403)
    }
    const eu = this.ctx.membro.id
    const notaId = novoId()
    await this.ctx.db().execute(sql`
      INSERT INTO chamado_notas_internas (id, tenant_id, chamado_id, autor_membro_id, corpo, criado_por, atualizado_por)
      VALUES (${notaId}, ${this.ctx.tenantId}, ${l.id}, ${eu}, ${dados.corpo}, ${eu}, ${eu})`)
    await this.ctx.db().execute(sql`
      UPDATE chamados SET atualizado_em = now(), atualizado_por = ${eu} WHERE id = ${l.id}`)
    await this.chamados.registrarEvento(l.id, { tipo: 'nota_interna', dados: { notaId } })
    return this.chamados.obter(l.id, true)
  }
}
