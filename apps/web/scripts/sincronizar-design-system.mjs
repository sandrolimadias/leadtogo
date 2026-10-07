// Copia os arquivos do design system (a ÚNICA fonte é docs/design-system/) para src/styles.
// As cópias não vão para o Git (.gitignore): rodam no dev, no build e nos testes.
// O Dockerfile do web precisa ter docs/design-system/ no contexto antes do build (docs/plano_implantacao.md, E11).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const origem = join(aqui, '../../../docs/design-system')
export const destino = join(aqui, '../src/styles')

/** Arquivos copiados, relativos às duas pastas. */
export function arquivosDoDesignSystem() {
  const fontes = existsSync(join(origem, 'fonts'))
    ? readdirSync(join(origem, 'fonts'))
        .filter((n) => n.endsWith('.woff2'))
        .map((n) => `fonts/${n}`)
    : []
  const logos = existsSync(join(origem, 'assets/logos'))
    ? readdirSync(join(origem, 'assets/logos'))
        .filter((n) => n.endsWith('.svg'))
        .map((n) => `assets/logos/${n}`)
    : []
  return ['tokens.css', 'tailwind-theme.css', ...fontes, ...logos]
}

export function sincronizar() {
  if (!existsSync(origem)) {
    throw new Error(
      `design system não encontrado em ${origem} (o contexto do build precisa de docs/design-system/)`,
    )
  }
  const arquivos = arquivosDoDesignSystem()
  for (const arquivo of arquivos) {
    mkdirSync(dirname(join(destino, arquivo)), { recursive: true })
    copyFileSync(join(origem, arquivo), join(destino, arquivo))
  }
  return arquivos
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const copiados = sincronizar()
  console.log(`design system: ${copiados.length} arquivos copiados para src/styles`)
}
