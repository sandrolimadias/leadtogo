/** Conventional Commits (em português). Ver docs/esteira_deploy.md, seção 11. */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // o assunto pode começar com nome próprio ou sigla (ex.: "docs: E4 (Garage, ARM64)")
    'subject-case': [0],
  },
}
