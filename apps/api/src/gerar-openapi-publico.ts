import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { gerarDocumentoPublico, quebrasDeContrato } from './documentacao/gerar-documento-publico.js'

// Atualiza o retrato do contrato da API pública (docs/api/publica-v1.openapi.json):
//   pnpm --filter @leadtogo/api api:publica:atualizar            (recusa mudança que não seja aditiva)
//   pnpm --filter @leadtogo/api api:publica:atualizar --quebrar  (só numa v2, com aviso aos integradores)
const arquivo = new URL('../../../docs/api/publica-v1.openapi.json', import.meta.url)
const novo = await gerarDocumentoPublico()
if (existsSync(arquivo) && !process.argv.includes('--quebrar')) {
  const antigo = JSON.parse(readFileSync(arquivo, 'utf8')) as Parameters<
    typeof quebrasDeContrato
  >[0]
  const quebras = quebrasDeContrato(
    antigo,
    novo as unknown as Parameters<typeof quebrasDeContrato>[1],
  )
  if (quebras.length > 0) {
    console.error('Mudança NÃO aditiva no contrato da API pública v1:\n- ' + quebras.join('\n- '))
    console.error('Mantenha o que existe (só acrescente) ou, numa v2, rode com --quebrar.')
    process.exit(1)
  }
}
writeFileSync(arquivo, JSON.stringify(novo, null, 2) + '\n')
console.log('docs/api/publica-v1.openapi.json atualizado')
