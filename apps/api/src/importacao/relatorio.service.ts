import { and, desc, eq, inArray, schema, sql } from '@leadtogo/db'
import {
  type ConsultaDasLinhas,
  type ConsultaDosLotes,
  type ListaDeLinhas,
  type ListaDeLotes,
  type LoteDeImportacao,
  MOTIVO_IMPORTAR_MESMO_ASSIM,
  rotuloDoResultado,
  type ResultadoDaLinha,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { agendarExecucao } from './evento.js'
import { LotesDeImportacaoService } from './lotes.service.js'

const { atividades, contatos, empresas, importacaoLinhas, importacoes, membros } = schema

/**
 * Uma célula de CSV segura para abrir no Excel: texto que começa com `=`, `+`, `-`, `@`, tabulação ou
 * retorno vira texto (apóstrofo na frente), para uma planilha enviada não virar fórmula na de volta.
 */
export function celulaDeCsv(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro
}

@Injectable()
export class RelatorioDaImportacaoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly lotes: LotesDeImportacaoService,
  ) {}

  private exigirQuemImporta(): void {}

  /** Os lotes da empresa, do mais novo para o mais antigo. */
  async listarLotes(consulta: ConsultaDosLotes): Promise<ListaDeLotes> {
    this.exigirQuemImporta()
    const db = this.ctx.db()
    const filtro = and(
      sql`${importacoes.excluidoEm} IS NULL`,
      consulta.tipo ? eq(importacoes.tipo, consulta.tipo) : undefined,
    )
    const [{ total } = { total: 0 }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(importacoes)
      .where(filtro)
    const linhas = await db
      .select({ lote: importacoes, criadoPor: membros.nome })
      .from(importacoes)
      .leftJoin(membros, eq(membros.id, importacoes.criadoPor))
      .where(filtro)
      .orderBy(desc(importacoes.criadoEm))
      .limit(consulta.porPagina)
      .offset((consulta.pagina - 1) * consulta.porPagina)
    return {
      itens: linhas.map(({ lote, criadoPor }) => ({
        id: lote.id,
        nome: lote.nome,
        tipo: lote.tipo,
        nomeArquivo: lote.nomeArquivo,
        situacao: lote.situacao,
        totalLinhas: lote.totalLinhas,
        totais: lote.totais as Record<string, number | string>,
        criadoPor,
        criadoEm: lote.criadoEm.toISOString(),
        concluidoEm: lote.concluidoEm?.toISOString() ?? null,
      })),
      total,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    }
  }

  /** As linhas do lote, com o resultado de cada uma; filtra por resultado. */
  async linhas(id: string, consulta: ConsultaDasLinhas): Promise<ListaDeLinhas> {
    this.exigirQuemImporta()
    const lote = await this.lotes.detalhar(id) // 404 se não existe
    const db = this.ctx.db()
    const onde = and(
      eq(importacaoLinhas.importacaoId, id),
      consulta.resultado ? eq(importacaoLinhas.resultado, consulta.resultado) : undefined,
    )
    const [{ total } = { total: 0 }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(importacaoLinhas)
      .where(onde)
    const linhas = await db
      .select({
        id: importacaoLinhas.id,
        numero: importacaoLinhas.numero,
        resultado: importacaoLinhas.resultado,
        motivo: importacaoLinhas.motivo,
        empresaId: importacaoLinhas.empresaId,
        contatoId: importacaoLinhas.contatoId,
        atividadeId: importacaoLinhas.atividadeId,
        avisos: importacaoLinhas.avisos,
        contatoNome: contatos.nome,
        atividadeTitulo: atividades.titulo,
        dados: importacaoLinhas.dados,
        empresaNome: sql<
          string | null
        >`coalesce(${empresas.nomeFantasia}, ${empresas.razaoSocial})`,
        // `false` quando a empresa saiu da carteira (desfazer); nulo quando a linha não tem empresa
        empresaNaCarteira: sql<
          boolean | null
        >`${empresas.id} IS NOT NULL AND ${empresas.excluidoEm} IS NULL`,
      })
      .from(importacaoLinhas)
      .leftJoin(empresas, eq(empresas.id, importacaoLinhas.empresaId))
      .leftJoin(contatos, eq(contatos.id, importacaoLinhas.contatoId))
      .leftJoin(atividades, eq(atividades.id, importacaoLinhas.atividadeId))
      .where(onde)
      .orderBy(importacaoLinhas.numero)
      .limit(consulta.porPagina)
      .offset((consulta.pagina - 1) * consulta.porPagina)
    return {
      itens: linhas.map((l) => ({
        ...l,
        avisos: l.avisos as string[],
        dados: l.dados as Record<string, string>,
      })),
      total,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
      colunas: lote.colunas,
    }
  }

  /**
   * O que não entrou, em CSV (para corrigir a planilha e importar de novo): linha, resultado, motivo
   * e as colunas originais. Abre direto no Excel em português (`;`, UTF-8 com BOM).
   */
  async csvDosProblemas(id: string, resultado?: ResultadoDaLinha): Promise<string> {
    this.exigirQuemImporta()
    const lote = await this.lotes.detalhar(id)
    const linhas = await this.ctx
      .db()
      .select({
        numero: importacaoLinhas.numero,
        resultado: importacaoLinhas.resultado,
        motivo: importacaoLinhas.motivo,
        dados: importacaoLinhas.dados,
      })
      .from(importacaoLinhas)
      .where(
        and(
          eq(importacaoLinhas.importacaoId, id),
          resultado
            ? eq(importacaoLinhas.resultado, resultado)
            : sql`${importacaoLinhas.resultado} NOT IN ('criada', 'criada_fora_do_perfil', 'vinculada', 'ja_vinculada', 'pendente')`,
        ),
      )
      .orderBy(importacaoLinhas.numero)
    const cabecalho = ['Linha', 'Resultado', 'Motivo', ...lote.colunas]
    const corpo = linhas.map((l) => {
      const dados = l.dados as Record<string, string>
      return [
        String(l.numero),
        rotuloDoResultado(l.resultado, lote.tipo),
        l.motivo ?? '',
        ...lote.colunas.map((c) => dados[c] ?? ''),
      ]
    })
    return `\uFEFF${[cabecalho, ...corpo].map((l) => l.map(celulaDeCsv).join(';')).join('\r\n')}\r\n`
  }

  /**
   * "Importar mesmo assim": as linhas que ficaram fora do perfil voltam a pendentes, marcadas no
   * `motivo` (`MOTIVO_IMPORTAR_MESMO_ASSIM`), e o worker as cadastra com a tag "Fora do perfil". Só num lote concluído. O bloqueio de empresa não ativa
   * continua valendo (a linha pode virar "pulada: empresa não ativa").
   */
  async importarForaDoPerfil(id: string, linhaIds?: string[]): Promise<LoteDeImportacao> {
    this.exigirQuemImporta()
    const db = this.ctx.db()
    const lote = await this.lotes.detalhar(id)
    if (lote.situacao !== 'concluida') {
      throw new ErroApi(
        'importacao_nao_concluida',
        'Só dá para importar as linhas fora do perfil depois que a importação termina.',
        409,
      )
    }
    const alvo = await db
      .select({ id: importacaoLinhas.id })
      .from(importacaoLinhas)
      .where(
        and(
          eq(importacaoLinhas.importacaoId, id),
          eq(importacaoLinhas.resultado, 'fora_do_perfil'),
          linhaIds ? inArray(importacaoLinhas.id, linhaIds) : undefined,
        ),
      )
    if (alvo.length === 0) {
      throw new ErroApi(
        'sem_linhas_fora_do_perfil',
        'Não há linhas fora do perfil para importar.',
        409,
      )
    }
    // A mudança de situação é o que impede dois cliques de agendarem duas execuções
    const [mudou] = await db
      .update(importacoes)
      .set({
        situacao: 'em_andamento',
        concluidoEm: null,
        // sem espera antiga e com o relógio do "parado" zerado, como no Iniciar
        proximaConsultaEm: null,
        ultimoProgressoEm: sql`now()`,
        atualizadoPor: this.ctx.membro.id,
      })
      .where(and(eq(importacoes.id, id), eq(importacoes.situacao, 'concluida')))
      .returning({ id: importacoes.id })
    if (!mudou) {
      throw new ErroApi('importacao_em_andamento', 'Esta importação já está em andamento.', 409)
    }
    await db
      .update(importacaoLinhas)
      .set({ resultado: 'pendente', motivo: MOTIVO_IMPORTAR_MESMO_ASSIM, processadaEm: null })
      .where(
        inArray(
          importacaoLinhas.id,
          alvo.map((a) => a.id),
        ),
      )
    await agendarExecucao(db, this.ctx.tenantId, id)
    await this.auditoria.registrar({
      entidade: 'importacao',
      entidadeId: id,
      acao: 'importar_fora_do_perfil',
      alteracoes: { linhas: alvo.length },
    })
    return this.lotes.detalhar(id)
  }
}
