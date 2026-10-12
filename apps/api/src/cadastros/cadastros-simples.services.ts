import { schema } from '@leadtogo/db'
import type {
  AlterarMotivoEntrada,
  AlterarOrigemEntrada,
  AlterarSolucaoEntrada,
  AlterarTipoAtividadeEntrada,
  AlterarVerticalEntrada,
  CriarMotivoEntrada,
  CriarOrigemEntrada,
  CriarSolucaoEntrada,
  CriarTipoAtividadeEntrada,
  CriarVerticalEntrada,
  Motivo,
  Origem,
  Solucao,
  TipoAtividade,
  Vertical,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { CadastroSimplesService } from './cadastro-simples.service.js'

const { motivos, origens, solucoes, tiposAtividade, verticais } = schema

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
    })
  }
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
      conferirExclusao: (l) => {
        if (l.chaveSistema) throw protegida(l.nome)
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
      conferirExclusao: (l) => {
        if (l.chaveSistema === 'tarefa') throw tarefa('não pode ser excluído')
      },
    })
  }
}
