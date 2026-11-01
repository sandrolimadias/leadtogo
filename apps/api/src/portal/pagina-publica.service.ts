import { type Conexao, novoId, sql } from '@leadtogo/db'
import {
  DEFINICAO_DA_INSCRICAO_PADRAO,
  type DisponibilidadeDoEvento,
  type EnviarRespostaEntrada,
  type EventoPublico,
  type FormularioParaResponder,
  type InscricaoPublicaFeita,
  normalizarCnpj,
  type PaginaPublica,
  SLUG_DO_PORTAL,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'
import { agendarAssociacaoNoCrm } from './associacao-crm.js'
import { agendarVinculoNoCrm } from './evento-crm.js'
import { traduzirErroDaAgenda } from './eventos-participacao.service.js'
import { dadosDaPessoa } from './pessoa-do-formulario.js'
import { ResponderFormularioService } from './responder-formulario.service.js'

const paginaNaoEncontrada = () =>
  new ErroApi('pagina_nao_encontrada', 'Esta página não existe ou foi desligada.', 404)
const eventoNaoEncontrado = () =>
  new ErroApi('evento_nao_encontrado', 'Evento não encontrado.', 404)

/** "Poucas vagas" a partir de 80% ocupado ou com 5 vagas ou menos. */
export function disponibilidade(
  vagas: number | null,
  confirmados: number,
): DisponibilidadeDoEvento {
  if (vagas === null) return 'disponivel'
  const restantes = vagas - confirmados
  if (restantes <= 0) return 'lotado'
  return restantes <= 5 || confirmados / vagas >= 0.8 ? 'poucas_vagas' : 'disponivel'
}

type LinhaDoEvento = {
  id: string
  titulo: string
  descricao: string | null
  local: string | null
  link_online: string | null
  inicio_em: string | Date
  fim_em: string | Date
  prazo_confirmacao: string | Date | null
  publico: boolean
  vagas_totais: number | null
  total_confirmados: number
  formulario_inscricao_id: string | null
}

const iso = (d: string | Date) => new Date(d).toISOString()

/**
 * Página pública de eventos e "Seja um Associado" (Fase 4H, F-3 e F-4), sem login. Acha o tenant pelo endereço
 * público do portal (só com o portal e a página ligados) e trabalha na transação desse tenant. Só aparecem os
 * eventos publicados para TODOS os clientes (alcance por empresas ou tags nunca vai à página pública).
 */
@Injectable()
export class PaginaPublicaService {
  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly formularios: ResponderFormularioService,
  ) {}

  private async tenant(slug: string): Promise<string> {
    if (!SLUG_DO_PORTAL.test(slug)) throw paginaNaoEncontrada()
    const [r] = await this.banco.db.execute<{ tenant_id: string }>(
      sql`SELECT tenant_id FROM app_portal_publico(${slug})`,
    )
    if (!r) throw paginaNaoEncontrada()
    return r.tenant_id
  }

  private async noTenant<T>(slug: string, fn: (tx: Transacao, tenantId: string) => Promise<T>) {
    const tenantId = await this.tenant(slug)
    return this.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx, tenantId)
    })
  }

  private async eventos(tx: Transacao, id?: string): Promise<LinhaDoEvento[]> {
    return tx.execute<LinhaDoEvento>(sql`
      SELECT id, titulo, descricao, local, link_online, inicio_em, fim_em, prazo_confirmacao, publico, vagas_totais,
             total_confirmados, formulario_inscricao_id
      FROM eventos
      WHERE situacao = 'publicado' AND excluido_em IS NULL AND encerrado_em IS NULL AND alcance = 'todos'
        AND fim_em > now() ${id ? sql`AND id = ${id}` : sql``}
      ORDER BY inicio_em
      LIMIT 60`)
  }

  private paraPublico(e: LinhaDoEvento): EventoPublico {
    const agora = Date.now()
    const aberto =
      e.publico &&
      new Date(e.inicio_em).getTime() > agora &&
      (e.prazo_confirmacao === null || new Date(e.prazo_confirmacao).getTime() > agora)
    return {
      id: e.id,
      titulo: e.titulo,
      descricao: e.descricao,
      local: e.local,
      online: e.link_online !== null,
      inicioEm: iso(e.inicio_em),
      fimEm: iso(e.fim_em),
      prazoConfirmacao: e.prazo_confirmacao ? iso(e.prazo_confirmacao) : null,
      inscricaoAberta: aberto,
      disponibilidade: disponibilidade(e.vagas_totais, e.total_confirmados),
    }
  }

  async pagina(slug: string): Promise<PaginaPublica> {
    return this.noTenant(slug, async (tx) => {
      const [c] = await tx.execute<{
        nome: string | null
        empresa: string
        associacao: string | null
      }>(sql`
        SELECT c.portal_nome AS nome, coalesce(t.nome_fantasia, t.razao_social) AS empresa,
               c.portal_formulario_associacao_id AS associacao
        FROM tenant_configuracoes c JOIN tenants t ON t.id = c.tenant_id`)
      return {
        nome: c?.nome ?? c?.empresa ?? 'Portal do Cliente',
        logoUrl: null,
        associacao: Boolean(c?.associacao),
        eventos: (await this.eventos(tx)).map((e) => this.paraPublico(e)),
      }
    })
  }

  private async eventoAberto(tx: Transacao, id: string): Promise<LinhaDoEvento> {
    const [e] = await this.eventos(tx, id)
    if (!e) throw eventoNaoEncontrado()
    if (!e.publico) {
      throw new ErroApi(
        'evento_so_associados',
        'Este evento é exclusivo para associados: entre no portal para se inscrever.',
        403,
      )
    }
    return e
  }

  /** O formulário da inscrição (o do evento, ou nome, e-mail, telefone e CNPJ). */
  async formularioDeInscricao(slug: string, id: string): Promise<FormularioParaResponder> {
    return this.noTenant(slug, async (tx) => {
      const e = await this.eventoAberto(tx, id)
      if (e.formulario_inscricao_id)
        return this.formularios.paraPagina(tx, e.formulario_inscricao_id)
      return {
        id: e.id,
        nome: `Inscrição: ${e.titulo}`,
        versao: 1,
        definicao: DEFINICAO_DA_INSCRICAO_PADRAO,
        preenchidos: {},
        travados: [],
        captchaChave: this.formularios.chaveDoCaptcha(true),
      }
    })
  }

  /**
   * Inscrição sem login (Q-5: menor fricção): aceite de privacidade, captcha, campo isca e limite por IP. O mesmo
   * e-mail no mesmo evento não duplica (devolve a situação de antes). Com CNPJ e o vínculo ligado, vai ao CRM.
   */
  async inscrever(
    slug: string,
    id: string,
    d: EnviarRespostaEntrada,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<InscricaoPublicaFeita> {
    const mensagem = (s: 'confirmado' | 'lista_espera') =>
      s === 'lista_espera'
        ? 'O evento lotou: você entrou na lista de espera. Se abrir uma vaga, a equipe entra em contato.'
        : 'Inscrição confirmada. Até lá!'
    if (d.site) return { situacao: 'confirmado', mensagem: mensagem('confirmado') }
    const captcha = await this.noTenant(slug, async (tx) => {
      const e = await this.eventoAberto(tx, id)
      return e.formulario_inscricao_id
        ? this.formularios.captchaDoFormulario(tx, e.formulario_inscricao_id)
        : true
    })
    await this.formularios.exigirEnvioPublico(d, captcha, ip)
    return this.noTenant(slug, async (tx, tenantId) => {
      const e = await this.eventoAberto(tx, id)
      let respostaId: string | null = null
      let pessoa: ReturnType<typeof dadosDaPessoa>
      if (e.formulario_inscricao_id) {
        const r = await this.formularios.gravarRespostaPublica(
          tx,
          tenantId,
          e.formulario_inscricao_id,
          d,
          { tipo: 'evento', id },
          ip,
          agente,
        )
        respostaId = r.id
        pessoa = dadosDaPessoa(r.definicao, r.valores)
      } else {
        pessoa = dadosDaPessoa(
          DEFINICAO_DA_INSCRICAO_PADRAO,
          this.formularios.conferirDefinicao(DEFINICAO_DA_INSCRICAO_PADRAO, d),
        )
      }
      if (!pessoa.email) {
        throw new ErroApi('sem_email', 'O formulário de inscrição precisa de um e-mail.', 422)
      }
      const cnpj = pessoa.cnpj ? normalizarCnpj(pessoa.cnpj) : null
      let situacao = 'confirmado'
      try {
        const [r] = await tx.execute<{ situacao: string }>(sql`
          SELECT app_evento_inscrever(${id}, ${novoId()}, ${JSON.stringify({
            origem: 'publico',
            nome: pessoa.nome,
            email: pessoa.email,
            telefone: pessoa.telefone,
            cnpj,
            resposta_id: respostaId,
          })}::jsonb) AS situacao`)
        situacao = r?.situacao ?? 'confirmado'
      } catch (erro) {
        traduzirErroDaAgenda(erro)
      }
      if (cnpj) {
        const [p] = await tx.execute<{ id: string; tratado: boolean }>(sql`
          SELECT id, crm_tratado_em IS NOT NULL AS tratado FROM evento_confirmacoes
          WHERE evento_id = ${id} AND email = ${pessoa.email.toLowerCase()} AND situacao <> 'cancelado'`)
        if (p && !p.tratado) await agendarVinculoNoCrm(tx, tenantId, p.id)
      }
      const final = situacao === 'lista_espera' ? 'lista_espera' : 'confirmado'
      return { situacao: final, mensagem: mensagem(final) }
    })
  }

  private async idDaAssociacao(tx: Transacao): Promise<string> {
    const [c] = await tx.execute<{ id: string | null }>(sql`
      SELECT portal_formulario_associacao_id AS id FROM tenant_configuracoes`)
    if (!c?.id)
      throw new ErroApi('sem_associacao', 'Este portal não recebe pedidos de associação.', 404)
    return c.id
  }

  async formularioDeAssociacao(slug: string): Promise<FormularioParaResponder> {
    return this.noTenant(slug, async (tx) =>
      this.formularios.paraPagina(tx, await this.idDaAssociacao(tx)),
    )
  }

  /** "Seja um Associado": a resposta fica em Formulários → Respostas; com CNPJ e o vínculo ligado, vira Lead. */
  async associar(
    slug: string,
    d: EnviarRespostaEntrada,
    ip: string | undefined,
    agente: string | undefined,
  ): Promise<{ id: string | null; mensagem: string }> {
    const { formularioId, captcha, sucesso } = await this.noTenant(slug, async (tx) => {
      const id = await this.idDaAssociacao(tx)
      const f = await this.formularios.paraPagina(tx, id)
      return {
        formularioId: id,
        captcha: await this.formularios.captchaDoFormulario(tx, id),
        sucesso: f.definicao.mensagemDeSucesso,
      }
    })
    if (d.site) return { id: null, mensagem: sucesso }
    await this.formularios.exigirEnvioPublico(d, captcha, ip)
    return this.noTenant(slug, async (tx, tenantId) => {
      const r = await this.formularios.gravarRespostaPublica(
        tx,
        tenantId,
        formularioId,
        d,
        null,
        ip,
        agente,
      )
      if (dadosDaPessoa(r.definicao, r.valores).cnpj) {
        await agendarAssociacaoNoCrm(tx, tenantId, r.id)
      }
      return { id: r.id, mensagem: r.mensagem }
    })
  }
}
