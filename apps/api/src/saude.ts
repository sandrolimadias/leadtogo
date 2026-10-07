import { verificarSaude } from './saude/verificar.js'

// HEALTHCHECK da imagem (`node dist/saude.js`): vale para a API e para o worker, sem configurar nada.
// Sai com 0 (saudável) ou 1. `PAPEL=api|worker` força o papel (ver saude/verificar.ts).
process.exit((await verificarSaude()) ? 0 : 1)
