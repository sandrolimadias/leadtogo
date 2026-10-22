import { and, eq, isNull, schema, sql } from '@leadtogo/db'
import type {
  AlterarResultadoDeVisitaEntrada,
  CriarResultadoDeVisitaEntrada,
  ResultadoDeVisita,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { CadastroSimplesService } from '../cadastros/cadastro-simples.service.js'
import { ErroApi } from '../http/erro-api.js'

const { visitaResultados, visitaModelos } = schema

const deSistema = (nome: string, acao: string) =>
  new ErroApi(
    'resultado_de_sistema',
    `O resultado "${nome}" é do sistema: ${acao}. Dá para renomear e trocar o modelo.`,
    409,
  )

/**
 * Resultados da visita (G3a): escolhem o modelo do relatório. "Não localizada" e "Empresa encerrada"
 * são de sistema (só se renomeiam e trocam de modelo). Os demais seguem a regra dos cadastros: o
 * usado em relatório só se inativa.
 */
@Injectable()
export class ResultadosDeVisitaService extends CadastroSimplesService<
  typeof visitaResultados.$inferSelect,
  ResultadoDeVisita,
  CriarResultadoDeVisitaEntrada,
  AlterarResultadoDeVisitaEntrada
> {
  constructor(
    private readonly contexto: ContextoTenantService,
    auditoria: AuditoriaService,
  ) {
    super(contexto, auditoria, {
      entidade: 'resultado_visita',
      rotulo: 'Resultado da visita',
      tabela: visitaResultados,
      paraDto: (l) => ({
        id: l.id,
        nome: l.nome,
        chaveSistema: l.chaveSistema,
        modeloId: l.modeloId,
        ativo: l.ativo,
        ordem: l.ordem,
      }),
      valoresCriar: (d) => ({ nome: d.nome, modeloId: d.modeloId }),
      valoresAlterar: (d) => ({ nome: d.nome, modeloId: d.modeloId, ativo: d.ativo }),
      conferirAlteracao: (l, v) => {
        if (l.chaveSistema && v['ativo'] === false)
          throw deSistema(l.nome, 'não pode ser inativado')
      },
      conferirExclusao: async (l) => {
        if (l.chaveSistema) throw deSistema(l.nome, 'não pode ser excluído')
        const [uso] = await contexto
          .db()
          .execute<{ usado: boolean }>(
            sql`SELECT EXISTS (SELECT 1 FROM relatorios_visita WHERE resultado_id = ${l.id}) AS usado`,
          )
        if (uso?.usado) {
          throw new ErroApi(
            'resultado_em_uso',
            `O resultado "${l.nome}" já foi usado em relatórios: não dá para excluir, só inativar.`,
            409,
          )
        }
      },
    })
  }

  override async criar(dados: CriarResultadoDeVisitaEntrada): Promise<ResultadoDeVisita> {
    await this.conferirModelo(dados.modeloId)
    return super.criar(dados)
  }

  override async alterar(
    id: string,
    dados: AlterarResultadoDeVisitaEntrada,
  ): Promise<ResultadoDeVisita> {
    if (dados.modeloId) await this.conferirModelo(dados.modeloId)
    return super.alterar(id, dados)
  }

  /** O modelo precisa ser da empresa ativa (o RLS esconde o de outra), não excluído e ativo. */
  private async conferirModelo(modeloId: string): Promise<void> {
    const [modelo] = await this.contexto
      .db()
      .select({ ativo: visitaModelos.ativo })
      .from(visitaModelos)
      .where(and(eq(visitaModelos.id, modeloId), isNull(visitaModelos.excluidoEm)))
    if (!modelo)
      throw new ErroApi('modelo_nao_encontrado', 'Modelo de relatório não encontrado.', 404)
    if (!modelo.ativo) {
      throw new ErroApi(
        'modelo_inativo',
        'Esse modelo de relatório está inativo. Escolha outro.',
        409,
      )
    }
  }
}
