import { executarTestarErro } from './observabilidade/testar-erro.js'

// Entrypoint do comando `node dist/testar-erro.js` (docs/runbook_observabilidade.md).
const codigo = await executarTestarErro(process.env, {
  imprimir: (linha) => console.log(linha),
  imprimirErro: (linha) => console.error(linha),
})
process.exit(codigo)
