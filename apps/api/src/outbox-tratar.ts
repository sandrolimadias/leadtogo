import { executarTratar, bancoReal } from './worker/outbox/tratar.js'

// Entrypoint do comando `node dist/outbox-tratar.js` (docs/runbook_observabilidade.md).
const url = process.env['DATABASE_URL']
const codigo = await executarTratar(
  process.argv.slice(2),
  () => {
    if (!url) throw new Error('DATABASE_URL não definida')
    return bancoReal(url)
  },
  {
    imprimir: (linha) => console.log(linha),
    imprimirErro: (linha) => console.error(linha),
  },
)
process.exit(codigo)
