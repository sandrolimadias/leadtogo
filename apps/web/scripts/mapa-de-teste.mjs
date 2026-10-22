// O bucket público do mapa (https://mapa.crm.aledias.com.br/...) não existe no teste local das imagens. Aqui sobe
// um servidor HTTPS local que faz o que o Garage faz de verdade com o arquivo de teste (docker/fixtures/
// mapa-teste.pmtiles): Range (206 com Content-Range), CORS só para o app e Cache-Control imutável. O Chromium é
// lançado com `--host-resolver-rules` mandando mapa.crm.aledias.com.br para ele (certificado autoassinado, aceito
// com `ignoreHTTPSErrors`). A requisição sai do navegador de verdade, pela rede, então a CSP
// (`connect-src https://mapa.crm.aledias.com.br`) e o CORS continuam sendo testados, e nada passa pelo CDP do
// Playwright (um `route.fulfill` de centenas de faixas atrasava as respostas do teste de carga).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const URL_DO_MAPA_DE_TESTE = 'https://mapa.crm.aledias.com.br/teste.pmtiles'

const arquivo = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../docker/fixtures/mapa-teste.pmtiles'),
)

/** Sobe o servidor; devolve os argumentos do Chromium e a função que o encerra. */
export async function subirMapaDeTeste(origemDoApp) {
  const pasta = mkdtempSync(join(tmpdir(), 'mapa-teste-'))
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=mapa.crm.aledias.com.br',
      '-addext',
      'subjectAltName=DNS:mapa.crm.aledias.com.br',
      '-keyout',
      join(pasta, 'chave.pem'),
      '-out',
      join(pasta, 'cert.pem'),
    ],
    { stdio: 'ignore' },
  )
  const cors = {
    'access-control-allow-origin': origemDoApp,
    'access-control-allow-methods': 'GET, HEAD',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'Content-Range, Content-Length, ETag, Accept-Ranges',
  }
  const servidor = createServer(
    { key: readFileSync(join(pasta, 'chave.pem')), cert: readFileSync(join(pasta, 'cert.pem')) },
    (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors).end()
        return
      }
      const faixa = /^bytes=(\d+)-(\d*)$/.exec(req.headers['range'] ?? '')
      const cabecalhos = {
        ...cors,
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'application/octet-stream',
      }
      if (!faixa) {
        res.writeHead(200, { ...cabecalhos, 'content-length': arquivo.length }).end(arquivo)
        return
      }
      const de = Number(faixa[1])
      const ate = Math.min(faixa[2] ? Number(faixa[2]) : arquivo.length - 1, arquivo.length - 1)
      const corpo = arquivo.subarray(de, ate + 1)
      res
        .writeHead(206, {
          ...cabecalhos,
          'content-range': `bytes ${de}-${ate}/${arquivo.length}`,
          'content-length': corpo.length,
        })
        .end(corpo)
    },
  )
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  const porta = servidor.address().port
  return {
    argsDoChromium: [`--host-resolver-rules=MAP mapa.crm.aledias.com.br 127.0.0.1:${porta}`],
    parar: () => {
      servidor.close()
      rmSync(pasta, { recursive: true, force: true })
    },
  }
}
