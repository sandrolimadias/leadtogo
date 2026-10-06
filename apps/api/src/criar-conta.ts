import 'reflect-metadata'

import { executarCriarConta, lerSenhaDoTerminal } from './primeiro-acesso/criar-conta.js'

// Entrypoint do comando `node dist/criar-conta.js` (ver docs/esteira_deploy.md).
const codigo = await executarCriarConta(process.argv.slice(2), process.env, {
  imprimir: (linha) => console.log(linha),
  imprimirErro: (linha) => console.error(linha),
  lerSenha: lerSenhaDoTerminal,
})
process.exit(codigo)
