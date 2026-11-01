import { novoId, sql } from '@leadtogo/db'
import {
  type DefinicaoDeFormulario,
  type EventoDaEmpresa,
  type IncluirParticipanteEntrada,
  MAXIMO_DE_LEMBRETES_DE_AVALIACAO,
  normalizarCnpj,
  type ResultadoDoPedidoDeAvaliacao,
  type Respostas,
  TIPOS_DE_APRESENTACAO,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'
import ExcelJS from 'exceljs'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { escopoDaCarteira, podeVer } from '../carteira/regras-de-carteira.js'
import { ErroApi } from '../http/erro-api.js'
import { agendarPedidoDeAvaliacao } from './avaliacao-evento.js'
import { agendarVinculoNoCrm } from './evento-crm.js'
import { novoTokenDoPortal } from './portal-token.js'

const naoEncontrado = () => new ErroApi('evento_nao_encontrado', 'Evento não encontrado.', 404)
const participanteNaoEncontrado = () =>
  new ErroApi('participante_nao_encontrado', 'Participante não encontrado.', 404)

/** Erro de negócio da função do banco (`RAISE EXCEPTION 'codigo'`) → erro da API. */
const ERROS: Record<string, ErroApi> = {
  evento_nao_encontrado: naoEncontrado(),
  evento_cancelado: new ErroApi('evento_cancelado', 'Este evento foi cancelado.', 409),
  evento_encerrado: new ErroApi('evento_encerrado', 'Este evento já foi encerrado.', 409),
  sem_email: new ErroApi('sem_email', 'Informe o e-mail do participante.', 400),
}
export function traduzirErroDaAgenda(e: unknown): never {
  for (let atual: unknown = e; atual; atual = (atual as { cause?: unknown }).cause) {
    const conhecido = ERROS[(atual as { message?: string }).message ?? '']
    if (conhecido) throw conhecido
  }
  throw e
}

type LinhaDoInscrito = {
  pessoa: string
  email: string
  telefone: string | null
  empresa: string | null
  cnpj: string | null
  origem: string
  situacao: string
  presenca: string
  avaliou: boolean
  inscrito_em: string | Date
  respostas: Respostas | null
}

const ROTULO_SITUACAO: Record<string, string> = {
  confirmado: 'Inscrito',
  lista_espera: 'Lista de espera',
  cancelado: 'Presença cancelada',
}
const ROTULO_PRESENCA: Record<string, string> = {
  nao_registrada: 'Não registrada',
  checkin_qr: 'Check-in (QR)',
  manual: 'Registrada pela equipe',
}

const textoDoValor = (v: unknown): string =>
  v === null || v === undefined
    ? ''
    : Array.isArray(v)
      ? v.join(', ')
      : typeof v === 'boolean'
        ? v
          ? 'Sim'
          : 'Não'
        : typeof v === 'string' || typeof v === 'number'
          ? String(v)
          : ''

/** Conteúdo que começa com =, +, - ou @ vira texto (nunca fórmula na planilha). */
const seguro = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

/**
 * Participação nos eventos pela EQUIPE (Fase 4G): presença manual (B-20), incluir quem veio sem inscrição, encerrar o
 * evento e pedir a avaliação aos presentes (B-15), reenviar a quem falta (B-16), o QR de check-in (B-18) e o
 * relatório de inscritos em CSV, Excel e PDF (B-13).
 */
@Injectable()
export class EventosParticipacaoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  private async evento(id: string) {
    const [e] = await this.ctx.db().execute<{
      id: string
      titulo: string
      situacao: string
      inicio_em: string | Date
      fim_em: string | Date
      encerrado_em: string | Date | null
      formulario_avaliacao_id: string | null
      formulario_inscricao_id: string | null
    }>(sql`
      SELECT id, titulo, situacao::text AS situacao, inicio_em, fim_em, encerrado_em, formulario_avaliacao_id,
             formulario_inscricao_id
      FROM eventos WHERE id = ${id} AND excluido_em IS NULL`)
    if (!e) throw naoEncontrado()
    return e
  }

  /** Marca ou desfaz a presença de quem participou sem fazer o check-in. */
  async registrarPresenca(
    eventoId: string,
    participacaoId: string,
    presente: boolean,
  ): Promise<void> {
    await this.evento(eventoId)
    const r = await this.ctx.db().execute(sql`
      UPDATE evento_confirmacoes SET
        presenca = ${presente ? 'manual' : 'nao_registrada'}::presenca_evento,
        presenca_em = ${presente ? sql`coalesce(presenca_em, now())` : null},
        presenca_por = ${presente ? this.ctx.membro.id : null}, atualizado_em = now()
      WHERE id = ${participacaoId} AND evento_id = ${eventoId} AND situacao <> 'cancelado'
      RETURNING id`)
    if (r.length === 0) throw participanteNaoEncontrado()
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: eventoId,
      acao: presente ? 'registrar_presenca' : 'desfazer_presenca',
      alteracoes: { participacaoId },
    })
  }

  /** Inclui quem veio sem se inscrever, já com a presença registrada (com CNPJ, vai ao CRM como as inscrições). */
  async incluir(eventoId: string, d: IncluirParticipanteEntrada): Promise<string> {
    const e = await this.evento(eventoId)
    if (e.situacao !== 'publicado') {
      throw new ErroApi('evento_nao_publicado', 'Só se registra presença em evento publicado.', 409)
    }
    const cnpj = d.cnpj ? normalizarCnpj(d.cnpj) : null
    const db = this.ctx.db()
    const [empresa] = cnpj
      ? await db.execute<{ id: string }>(sql`
          SELECT id FROM empresas WHERE documento = ${cnpj} AND excluido_em IS NULL LIMIT 1`)
      : []
    const id = novoId()
    try {
      await db.execute(
        sql`SELECT app_evento_inscrever(${eventoId}, ${id}, ${JSON.stringify({
          origem: 'equipe',
          nome: d.nome,
          email: d.email,
          telefone: d.telefone ?? null,
          cnpj,
          empresa_id: empresa?.id ?? null,
        })}::jsonb)`,
      )
    } catch (erro) {
      traduzirErroDaAgenda(erro)
    }
    const [p] = await db.execute<{ id: string }>(sql`
      SELECT id FROM evento_confirmacoes WHERE evento_id = ${eventoId} AND email = ${d.email} AND situacao <> 'cancelado'`)
    const participacaoId = p?.id ?? id
    await db.execute(sql`
      UPDATE evento_confirmacoes SET presenca = 'manual', presenca_em = coalesce(presenca_em, now()),
        presenca_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${participacaoId}`)
    if (cnpj) await agendarVinculoNoCrm(db, this.ctx.tenantId, participacaoId)
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: eventoId,
      acao: 'incluir_participante',
      alteracoes: { participacaoId, email: d.email },
    })
    return participacaoId
  }

  /**
   * Encerra o evento: quem não tem presença fica como ausente, e os presentes recebem o pedido de avaliação (push e
   * sino no portal; e-mail com link pessoal para quem não tem acesso, se ligado).
   */
  async encerrar(eventoId: string): Promise<ResultadoDoPedidoDeAvaliacao> {
    const db = this.ctx.db()
    const [e] = await db.execute<{
      situacao: string
      inicio_em: string | Date
      encerrado_em: string | Date | null
    }>(sql`
      SELECT situacao::text AS situacao, inicio_em, encerrado_em FROM eventos
      WHERE id = ${eventoId} AND excluido_em IS NULL FOR UPDATE`)
    if (!e) throw naoEncontrado()
    if (e.situacao !== 'publicado') {
      throw new ErroApi('evento_nao_publicado', 'Só se encerra um evento publicado.', 409)
    }
    if (e.encerrado_em)
      throw new ErroApi('evento_ja_encerrado', 'Este evento já foi encerrado.', 409)
    if (new Date(e.inicio_em).getTime() > Date.now()) {
      throw new ErroApi('evento_nao_comecou', 'O evento ainda não começou.', 409)
    }
    await db.execute(sql`
      UPDATE eventos SET encerrado_em = now(), encerrado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${eventoId}`)
    const r = await this.pedirAvaliacao(eventoId, null)
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: eventoId,
      acao: 'encerrar',
      alteracoes: { ...r },
    })
    return r
  }

  /** Reenvia o pedido de avaliação a quem ainda não avaliou (ou às pessoas escolhidas). No máximo 3 por pessoa. */
  async reenviarAvaliacao(
    eventoId: string,
    ids: string[] | undefined,
  ): Promise<ResultadoDoPedidoDeAvaliacao> {
    const e = await this.evento(eventoId)
    if (!e.encerrado_em) {
      throw new ErroApi('evento_nao_encerrado', 'Encerre o evento para pedir a avaliação.', 409)
    }
    const r = await this.pedirAvaliacao(eventoId, ids ?? null)
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: eventoId,
      acao: 'reenviar_avaliacao',
      alteracoes: { ...r },
    })
    return r
  }

  private async pedirAvaliacao(
    eventoId: string,
    ids: string[] | null,
  ): Promise<ResultadoDoPedidoDeAvaliacao> {
    const db = this.ctx.db()
    const [cfg] = await db.execute<{ formulario: string | null; por_email: boolean }>(sql`
      SELECT e.formulario_avaliacao_id AS formulario, tc.portal_avaliacao_por_email AS por_email
      FROM eventos e JOIN tenant_configuracoes tc ON tc.tenant_id = e.tenant_id WHERE e.id = ${eventoId}`)
    if (!cfg?.formulario) return { porPush: 0, porEmail: 0, ignorados: 0 }
    const alvos = await db.execute<{ id: string; tem_acesso: boolean; pode: boolean }>(sql`
      SELECT c.id, (pa.id IS NOT NULL AND pa.situacao = 'ativo') AS tem_acesso,
             (c.avaliacao_lembretes < ${MAXIMO_DE_LEMBRETES_DE_AVALIACAO}) AS pode
      FROM evento_confirmacoes c LEFT JOIN portal_acessos pa ON pa.id = c.acesso_id
      WHERE c.evento_id = ${eventoId} AND c.situacao <> 'cancelado' AND c.presenca <> 'nao_registrada'
        AND c.avaliacao_resposta_id IS NULL
        ${ids ? sql`AND c.id = ANY (${`{${ids.join(',')}}`}::uuid[])` : sql``}`)
    const enviar = alvos.filter((a) => a.pode && (a.tem_acesso || cfg.por_email))
    if (enviar.length > 0) {
      await agendarPedidoDeAvaliacao(
        db,
        this.ctx.tenantId,
        eventoId,
        enviar.map((a) => a.id),
      )
    }
    return {
      porPush: enviar.filter((a) => a.tem_acesso).length,
      porEmail: enviar.filter((a) => !a.tem_acesso).length,
      ignorados: alvos.length - enviar.length,
    }
  }

  /** Gera (ou troca) o QR de check-in: o endereço só aparece agora; no banco, só o hash. */
  async gerarCheckin(eventoId: string): Promise<{ url: string; token: string }> {
    const e = await this.evento(eventoId)
    if (e.situacao !== 'publicado') {
      throw new ErroApi('evento_nao_publicado', 'Publique o evento para gerar o check-in.', 409)
    }
    if (!this.config.PORTAL_URL) {
      throw new ErroApi('portal_indisponivel', 'O endereço do portal não está configurado.', 503)
    }
    const { token, hash } = novoTokenDoPortal(this.ctx.tenantId)
    await this.ctx.db().execute(sql`
      UPDATE eventos SET checkin_token_hash = ${hash}, atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${eventoId}`)
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: eventoId,
      acao: 'gerar_checkin',
    })
    return { url: `${new URL(this.config.PORTAL_URL).origin}/checkin/${token}`, token }
  }

  // ------------------------------------------------------------------------------------ relatórios

  private async inscritos(eventoId: string) {
    const e = await this.evento(eventoId)
    const db = this.ctx.db()
    const linhas = await db.execute<LinhaDoInscrito>(sql`
      SELECT coalesce(c.nome, ct.nome, '') AS pessoa, coalesce(c.email::text, pa.email::text, '') AS email,
             c.telefone, coalesce(em.nome_fantasia, em.razao_social) AS empresa, coalesce(c.cnpj, em.documento) AS cnpj,
             c.origem::text AS origem, c.situacao::text AS situacao, c.presenca::text AS presenca,
             c.avaliacao_resposta_id IS NOT NULL AS avaliou, c.entrou_na_fila_em AS inscrito_em, r.respostas
      FROM evento_confirmacoes c
      LEFT JOIN portal_acessos pa ON pa.id = c.acesso_id
      LEFT JOIN contatos ct ON ct.id = coalesce(c.contato_id, pa.contato_id)
      LEFT JOIN empresas em ON em.id = c.empresa_id
      LEFT JOIN formulario_respostas r ON r.id = c.resposta_id
      WHERE c.evento_id = ${eventoId}
      ORDER BY lower(coalesce(c.nome, ct.nome, '')), c.entrou_na_fila_em`)
    let campos: { id: string; rotulo: string }[] = []
    if (e.formulario_inscricao_id) {
      const [v] = await db.execute<{ definicao: DefinicaoDeFormulario }>(sql`
        SELECT v.definicao FROM formularios f
        JOIN formulario_versoes v ON v.formulario_id = f.id AND v.versao = f.versao_publicada
        WHERE f.id = ${e.formulario_inscricao_id}`)
      campos = (v?.definicao.campos ?? [])
        .filter((c) => !TIPOS_DE_APRESENTACAO.includes(c.tipo))
        .map((c) => ({ id: c.id, rotulo: c.rotulo }))
    }
    const cabecalho = [
      'Nome',
      'E-mail',
      'Telefone',
      'Empresa',
      'CNPJ',
      'Situação',
      'Presença',
      'Avaliou',
      'Inscrito em',
      ...campos.map((c) => c.rotulo),
    ]
    const dados = linhas.map((l) => [
      l.pessoa,
      l.email,
      l.telefone ?? '',
      l.empresa ?? '',
      l.cnpj ?? '',
      ROTULO_SITUACAO[l.situacao] ?? l.situacao,
      ROTULO_PRESENCA[l.presenca] ?? l.presenca,
      l.avaliou ? 'Sim' : 'Não',
      new Date(l.inscrito_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      ...campos.map((c) => textoDoValor(l.respostas?.[c.id])),
    ])
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: eventoId,
      acao: 'exportar_inscritos',
      alteracoes: { linhas: linhas.length },
    })
    return { evento: e, cabecalho, dados }
  }

  async exportarCsv(eventoId: string): Promise<{ nome: string; conteudo: string }> {
    const { cabecalho, dados } = await this.inscritos(eventoId)
    const linha = (v: string[]) =>
      v
        .map(seguro)
        .map((x) => (/[";\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x))
        .join(';')
    return {
      nome: `inscritos-${eventoId}.csv`,
      conteudo: `\uFEFF${[linha(cabecalho), ...dados.map(linha)].join('\r\n')}\r\n`,
    }
  }

  async exportarXlsx(eventoId: string): Promise<{ nome: string; conteudo: Buffer }> {
    const { evento, cabecalho, dados } = await this.inscritos(eventoId)
    const livro = new ExcelJS.Workbook()
    const planilha = livro.addWorksheet('Inscritos')
    planilha.addRow([evento.titulo])
    planilha.getRow(1).font = { bold: true, size: 14 }
    planilha.addRow([])
    planilha.addRow(cabecalho)
    planilha.getRow(3).font = { bold: true }
    for (const l of dados) planilha.addRow(l.map(seguro))
    planilha.columns.forEach((c) => {
      c.width = 22
    })
    planilha.views = [{ state: 'frozen', ySplit: 3 }]
    const conteudo = Buffer.from(await livro.xlsx.writeBuffer())
    return { nome: `inscritos-${eventoId}.xlsx`, conteudo }
  }

  /** Lista de inscritos pronta para imprimir ou salvar como PDF (A4 paisagem). */
  async exportarImpressao(eventoId: string): Promise<{ nome: string; conteudo: string }> {
    const { evento, cabecalho, dados } = await this.inscritos(eventoId)
    const esc = (t: string) =>
      t.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
      )
    const quando = new Date(evento.inicio_em).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'short',
    })
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Inscritos: ${esc(evento.titulo)}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font-family:sans-serif;font-size:10px;color:#111}h1{font-size:16px;margin:0}
p{margin:2px 0 10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#eee}</style></head><body onload="window.print()">
<h1>${esc(evento.titulo)}</h1><p>${esc(quando)} · ${dados.length} ${dados.length === 1 ? 'inscrição' : 'inscrições'}</p>
<table><thead><tr>${cabecalho.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
${dados.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></body></html>`
    return { nome: `inscritos-${eventoId}.html`, conteudo: html }
  }

  /** Aba Eventos da ficha da empresa (B-21): quem da empresa se inscreveu, presença e nota da avaliação. */
  async daEmpresa(empresaId: string): Promise<{ itens: EventoDaEmpresa[]; total: number }> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [empresa] = await db.execute<{ vendedor_id: string }>(sql`
      SELECT vendedor_id FROM empresas WHERE id = ${empresaId} AND excluido_em IS NULL`)
    if (!empresa || !podeVer(escopo, empresa.vendedor_id)) {
      throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    }
    const linhas = await db.execute<{
      evento_id: string
      titulo: string
      inicio_em: string | Date
      pessoa: string
      situacao: EventoDaEmpresa['situacao']
      presenca: EventoDaEmpresa['presenca']
      respostas: Respostas | null
      definicao: DefinicaoDeFormulario | null
    }>(sql`
      SELECT e.id AS evento_id, e.titulo, e.inicio_em,
             coalesce(c.nome, ct.nome, c.email::text, pa.email::text, '') AS pessoa,
             c.situacao::text AS situacao, c.presenca::text AS presenca, fr.respostas, v.definicao
      FROM evento_confirmacoes c
      JOIN eventos e ON e.id = c.evento_id AND e.excluido_em IS NULL
      LEFT JOIN portal_acessos pa ON pa.id = c.acesso_id
      LEFT JOIN contatos ct ON ct.id = coalesce(c.contato_id, pa.contato_id)
      LEFT JOIN formulario_respostas fr ON fr.id = c.avaliacao_resposta_id
      LEFT JOIN formulario_versoes v ON v.formulario_id = fr.formulario_id AND v.versao = fr.versao
      WHERE coalesce(c.empresa_id, pa.empresa_id) = ${empresaId}
      ORDER BY e.inicio_em DESC, pessoa
      LIMIT 500`)
    const itens = linhas.map((l): EventoDaEmpresa => {
      const campo = l.definicao?.campos.find((x) => x.tipo === 'avaliacao' || x.tipo === 'nps')
      const bruto = campo && l.respostas ? l.respostas[campo.id] : undefined
      return {
        eventoId: l.evento_id,
        titulo: l.titulo,
        inicioEm: new Date(l.inicio_em).toISOString(),
        pessoa: l.pessoa,
        situacao: l.situacao,
        presenca: l.presenca,
        avaliou: l.respostas !== null,
        nota: typeof bruto === 'number' ? bruto : null,
      }
    })
    return { itens, total: itens.length }
  }
}
