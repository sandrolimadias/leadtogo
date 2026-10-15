import { and, eq, gt, inArray, isNull, schema, sql } from '@leadtogo/db'
import {
  documentoDaPlanilha,
  PROBLEMAS_NA_PREVIA,
  type PreviaDaImportacao,
  validarMapeamento,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { escopoDaCarteira } from '../carteira/regras-de-carteira.js'
import { ErroApi } from '../http/erro-api.js'
import { VALIDADE_DO_CACHE_DIAS } from '../receita/receita.service.js'

const { empresas, importacaoLinhas, importacoes, receitaConsultas } = schema

/**
 * A prévia de um lote: o que a importação vai fazer, sem consultar a Receita nem gravar nada.
 * Lê as linhas já guardadas e cruza com a carteira e com o cache da Receita.
 */
@Injectable()
export class PreviaDaImportacaoService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async calcular(id: string): Promise<PreviaDaImportacao> {
    if (this.ctx.membro.papel !== 'admin' && this.ctx.membro.papel !== 'gestor') {
      throw new ErroApi('acesso_negado', 'Só administradores e gestores importam planilhas.', 403)
    }
    const db = this.ctx.db()
    const [lote] = await db.select().from(importacoes).where(eq(importacoes.id, id))
    if (!lote || lote.excluidoEm) {
      throw new ErroApi('importacao_nao_encontrada', 'Importação não encontrada.', 404)
    }
    const mapeamento = lote.mapeamento as { colunas?: string[]; campos?: Record<string, string> }
    const colunaDoCnpj = mapeamento.campos?.['documento']
    if (
      !colunaDoCnpj ||
      validarMapeamento(mapeamento.campos ?? {}, mapeamento.colunas ?? [], lote.fonteDados).some(
        (e) => e.campo === 'documento',
      )
    ) {
      throw new ErroApi(
        'mapeamento_incompleto',
        'Indique a coluna do CNPJ antes de ver a prévia.',
        409,
      )
    }

    const linhas = await db
      .select({ numero: importacaoLinhas.numero, dados: importacaoLinhas.dados })
      .from(importacaoLinhas)
      .where(eq(importacaoLinhas.importacaoId, id))
      .orderBy(importacaoLinhas.numero)

    const problemas: PreviaDaImportacao['problemas'] = []
    const anota = (numero: number, motivo: string) => {
      if (problemas.length < PROBLEMAS_NA_PREVIA) problemas.push({ numero, motivo })
    }
    const vistos = new Map<string, number>()
    const unicos: { numero: number; documento: string }[] = []
    let semCnpjValido = 0
    let repetidasNaPlanilha = 0
    for (const l of linhas) {
      const bruto = (l.dados as Record<string, string>)[colunaDoCnpj] ?? ''
      const documento = documentoDaPlanilha(bruto)
      if (!documento) {
        semCnpjValido += 1
        anota(l.numero, bruto.trim() === '' ? 'CNPJ em branco' : `CNPJ inválido: ${bruto}`)
      } else if (vistos.has(documento)) {
        repetidasNaPlanilha += 1
        anota(l.numero, `CNPJ repetido (já está na linha ${vistos.get(documento)})`)
      } else {
        vistos.set(documento, l.numero)
        unicos.push({ numero: l.numero, documento })
      }
    }

    const documentos = unicos.map((u) => u.documento)
    const naCarteira = new Set(
      documentos.length === 0
        ? []
        : (
            await db
              .select({ documento: empresas.documento })
              .from(empresas)
              .where(and(inArray(empresas.documento, documentos), isNull(empresas.excluidoEm)))
          ).map((r) => r.documento),
    )
    let jaNaCarteira = 0
    const novos: string[] = []
    for (const u of unicos) {
      if (naCarteira.has(u.documento)) {
        jaNaCarteira += 1
        anota(u.numero, 'CNPJ já está na carteira (a empresa não será alterada)')
      } else novos.push(u.documento)
    }

    const escopo = await escopoDaCarteira(this.ctx)
    // Com bloqueio de empresa não ativa, perfil ou dados da Receita, cada CNPJ novo é consultado
    const consultaAReceita =
      escopo.bloquearNaoAtiva || lote.perfilId !== null || lote.fonteDados !== 'planilha'
    let consultasNecessarias = 0
    if (consultaAReceita && novos.length > 0) {
      const emCache = await db
        .select({ cnpj: receitaConsultas.cnpj })
        .from(receitaConsultas)
        .where(
          and(
            inArray(receitaConsultas.cnpj, novos),
            gt(
              receitaConsultas.consultadoEm,
              sql`now() - make_interval(days => ${VALIDADE_DO_CACHE_DIAS})`,
            ),
          ),
        )
      consultasNecessarias = novos.length - emCache.length
    }
    return {
      totalLinhas: linhas.length,
      aImportar: novos.length,
      semCnpjValido,
      repetidasNaPlanilha,
      jaNaCarteira,
      consultaAReceita,
      consultasNecessarias,
      estimativaSegundos: Math.ceil((consultasNecessarias * lote.intervaloMs) / 1000),
      problemas,
    }
  }
}
