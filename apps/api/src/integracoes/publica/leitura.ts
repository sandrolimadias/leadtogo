import { type SQL, sql } from '@leadtogo/db'
import type {
  AtividadePublica,
  ContatoPublico,
  EmpresaPublica,
  OportunidadePublica,
} from '@leadtogo/shared'

import type { Transacao } from '../../acesso/contexto-tenant.service.js'
import { ErroApi } from '../../http/erro-api.js'

// Modelo de leitura da API pública (docs/plano_api_aberta.md, seção 5): DTOs próprios em lista de permissão,
// montados direto no SQL (uma consulta por página, sem N+1). A chave age com alcance "todas" e o RLS isola a
// empresa (tenant), então não há filtro de carteira aqui.

/** Instante em ISO 8601 UTC (`2026-10-28T12:00:00.000Z`) ou nulo. */
const iso = (coluna: SQL): SQL =>
  sql`to_char(${coluna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

const tagJson = (t: SQL, g: SQL): SQL => sql`json_build_object(
  'id', ${t}.id, 'nome', ${t}.nome, 'chave_sistema', ${t}.chave_sistema,
  'grupo', json_build_object('id', ${g}.id, 'nome', ${g}.nome, 'chave_sistema', ${g}.chave_sistema))`

const pessoaJson = (m: SQL): SQL =>
  sql`json_build_object('id', ${m}.id, 'nome', ${m}.nome, 'email', ${m}.email::text)`

// ------------------------------------------------------------------------------------------- paginação

/** O cursor é o id do último item da página (uuid v7, em ordem de criação), em base64url. */
export const cursorDe = (id: string): string => Buffer.from(id, 'utf8').toString('base64url')

export function idDoCursor(cursor: string | undefined): string | null {
  if (!cursor) return null
  const id = Buffer.from(cursor, 'base64url').toString('utf8')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ErroApi('cursor_invalido', 'Cursor inválido.', 400)
  return id
}

export interface Pagina<T> {
  dados: T[]
  proximo_cursor: string | null
}

/** Busca `limite + 1` para saber se há próxima página. */
export function paginar<T extends { id: string }>(linhas: T[], limite: number): Pagina<T> {
  const dados = linhas.slice(0, limite)
  const ultimo = dados.at(-1)
  return { dados, proximo_cursor: linhas.length > limite && ultimo ? cursorDe(ultimo.id) : null }
}

/** Condições comuns: depois do cursor e alterado desde. `alias` é a tabela principal da consulta. */
export function condicoesDePagina(
  alias: SQL,
  consulta: { cursor?: string | undefined; atualizado_desde?: string | undefined },
): SQL[] {
  const condicoes: SQL[] = []
  const depois = idDoCursor(consulta.cursor)
  if (depois) condicoes.push(sql`${alias}.id > ${depois}::uuid`)
  if (consulta.atualizado_desde) {
    condicoes.push(sql`${alias}.atualizado_em >= ${consulta.atualizado_desde}::timestamptz`)
  }
  return condicoes
}

const onde = (condicoes: SQL[]): SQL =>
  condicoes.length === 0 ? sql`` : sql`AND ${sql.join(condicoes, sql` AND `)}`

/** Uma tag pela chave do sistema ou pelo id (ativa ou não; não excluída). */
export const condicaoDeTag = (t: SQL, referencia: string): SQL =>
  /^[0-9a-f-]{36}$/i.test(referencia)
    ? sql`${t}.id = ${referencia}::uuid`
    : sql`${t}.chave_sistema = ${referencia}`

// ------------------------------------------------------------------------------------------------ empresas

export async function lerEmpresas(
  db: Transacao,
  condicoes: SQL[],
  limite: number,
): Promise<EmpresaPublica[]> {
  const linhas = await db.execute<{ dto: EmpresaPublica }>(sql`
    SELECT json_build_object(
      'id', e.id,
      'tipo_documento', e.tipo_documento,
      'documento', e.documento,
      'razao_social', e.razao_social,
      'nome_fantasia', e.nome_fantasia,
      'nome', coalesce(e.nome_fantasia, e.razao_social),
      'status', (SELECT ${tagJson(sql`t`, sql`g`)} FROM empresa_tags et
        JOIN tags t ON t.id = et.tag_id JOIN tag_grupos g ON g.id = t.tag_grupo_id
        WHERE et.empresa_id = e.id AND g.chave_sistema = 'status' LIMIT 1),
      'tags', coalesce((SELECT json_agg(${tagJson(sql`t`, sql`g`)} ORDER BY g.ordem, t.ordem, t.nome)
        FROM empresa_tags et JOIN tags t ON t.id = et.tag_id JOIN tag_grupos g ON g.id = t.tag_grupo_id
        WHERE et.empresa_id = e.id AND t.excluido_em IS NULL), '[]'::json),
      'responsavel', ${pessoaJson(sql`v`)},
      'vertical', CASE WHEN ve.id IS NULL THEN NULL ELSE json_build_object('id', ve.id, 'nome', ve.nome) END,
      'website', e.website,
      'observacoes', e.observacoes,
      'telefones', coalesce((SELECT json_agg(json_build_object('numero', tel.numero, 'e164', tel.numero_e164,
          'tipo', tel.tipo, 'principal', tel.principal) ORDER BY tel.principal DESC, tel.criado_em)
        FROM empresa_telefones tel WHERE tel.empresa_id = e.id), '[]'::json),
      'endereco', json_build_object('cep', e.cep, 'logradouro', e.logradouro, 'numero', e.numero,
        'complemento', e.complemento, 'bairro', e.bairro, 'municipio_ibge', e.municipio_codigo,
        'municipio', mu.nome, 'uf', mu.uf),
      'receita', json_build_object('situacao_nao_verificada', e.situacao_nao_verificada,
        'atualizada_em', ${iso(sql`e.receita_atualizado_em`)}),
      'ultima_visita_em', ${iso(sql`e.ultima_visita_em`)},
      'ultimo_contato_em', ${iso(sql`e.ultimo_contato_em`)},
      'proxima_atividade_em', ${iso(sql`e.proxima_atividade_em`)},
      'criado_em', ${iso(sql`e.criado_em`)},
      'atualizado_em', ${iso(sql`e.atualizado_em`)}
    ) AS dto
    FROM empresas e
    JOIN membros v ON v.id = e.vendedor_id
    LEFT JOIN verticais ve ON ve.id = e.vertical_id
    LEFT JOIN municipios mu ON mu.codigo_ibge = e.municipio_codigo
    WHERE e.excluido_em IS NULL ${onde(condicoes)}
    ORDER BY e.id
    LIMIT ${limite}`)
  return linhas.map((l) => l.dto)
}

export async function lerEmpresa(db: Transacao, id: string): Promise<EmpresaPublica> {
  const [empresa] = await lerEmpresas(db, [sql`e.id = ${id}::uuid`], 1)
  if (!empresa) throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
  return empresa
}

// ------------------------------------------------------------------------------------------------ contatos

export async function lerContatos(
  db: Transacao,
  condicoes: SQL[],
  limite: number,
): Promise<ContatoPublico[]> {
  const linhas = await db.execute<{ dto: ContatoPublico }>(sql`
    SELECT json_build_object(
      'id', c.id,
      'nome', c.nome,
      'emails', coalesce((SELECT json_agg(json_build_object('email', ce.email::text, 'principal', ce.principal)
          ORDER BY ce.principal DESC, ce.criado_em) FROM contato_emails ce WHERE ce.contato_id = c.id), '[]'::json),
      'telefones', coalesce((SELECT json_agg(json_build_object('numero', ct.numero, 'e164', ct.numero_e164,
          'tipo', ct.tipo, 'principal', ct.principal) ORDER BY ct.principal DESC, ct.criado_em)
        FROM contato_telefones ct WHERE ct.contato_id = c.id), '[]'::json),
      'empresas', coalesce((SELECT json_agg(json_build_object('id', em.id,
          'nome', coalesce(em.nome_fantasia, em.razao_social), 'cargo', ec.cargo, 'principal', ec.principal)
          ORDER BY ec.principal DESC, ec.criado_em)
        FROM empresa_contatos ec JOIN empresas em ON em.id = ec.empresa_id
        WHERE ec.contato_id = c.id AND ec.ativo AND em.excluido_em IS NULL), '[]'::json),
      'aceita_whatsapp', c.aceita_whatsapp,
      'aceita_email', c.aceita_email,
      'observacoes', c.observacoes,
      'criado_em', ${iso(sql`c.criado_em`)},
      'atualizado_em', ${iso(sql`c.atualizado_em`)}
    ) AS dto
    FROM contatos c
    WHERE c.excluido_em IS NULL ${onde(condicoes)}
    ORDER BY c.id
    LIMIT ${limite}`)
  return linhas.map((l) => l.dto)
}

export async function lerContato(db: Transacao, id: string): Promise<ContatoPublico> {
  const [contato] = await lerContatos(db, [sql`c.id = ${id}::uuid`], 1)
  if (!contato) throw new ErroApi('contato_nao_encontrado', 'Contato não encontrado.', 404)
  return contato
}

// ---------------------------------------------------------------------------------------------- atividades

export async function lerAtividades(
  db: Transacao,
  condicoes: SQL[],
  limite: number,
): Promise<AtividadePublica[]> {
  const linhas = await db.execute<{ dto: AtividadePublica }>(sql`
    SELECT json_build_object(
      'id', a.id,
      'tipo', json_build_object('id', ta.id, 'nome', ta.nome, 'chave_sistema', ta.chave_sistema),
      'titulo', a.titulo,
      'situacao', CASE WHEN a.situacao = 'em_execucao' THEN 'pendente' ELSE a.situacao::text END,
      'inicio', ${iso(sql`a.data_inicio`)},
      'fim', ${iso(sql`a.data_fim`)},
      'dia_inteiro', a.dia_inteiro,
      'realizada_em', ${iso(sql`a.realizada_em`)},
      'resultado', a.resultado,
      'observacoes', a.observacoes,
      'empresa_id', a.empresa_id,
      'contato_id', a.contato_id,
      'oportunidade_id', a.oportunidade_id,
      'responsavel', ${pessoaJson(sql`r`)},
      'origem', a.origem,
      'id_externo', a.id_externo,
      'criado_em', ${iso(sql`a.criado_em`)},
      'atualizado_em', ${iso(sql`a.atualizado_em`)}
    ) AS dto
    FROM atividades a
    JOIN tipos_atividade ta ON ta.id = a.tipo_atividade_id
    JOIN membros r ON r.id = a.responsavel_id
    WHERE a.excluido_em IS NULL ${onde(condicoes)}
    ORDER BY a.id
    LIMIT ${limite}`)
  return linhas.map((l) => l.dto)
}

export async function lerAtividade(db: Transacao, id: string): Promise<AtividadePublica> {
  const [atividade] = await lerAtividades(db, [sql`a.id = ${id}::uuid`], 1)
  if (!atividade) throw new ErroApi('atividade_nao_encontrada', 'Atividade não encontrada.', 404)
  return atividade
}

// ------------------------------------------------------------------------------------------- oportunidades

export async function lerOportunidades(
  db: Transacao,
  condicoes: SQL[],
  limite: number,
): Promise<OportunidadePublica[]> {
  const linhas = await db.execute<{ dto: OportunidadePublica }>(sql`
    SELECT json_build_object(
      'id', o.id,
      'titulo', o.titulo,
      'empresa_id', o.empresa_id,
      'contato_id', o.contato_id,
      'funil', json_build_object('id', f.id, 'nome', f.nome),
      'fase', json_build_object('id', fa.id, 'nome', fa.nome),
      'status', o.status,
      'valor_unico', to_char(o.valor_unico, 'FM9999999999990.00'),
      'valor_mensal', to_char(o.valor_mensal, 'FM9999999999990.00'),
      'meses', o.meses,
      'valor_total', to_char(o.valor_total, 'FM9999999999990.00'),
      'probabilidade', o.probabilidade,
      'previsao_fechamento', o.data_prevista_fechamento,
      'data_fechamento', ${iso(sql`o.data_fechamento`)},
      'responsavel', ${pessoaJson(sql`r`)},
      'origem', CASE WHEN og.id IS NULL THEN NULL ELSE json_build_object('id', og.id, 'nome', og.nome) END,
      'observacoes', o.observacoes,
      'criado_em', ${iso(sql`o.criado_em`)},
      'atualizado_em', ${iso(sql`o.atualizado_em`)}
    ) AS dto
    FROM oportunidades o
    JOIN funis f ON f.id = o.funil_id
    JOIN funil_fases fa ON fa.id = o.fase_id
    JOIN membros r ON r.id = o.responsavel_id
    LEFT JOIN origens og ON og.id = o.origem_id
    WHERE o.excluido_em IS NULL ${onde(condicoes)}
    ORDER BY o.id
    LIMIT ${limite}`)
  return linhas.map((l) => l.dto)
}

export async function lerOportunidade(db: Transacao, id: string): Promise<OportunidadePublica> {
  const [oportunidade] = await lerOportunidades(db, [sql`o.id = ${id}::uuid`], 1)
  if (!oportunidade) {
    throw new ErroApi('oportunidade_nao_encontrada', 'Oportunidade não encontrada.', 404)
  }
  return oportunidade
}
