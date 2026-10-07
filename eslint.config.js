// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/.turbo/',
    '**/dev-dist/',
    'docs/',
    'packages/api-client/src/gerado/',
    'apps/web/src/routeTree.gen.ts',
    'apps/web/src/styles/',
    'packages/db/migrations/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // arquivos JS de configuração ficam fora dos projetos TypeScript
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // API NestJS: classes vazias com decorator (módulos) são o padrão do framework
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  // Web (React)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // `throw redirect(...)` é como o TanStack Router desvia a navegação nos guardas das rotas
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: 'Redirect' }] },
      ],
    },
  },

  // Testes e serviços de mentira: funções async sem await e hooks ao lado de componentes são normais
  {
    files: ['apps/web/**/*.test.{ts,tsx}', 'apps/web/src/testes/**'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },

  prettier,
)
