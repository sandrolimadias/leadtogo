import { novoId, sql } from '@leadtogo/db'
import type {
  AlterarPontoDePartidaEntrada,
  CriarPontoDePartidaEntrada,
  PontoDePartida,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

const naoEncontrado = () =>
  new ErroApi('ponto_nao_encontrado', 'Ponto de partida não encontrado.', 404)
const nomeRepetido = () =>
  new ErroApi('nome_repetido', 'Já existe um ponto de partida com este nome.', 409, [
    { campo: 'nome', mensagem: 'Já existe um ponto de partida com este nome.' },
  ])

type Linha = {
  id: string
  nome: string
  endereco: string | null
  latitude: number
  longitude: number
  padrao: boolean
  ativo: boolean
  ordem: number
}

const ehNomeRepetido = (e: unknown) =>
  e instanceof Error && /rota_pontos_partida_nome_uq/.test(`${e.message} ${String(e.cause)}`)

/**
 * Pontos de partida das rotas (G4): cadastro auxiliar do admin (`cadastros.gerir`), com a posição marcada
 * no mapa. Um só padrão por empresa (marcar outro tira o anterior). Usado em alguma rota só se inativa,
 * como os demais cadastros (docs/funcionalidades.md, seção 11).
 */
@Injectable()
export class PontosDePartidaService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(): Promise<PontoDePartida[]> {
    const linhas = await this.ctx.db().execute<Linha>(sql`
      SELECT id, nome, endereco, ST_Y(localizacao::geometry) AS latitude, ST_X(localizacao::geometry) AS longitude,
        padrao, ativo, ordem
      FROM rota_pontos_partida WHERE excluido_em IS NULL ORDER BY padrao DESC, ordem, lower(nome)`)
    return linhas
  }

  private async obter(id: string): Promise<PontoDePartida> {
    const p = (await this.listar()).find((l) => l.id === id)
    if (!p) throw naoEncontrado()
    return p
  }

  async criar(dados: CriarPontoDePartidaEntrada): Promise<PontoDePartida> {
    const db = this.ctx.db()
    if (dados.padrao) await this.tirarPadrao()
    const [{ ordem } = { ordem: 0 }] = await db.execute<{ ordem: number }>(sql`
      SELECT coalesce(max(ordem), 0) + 1 AS ordem FROM rota_pontos_partida WHERE excluido_em IS NULL`)
    let id: string | undefined
    try {
      const [l] = await db.execute<{ id: string }>(sql`
        INSERT INTO rota_pontos_partida (tenant_id, id, nome, endereco, localizacao, padrao, ordem, criado_por, atualizado_por)
        VALUES (${this.ctx.tenantId}, ${novoId()}, ${dados.nome}, ${dados.endereco ?? null},
          ST_SetSRID(ST_MakePoint(${dados.longitude}, ${dados.latitude}), 4326)::geography,
          ${dados.padrao ?? false}, ${ordem}, ${this.ctx.membro.id}, ${this.ctx.membro.id})
        RETURNING id`)
      id = l?.id
    } catch (e) {
      if (ehNomeRepetido(e)) throw nomeRepetido()
      throw e
    }
    if (!id) throw new Error('ponto sem id')
    await this.auditoria.registrar({
      entidade: 'rota_ponto_partida',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { nome: dados.nome, padrao: dados.padrao ?? false },
    })
    return this.obter(id)
  }

  async alterar(id: string, dados: AlterarPontoDePartidaEntrada): Promise<PontoDePartida> {
    const antes = await this.obter(id)
    if (dados.padrao) await this.tirarPadrao()
    const mudaPosicao = dados.latitude !== undefined && dados.longitude !== undefined
    try {
      await this.ctx.db().execute(sql`
        UPDATE rota_pontos_partida SET
          nome = ${dados.nome ?? antes.nome},
          endereco = ${dados.endereco === undefined ? antes.endereco : dados.endereco},
          localizacao = ${
            mudaPosicao
              ? sql`ST_SetSRID(ST_MakePoint(${dados.longitude}, ${dados.latitude}), 4326)::geography`
              : sql`localizacao`
          },
          padrao = ${dados.padrao ?? antes.padrao},
          ativo = ${dados.ativo ?? antes.ativo},
          atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
        WHERE id = ${id}`)
    } catch (e) {
      if (ehNomeRepetido(e)) throw nomeRepetido()
      throw e
    }
    const depois = await this.obter(id)
    await this.auditoria.registrar({
      entidade: 'rota_ponto_partida',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: { antes, depois },
    })
    return depois
  }

  /** Sem uso, exclui (lógico); usado em alguma rota, 409 `ponto_em_uso` (só se inativa). */
  async excluir(id: string): Promise<void> {
    await this.obter(id)
    const [uso] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM rotas WHERE ponto_partida_id = ${id} AND excluido_em IS NULL`)
    if ((uso?.n ?? 0) > 0) {
      throw new ErroApi(
        'ponto_em_uso',
        'Este ponto de partida já foi usado em rotas: inative-o em vez de excluir.',
        409,
      )
    }
    await this.ctx.db().execute(sql`
      UPDATE rota_pontos_partida SET excluido_em = now(), padrao = false, atualizado_por = ${this.ctx.membro.id},
        atualizado_em = now()
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'rota_ponto_partida',
      entidadeId: id,
      acao: 'excluir',
    })
  }

  private async tirarPadrao(): Promise<void> {
    await this.ctx.db().execute(sql`
      UPDATE rota_pontos_partida SET padrao = false, atualizado_em = now() WHERE padrao AND excluido_em IS NULL`)
  }
}
