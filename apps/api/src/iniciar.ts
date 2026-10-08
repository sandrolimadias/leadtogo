import { dependenciasReais, iniciar } from './iniciar/iniciar.js'

// Entrypoint da imagem (CMD padrão): `node dist/iniciar.js`, papel em PAPEL=api|worker (docs/runbook_e13.md).
// main.js, worker.js e migrate.js continuam funcionando sozinhos.
const codigo = await iniciar(process.env, dependenciasReais)
if (codigo !== 0) process.exit(codigo)
