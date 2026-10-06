# packages/shared

Schemas Zod, tipos, enums e regras compartilhadas entre API e web (ex.: validação de CNPJ alfanumérico, formatação de moeda).

- Cada domínio ganha um arquivo em `src/` e é reexportado em `src/index.ts`.
- Testes ao lado do código (`*.test.ts`), com Vitest.
- `pnpm build` gera `dist/` (usado pela API em runtime). O web, os testes e o typecheck leem o `src/` direto pela condição `@leadtogo/source`.
