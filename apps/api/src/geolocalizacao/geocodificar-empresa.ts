import { CHAVE_TAG_ENDERECO_A_CONFIRMAR, type Conexao, sql } from '@leadtogo/db'
import { textoDoEndereco } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { gravarDiferencaDeTags, tagsAtuaisDaEmpresa } from '../carteira/empresa-tags.js'
import { obterDoCache, registrarConsultas } from './consultas-geo.js'
import { type DependenciasDaGeocodificacao, geocodificar } from './geocodificador.js'
import { ProvedorCep } from './provedor-cep.js'
import { ProvedorCnefe } from './provedor-cnefe.js'
import { ProvedorNominatim } from './provedor-nominatim.js'
import type { EnderecoParaGeocodificar, ResultadoDaGeocodificacao } from './tipos.js'

/** O que o worker precisa para geocodificar (os provedores vêm da configuração). */
export interface ServicosDeGeo {
  banco: Conexao
  nominatim: ProvedorNominatim | null
  cep: ProvedorCep
  /** Dias de validade do cache das consultas externas */
  diasDeCache: number
  /** Troca das dependências (testes) */
  dependencias?: (tenantId: string) => DependenciasDaGeocodificacao
}

export type DesfechoDaEmpresa =
  | 'exata'
  | 'aproximada'
  | 'a_confirmar'
  /** Já tinha coordenada e o pedido não é de refazer */
  | 'ja_tinha'
  /** Posição ajustada à mão: nunca é sobrescrita pelo sistema */
  | 'preservada'
  /** Excluída, no exterior ou com o endereço alterado durante a consulta (um novo evento cuida) */
  | 'ignorada'
  /** Provedores fora do ar: tenta de novo depois */
  | 'indisponivel'

export interface PedidoDeGeocodificacao {
  tenantId: string
  empresaId: string
  /** `membros.id`; nulo = o sistema (automático ou lote) */
  acionadoPor: string | null
  loteId: string | null
  /** Refazer também quem já tem coordenada (o ajuste manual continua preservado) */
  refazerComCoordenada: boolean
}

interface EmpresaLida extends EnderecoParaGeocodificar {
  ajusteManual: boolean
  temCoordenada: boolean
}

const noTenant = <T>(banco: Conexao, tenantId: string, fn: (tx: Transacao) => Promise<T>) =>
  banco.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    return fn(tx)
  })

async function lerEmpresa(
  tx: Transacao,
  empresaId: string,
  travar: boolean,
): Promise<EmpresaLida | null> {
  const [e] = await tx.execute<{
    cep: string | null
    tipo_logradouro: string | null
    logradouro: string | null
    numero: string | null
    bairro: string | null
    municipio_codigo: number | null
    municipio_nome: string | null
    geo_ajuste_manual: boolean
    tem_coordenada: boolean
  }>(sql`
    SELECT e.cep, e.tipo_logradouro, e.logradouro, e.numero, e.bairro, e.municipio_codigo,
           m.nome AS municipio_nome, e.geo_ajuste_manual, e.localizacao IS NOT NULL AS tem_coordenada
    FROM empresas e LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
    WHERE e.id = ${empresaId} AND e.excluido_em IS NULL AND e.pais_codigo IS NULL
    ${travar ? sql`FOR UPDATE OF e` : sql``}`)
  if (!e) return null
  return {
    cep: e.cep,
    tipoLogradouro: e.tipo_logradouro,
    logradouro: e.logradouro,
    numero: e.numero,
    bairro: e.bairro,
    municipioCodigo: e.municipio_codigo,
    municipioNome: e.municipio_nome,
    ajusteManual: e.geo_ajuste_manual,
    temCoordenada: e.tem_coordenada,
  }
}

const mesmoEndereco = (a: EnderecoParaGeocodificar, b: EnderecoParaGeocodificar): boolean =>
  textoDoEndereco(a, a.municipioNome) === textoDoEndereco(b, b.municipioNome) &&
  a.municipioCodigo === b.municipioCodigo

function dependenciasReais(svc: ServicosDeGeo, tenantId: string): DependenciasDaGeocodificacao {
  return {
    cnefe: new ProvedorCnefe(svc.banco.db),
    nominatim: svc.nominatim,
    cep: svc.cep,
    cache: {
      obter: (provedor, consulta) =>
        noTenant(svc.banco, tenantId, (tx) =>
          obterDoCache(tx, provedor, consulta, svc.diasDeCache),
        ),
    },
  }
}

