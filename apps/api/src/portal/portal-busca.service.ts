import {
  codigoDoChamado,
  type ResultadoDaBuscaDoPortal,
  type ResultadoDaBusca,
} from '@leadtogo/shared'
import { sql } from '@leadtogo/db'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'

const POR_TIPO = 5

/** Escapa `\`, `%` e `_` para o termo valer como texto no LIKE. */
export const escaparParaLike = (t: string): string => t.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Primeiros caracteres de um texto (Markdown simplificado), em uma linha. */
const trecho = (t: string | null): string | null => {
  if (!t) return null
  const limpo = t
    .replace(/[#*_>`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!limpo) return null
  return limpo.length > 140 ? `${limpo.slice(0, 139)}…` : limpo
}

/**
 * Busca global do cliente: chamados, documentos, eventos e publicações, sem acento e sem diferenciar maiúsculas.
 * Roda DENTRO da sessão do cliente: as políticas do banco valem e cada consulta repete a condição de visibilidade
 * do módulo (chamados da própria empresa e origem portal; documento limpo, visível e do alcance; evento publicado ou
 * cancelado; publicação publicada).
 */
@Injectable()
export class PortalBuscaService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async buscar(q: string): Promise<ResultadoDaBuscaDoPortal> {
    const db = this.ctx.db()
    const padrao = `%${escaparParaLike(q)}%`
    const casa = (coluna: ReturnType<typeof sql>) =>
      sql`lower(f_unaccent(coalesce(${coluna}, ''))) LIKE lower(f_unaccent(${padrao}))`
    const numero = /^(?:ch-?)?0*(\d{1,9})$/i.exec(q.trim())?.[1]

    const chamados = await db.execute<{
      id: string
      numero: number
      assunto: string
      descricao: string | null
      atualizado_em: string | Date
    }>(sql`
      SELECT c.id, c.numero, c.assunto, c.descricao, c.atualizado_em FROM chamados c
      WHERE c.empresa_cliente_id = ${this.ctx.portal.empresaId} AND c.origem = 'portal' AND c.excluido_em IS NULL
        AND (${casa(sql`c.assunto`)} OR ${casa(sql`c.descricao`)}
             ${numero ? sql`OR c.numero = ${Number(numero)}` : sql``})
      ORDER BY c.atualizado_em DESC LIMIT ${POR_TIPO}`)

    const documentos = await db.execute<{
      id: string
      titulo: string
      descricao: string | null
      criado_em: string | Date
    }>(sql`
      SELECT d.id, d.titulo, d.descricao, d.criado_em FROM documentos d
      WHERE d.estado = 'limpo' AND d.enviado_em IS NOT NULL AND d.visivel_no_portal AND d.excluido_em IS NULL
        AND (${casa(sql`d.titulo`)} OR ${casa(sql`d.descricao`)} OR ${casa(sql`d.nome`)})
      ORDER BY d.criado_em DESC LIMIT ${POR_TIPO}`)

    const eventos = await db.execute<{
      id: string
      titulo: string
      descricao: string | null
      inicio_em: string | Date
    }>(sql`
      SELECT e.id, e.titulo, e.descricao, e.inicio_em FROM eventos e
      WHERE e.situacao IN ('publicado', 'cancelado') AND e.excluido_em IS NULL
        AND (${casa(sql`e.titulo`)} OR ${casa(sql`e.descricao`)} OR ${casa(sql`e.local`)})
      ORDER BY e.inicio_em DESC LIMIT ${POR_TIPO}`)

    const publicacoes = await db.execute<{
      id: string
      titulo: string
      corpo: string
      publicada_em: string | Date
    }>(sql`
      SELECT p.id, p.titulo, p.corpo, p.publicada_em FROM publicacoes p
      WHERE p.situacao = 'publicada' AND p.excluido_em IS NULL
        AND (${casa(sql`p.titulo`)} OR ${casa(sql`p.corpo`)})
      ORDER BY p.publicada_em DESC LIMIT ${POR_TIPO}`)

    const iso = (v: string | Date) => new Date(v).toISOString()
    const itens: ResultadoDaBusca[] = [
      ...[...chamados].map((c) => ({
        tipo: 'chamado' as const,
        id: c.id,
        titulo: `${codigoDoChamado(c.numero)} · ${c.assunto}`,
        trecho: casaTexto(c.assunto, q) ? null : trecho(c.descricao),
        destino: `/chamados/${c.id}`,
        data: iso(c.atualizado_em),
      })),
      ...[...documentos].map((d) => ({
        tipo: 'documento' as const,
        id: d.id,
        titulo: d.titulo,
        trecho: casaTexto(d.titulo, q) ? null : trecho(d.descricao),
        destino: '/documentos',
        data: iso(d.criado_em),
      })),
      ...[...eventos].map((e) => ({
        tipo: 'evento' as const,
        id: e.id,
        titulo: e.titulo,
        trecho: casaTexto(e.titulo, q) ? null : trecho(e.descricao),
        destino: '/agenda',
        data: iso(e.inicio_em),
      })),
      ...[...publicacoes].map((p) => ({
        tipo: 'publicacao' as const,
        id: p.id,
        titulo: p.titulo,
        trecho: casaTexto(p.titulo, q) ? null : trecho(p.corpo),
        destino: '/',
        data: iso(p.publicada_em),
      })),
    ]
    return { itens }
  }
}

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** O termo aparece neste texto? (mesma regra da busca: sem acento e sem diferenciar maiúsculas) */
const casaTexto = (texto: string, q: string): boolean => semAcento(texto).includes(semAcento(q))
