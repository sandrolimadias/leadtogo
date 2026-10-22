import { type SQL, sql } from '@leadtogo/db'
import { type Alcance, type PermissoesDoPerfil, definicaoDaPermissao } from '@leadtogo/shared'

import type { Transacao } from './contexto-tenant.service.js'
import type { MembroDaRequisicao, PapelMembro } from './requisicao.js'

/**
 * Carrega o perfil efetivo do membro e as permissões dele, já sob RLS (transação da requisição):
 *  - o perfil do membro (`membros.perfil_id`), se ativo e não excluído;
 *  - enquanto o membro não tem perfil (transição até a contração), o perfil de SISTEMA do papel dele,
 *    a mesma regra do backfill; sem perfil de sistema, nenhuma permissão;
 *  - perfil excluído ou inativo: nenhuma permissão (não cai no do papel).
 * Chaves que não estão no catálogo são ignoradas.
 */
export async function carregarPermissoes(
  tx: Transacao,
  membro: { id: string; papel: PapelMembro; perfil_id: string | null },
): Promise<MembroDaRequisicao> {
  const perfis = await tx.execute<{ id: string; nome: string }>(sql`
    SELECT id, nome FROM perfis_acesso
    WHERE excluido_em IS NULL AND ativo AND ${
      membro.perfil_id
        ? sql`id = ${membro.perfil_id}`
        : sql`chave_sistema = ${membro.papel}::chave_perfil_sistema`
    }
    LIMIT 1`)
  const perfil = perfis[0] ?? null
  const permissoes = perfil
    ? permissoesDoCatalogo(
        await tx.execute<{ permissao: string; alcance: Alcance | null }>(sql`
          SELECT permissao, alcance::text AS alcance FROM perfil_permissoes WHERE perfil_id = ${perfil.id}`),
      )
    : {}
  return {
    id: membro.id,
    papel: membro.papel,
    perfil: perfil ? { id: perfil.id, nome: perfil.nome } : null,
    permissoes,
  }
}

/**
 * Condição SQL do perfil efetivo do membro `m` ser o perfil `p` (a mesma regra de `carregarPermissoes`):
 * o perfil do membro ou, enquanto ele não tem, o de sistema do papel; só perfil ativo e não excluído.
 * `m` e `p` são os apelidos das tabelas `membros` e `perfis_acesso` na consulta.
 */
export const perfilEfetivo = (m: SQL, p: SQL): SQL => sql`(${p}.tenant_id = ${m}.tenant_id
  AND ${p}.excluido_em IS NULL AND ${p}.ativo
  AND (${p}.id = ${m}.perfil_id
    OR (${m}.perfil_id IS NULL AND ${p}.chave_sistema::text = ${m}.papel::text)))`

/** Linhas de `perfil_permissoes` → permissões, ignorando o que não está no catálogo (ou veio torto). */
export function permissoesDoCatalogo(
  linhas: Iterable<{ permissao: string; alcance: Alcance | null }>,
): PermissoesDoPerfil {
  const permissoes: PermissoesDoPerfil = {}
  for (const l of linhas) {
    const def = definicaoDaPermissao(l.permissao)
    if (!def) continue
    if (def.admiteAlcance) {
      if (l.alcance) permissoes[l.permissao] = l.alcance
    } else permissoes[l.permissao] = true
  }
  return permissoes
}

/** Tem ao menos UMA das permissões pedidas (a marca `@Permissao`). */
export const atendeAlguma = (permissoes: PermissoesDoPerfil, chaves: readonly string[]): boolean =>
  chaves.some((c) => permissoes[c] !== undefined)
