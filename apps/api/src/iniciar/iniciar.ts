import { criarPadroesPendentesPorUrl, semearReferenciasPorUrl } from '@leadtogo/db'

import { migrar } from '../migracao/migrar.js'
import { padroesDosPerfis } from '../perfis/padroes-dos-perfis.js'

export type Papel = 'api' | 'worker'

export interface Dependencias {
  /** Aplica as migrações pendentes (DATABASE_MIGRATION_URL) */
  migrar: (env: NodeJS.ProcessEnv) => Promise<void>
  /** Semeia as referências globais com a URL do dono das tabelas */
  semear: (url: string) => Promise<Record<string, number>>
  /** Cria os cadastros padrão e os perfis de acesso das empresas que ainda não os tiveram (backfill; idempotente) */
  criarPadroes: (
    url: string,
  ) => Promise<{ criados: number; falhas: { tenantId: string; erro: string }[] }>
  /** Carrega o processo do papel (importa main.js ou worker.js, que sobem sozinhos) */
  carregar: (papel: Papel) => Promise<unknown>
  info: (linha: string) => void
  erro: (linha: string) => void
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Papel pedido em `PAPEL` (padrão: api). Valor desconhecido é erro, nunca um papel "adivinhado". */
export function lerPapel(env: NodeJS.ProcessEnv): Papel | undefined {
  const valor = (env['PAPEL'] ?? '').trim()
  if (valor === '') return 'api'
  return valor === 'api' || valor === 'worker' ? valor : undefined
}

/**
 * Entrypoint único da imagem (`node dist/iniciar.js`, o CMD padrão): o papel vem da variável
 * `PAPEL`, porque o Coolify ignora o comando de partida de recursos Docker Image.
 *  - `api` (padrão): migra o banco, semeia as referências, descarta a credencial do dono das tabelas
 *    do ambiente e sobe a API. Migração com erro = código 1 (a API não sobe, o container nunca
 *    fica saudável e o Coolify mantém a versão antiga).
 *  - `worker`: não migra, não semeia e não deve receber a DATABASE_MIGRATION_URL (se vier, é
 *    descartada com um aviso antes de qualquer outra coisa).
 * Devolve 0 quando o processo do papel foi carregado e um código de saída diferente de zero em
 * caso de falha de inicialização. As mensagens nunca incluem a URL do banco.
 */
export async function iniciar(env: NodeJS.ProcessEnv, deps: Dependencias): Promise<number> {
  const papel = lerPapel(env)
  if (!papel) {
    deps.erro(`PAPEL inválido: "${env['PAPEL']}". Use "api" (padrão) ou "worker".`)
    return 1
  }

  const urlMigracao = env['DATABASE_MIGRATION_URL']
  // Nenhum processo de longa duração mantém a credencial do dono das tabelas
  delete env['DATABASE_MIGRATION_URL']

  if (papel === 'worker') {
    if (urlMigracao) {
      deps.erro(
        'Aviso: DATABASE_MIGRATION_URL não é usada pelo worker; descartada (remova-a do recurso).',
      )
    }
    deps.info('Iniciando o worker.')
    await deps.carregar('worker')
    return 0
  }

  deps.info('Aplicando migrações...')
  try {
    await deps.migrar({ DATABASE_MIGRATION_URL: urlMigracao })
  } catch (e) {
    deps.erro(`Falha na migração: ${mensagem(e)}`)
    return 1
  }
  deps.info('Migrações aplicadas.')

  // Referências globais (CNAEs, municípios...): idempotente e barata quando nada mudou. Uma falha aqui
  // não derruba a API (as migrações já passaram): fica o aviso no log, e `node dist/seed-referencias.js`
  // repete à mão. SEMEAR_REFERENCIAS=false desliga.
  if (env['SEMEAR_REFERENCIAS'] !== 'false' && urlMigracao) {
    try {
      deps.info(`Referências em dia: ${JSON.stringify(await deps.semear(urlMigracao))}`)
    } catch (e) {
      deps.erro(`Aviso: referências não semeadas (a API sobe mesmo assim): ${mensagem(e)}`)
    }
  }

  // Cadastros padrão (tags, tipos, funil...) das empresas que ainda não os tiveram: é o backfill das
  // empresas anteriores ao Módulo 1. Cada empresa só é atendida uma vez (marca `padroes_criados_em`),
  // então repetir no deploy seguinte não recria o que o administrador excluiu. Falha não derruba a API:
  // fica o aviso e o próximo start tenta de novo.
  if (urlMigracao) {
    try {
      const { criados, falhas } = await deps.criarPadroes(urlMigracao)
      deps.info(`Cadastros padrão: ${criados} empresa(s) atendida(s).`)
      for (const f of falhas) {
        deps.erro(
          `Aviso: padrões não criados para a empresa ${f.tenantId} (tenta de novo no próximo start): ${f.erro}`,
        )
      }
    } catch (e) {
      deps.erro(`Aviso: cadastros padrão não criados (a API sobe mesmo assim): ${mensagem(e)}`)
    }
  }

  await deps.carregar('api')
  return 0
}

/** Dependências reais (usadas por dist/iniciar.js). */
export const dependenciasReais: Dependencias = {
  migrar,
  semear: semearReferenciasPorUrl,
  criarPadroes: (url) => criarPadroesPendentesPorUrl(url, padroesDosPerfis),
  carregar: (papel) => (papel === 'api' ? import('../main.js') : import('../worker.js')),
  info: (linha) => console.log(linha),
  erro: (linha) => console.error(linha),
}
