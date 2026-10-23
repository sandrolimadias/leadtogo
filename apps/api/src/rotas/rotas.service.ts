import { schema, type SQL, sql } from '@leadtogo/db'
import {
  type Alcance,
  type ConfiguracaoDeRotas,
  type ConsultaDeRotas,
  type Coordenada,
  type EstimativaDeRota,
  FUSO_PADRAO,
  type ItemDeRota,
  type ListaDeRotas,
  type OrdemOtimizada,
  type OtimizarRotaEntrada,
  type ParadaDaRota,
  type ParadasAdicionadas,
  type Rota,
  type RotaDaEmpresa,
  type SalvarRotaEntrada,
  ordemEmLinhaReta,
  trechoEstimado,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { carregarPermissoes } from '../acesso/permissoes-do-membro.js'
import type { PapelMembro } from '../acesso/requisicao.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { alcanca, escopoDaCarteira, type Responsaveis } from '../carteira/regras-de-carteira.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { type Roteirizador, RoteirizadorIndisponivel } from './roteirizador.js'

/** Token do serviço de rotas (VROOM + OSRM); `null` quando `VROOM_URL`/`OSRM_URL` não estão configuradas. */
export const ROTEIRIZADOR = Symbol('ROTEIRIZADOR')

const naoEncontrada = () => new ErroApi('rota_nao_encontrada', 'Rota não encontrada.', 404)
const semPermissao = () =>
  new ErroApi('acesso_negado', 'Seu perfil de acesso não permite alterar esta rota.', 403)

type LinhaDaRota = {
  id: string
  codigo: number
  nome: string
  data: string
  responsavel_id: string
  responsavel_nome: string
  partida: 'posicao_atual' | 'ponto'
  ponto_partida_id: string | null
  ponto_nome: string | null
  ponto_lat: number | null
  ponto_lon: number | null
  voltar_ao_inicio: boolean
  minutos_por_visita: number
  situacao: Rota['situacao']
  distancia_m: number | null
  duracao_s: number | null
  estimativa: EstimativaDeRota | null
  otimizada_em: string | null
  trajeto: [number, number][] | null
  iniciada_em: string | null
  concluida_em: string | null
}

type EmpresaDaParada = {
  id: string
  vendedor_id: string
  latitude: number
  longitude: number
}

interface Estimativas {
  estimativa: EstimativaDeRota
  distanciaM: number
  duracaoS: number
  /** O trecho que chega a cada parada (nulo na primeira, sem início) */
  trechos: ({ distanciaM: number; duracaoS: number } | null)[]
  linha: [number, number][] | null
}

const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString())
const hojeNoFuso = sql`(now() AT TIME ZONE ${FUSO_PADRAO})::date`

/**
 * Rotas (G4; docs/funcionalidades.md, seção 3D). Quem vê e altera vai pelo alcance de `rotas.ver` e
 * `rotas.editar` sobre o RESPONSÁVEL da rota; montar para outro vendedor exige `rotas.atribuir`. As paradas
 * são empresas com coordenada que o responsável da rota vê na carteira (e quem monta também). A posição atual
 * do aparelho entra só no cálculo e nunca é gravada (LGPD, `lgpd.md` 3.3).
 */
