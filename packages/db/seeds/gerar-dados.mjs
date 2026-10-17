#!/usr/bin/env node
// Gera os arquivos de seeds/dados/*.json a partir das fontes oficiais. Uso MANUAL, só para
// atualizar os dados (os arquivos gerados são versionados); o `pnpm db:seed` nunca baixa nada.
//   node packages/db/seeds/gerar-dados.mjs [estados] [paises] [portes] [qualificacoes] [cnaes] [municipios] [microrregioes]
// Sem argumentos, gera tudo. Fontes, URLs e datas: seeds/dados/README.md.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const DESTINO = fileURLToPath(new URL('./dados/', import.meta.url))
const IBGE = 'https://servicodados.ibge.gov.br/api'
const URL_TESOURO =
  'https://www.tesourotransparente.gov.br/ckan/dataset/abb968cb-3710-4f85-89cf-875c91b9c7f6/resource/eebb3bc6-9eea-4496-8bcf-304f33155282/download/tabmun.csv'

// DADOS_LOCAIS=<pasta> lê as respostas já baixadas (nomes em `local`) em vez de ir à internet.
const LOCAIS = process.env['DADOS_LOCAIS']

async function buscar(url, tipo = 'json', local = url.split('/').pop()) {
  if (LOCAIS) {
    const bruto = await readFile(`${LOCAIS}/${local}`, tipo === 'latin1' ? 'latin1' : 'utf8')
    return tipo === 'json' ? JSON.parse(bruto) : bruto
  }
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error(`${url}: HTTP ${resposta.status}`)
  if (tipo === 'json') return resposta.json()
  if (tipo === 'latin1') return new TextDecoder('latin1').decode(await resposta.arrayBuffer())
  return resposta.text()
}

async function gravar(nome, dados) {
  await mkdir(DESTINO, { recursive: true })
  await writeFile(`${DESTINO}${nome}.json`, `${JSON.stringify(dados, null, 2)}\n`)
  console.log(`${nome}.json: ${dados.length} registros`)
}

// Centro de cada município a partir da malha do IBGE: centroide ponderado pela área do maior polígono
// (os anéis internos são ignorados). Serve só para posicionar números no mapa, não para medir distância.
function centroideDoAnel(anel) {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i]
    const [x2, y2] = anel[i + 1]
    const f = x1 * y2 - x2 * y1
    area += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  if (area === 0) return { area: 0, x: anel[0][0], y: anel[0][1] }
  return { area: Math.abs(area / 2), x: cx / (3 * area), y: cy / (3 * area) }
}

function centroDaMalha(geometria) {
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates
  let melhor = null
  for (const poligono of poligonos) {
    const c = centroideDoAnel(poligono[0])
    if (!melhor || c.area > melhor.area) melhor = c
  }
  return melhor
}

const ufDe = (m) =>
  m.microrregiao
    ? m.microrregiao.mesorregiao.UF.sigla
    : m['regiao-imediata']['regiao-intermediaria'].UF.sigla