/** Id da tag de sistema "Endereço a confirmar" do tenant (nulo se o cadastro padrão ainda não a criou). */
async function tagEnderecoAConfirmar(tx: Transacao): Promise<string | null> {
  const [t] = await tx.execute<{ id: string }>(sql`
    SELECT id FROM tags WHERE chave_sistema = ${CHAVE_TAG_ENDERECO_A_CONFIRMAR} AND excluido_em IS NULL`)
  return t?.id ?? null
}

async function aplicarResultado(
  tx: Transacao,
  pedido: PedidoDeGeocodificacao,
  resultado: ResultadoDaGeocodificacao,
): Promise<DesfechoDaEmpresa> {
  const { tenantId, empresaId } = pedido
  const tagId = await tagEnderecoAConfirmar(tx)
  const atuais = await tagsAtuaisDaEmpresa(tx, empresaId)
  const comTag = new Set(atuais)
  let desfecho: DesfechoDaEmpresa

  if (resultado.situacao === 'posicionada') {
    const p = resultado.posicao
    await tx.execute(sql`
      UPDATE empresas SET
        localizacao = ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography,
        geo_precisao = ${p.precisao}::geo_precisao,
        geo_aproximacao = ${p.aproximacao}::geo_aproximacao,
        geo_origem = ${p.origem}::geo_origem,
        geo_endereco_consultado = ${p.consultado},
        geo_atualizado_em = now()
      WHERE id = ${empresaId} AND NOT geo_ajuste_manual`)
    if (tagId) comTag.delete(tagId)
    desfecho = p.precisao
  } else if (resultado.situacao === 'a_confirmar') {
    // Nenhuma empresa incompleta vira pin: sai do mapa e entra na fila "Confirmar endereço"
    await tx.execute(sql`
      UPDATE empresas SET localizacao = NULL, geo_precisao = NULL, geo_aproximacao = NULL,
        geo_origem = NULL, geo_endereco_consultado = NULL, geo_atualizado_em = now()
      WHERE id = ${empresaId} AND NOT geo_ajuste_manual`)
    if (tagId) comTag.add(tagId)
    desfecho = 'a_confirmar'
  } else {
    return 'indisponivel'
  }
  if (tagId) {
    await gravarDiferencaDeTags(tx, tenantId, empresaId, atuais, comTag, pedido.acionadoPor)
  }
  return desfecho
}

/**
 * Geocodifica UMA empresa (automática ou do lote): lê o endereço, roda a cascata SEM segurar conexão do
 * banco (a rede e o CNEFE ficam fora da transação), e grava o resultado, as consultas e a tag "Endereço
 * a confirmar" numa transação curta. Idempotente: repetir não muda nada além da data.
 */
export async function geocodificarEmpresa(
  svc: ServicosDeGeo,
  pedido: PedidoDeGeocodificacao,
): Promise<DesfechoDaEmpresa> {
  const { tenantId, empresaId } = pedido
  const lida = await noTenant(svc.banco, tenantId, (tx) => lerEmpresa(tx, empresaId, false))
  if (!lida) return 'ignorada'
  if (lida.ajusteManual) return 'preservada'
  if (lida.temCoordenada && !pedido.refazerComCoordenada) return 'ja_tinha'

  const dep = svc.dependencias?.(tenantId) ?? dependenciasReais(svc, tenantId)
  const resultado = await geocodificar(lida, dep)

  return noTenant(svc.banco, tenantId, async (tx) => {
    const agora = await lerEmpresa(tx, empresaId, true)
    // Excluída, no exterior, ajustada à mão ou com o endereço trocado durante a consulta: não grava
    // (se o endereço mudou, o evento da alteração já agendou outra geocodificação)
    if (!agora || agora.ajusteManual || !mesmoEndereco(lida, agora)) return 'ignorada'
    await registrarConsultas(
      tx,
      { tenantId, empresaId, loteId: pedido.loteId, acionadoPor: pedido.acionadoPor },
      resultado.consultas,
    )
    return aplicarResultado(tx, pedido, resultado)
  })
}
