// Confere o dist do web depois do build (roda no Dockerfile, antes de a imagem final copiá-lo):
//  1. nenhum source map pode sobrar (os mapas só existem para subir ao GlitchTip; sobrando, são apagados com aviso);
//  2. o precache do service worker precisa estar íntegro: cada entrada existe, a revisão (md5) bate com o
//     arquivo final (inclusive depois da injeção dos debug IDs) e todo JS/CSS de assets/ está na lista.
// Uso: node scripts/validar-dist.mjs [pasta]   (padrão: dist)  ·  Sai com 1 se algo estiver errado.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const problemas = []

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho]
  })
}

const mapas = arquivos(dist).filter((a) => a.endsWith('.map'))
for (const mapa of mapas) rmSync(mapa)
if (mapas.length > 0) {
  console.warn(
    `validar-dist: ${mapas.length} source map(s) sobraram e foram apagados (upload não concluído?)`,
  )
}
for (const arquivo of arquivos(dist).filter((a) => /\.(js|css)$/.test(a))) {
  if (/sourceMappingURL=/.test(readFileSync(arquivo, 'utf8'))) {
    problemas.push(`${relative(dist, arquivo)} ainda referencia um source map`)
  }
}

const sw = join(dist, 'sw.js')
if (!existsSync(sw)) {
  problemas.push('sw.js não existe (o PWA não foi gerado)')
} else {
  const entradas = [
    ...readFileSync(sw, 'utf8').matchAll(/\{url:"([^"]+)",revision:(?:null|"([0-9a-f]{32})")\}/g),
  ]
  if (entradas.length === 0) problemas.push('sw.js sem entradas de precache')
  const listadas = new Set()
  for (const [, url, revisao] of entradas) {
    listadas.add(url)
    const arquivo = join(dist, url)
    if (!existsSync(arquivo)) {
      problemas.push(`precache: ${url} não existe no dist`)
    } else if (
      revisao &&
      createHash('md5').update(readFileSync(arquivo)).digest('hex') !== revisao
    ) {
      problemas.push(`precache: a revisão de ${url} não bate com o arquivo final`)
    }
  }
  for (const arquivo of arquivos(join(dist, 'assets')).filter((a) => /\.(js|css)$/.test(a))) {
    const url = relative(dist, arquivo).split('\\').join('/')
    if (!listadas.has(url)) problemas.push(`precache: ${url} não está na lista`)
  }
  console.log(`validar-dist: ${entradas.length} entradas de precache conferidas`)
}

if (problemas.length > 0) {
  console.error(`validar-dist: ${problemas.length} problema(s):\n- ${problemas.join('\n- ')}`)
  process.exit(1)
}
console.log('validar-dist: ok')