const geradores = {
  async estados() {
    const lista = await buscar(`${IBGE}/v1/localidades/estados`, 'json', 'estados.json')
    await gravar(
      'estados',
      lista
        .map((e) => ({ uf: e.sigla, nome: e.nome, regiao: e.regiao.nome }))
        .sort((a, b) => a.uf.localeCompare(b.uf)),
    )
  },

  // Países da Receita Federal (dados abertos do CNPJ, arquivo Paises): código numérico da Receita
  // (Brasil = 105) e nome. O CSV foi baixado à mão (ver seeds/dados/README.md) e fica em seeds/fontes/.
  // Formato: separador `;`, Latin-1, código e nome entre aspas.
  async paises() {
    const csv = await readFile(`${DESTINO}../fontes/paises_receita_2026-09.csv`, 'latin1')
    const paises = csv
      .split(/\r?\n/)
      .filter((linha) => linha.trim() !== '')
      .map((linha) => {
        const [codigo, nome] = linha.split(';').map((c) => c.replace(/^"|"$/g, '').trim())
        if (!/^\d{3}$/.test(codigo ?? '') || !nome)
          throw new Error(`Linha inválida em Paises: ${linha}`)
        return { codigo: Number(codigo), nome }
      })
      .sort((a, b) => a.codigo - b.codigo)
    if (new Set(paises.map((p) => p.codigo)).size !== paises.length)
      throw new Error('Códigos de país repetidos')
    if (paises.find((p) => p.codigo === 105)?.nome !== 'BRASIL')
      throw new Error('Brasil (105) não encontrado')
    await gravar('paises', paises)
  },

  // Layout dos dados abertos do CNPJ (Receita Federal): campo "porte da empresa"
  async portes() {
    await gravar('portes', [
      { codigo: 0, descricao: 'Não informado' },
      { codigo: 1, descricao: 'Micro Empresa' },
      { codigo: 3, descricao: 'Empresa de Pequeno Porte' },
      { codigo: 5, descricao: 'Demais' },
    ])
  },

  // CNAE 2.x: subclasses (7 dígitos) com a hierarquia seção > divisão > grupo > classe (IBGE/CONCLA)
  async cnaes() {
    const lista = await buscar(`${IBGE}/v2/cnae/subclasses`, 'json', 'subclasses.json')
    await gravar(
      'cnaes',
      lista
        .map((s) => ({
          codigo: Number(s.id),
          descricao: s.descricao,
          secao: s.classe.grupo.divisao.secao.id,
          divisao: s.classe.grupo.divisao.id,
          grupo: s.classe.grupo.id,
          classe: s.classe.id,
        }))
        .sort((a, b) => a.codigo - b.codigo),
    )
  },

  // Municípios: IBGE (nome, UF e código IBGE) + código SIAFI/TOM (o que a Receita usa), da tabela
  // oficial do Tesouro Nacional que traz os dois códigos juntos. O cruzamento é pelo código IBGE
  // (exato; não precisa casar nomes). O que o Tesouro não tem vai em municipios_correcoes.json.
  async municipios() {
    const ibge = await buscar(`${IBGE}/v1/localidades/municipios`, 'json', 'municipios.json')
    const tesouro = await buscar(URL_TESOURO, 'latin1', 'tabmun.csv')
    const correcoes = JSON.parse(await readFile(`${DESTINO}municipios_correcoes.json`, 'utf8'))
    const malha = await buscar(
      `${IBGE}/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=minima&formato=application/vnd.geo+json`,
      'json',
      'malha_municipios.json',
    )
    const centros = new Map(
      malha.features.map((f) => [Number(f.properties.codarea), centroDaMalha(f.geometry)]),
    )

    // tabmun.csv: SIAFI;CNPJ da prefeitura;NOME;UF;IBGE (a linha "DEMAIS MUNICIPIOS" tem IBGE 0)
    const siafiPorIbge = new Map()
    for (const linha of tesouro.split(/\r?\n/)) {
      const [siafi, , , , ibgeCodigo] = linha.split(';')
      if (!ibgeCodigo || Number(ibgeCodigo) === 0) continue
      if (siafiPorIbge.has(Number(ibgeCodigo)))
        throw new Error(`IBGE ${ibgeCodigo} repetido no Tesouro`)
      siafiPorIbge.set(Number(ibgeCodigo), Number(siafi))
    }
    const manuais = new Map(correcoes.map((c) => [c.codigo_ibge, c.codigo_siafi]))

    let corrigidos = 0
    const municipios = ibge
      .map((m) => {
        const uf = ufDe(m)
        let siafi = siafiPorIbge.get(m.id)
        if (siafi === undefined) {
          siafi = manuais.get(m.id)
          if (siafi === undefined)
            throw new Error(
              `Sem código SIAFI para ${m.nome}/${uf} (${m.id}): acrescente em municipios_correcoes.json`,
            )
          corrigidos += 1
        }
        const centro = centros.get(m.id)
        return {
          codigo_ibge: m.id,
          codigo_siafi: siafi,
          nome: m.nome,
          uf,
          microrregiao_codigo: m.microrregiao?.id ?? null,
          longitude: centro ? Number(centro.x.toFixed(5)) : null,
          latitude: centro ? Number(centro.y.toFixed(5)) : null,
        }
      })
      .sort((a, b) => a.codigo_ibge - b.codigo_ibge)

    const repetidos = municipios.length - new Set(municipios.map((m) => m.codigo_siafi)).size
    if (repetidos > 0) throw new Error(`${repetidos} códigos SIAFI repetidos`)
    console.log(`${corrigidos} município(s) vieram de municipios_correcoes.json`)
    await gravar('municipios', municipios)
  },

  // Microrregiões oficiais do IBGE (usadas como regiões prontas na geolocalização)
  async microrregioes() {
    const ibge = await buscar(`${IBGE}/v1/localidades/municipios`, 'json', 'municipios.json')
    const porCodigo = new Map()
    for (const m of ibge) {
      if (!m.microrregiao) continue
      porCodigo.set(m.microrregiao.id, {
        codigo: m.microrregiao.id,
        nome: m.microrregiao.nome,
        uf: m.microrregiao.mesorregiao.UF.sigla,
      })
    }
    await gravar(
      'microrregioes',
      [...porCodigo.values()].sort((a, b) => a.codigo - b.codigo),
    )
  },

  // Tabela de qualificações do responsável/sócio da Receita, no CSV do projeto socios-brasil
  async qualificacoes() {
    const csv = await buscar(
      'https://raw.githubusercontent.com/turicas/socios-brasil/HEAD/qualificacao-socio.csv',
      'texto',
    )
    const linhas = csv.trim().split('\n').slice(1)
    await gravar(
      'qualificacoes_socio',
      linhas.map((l) => {
        const [codigo, ...resto] = l.trim().split(',')
        // a descrição pode ter vírgula; a última coluna é "coletado_atualmente"
        const descricao = resto.slice(0, -1).join(',')
        return { codigo: Number(codigo), descricao }
      }),
    )
  },
}

const pedidos = process.argv.slice(2)
const alvos = pedidos.length > 0 ? pedidos : Object.keys(geradores)
for (const alvo of alvos) {
  const gerar = geradores[alvo]
  if (!gerar)
    throw new Error(`Alvo desconhecido: ${alvo}. Opções: ${Object.keys(geradores).join(', ')}`)
  await gerar()
}
