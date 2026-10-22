import { CHAVE_TAG_ENDERECO_A_CONFIRMAR, sql } from '@leadtogo/db'
import {
  type AjustarPosicao,
  type ConfirmarEndereco,
  type ConsultaDaFila,
  faltasNoEndereco,
  type ListaDaFila,
  type PosicaoDaEmpresa,
  type ResumoDaGeolocalizacao,
  textoDoEndereco,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { gravarDiferencaDeTags, tagsAtuaisDaEmpresa } from '../carteira/empresa-tags.js'
import {
  condicaoDeResponsaveis,
  escopoDaCarteira,
  podeEditar,
  podeVer,
} from '../carteira/regras-de-carteira.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { agendarGeocodificacao, invalidarCoordenada } from './evento.js'
import { coordenadasDaEmpresa, type DadosDaPosicao, montarPosicao } from './posicao.js'
import { ProvedorCnefe } from './provedor-cnefe.js'

/** O Brasil cabe nesta caixa; ponto fora dela é erro de digitação ou de toque no mapa. */
const CAIXA_DO_BRASIL = { sul: -34, norte: 6, oeste: -74, leste: -33 }

type LinhaDaEmpresa = {
  vendedor_id: string
  cep: string | null
  tipo_logradouro: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  municipio_codigo: number | null
  municipio_nome: string | null
  pais_codigo: number | null
  geo_precisao: DadosDaPosicao['geoPrecisao']
  geo_aproximacao: DadosDaPosicao['geoAproximacao']
  geo_origem: DadosDaPosicao['geoOrigem']
  geo_endereco_consultado: string | null
  geo_ajuste_manual: boolean
  geo_atualizado_em: Date | string | null
  centro_lat?: number | null
  centro_lon?: number | null
}

/** Posição das empresas: ajustar o pin, confirmar o endereço, refazer, resumo e fila "Confirmar endereço". */
@Injectable()
export class GeolocalizacaoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  private async carregar(empresaId: string): Promise<LinhaDaEmpresa> {
    const escopo = await escopoDaCarteira(this.ctx)
    const [e] = await this.ctx.db().execute<LinhaDaEmpresa>(sql`
      SELECT e.vendedor_id, e.cep, e.tipo_logradouro, e.logradouro, e.numero, e.bairro, e.municipio_codigo,
             m.nome AS municipio_nome, e.pais_codigo, e.geo_precisao, e.geo_aproximacao, e.geo_origem,
             e.geo_endereco_consultado, e.geo_ajuste_manual, e.geo_atualizado_em
      FROM empresas e LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
      WHERE e.id = ${empresaId} AND e.excluido_em IS NULL
      FOR UPDATE OF e`)
    if (!e || !podeVer(escopo, e.vendedor_id)) {
      throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    }
    if (!podeEditar(escopo, e.vendedor_id)) {
      throw new ErroApi('acesso_negado', 'Você só edita empresas da sua carteira.', 403)
    }
    return e
  }

  private dados(e: LinhaDaEmpresa): DadosDaPosicao {
    return {
      cep: e.cep,
      tipoLogradouro: e.tipo_logradouro,
      logradouro: e.logradouro,
      numero: e.numero,
      bairro: e.bairro,
      municipioCodigo: e.municipio_codigo,
      municipioNome: e.municipio_nome,
      paisCodigo: e.pais_codigo,
      geoPrecisao: e.geo_precisao,
      geoAproximacao: e.geo_aproximacao,
      geoOrigem: e.geo_origem,
      geoEnderecoConsultado: e.geo_endereco_consultado,
      geoAjusteManual: e.geo_ajuste_manual,
      geoAtualizadoEm: e.geo_atualizado_em,
    }
  }

  private async tagAConfirmar(): Promise<string | null> {
    const [t] = await this.ctx.db().execute<{ id: string }>(sql`
      SELECT id FROM tags WHERE chave_sistema = ${CHAVE_TAG_ENDERECO_A_CONFIRMAR} AND excluido_em IS NULL`)
    return t?.id ?? null
  }

  /** Tira (ou põe) a tag de sistema "Endereço a confirmar" da empresa. */
  private async mudarTag(empresaId: string, aplicar: boolean): Promise<void> {
    const tagId = await this.tagAConfirmar()
    if (!tagId) return
    const db = this.ctx.db()
    const atuais = await tagsAtuaisDaEmpresa(db, empresaId)
    const finais = new Set(atuais)
    if (aplicar) finais.add(tagId)
    else finais.delete(tagId)
    await gravarDiferencaDeTags(
      db,
      this.ctx.tenantId,
      empresaId,
      atuais,
      finais,
      this.ctx.membro.id,
    )
  }

  async posicao(empresaId: string): Promise<PosicaoDaEmpresa> {
    const db = this.ctx.db()
    const [e] = await db.execute<LinhaDaEmpresa>(sql`
      SELECT e.vendedor_id, e.cep, e.tipo_logradouro, e.logradouro, e.numero, e.bairro, e.municipio_codigo,
             m.nome AS municipio_nome, e.pais_codigo, e.geo_precisao, e.geo_aproximacao, e.geo_origem,
             e.geo_endereco_consultado, e.geo_ajuste_manual, e.geo_atualizado_em,
             ST_Y(m.localizacao) AS centro_lat, ST_X(m.localizacao) AS centro_lon
      FROM empresas e LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
      WHERE e.id = ${empresaId} AND e.excluido_em IS NULL`)
    const escopo = await escopoDaCarteira(this.ctx)
    if (!e || !podeVer(escopo, e.vendedor_id)) {
      throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    }
    const tagId = await this.tagAConfirmar()
    const comTag = tagId ? (await tagsAtuaisDaEmpresa(db, empresaId)).has(tagId) : false
    return montarPosicao(
      this.dados(e),
      await coordenadasDaEmpresa(db, empresaId),
      comTag,
      e.centro_lat != null && e.centro_lon != null
        ? { latitude: e.centro_lat, longitude: e.centro_lon }
        : null,
    )
  }

  /**
   * "Ajustar posição": o usuário arrasta o pin e confirma. A posição vira exata de origem `manual`,
   * é preservada (nenhuma geocodificação a sobrescreve), a tag "Endereço a confirmar" sai e a "visita
   * tentada" do mapa também (o endereço foi confirmado).
   */
  async ajustar(empresaId: string, p: AjustarPosicao): Promise<PosicaoDaEmpresa> {
    if (
      p.latitude < CAIXA_DO_BRASIL.sul ||
      p.latitude > CAIXA_DO_BRASIL.norte ||
      p.longitude < CAIXA_DO_BRASIL.oeste ||
      p.longitude > CAIXA_DO_BRASIL.leste
    ) {
      throw new ErroApi('fora_do_brasil', 'Essa posição está fora do Brasil.', 400, [
        { campo: 'latitude', mensagem: 'Escolha um ponto dentro do Brasil.' },
      ])
    }
    const e = await this.carregar(empresaId)
    const texto = textoDoEndereco(this.dados(e), e.municipio_nome)
    await this.ctx.db().execute(sql`
      UPDATE empresas SET localizacao = ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography,
        geo_precisao = 'exata', geo_aproximacao = NULL, geo_origem = 'manual', geo_ajuste_manual = true,
        geo_endereco_consultado = ${texto}, geo_atualizado_em = now(), visita_tentada_em = NULL,
        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${empresaId}`)
    await this.mudarTag(empresaId, false)
    await this.auditoria.registrar({
      entidade: 'empresa',
      entidadeId: empresaId,
      acao: 'ajustar_posicao',
      alteracoes: { origem: e.geo_origem, para: 'manual' },
    })
    return this.posicao(empresaId)
  }

  /**
   * Depois que o endereço mudou numa empresa com posição ajustada à mão: `manter_posicao` guarda a
   * posição (o aviso some) e `refazer` descarta o ajuste e geocodifica o endereço novo.
   */
  async confirmarEndereco(empresaId: string, dados: ConfirmarEndereco): Promise<PosicaoDaEmpresa> {
    const e = await this.carregar(empresaId)
    const texto = textoDoEndereco(this.dados(e), e.municipio_nome)
    if (dados.acao === 'manter_posicao') {
      if (e.geo_ajuste_manual) {
        await this.ctx
          .db()
          .execute(
            sql`UPDATE empresas SET geo_endereco_consultado = ${texto} WHERE id = ${empresaId}`,
          )
      }
    } else {
      await this.ctx.db().execute(sql`
        UPDATE empresas SET geo_ajuste_manual = false, localizacao = NULL, geo_precisao = NULL,
          geo_aproximacao = NULL, geo_origem = NULL, geo_endereco_consultado = NULL, geo_atualizado_em = now()
        WHERE id = ${empresaId}`)
      await agendarGeocodificacao(this.ctx.db(), this.ctx.tenantId, empresaId)
    }
    await this.auditoria.registrar({
      entidade: 'empresa',
      entidadeId: empresaId,
      acao: 'confirmar_endereco',
      alteracoes: { acao: dados.acao },
    })
    return this.posicao(empresaId)
  }

  /** Refaz a geocodificação (o worker faz); a posição ajustada à mão não é tocada. */
  async geocodificarDeNovo(empresaId: string): Promise<PosicaoDaEmpresa> {
    const e = await this.carregar(empresaId)
    if (e.pais_codigo !== null) {
      throw new ErroApi('empresa_no_exterior', 'Empresa no exterior não é geocodificada.', 409)
    }
    if (e.geo_ajuste_manual) {
      throw new ErroApi(
        'posicao_ajustada',
        'A posição foi ajustada à mão. Confirme o endereço para refazer.',
        409,
      )
    }
    await invalidarCoordenada(this.ctx.db(), empresaId)
    await agendarGeocodificacao(this.ctx.db(), this.ctx.tenantId, empresaId)
    return this.posicao(empresaId)
  }

  async resumo(): Promise<ResumoDaGeolocalizacao> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [c] = await db.execute<{
      total: number
      exatas: number
      aproximadas: number
      sem: number
      a_confirmar: number
      manuais: number
    }>(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE e.localizacao IS NOT NULL AND e.geo_precisao = 'exata')::int AS exatas,
             count(*) FILTER (WHERE e.localizacao IS NOT NULL AND e.geo_precisao <> 'exata')::int AS aproximadas,
             count(*) FILTER (WHERE e.localizacao IS NULL AND NOT EXISTS (
               SELECT 1 FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
               WHERE et.empresa_id = e.id AND t.chave_sistema = ${CHAVE_TAG_ENDERECO_A_CONFIRMAR}))::int AS sem,
             count(*) FILTER (WHERE e.localizacao IS NULL AND EXISTS (
               SELECT 1 FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
               WHERE et.empresa_id = e.id AND t.chave_sistema = ${CHAVE_TAG_ENDERECO_A_CONFIRMAR}))::int AS a_confirmar,
             count(*) FILTER (WHERE e.geo_ajuste_manual)::int AS manuais
      FROM empresas e
      WHERE e.excluido_em IS NULL AND e.pais_codigo IS NULL
        AND ${condicaoDeResponsaveis(escopo.empresas.ver, sql`e.vendedor_id`) ?? sql`true`}`)
    return {
      cnefeCarregado: await new ProvedorCnefe(db).carregado(),
      uf: this.config.GEO_UF.toUpperCase(),
      nominatimConfigurado: Boolean(this.config.NOMINATIM_URL),
      totalEmpresas: c?.total ?? 0,
      exatas: c?.exatas ?? 0,
      aproximadas: c?.aproximadas ?? 0,
      semCoordenada: c?.sem ?? 0,
      aConfirmar: c?.a_confirmar ?? 0,
      ajustadasAMao: c?.manuais ?? 0,
    }
  }

  /** Fila "Confirmar endereço": as empresas com a tag, com o que falta; o vendedor vê só as suas. */
  async fila(consulta: ConsultaDaFila): Promise<ListaDaFila> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const visivel = sql`AND ${condicaoDeResponsaveis(escopo.empresas.ver, sql`e.vendedor_id`) ?? sql`true`}`
    const base = sql`
      FROM empresas e
      JOIN empresa_tags et ON et.empresa_id = e.id
      JOIN tags t ON t.id = et.tag_id AND t.chave_sistema = ${CHAVE_TAG_ENDERECO_A_CONFIRMAR}
      LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
      JOIN membros v ON v.id = e.vendedor_id
      WHERE e.excluido_em IS NULL AND e.pais_codigo IS NULL ${visivel}`
    const [t] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n ${base}`)
    const linhas = await db.execute<{
      id: string
      nome: string
      cep: string | null
      tipo_logradouro: string | null
      logradouro: string | null
      numero: string | null
      bairro: string | null
      municipio_codigo: number | null
      municipio_nome: string | null
      vendedor: string
    }>(sql`
      SELECT e.id, coalesce(e.nome_fantasia, e.razao_social) AS nome, e.cep, e.tipo_logradouro,
             e.logradouro, e.numero, e.bairro, e.municipio_codigo, m.nome AS municipio_nome, v.nome AS vendedor
      ${base}
      ORDER BY et.aplicada_em DESC, e.id
      LIMIT ${consulta.porPagina} OFFSET ${(consulta.pagina - 1) * consulta.porPagina}`)
    return {
      itens: linhas.map((l) => ({
        empresaId: l.id,
        nome: l.nome,
        endereco:
          textoDoEndereco(
            {
              tipoLogradouro: l.tipo_logradouro,
              logradouro: l.logradouro,
              numero: l.numero,
              bairro: l.bairro,
            },
            null,
          ) || 'Sem endereço',
        municipio: l.municipio_nome,
        cep: l.cep,
        faltas: faltasNoEndereco({
          logradouro: l.logradouro,
          numero: l.numero,
          bairro: l.bairro,
          municipioCodigo: l.municipio_codigo,
        }),
        vendedor: l.vendedor,
      })),
      total: t?.n ?? 0,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    }
  }
}