@Injectable()
export class RotasService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    @Inject(ROTEIRIZADOR) private readonly roteirizador: Roteirizador | null,
  ) {}

  private get permissao() {
    return new PermissaoService(this.ctx)
  }

  // ---- Configuração ----

  async configuracao(): Promise<ConfiguracaoDeRotas> {
    const [c] = await this.ctx.db().execute<{ minutos: number }>(sql`
      SELECT rota_minutos_por_visita AS minutos FROM tenant_configuracoes WHERE tenant_id = ${this.ctx.tenantId}`)
    return {
      minutosPorVisita: c?.minutos ?? 40,
      maxParadas: this.config.ROTA_MAX_PARADAS,
      otimizacaoConfigurada: this.roteirizador !== null,
    }
  }

  async alterarConfiguracao(minutosPorVisita: number): Promise<ConfiguracaoDeRotas> {
    const antes = await this.configuracao()
    await this.ctx.db().execute(sql`
      UPDATE tenant_configuracoes SET rota_minutos_por_visita = ${minutosPorVisita}, atualizado_em = now()
      WHERE tenant_id = ${this.ctx.tenantId}`)
    await this.auditoria.registrar({
      entidade: 'configuracao_rotas',
      acao: 'alterar',
      alteracoes: { minutosPorVisita: { antes: antes.minutosPorVisita, depois: minutosPorVisita } },
    })
    return this.configuracao()
  }

  // ---- Leitura ----

  async listar(c: ConsultaDeRotas): Promise<ListaDeRotas> {
    const visiveis = await this.permissao.condicao('rotas.ver', sql`r.responsavel_id`)
    const condicoes: SQL[] = [sql`r.excluido_em IS NULL`]
    if (visiveis) condicoes.push(visiveis)
    if (c.de) condicoes.push(sql`r.data >= ${c.de}::date`)
    if (c.ate) condicoes.push(sql`r.data <= ${c.ate}::date`)
    if (c.responsavelId) condicoes.push(sql`r.responsavel_id = ${c.responsavelId}`)
    if (c.situacao) condicoes.push(sql`r.situacao = ${c.situacao}::situacao_rota`)
    const onde = sql.join(condicoes, sql` AND `)
    const db = this.ctx.db()
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM rotas r WHERE ${onde}`,
    )
    const linhas = await db.execute<{
      id: string
      codigo: number
      nome: string
      data: string
      responsavel_id: string
      responsavel_nome: string
      situacao: ItemDeRota['situacao']
      paradas: number
      visitadas: number
      puladas: number
      distancia_m: number | null
      duracao_s: number | null
      minutos_por_visita: number
      estimativa: EstimativaDeRota | null
    }>(sql`
      SELECT r.id, r.codigo, r.nome, r.data::text AS data, r.responsavel_id, m.nome AS responsavel_nome,
        r.situacao::text AS situacao, r.distancia_m, r.duracao_s, r.minutos_por_visita, r.estimativa::text AS estimativa,
        count(p.id)::int AS paradas,
        count(p.id) FILTER (WHERE p.situacao = 'visitada')::int AS visitadas,
        count(p.id) FILTER (WHERE p.situacao = 'pulada')::int AS puladas
      FROM rotas r JOIN membros m ON m.id = r.responsavel_id
      LEFT JOIN rota_paradas p ON p.rota_id = r.id AND p.excluido_em IS NULL
      WHERE ${onde}
      GROUP BY r.id, m.nome
      ORDER BY r.data DESC, r.codigo DESC
      LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return {
      total: total?.n ?? 0,
      itens: linhas.map((l) => ({
        id: l.id,
        codigo: l.codigo,
        nome: l.nome,
        data: l.data,
        responsavel: { id: l.responsavel_id, nome: l.responsavel_nome },
        situacao: l.situacao,
        paradas: l.paradas,
        visitadas: l.visitadas,
        puladas: l.puladas,
        pendentes: l.paradas - l.visitadas - l.puladas,
        distanciaM: l.distancia_m,
        duracaoS: l.duracao_s,
        minutosPorVisita: l.minutos_por_visita,
        estimativa: l.estimativa,
      })),
    }
  }

  async obter(id: string): Promise<Rota> {
    const l = await this.linhaVisivel(id)
    return this.paraDto(l)
  }

  /** As rotas de hoje da própria pessoa (a "rota do dia" do celular), sem as canceladas. */
  async hoje(): Promise<Rota[]> {
    const ids = await this.ctx.db().execute<{ id: string }>(sql`
      SELECT id FROM rotas WHERE excluido_em IS NULL AND responsavel_id = ${this.ctx.membro.id}
        AND data = ${hojeNoFuso} AND situacao <> 'cancelada'
      ORDER BY codigo`)
    const rotas: Rota[] = []
    for (const { id } of ids) rotas.push(await this.paraDto(await this.linha(id)))
    return rotas
  }

  /** As rotas em aberto (de hoje em diante) em que a empresa é parada, entre as que a pessoa vê. */
  async daEmpresa(empresaId: string): Promise<RotaDaEmpresa[]> {
    const visiveis = await this.permissao.condicao('rotas.ver', sql`r.responsavel_id`)
    const linhas = await this.ctx.db().execute<{
      rota_id: string
      codigo: number
      nome: string
      data: string
      ordem: number
      situacao: RotaDaEmpresa['situacaoParada']
    }>(sql`
      SELECT r.id AS rota_id, r.codigo, r.nome, r.data::text AS data, p.ordem, p.situacao::text AS situacao
      FROM rota_paradas p JOIN rotas r ON r.id = p.rota_id
      WHERE p.empresa_id = ${empresaId} AND p.excluido_em IS NULL AND r.excluido_em IS NULL
        AND r.situacao IN ('planejada', 'em_andamento') AND r.data >= ${hojeNoFuso}
        ${visiveis ? sql`AND ${visiveis}` : sql``}
      ORDER BY r.data, r.codigo`)
    return linhas.map((l) => ({
      rotaId: l.rota_id,
      codigo: l.codigo,
      nome: l.nome,
      data: l.data,
      ordem: l.ordem,
      situacaoParada: l.situacao,
    }))
  }

  // ---- Montar ----

  async criar(dados: SalvarRotaEntrada): Promise<Rota> {
    const responsavelId = await this.responsavelPermitido(dados.responsavelId)
    const ponto = await this.pontoDePartida(dados.partida, dados.pontoPartidaId)
    const empresas = await this.empresasValidas(dados.empresaIds, responsavelId)
    const minutos = dados.minutosPorVisita ?? (await this.configuracao()).minutosPorVisita
    const db = this.ctx.db()
    const [c] = await db.execute<{ codigo: number }>(sql`
      UPDATE tenant_configuracoes SET rota_ultimo_codigo = rota_ultimo_codigo + 1
      WHERE tenant_id = ${this.ctx.tenantId} RETURNING rota_ultimo_codigo AS codigo`)
    if (!c) throw new Error('empresa sem configuração')
    const [r] = await db
      .insert(schema.rotas)
      .values({
        tenantId: this.ctx.tenantId,
        codigo: c.codigo,
        nome: dados.nome,
        data: dados.data,
        responsavelId,
        partida: dados.partida,
        pontoPartidaId: ponto?.id ?? null,
        voltarAoInicio: dados.voltarAoInicio,
        minutosPorVisita: minutos,
        criadoPor: this.ctx.membro.id,
        atualizadoPor: this.ctx.membro.id,
      })
      .returning({ id: schema.rotas.id })
    if (!r) throw new Error('rota sem id')
    await this.gravarParadas(r.id, empresas, new Map())
    await this.recalcular(r.id, dados.partida === 'ponto' ? ponto : (dados.posicaoAtual ?? null), {
      otimizada: dados.otimizada ?? false,
    })
    await this.auditoria.registrar({
      entidade: 'rota',
      entidadeId: r.id,
      acao: 'criar',
      alteracoes: {
        codigo: c.codigo,
        nome: dados.nome,
        data: dados.data,
        responsavelId,
        paradas: empresas.length,
      },
    })
    return this.obter(r.id)
  }

  async salvar(id: string, dados: SalvarRotaEntrada): Promise<Rota> {
    const atual = await this.linhaEditavel(id)
    const responsavelId =
      dados.responsavelId && dados.responsavelId !== atual.responsavel_id
        ? await this.responsavelPermitido(dados.responsavelId)
        : atual.responsavel_id
    const ponto = await this.pontoDePartida(dados.partida, dados.pontoPartidaId)
    const empresas = await this.empresasValidas(dados.empresaIds, responsavelId)
    const paradas = await this.paradasGravadas(id)
    const resolvidas = paradas.filter((p) => p.situacao !== 'pendente')
    const faltando = resolvidas.filter((p) => !dados.empresaIds.includes(p.empresa_id))
    if (faltando.length > 0) {
      throw new ErroApi(
        'parada_resolvida',
        'Paradas já visitadas ou puladas não saem da rota.',
        409,
      )
    }
    await this.ctx.db().execute(sql`
      UPDATE rotas SET nome = ${dados.nome}, data = ${dados.data}::date, responsavel_id = ${responsavelId},
        partida = ${dados.partida}::partida_rota, ponto_partida_id = ${ponto?.id ?? null}::uuid,
        voltar_ao_inicio = ${dados.voltarAoInicio},
        minutos_por_visita = ${dados.minutosPorVisita ?? atual.minutos_por_visita},
        atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${id}`)
    await this.gravarParadas(id, empresas, new Map(paradas.map((p) => [p.empresa_id, p])))
    await this.recalcular(id, dados.partida === 'ponto' ? ponto : (dados.posicaoAtual ?? null), {
      otimizada: dados.otimizada ?? false,
    })
    await this.auditoria.registrar({
      entidade: 'rota',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: {
        nome: { antes: atual.nome, depois: dados.nome },
        data: { antes: atual.data, depois: dados.data },
        responsavelId: { antes: atual.responsavel_id, depois: responsavelId },
        paradas: { antes: paradas.map((p) => p.empresa_id), depois: dados.empresaIds },
      },
    })
    return this.obter(id)
  }

  /** "Adicionar à rota": acrescenta no fim o que cabe; o que não serve só conta. */
  async adicionarParadas(id: string, empresaIds: string[]): Promise<ParadasAdicionadas> {
    const atual = await this.linhaEditavel(id)
    const paradas = await this.paradasGravadas(id)
    const naRota = new Set(paradas.map((p) => p.empresa_id))
    const unicas = [...new Set(empresaIds)]
    const novas = unicas.filter((e) => !naRota.has(e))
    const validas = await this.empresasValidas(novas, atual.responsavel_id, {
      ignorarInvalidas: true,
    })
    const vagas = Math.max(0, this.config.ROTA_MAX_PARADAS - paradas.length)
    const entram = validas.slice(0, vagas)
    if (entram.length > 0) {
      const todas = [
        ...(await this.empresasValidas(
          paradas.map((p) => p.empresa_id),
          atual.responsavel_id,
          { ignorarInvalidas: true, semConferirAlcance: true },
        )),
        ...entram,
      ]
      await this.gravarParadas(id, todas, new Map(paradas.map((p) => [p.empresa_id, p])))
      await this.recalcular(id, atual.partida === 'ponto' ? this.coordenadaDoPonto(atual) : null, {
        otimizada: false,
      })
      await this.auditoria.registrar({
        entidade: 'rota',
        entidadeId: id,
        acao: 'adicionar_paradas',
        alteracoes: { empresaIds: entram.map((e) => e.id) },
      })
    }
    return {
      rota: await this.obter(id),
      adicionadas: entram.length,
      jaNaRota: unicas.length - novas.length,
      ignoradas: novas.length - validas.length,
      excedentes: validas.length - entram.length,
    }
  }

  /** A ordem mais curta, sem gravar nada (a tela mostra e a pessoa salva). */
  async otimizar(dados: OtimizarRotaEntrada): Promise<OrdemOtimizada> {
    if (!this.roteirizador) {
      throw new ErroApi('rotas_nao_configuradas', 'Otimização de rotas ainda não configurada.', 409)
    }
    const responsavelId = await this.responsavelPermitido(dados.responsavelId)
    const ponto = await this.pontoDePartida(dados.partida, dados.pontoPartidaId)
    const empresas = await this.empresasValidas(dados.empresaIds, responsavelId)
    const inicio: Coordenada | null =
      dados.partida === 'ponto' ? ponto : (dados.posicaoAtual ?? null)
    const coordenadas = empresas.map((e) => ({ latitude: e.latitude, longitude: e.longitude }))
    const fim = dados.voltarAoInicio && inicio ? inicio : null
    let aviso: OrdemOtimizada['aviso'] = inicio ? null : 'sem_partida'
    let ordem: number[]
    try {
      ordem = await this.roteirizador.ordenar(inicio, coordenadas, fim)
    } catch (erro) {
      if (!(erro instanceof RoteirizadorIndisponivel)) throw erro
      ordem = ordemEmLinhaReta(inicio, coordenadas, dados.voltarAoInicio)
      aviso = 'indisponivel'
    }
    const ordenadas = ordem.map((i) => coordenadas[i] as Coordenada)
    const e = await this.estimar(inicio, ordenadas, dados.voltarAoInicio, aviso !== 'indisponivel')
    return {
      empresaIds: ordem.map((i) => (empresas[i] as EmpresaDaParada).id),
      estimativa: e.estimativa,
      distanciaM: e.distanciaM,
      duracaoS: e.duracaoS,
      aviso: e.estimativa === 'linha_reta' && aviso === null ? 'indisponivel' : aviso,
    }
  }

  // ---- Executar (G4b) ----

  async cancelar(id: string): Promise<Rota> {
    const atual = await this.linhaEditavel(id)
    await this.ctx.db().execute(sql`
      UPDATE rotas SET situacao = 'cancelada', atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'rota',
      entidadeId: id,
      acao: 'cancelar',
      alteracoes: { situacao: { antes: atual.situacao, depois: 'cancelada' } },
    })
    return this.obter(id)
  }

  /** Encerra a rota: as paradas ainda pendentes viram puladas ("Rota encerrada"). */
  async encerrar(id: string): Promise<Rota> {
    const atual = await this.linhaEditavel(id)
    const db = this.ctx.db()
    await db.execute(sql`
      UPDATE rota_paradas SET situacao = 'pulada', motivo_pulo = 'Rota encerrada', resolvida_em = now(),
        atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE rota_id = ${id} AND excluido_em IS NULL AND situacao = 'pendente'`)
    await db.execute(sql`
      UPDATE rotas SET situacao = 'concluida', concluida_em = now(), iniciada_em = coalesce(iniciada_em, now()),
        atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'rota',
      entidadeId: id,
      acao: 'encerrar',
      alteracoes: { situacao: { antes: atual.situacao, depois: 'concluida' } },
    })
    return this.obter(id)
  }

  async pular(id: string, paradaId: string, motivo: string): Promise<Rota> {
    await this.linhaEditavel(id)
    const db = this.ctx.db()
    const [p] = await db.execute<{ situacao: string }>(sql`
      SELECT situacao::text AS situacao FROM rota_paradas
      WHERE id = ${paradaId} AND rota_id = ${id} AND excluido_em IS NULL FOR UPDATE`)
    if (!p) throw new ErroApi('parada_nao_encontrada', 'Parada não encontrada.', 404)
    if (p.situacao !== 'pendente') {
      throw new ErroApi('parada_resolvida', 'Esta parada já foi visitada ou pulada.', 409)
    }
    await db.execute(sql`
      UPDATE rota_paradas SET situacao = 'pulada', motivo_pulo = ${motivo}, resolvida_em = now(),
        atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
      WHERE id = ${paradaId}`)
    await atualizarAndamento(db, id, this.ctx.membro.id)
    await this.auditoria.registrar({
      entidade: 'rota',
      entidadeId: id,
      acao: 'pular_parada',
      alteracoes: { paradaId, motivo },
    })
    return this.obter(id)
  }

  // ---- Apoio ----

  private async linha(id: string): Promise<LinhaDaRota> {
    const [l] = await this.ctx.db().execute<LinhaDaRota>(sql`
      SELECT r.id, r.codigo, r.nome, r.data::text AS data, r.responsavel_id, m.nome AS responsavel_nome,
        r.partida::text AS partida, r.ponto_partida_id, pp.nome AS ponto_nome,
        ST_Y(pp.localizacao::geometry) AS ponto_lat, ST_X(pp.localizacao::geometry) AS ponto_lon,
        r.voltar_ao_inicio, r.minutos_por_visita, r.situacao::text AS situacao, r.distancia_m, r.duracao_s,
        r.estimativa::text AS estimativa, r.otimizada_em, r.iniciada_em, r.concluida_em,
        CASE WHEN r.trajeto IS NULL THEN NULL
          ELSE (ST_AsGeoJSON(r.trajeto::geometry, 6)::json -> 'coordinates') END AS trajeto
      FROM rotas r JOIN membros m ON m.id = r.responsavel_id
      LEFT JOIN rota_pontos_partida pp ON pp.id = r.ponto_partida_id
      WHERE r.id = ${id} AND r.excluido_em IS NULL`)
    if (!l) throw naoEncontrada()
    return l
  }

  private async linhaVisivel(id: string): Promise<LinhaDaRota> {
    const l = await this.linha(id)
    if (!(await this.permissao.alcanca('rotas.ver', l.responsavel_id))) throw naoEncontrada()
    return l
  }

  /** A rota que a pessoa pode alterar e ainda está aberta (planejada ou em andamento), travada. */
  private async linhaEditavel(id: string): Promise<LinhaDaRota> {
    await this.ctx.db().execute(sql`SELECT 1 FROM rotas WHERE id = ${id} FOR UPDATE`)
    const l = await this.linhaVisivel(id)
    if (!(await this.permissao.alcanca('rotas.editar', l.responsavel_id))) throw semPermissao()
    if (l.situacao === 'concluida' || l.situacao === 'cancelada') {
      throw new ErroApi('rota_fechada', 'Esta rota já foi concluída ou cancelada.', 409)
    }
    return l
  }

  /** O responsável pedido (sem ele, a própria pessoa), conferindo `rotas.editar` e `rotas.atribuir`. */
  private async responsavelPermitido(pedido: string | undefined): Promise<string> {
    const eu = this.ctx.membro.id
    const responsavelId = pedido ?? eu
    if (!this.permissao.pode('rotas.editar')) throw semPermissao()
    if (responsavelId === eu) return eu
    if (
      !this.permissao.pode('rotas.atribuir') ||
      !(await this.permissao.alcanca('rotas.editar', responsavelId))
    ) {
      throw new ErroApi(
        'acesso_negado',
        'Seu perfil de acesso não permite montar rotas para outro vendedor.',
        403,
      )
    }
    const [m] = await this.ctx.db().execute<{ id: string }>(sql`
      SELECT id FROM membros WHERE id = ${responsavelId} AND excluido_em IS NULL AND ativo`)
    if (!m) {
      throw new ErroApi('responsavel_invalido', 'Escolha um membro ativo da equipe.', 400, [
        { campo: 'responsavelId', mensagem: 'Escolha um membro ativo da equipe.' },
      ])
    }
    return responsavelId
  }

  private async pontoDePartida(
    partida: 'posicao_atual' | 'ponto',
    pontoId: string | null | undefined,
  ): Promise<(Coordenada & { id: string }) | null> {
    if (partida !== 'ponto' || !pontoId) return null
    const [p] = await this.ctx.db().execute<{
      id: string
      latitude: number
      longitude: number
    }>(sql`
      SELECT id, ST_Y(localizacao::geometry) AS latitude, ST_X(localizacao::geometry) AS longitude
      FROM rota_pontos_partida WHERE id = ${pontoId} AND excluido_em IS NULL AND ativo`)
    if (!p) {
      throw new ErroApi('ponto_invalido', 'Escolha um ponto de partida ativo.', 400, [
        { campo: 'pontoPartidaId', mensagem: 'Escolha um ponto de partida ativo.' },
      ])
    }
    return p
  }

  private coordenadaDoPonto(l: LinhaDaRota): Coordenada | null {
    return l.ponto_lat !== null && l.ponto_lon !== null
      ? { latitude: l.ponto_lat, longitude: l.ponto_lon }
      : null
  }

  /** Quem o membro alcança com `empresas.ver` (o responsável da rota pode ser outro, com outro perfil). */
  private async carteiraVistaPor(membroId: string): Promise<Responsaveis> {
    if (membroId === this.ctx.membro.id) return (await escopoDaCarteira(this.ctx)).empresas.ver
    const tx = this.ctx.db()
    const [m] = await tx.execute<{ id: string; papel: PapelMembro; perfil_id: string | null }>(sql`
      SELECT id, papel::text AS papel, perfil_id FROM membros WHERE id = ${membroId}`)
    if (!m) return []
    const alcance = (await carregarPermissoes(tx, m)).permissoes['empresas.ver'] as
      Alcance | undefined
    if (alcance === 'todas') return null
    if (alcance === 'propria') return [membroId]
    if (alcance !== 'equipe') return []
    const equipe = await tx.execute<{ id: string }>(sql`
      WITH RECURSIVE equipe(id, caminho) AS (
        SELECT id, ARRAY[id] FROM membros WHERE id = ${membroId}
        UNION ALL
        SELECT m.id, e.caminho || m.id FROM membros m JOIN equipe e ON m.gestor_id = e.id
        WHERE m.excluido_em IS NULL AND NOT m.id = ANY (e.caminho)
      )
      SELECT DISTINCT id FROM equipe`)
    return equipe.map((e) => e.id)
  }

  /**
   * As empresas das paradas, na ordem pedida: com coordenada, não excluídas e vistas por quem monta e pelo
   * responsável da rota. Sem `ignorarInvalidas`, qualquer uma fora da regra recusa o pedido (400).
   */
  private async empresasValidas(
    ids: readonly string[],
    responsavelId: string,
    opcoes: { ignorarInvalidas?: boolean; semConferirAlcance?: boolean } = {},
  ): Promise<EmpresaDaParada[]> {
    if (ids.length === 0) return []
    const linhas = await this.ctx.db().execute<EmpresaDaParada>(sql`
      SELECT id, vendedor_id, ST_Y(localizacao::geometry) AS latitude, ST_X(localizacao::geometry) AS longitude
      FROM empresas
      WHERE id = ANY (${`{${ids.join(',')}}`}::uuid[]) AND excluido_em IS NULL AND localizacao IS NOT NULL`)
    const porId = new Map(linhas.map((l) => [l.id, l]))
    const minhas = opcoes.semConferirAlcance
      ? null
      : (await escopoDaCarteira(this.ctx)).empresas.ver
    const dele = opcoes.semConferirAlcance ? null : await this.carteiraVistaPor(responsavelId)
    const validas: EmpresaDaParada[] = []
    let invalidas = 0
    for (const id of ids) {
      const e = porId.get(id)
      if (e && alcanca(minhas, e.vendedor_id) && alcanca(dele, e.vendedor_id)) validas.push(e)
      else invalidas += 1
    }
    if (invalidas > 0 && !opcoes.ignorarInvalidas) {
      throw new ErroApi(
        'parada_invalida',
        invalidas === 1
          ? 'Uma empresa não pode entrar na rota: está sem posição no mapa ou fora da carteira do responsável.'
          : `${invalidas} empresas não podem entrar na rota: estão sem posição no mapa ou fora da carteira do responsável.`,
        400,
        [
          {
            campo: 'empresaIds',
            mensagem: 'Há empresas sem posição ou fora da carteira do responsável.',
          },
        ],
      )
    }
    if (validas.length > this.config.ROTA_MAX_PARADAS && !opcoes.ignorarInvalidas) {
      throw new ErroApi(
        'paradas_demais',
        `No máximo ${this.config.ROTA_MAX_PARADAS} paradas por rota.`,
        400,
        [{ campo: 'empresaIds', mensagem: `No máximo ${this.config.ROTA_MAX_PARADAS} paradas.` }],
      )
    }
    return validas
  }

  private paradasGravadas(rotaId: string) {
    return this.ctx.db().execute<{ id: string; empresa_id: string; situacao: string }>(sql`
      SELECT id, empresa_id, situacao::text AS situacao FROM rota_paradas
      WHERE rota_id = ${rotaId} AND excluido_em IS NULL ORDER BY ordem`)
  }

  /** Regrava as paradas na ordem dada: as que ficam mantêm a situação; as que saem são excluídas. */
  private async gravarParadas(
    rotaId: string,
    empresas: readonly EmpresaDaParada[],
    atuais: Map<string, { id: string }>,
  ): Promise<void> {
    const db = this.ctx.db()
    const ficam = new Set(empresas.map((e) => e.id))
    const saem = [...atuais.entries()].filter(([empresaId]) => !ficam.has(empresaId))
    if (saem.length > 0) {
      await db.execute(sql`
        UPDATE rota_paradas SET excluido_em = now(), atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
        WHERE id = ANY (${`{${saem.map(([, p]) => p.id).join(',')}}`}::uuid[])`)
    }
    for (const [i, e] of empresas.entries()) {
      const existente = atuais.get(e.id)
      if (existente) {
        await db.execute(sql`
          UPDATE rota_paradas SET ordem = ${i + 1}, atualizado_por = ${this.ctx.membro.id}, atualizado_em = now()
          WHERE id = ${existente.id}`)
      } else {
        await db.insert(schema.rotaParadas).values({
          tenantId: this.ctx.tenantId,
          rotaId,
          empresaId: e.id,
          ordem: i + 1,
          criadoPor: this.ctx.membro.id,
          atualizadoPor: this.ctx.membro.id,
        })
      }
    }
  }

  /**
   * Distâncias e tempos na ordem dada: pelas ruas (OSRM) quando configurado e no ar; senão em linha reta.
   * Sem início (posição atual não informada), o primeiro trecho não existe.
   */
  private async estimar(
    inicio: Coordenada | null,
    paradas: readonly Coordenada[],
    voltar: boolean,
    tentarRuas = true,
  ): Promise<Estimativas> {
    const pontos = [...(inicio ? [inicio] : []), ...paradas, ...(voltar && inicio ? [inicio] : [])]
    let trechos: { distanciaM: number; duracaoS: number }[] | null = null
    let linha: [number, number][] | null = null
    if (this.roteirizador && tentarRuas && pontos.length >= 2) {
      try {
        const t = await this.roteirizador.trajeto(pontos)
        trechos = t.trechos
        linha = t.linha.length >= 2 ? t.linha : null
      } catch (erro) {
        if (!(erro instanceof RoteirizadorIndisponivel)) throw erro
      }
    }
    const estimativa: EstimativaDeRota = trechos ? 'ruas' : 'linha_reta'
    trechos ??= pontos.slice(1).map((p, i) => trechoEstimado(pontos[i] as Coordenada, p))
    const porParada = paradas.map(
      (_, i) => (inicio ? trechos[i] : i === 0 ? null : trechos[i - 1]) ?? null,
    )
    return {
      estimativa,
      distanciaM: trechos.reduce((s, t) => s + t.distanciaM, 0),
      duracaoS: trechos.reduce((s, t) => s + t.duracaoS, 0),
      trechos: porParada,
      linha,
    }
  }

  /** Recalcula e grava as estimativas da rota na ordem atual das paradas. */
  private async recalcular(
    rotaId: string,
    inicio: Coordenada | null,
    opcoes: { otimizada: boolean },
  ): Promise<void> {
    const db = this.ctx.db()
    const [r] = await db.execute<{ voltar: boolean }>(
      sql`SELECT voltar_ao_inicio AS voltar FROM rotas WHERE id = ${rotaId}`,
    )
    const paradas = await db.execute<{ id: string; latitude: number; longitude: number }>(sql`
      SELECT p.id, ST_Y(e.localizacao::geometry) AS latitude, ST_X(e.localizacao::geometry) AS longitude
      FROM rota_paradas p JOIN empresas e ON e.id = p.empresa_id
      WHERE p.rota_id = ${rotaId} AND p.excluido_em IS NULL ORDER BY p.ordem`)
    if (paradas.length === 0) {
      await db.execute(sql`
        UPDATE rotas SET distancia_m = NULL, duracao_s = NULL, estimativa = NULL, trajeto = NULL WHERE id = ${rotaId}`)
      return
    }
    const e = await this.estimar(inicio, paradas, Boolean(r?.voltar))
    for (const [i, p] of paradas.entries()) {
      const t = e.trechos[i]
      await db.execute(sql`
        UPDATE rota_paradas SET distancia_trecho_m = ${t?.distanciaM ?? null}, duracao_trecho_s = ${t?.duracaoS ?? null}
        WHERE id = ${p.id}`)
    }
    const trajeto = e.linha
      ? sql`ST_GeogFromText(${`SRID=4326;LINESTRING(${e.linha.map(([lon, lat]) => `${lon} ${lat}`).join(',')})`})`
      : sql`NULL`
    await db.execute(sql`
      UPDATE rotas SET distancia_m = ${e.distanciaM}, duracao_s = ${e.duracaoS},
        estimativa = ${e.estimativa}::estimativa_rota, trajeto = ${trajeto},
        otimizada_em = ${opcoes.otimizada ? sql`now()` : sql`otimizada_em`}
      WHERE id = ${rotaId}`)
  }

  private async paraDto(l: LinhaDaRota): Promise<Rota> {
    const paradas = await this.ctx.db().execute<{
      id: string
      empresa_id: string
      empresa_nome: string
      bairro: string | null
      cidade: string | null
      uf: string | null
      telefone: string | null
      latitude: number | null
      longitude: number | null
      precisao: 'exata' | 'aproximada' | null
      ordem: number
      distancia_trecho_m: number | null
      duracao_trecho_s: number | null
      situacao: ParadaDaRota['situacao']
      motivo_pulo: string | null
      atividade_id: string | null
      resolvida_em: string | null
    }>(sql`
      SELECT p.id, p.empresa_id, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome, e.bairro,
        mu.nome AS cidade, mu.uf,
        (SELECT t.numero_e164 FROM empresa_telefones t WHERE t.empresa_id = e.id
          ORDER BY t.principal DESC, t.criado_em LIMIT 1) AS telefone,
        ST_Y(e.localizacao::geometry) AS latitude, ST_X(e.localizacao::geometry) AS longitude,
        e.geo_precisao::text AS precisao, p.ordem, p.distancia_trecho_m, p.duracao_trecho_s,
        p.situacao::text AS situacao, p.motivo_pulo, p.atividade_id, p.resolvida_em
      FROM rota_paradas p JOIN empresas e ON e.id = p.empresa_id
      LEFT JOIN municipios mu ON mu.codigo_ibge = e.municipio_codigo
      WHERE p.rota_id = ${l.id} AND p.excluido_em IS NULL ORDER BY p.ordem`)
    const podeEditar =
      l.situacao !== 'concluida' &&
      l.situacao !== 'cancelada' &&
      (await this.permissao.alcanca('rotas.editar', l.responsavel_id))
    return {
      id: l.id,
      codigo: l.codigo,
      nome: l.nome,
      data: l.data,
      responsavel: { id: l.responsavel_id, nome: l.responsavel_nome },
      partida: l.partida,
      pontoPartida:
        l.ponto_partida_id && l.ponto_nome !== null && l.ponto_lat !== null && l.ponto_lon !== null
          ? {
              id: l.ponto_partida_id,
              nome: l.ponto_nome,
              latitude: l.ponto_lat,
              longitude: l.ponto_lon,
            }
          : null,
      voltarAoInicio: l.voltar_ao_inicio,
      minutosPorVisita: l.minutos_por_visita,
      situacao: l.situacao,
      distanciaM: l.distancia_m,
      duracaoS: l.duracao_s,
      estimativa: l.estimativa,
      otimizadaEm: iso(l.otimizada_em),
      trajeto: l.trajeto,
      iniciadaEm: iso(l.iniciada_em),
      concluidaEm: iso(l.concluida_em),
      podeEditar,
      paradas: paradas.map((p) => ({
        id: p.id,
        empresaId: p.empresa_id,
        empresaNome: p.empresa_nome,
        bairro: p.bairro,
        cidade: p.cidade,
        uf: p.uf,
        telefone: p.telefone,
        latitude: p.latitude,
        longitude: p.longitude,
        precisao: p.precisao,
        ordem: p.ordem,
        distanciaTrechoM: p.distancia_trecho_m,
        duracaoTrechoS: p.duracao_trecho_s,
        situacao: p.situacao,
        motivoPulo: p.motivo_pulo,
        atividadeId: p.atividade_id,
        resolvidaEm: iso(p.resolvida_em),
      })),
    }
  }
}

