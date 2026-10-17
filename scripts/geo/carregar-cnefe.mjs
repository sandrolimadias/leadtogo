#!/usr/bin/env node
// Carrega o CNEFE 2022 do IBGE em `referencia_geo` (cnefe_enderecos e cnefe_logradouros).
// Preparo pesado: rode no SEU ambiente (ou na VPS só se a carga for pequena), nunca como parte do deploy.
// Passo a passo, tempos e como recarregar depois de uma restauração: docs/geo_atualizacao.md.
//
//   pnpm --filter @leadtogo/shared build        # uma vez (o script usa a normalização do dist)
//   DATABASE_MIGRATION_URL="$URL_DO_OWNER" \
//     node scripts/geo/carregar-cnefe.mjs <arquivo.csv|arquivo.zip> [<outro.csv> ...]
//
// Cada execução SUBSTITUI o conteúdo inteiro (uma transação: ou tudo ou nada); por isso passe todos os
// estados desejados de uma vez. O CSV é o do Censo 2022 (Cadastro Nacional de Endereços para Fins
// Estatísticos), separado por `;`, com cabeçalho. Sem estado fixo: vale para qualquer UF.
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const raiz = new URL('../../', import.meta.url)
const requerDoBanco = createRequire(new URL('packages/db/package.json', raiz))
const postgres = requerDoBanco('postgres')
const { converterLinhaDoCnefe, dividirLinhaDoCsv } = await import(
  new URL('packages/shared/dist/index.js', raiz)
).catch(() => {
  console.error('Falta compilar o pacote compartilhado: pnpm --filter @leadtogo/shared build')
  process.exit(1)
})

const arquivos = process.argv.slice(2)
const url = process.env.DATABASE_MIGRATION_URL
if (arquivos.length === 0 || !url) {
  console.error(
    'Uso: DATABASE_MIGRATION_URL=... node scripts/geo/carregar-cnefe.mjs <cnefe.csv|cnefe.zip> ...',
  )
  process.exit(2)
}

/** Linhas de um CSV ou de um ZIP que contenha um CSV (lido por `unzip -p`, sem descompactar em disco). */
function linhasDe(arquivo) {
  let entrada
  if (arquivo.toLowerCase().endsWith('.zip')) {
    const unzip = spawn('unzip', ['-p', arquivo, '*.csv'], { stdio: ['ignore', 'pipe', 'inherit'] })
    unzip.on('error', (e) => {
      console.error(
        `Não consegui rodar o unzip (${e.message}). Instale o unzip ou passe o CSV já descompactado.`,
      )
      process.exit(1)
    })
    entrada = unzip.stdout
  } else {
    entrada = createReadStream(arquivo)
  }
  return createInterface({ input: entrada, crlfDelay: Infinity })
}

const tsv = (v) =>
  v === null || v === undefined
    ? '\\N'
    : String(v).replace(
        /[\\\t\n\r]/g,
        (c) => ({ '\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r' })[c],
      )

const mediana = (v) => {
  const o = Float64Array.from(v).sort()
  const m = o.length >> 1
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

const ruas = new Map() // "município|rua normalizada" → { original, lats, lons }
let lidas = 0
let descartadas = 0
const t0 = Date.now()

async function* enderecos() {
  for (const arquivo of arquivos) {
    let cabecalho = null
    for await (const linha of linhasDe(arquivo)) {
      if (!linha) continue
      const campos = dividirLinhaDoCsv(linha)
      if (!cabecalho) {
        cabecalho = campos.map((c) => c.replace(/^\uFEFF/, '').trim())
        continue
      }
      lidas += 1
      const registro = Object.fromEntries(cabecalho.map((nome, i) => [nome, campos[i] ?? '']))
      const e = converterLinhaDoCnefe(registro)
      if (!e) {
        descartadas += 1
        continue
      }
      if (e.logradouroNormalizado) {
        const chave = `${e.municipioCodigo}|${e.logradouroNormalizado}`
        let rua = ruas.get(chave)
        if (!rua) ruas.set(chave, (rua = { original: e.logradouroOriginal, lats: [], lons: [] }))
        rua.lats.push(e.latitude)
        rua.lons.push(e.longitude)
      }
      if (lidas % 250_000 === 0) console.log(`  ${lidas.toLocaleString('pt-BR')} linhas lidas…`)
      yield [
        e.municipioCodigo,
        e.cep,
        e.localidade,
        e.logradouroNormalizado,
        e.numero,
        e.modificador,
        e.latitude,
        e.longitude,
        e.nivelCoordenada,
        e.especie,
      ]
        .map(tsv)
        .join('\t') + '\n'
    }
  }
}

const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  await sql.begin(async (tx) => {
    // Esvazia e recarrega dentro da MESMA transação: quem consulta nunca vê a tabela pela metade
    await tx`TRUNCATE referencia_geo.cnefe_enderecos, referencia_geo.cnefe_logradouros RESTART IDENTITY`
    const copia = await tx`
      COPY referencia_geo.cnefe_enderecos
        (municipio_codigo, cep, localidade, logradouro_normalizado, numero, modificador, latitude, longitude, nivel_coordenada, especie)
      FROM STDIN`.writable()
    await pipeline(Readable.from(enderecos()), copia)
    // Arquivo errado, vazio ou ZIP sem CSV: não apaga o que já está carregado
    if (lidas - descartadas === 0) {
      throw new Error(
        'Nenhum endereço com coordenada foi lido; nada foi alterado (transação desfeita).',
      )
    }
    console.log(
      `Endereços: ${(lidas - descartadas).toLocaleString('pt-BR')} (${descartadas.toLocaleString('pt-BR')} sem coordenada ou município, descartados)`,
    )

    const copiaRuas = await tx`
      COPY referencia_geo.cnefe_logradouros
        (municipio_codigo, logradouro_normalizado, logradouro, enderecos, latitude_centro, longitude_centro)
      FROM STDIN`.writable()
    await pipeline(
      Readable.from(
        (function* () {
          for (const [chave, r] of ruas) {
            const [municipio, ...resto] = chave.split('|')
            yield [
              municipio,
              resto.join('|'),
              r.original,
              r.lats.length,
              mediana(r.lats),
              mediana(r.lons),
            ]
              .map(tsv)
              .join('\t') + '\n'
          }
        })(),
      ),
      copiaRuas,
    )
    console.log(`Ruas: ${ruas.size.toLocaleString('pt-BR')}`)
    await tx`ANALYZE referencia_geo.cnefe_enderecos`
    await tx`ANALYZE referencia_geo.cnefe_logradouros`
  })
  const [{ enderecos: n, ruas: r, municipios }] = await sql`
    SELECT (SELECT count(*) FROM referencia_geo.cnefe_enderecos)::int AS enderecos,
           (SELECT count(*) FROM referencia_geo.cnefe_logradouros)::int AS ruas,
           (SELECT count(DISTINCT municipio_codigo) FROM referencia_geo.cnefe_enderecos)::int AS municipios`
  console.log(
    `Pronto em ${Math.round((Date.now() - t0) / 1000)} s: ${n.toLocaleString('pt-BR')} endereços, ${r.toLocaleString('pt-BR')} ruas, ${municipios} municípios.`,
  )
} finally {
  await sql.end()
}
