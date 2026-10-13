import { schema, sql } from '@leadtogo/db'

import type { EscopoDaCarteira } from './regras-de-carteira.js'

/**
 * Regra de carteira dos contatos (docs/escopo_mvp.md, Módulo 3). O contato não tem dono: vale a
 * carteira das empresas a que ele está vinculado (vínculo ativo, empresa não excluída).
 *  - admin e gestor veem e editam todos, até o contato sem nenhuma empresa vinculada;
 *  - o vendedor vê o contato ligado a empresa que ele vê (a própria carteira, ou todas, se a empresa
 *    ligou "Vendedores podem ver todas as empresas") e edita o ligado a empresa dele.
 */
const comVinculoDe = (escopo: EscopoDaCarteira, soAsDele: boolean) => sql`EXISTS (
  SELECT 1 FROM empresa_contatos ec JOIN empresas e ON e.id = ec.empresa_id
  WHERE ec.contato_id = ${schema.contatos.id} AND ec.ativo AND e.excluido_em IS NULL
    AND ${soAsDele || !escopo.veTodas ? sql`e.vendedor_id = ${escopo.membroId}` : sql`true`})`

/** Condição SQL dos contatos que o usuário vê (`undefined` = todos). */
export const condicaoDeVisibilidadeDoContato = (escopo: EscopoDaCarteira) =>
  escopo.papel === 'vendedor' ? comVinculoDe(escopo, false) : undefined

/** Condição SQL dos contatos que o usuário edita (`undefined` = todos). */
export const condicaoDeEdicaoDoContato = (escopo: EscopoDaCarteira) =>
  escopo.papel === 'vendedor' ? comVinculoDe(escopo, true) : undefined

/** Excluir contato: só admin e gestor. */
export const podeExcluirContato = (escopo: EscopoDaCarteira): boolean => escopo.papel !== 'vendedor'