type Banco = ReturnType<ContextoTenantService['db']>

/** Primeira parada resolvida põe a rota em andamento; nenhuma pendente a conclui. */
export async function atualizarAndamento(
  db: Banco,
  rotaId: string,
  membroId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE rotas r SET
      situacao = CASE
        WHEN NOT EXISTS (SELECT 1 FROM rota_paradas p WHERE p.rota_id = r.id AND p.excluido_em IS NULL AND p.situacao = 'pendente')
          THEN 'concluida'::situacao_rota
        ELSE 'em_andamento'::situacao_rota END,
      iniciada_em = coalesce(r.iniciada_em, now()),
      concluida_em = CASE
        WHEN NOT EXISTS (SELECT 1 FROM rota_paradas p WHERE p.rota_id = r.id AND p.excluido_em IS NULL AND p.situacao = 'pendente')
          THEN now() ELSE NULL END,
      atualizado_por = ${membroId}, atualizado_em = now()
    WHERE r.id = ${rotaId} AND r.situacao IN ('planejada', 'em_andamento')`)
}

/**
 * Check-in (G3b) numa empresa que é parada pendente da rota de HOJE do mesmo vendedor: a visita se liga à
 * parada e a rota fica em andamento. Vale também para o check-in feito sem sinal (a fila sobe depois), por
 * isso a data é a do check-in, no fuso da empresa.
 */
export async function ligarVisitaAParada(
  db: Banco,
  dados: { empresaId: string; responsavelId: string; atividadeId: string; quando: Date },
): Promise<void> {
  const [p] = await db.execute<{ id: string; rota_id: string }>(sql`
    SELECT p.id, p.rota_id FROM rota_paradas p JOIN rotas r ON r.id = p.rota_id
    WHERE p.empresa_id = ${dados.empresaId} AND p.excluido_em IS NULL AND p.situacao = 'pendente'
      AND p.atividade_id IS NULL AND r.excluido_em IS NULL AND r.responsavel_id = ${dados.responsavelId}
      AND r.situacao IN ('planejada', 'em_andamento')
      AND r.data = (${dados.quando.toISOString()}::timestamptz AT TIME ZONE ${FUSO_PADRAO})::date
    ORDER BY r.codigo LIMIT 1 FOR UPDATE OF p`)
  if (!p) return
  await db.execute(sql`
    UPDATE rota_paradas SET atividade_id = ${dados.atividadeId}, atualizado_em = now() WHERE id = ${p.id}`)
  await db.execute(sql`
    UPDATE rotas SET situacao = 'em_andamento', iniciada_em = coalesce(iniciada_em, now()), atualizado_em = now()
    WHERE id = ${p.rota_id} AND situacao = 'planejada'`)
}

/** Relatório concluído (G3b): a parada ligada à visita fica visitada, e a rota anda (ou termina). */
export async function concluirParadaDaVisita(
  db: Banco,
  atividadeId: string,
  membroId: string,
): Promise<void> {
  const [p] = await db.execute<{ id: string; rota_id: string }>(sql`
    UPDATE rota_paradas SET situacao = 'visitada', resolvida_em = now(), atualizado_por = ${membroId},
      atualizado_em = now()
    WHERE atividade_id = ${atividadeId} AND excluido_em IS NULL AND situacao = 'pendente'
    RETURNING id, rota_id`)
  if (p) await atualizarAndamento(db, p.rota_id, membroId)
}
