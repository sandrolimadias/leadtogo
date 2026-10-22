import { schema, type SQL, sql } from '@leadtogo/db'

import type { EscopoDaCarteira, Responsaveis } from './regras-de-carteira.js'

/**
 * Regra de carteira dos contatos (docs/funcionalidades.md, "Perfis de acesso"). O contato não tem dono:
 * vale a carteira das empresas a que ele está vinculado (vínculo ativo, empresa não excluída), pelo
 * alcance do perfil em cada ação (`contatos.ver`, `contatos.editar`, `contatos.excluir`).
 *  - Contato SEM empresa vinculada: só quem alcança todos ao ver E ao editar (como antes: o
 *    administrador e o gestor; o vendedor que "vê todas" continuava sem vê-lo);
 *  - com alcance todas na ação (e, para ver, também para editar): sem restrição.
 */
const comVinculoDe = (r: Responsaveis) => sql`EXISTS (
  SELECT 1 FROM empresa_contatos ec JOIN empresas e ON e.id = ec.empresa_id
  WHERE ec.contato_id = ${schema.contatos.id} AND ec.ativo AND e.excluido_em IS NULL
    AND ${r === null ? sql`true` : r.length === 0 ? sql`false` : sql`e.vendedor_id = ANY (${`{${r.join(',')}}`}::uuid[])`})`

/** Vê (e edita) contato sem empresa vinculada. */
const alcancaSemEmpresa = (e: EscopoDaCarteira) =>
  e.contatos.ver === null && e.contatos.editar === null

/** Condição SQL dos contatos que o usuário vê (`undefined` = todos). */
export const condicaoDeVisibilidadeDoContato = (e: EscopoDaCarteira): SQL | undefined =>
  alcancaSemEmpresa(e) ? undefined : comVinculoDe(e.contatos.ver)

/** Condição SQL dos contatos que o usuário edita (`undefined` = todos). */
export const condicaoDeEdicaoDoContato = (e: EscopoDaCarteira): SQL | undefined =>
  e.contatos.editar === null ? undefined : comVinculoDe(e.contatos.editar)

/** Condição SQL dos contatos que o usuário exclui (`undefined` = todos). */
export const condicaoDeExclusaoDoContato = (e: EscopoDaCarteira): SQL | undefined =>
  e.contatos.excluir === null ? undefined : comVinculoDe(e.contatos.excluir)

/** Excluir contato: tem a permissão (o alcance é conferido no contato, por `condicaoDeExclusaoDoContato`). */
export const podeExcluirContato = (e: EscopoDaCarteira): boolean =>
  e.contatos.excluir === null || e.contatos.excluir.length > 0
