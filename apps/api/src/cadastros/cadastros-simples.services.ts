import { schema, sql } from '@leadtogo/db'
import type {
  AlterarMotivoEntrada,
  AlterarOrigemEntrada,
  AlterarPapelDecisaoEntrada,
  AlterarSolucaoEntrada,
  AlterarTipoAtividadeEntrada,
  AlterarVerticalEntrada,
  CriarMotivoEntrada,
  CriarOrigemEntrada,
  CriarPapelDecisaoEntrada,
  CriarSolucaoEntrada,
  CriarTipoAtividadeEntrada,
  CriarVerticalEntrada,
  Motivo,
  Origem,
  PapelDecisao,
  Solucao,
  TipoAtividade,
  Vertical,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { CadastroSimplesService } from './cadastro-simples.service.js'

const { motivos, origens, papeisDecisao, solucoes, tiposAtividade, verticais } = schema

@Injectable()
export class VerticaisService extends CadastroSimplesService<
  typeof verticais.$inferSelect,
  Vertical,
  CriarVerticalEntrada,
  AlterarVerticalEntrada
> {
  constructor(ctx: ContextoTenantService, auditoria: AuditoriaService) {
    super(ctx, auditoria, {
      entidade: 'vertical',
      rotulo: 'Vertical',
      tabela: verticais,
      paraDto: (l) => ({ id: l.id, nome: l.nome, cor: l.cor, ativo: l.ativo, ordem: l.ordem }),
      valoresCriar: (d) => ({ nome: d.nome, cor: d.cor ?? 'gray' }),
      valoresAlterar: (d) => ({ nome: d.nome, cor: d.cor, ativo: d.ativo }),
      // Excluir só o que nunca foi usado: vertical de alguma empresa (mesmo excluída) só se inativa
      conferirExclusao: async (l) => {
        const [uso] = await ctx
          .db()
          .execute<{ usada: boolean }>(
            sql`SELECT EXISTS (SELECT 1 FROM empresas WHERE vertical_id = ${l.id}) AS usada`,
          )
        if (uso?.usada) {
          throw new ErroApi(
            'vertical_em_uso',
            `A vertical "${l.nome}" já foi usada por empresas: não dá para excluir, só inativar.`,
            409,
          )
        }
      },
    })
  }
}

/**
 * "Só se exclui o que nunca foi usado" (regra de 13/10/2026): o cadastro usado por algum registro (mesmo
 * excluído) só se inativa, para o histórico guardar o nome. `consulta` devolve se há uso.
 */
async function recusarSeEmUso(
  ctx: ContextoTenantService,
  consulta: ReturnType<typeof sql>,
  codigo: string,
  mensagem: string,
): Promise<void> {
  const [uso] = await ctx.db().execute<{ usada: boolean }>(consulta)
  if (uso?.usada) throw new ErroApi(codigo, mensagem, 409)
}

/** Texto vazio vira nulo: "sem descrição". */
const descricaoOuNula = (d: string | null | undefined) => (d?.trim() ? d.trim() : null)

@Injectable()
export class SolucoesService extends CadastroSimplesService<
  typeof solucoes.$inferSelect,
  Solucao,
  CriarSolucaoEntrada,
  AlterarSolucaoEntrada
> {
  constructor(ctx: ContextoTenantService, auditoria: AuditoriaService) {
    super(ctx, auditoria, {
      entidade: 'solucao',
      rotulo: 'Solução',
      tabela: solucoes,
      paraDto: (l) => ({
        id: l.id,
        nome: l.nome,
        cor: l.cor,
        descricao: l.descricao,
        ativo: l.ativo,
        ordem: l.ordem,
      }),
      valoresCriar: (d) => ({
        nome: d.nome,
        cor: d.cor ?? 'gray',
        descricao: descricaoOuNula(d.descricao),
      }),
      valoresAlterar: (d) => ({
        nome: d.nome,
        cor: d.cor,
        ativo: d.ativo,
        ...(d.descricao !== undefined && { descricao: descricaoOuNula(d.descricao) }),
      }),
      conferirExclusao: (l) =>
        recusarSeEmUso(
          ctx,
          sql`SELECT EXISTS (SELECT 1 FROM oportunidades WHERE solucao_id = ${l.id}) AS usada`,
          'solucao_em_uso',
          `A solução "${l.nome}" já foi usada em oportunidades: não dá para excluir, só inativar.`,
        ),
    })
  }
}

@Injectable()
export class OrigensService extends CadastroSimplesService<
  typeof origens.$inferSelect,
  Origem,
  CriarOrigemEntrada,
  AlterarOrigemEntrada
> {
  constructor(ctx: ContextoTenantService, auditoria: AuditoriaService) {
    const protegida = (nome: string) =>
      new ErroApi(
        'origem_de_sistema',
        `A origem "${nome}" é usada pelo sistema: dá para renomear, não inativar nem excluir.`,
        409,
      )
    super(ctx, auditoria, {
      entidade: 'origem',
      rotulo: 'Origem',
      tabela: origens,
      paraDto: (l) => ({
        id: l.id,
        nome: l.nome,
        ativo: l.ativo,
        ordem: l.ordem,
        chaveSistema: l.chaveSistema,
      }),
      valoresCriar: (d) => ({ nome: d.nome }),
      valoresAlterar: (d) => ({ nome: d.nome, ativo: d.ativo }),
      conferirAlteracao: (l, v) => {
        if (l.chaveSistema && v['ativo'] === false) throw protegida(l.nome)
      },
      conferirExclusao: async (l) => {
        if (l.chaveSistema) throw protegida(l.nome)
        await recusarSeEmUso(
          ctx,
          sql`SELECT (EXISTS (SELECT 1 FROM oportunidades WHERE origem_id = ${l.id})
                   OR EXISTS (SELECT 1 FROM importacoes WHERE origem_id = ${l.id})) AS usada`,
          'origem_em_uso',
          `A origem "${l.nome}" já foi usada em oportunidades ou importações: não dá para excluir, só inativar.`,
        )
      },
    })
  }
}

@Injectable()
export class MotivosService extends CadastroSimplesService<
  typeof motivos.$inferSelect,
  Motivo,
  CriarMotivoEntrada,
  AlterarMotivoEntrada
> {
  constructor(ctx: ContextoTenantService, auditoria: AuditoriaService) {
    super(ctx, auditoria, {
      entidade: 'motivo',
      rotulo: 'Motivo',
      tabela: motivos,
      paraDto: (l) => ({
        id: l.id,
        nome: l.nome,
        // o banco aceita todos os status; a API só grava os que pedem motivo
        aplicaA: l.aplicaA.filter((s) => s === 'perdido' || s === 'cancelado' || s === 'suspenso'),
        ativo: l.ativo,
        ordem: l.ordem,
      }),
      valoresCriar: (d) => ({ nome: d.nome, aplicaA: d.aplicaA }),
      valoresAlterar: (d) => ({ nome: d.nome, aplicaA: d.aplicaA, ativo: d.ativo }),
      conferirExclusao: (l) =>
        recusarSeEmUso(
          ctx,
          sql`SELECT (EXISTS (SELECT 1 FROM oportunidades WHERE motivo_id = ${l.id})
                   OR EXISTS (SELECT 1 FROM oportunidade_historico WHERE motivo_id = ${l.id})) AS usada`,
          'motivo_em_uso',
          `O motivo "${l.nome}" já foi usado ao fechar oportunidades: não dá para excluir, só inativar.`,
        ),
    })
  }
}

@Injectable()
export class TiposAtividadeService extends CadastroSimplesService<
  typeof tiposAtividade.$inferSelect,
  TipoAtividade,
  CriarTipoAtividadeEntrada,
  AlterarTipoAtividadeEntrada
> {
  constructor(ctx: ContextoTenantService, auditoria: AuditoriaService) {
    const tarefa = (acao: string) =>
      new ErroApi(
        'tipo_de_sistema',
        `O tipo "Tarefa" é do sistema: ${acao}. Dá para renomear, mudar ícone e cor.`,
        409,
      )
    super(ctx, auditoria, {
      entidade: 'tipo_atividade',
      rotulo: 'Tipo de atividade',
      tabela: tiposAtividade,
      paraDto: (l) => ({
        id: l.id,
        nome: l.nome,
        icone: l.icone,
        cor: l.cor,
        contaComo: l.contaComo,
        exigeEmpresa: l.exigeEmpresa,
        sincronizaAgenda: l.sincronizaAgenda,
        ativo: l.ativo,
        ordem: l.ordem,
        chaveSistema: l.chaveSistema,
      }),
      valoresCriar: (d) => ({
        nome: d.nome,
        icone: d.icone,
        cor: d.cor ?? 'gray',
        contaComo: d.contaComo ?? 'nenhum',
        exigeEmpresa: d.exigeEmpresa ?? true,
        sincronizaAgenda: d.sincronizaAgenda ?? false,
      }),
      valoresAlterar: (d) => ({
        nome: d.nome,
        icone: d.icone,
        cor: d.cor,
        contaComo: d.contaComo,
        exigeEmpresa: d.exigeEmpresa,
        sincronizaAgenda: d.sincronizaAgenda,
        ativo: d.ativo,
      }),
      // A Tarefa é a atividade interna: sem empresa obrigatória e fora do controle de visitas/contatos
      conferirAlteracao: (l, v) => {
        if (l.chaveSistema !== 'tarefa') return
        if (v['ativo'] === false) throw tarefa('não pode ser inativado')
        if (v['exigeEmpresa'] === true) throw tarefa('a empresa continua opcional')
        if (v['contaComo'] !== undefined && v['contaComo'] !== 'nenhum') {
          throw tarefa('não conta como visita nem contato')
        }
      },
      conferirExclusao: async (l) => {
        if (l.chaveSistema === 'tarefa') throw tarefa('não pode ser excluído')
        await recusarSeEmUso(
          ctx,
          sql`SELECT EXISTS (SELECT 1 FROM atividades WHERE tipo_atividade_id = ${l.id}) AS usada`,
          'tipo_em_uso',
          `O tipo "${l.nome}" já foi usado em atividades: não dá para excluir, só inativar.`,
        )
      },
    })
  }
}

@Injectable()
export class PapeisDecisaoService extends CadastroSimplesService<
  typeof papeisDecisao.$inferSelect,
  PapelDecisao,
  CriarPapelDecisaoEntrada,
  AlterarPapelDecisaoEntrada
> {
  constructor(ctx: ContextoTenantService, auditoria: AuditoriaService) {
    super(ctx, auditoria, {
      entidade: 'papel_decisao',
      rotulo: 'Papel na decisão',
      tabela: papeisDecisao,
      paraDto: (l) => ({ id: l.id, nome: l.nome, ativo: l.ativo, ordem: l.ordem }),
      valoresCriar: (d) => ({ nome: d.nome }),
      valoresAlterar: (d) => ({ nome: d.nome, ativo: d.ativo }),
      // Excluir só o que nunca foi usado: papel de algum contato (mesmo excluído) só se inativa
      conferirExclusao: async (l) => {
        const [uso] = await ctx
          .db()
          .execute<{ usada: boolean }>(
            sql`SELECT EXISTS (SELECT 1 FROM contatos WHERE papel_decisao_id = ${l.id}) AS usada`,
          )
        if (uso?.usada) {
          throw new ErroApi(
            'papel_em_uso',
            `O papel "${l.nome}" já foi usado por contatos: não dá para excluir, só inativar.`,
            409,
          )
        }
      },
    })
  }
}
