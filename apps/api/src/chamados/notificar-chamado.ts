import { createHash } from 'node:crypto'

import { novoId, sql } from '@leadtogo/db'
import { codigoDoChamado } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { emailChamado, emailPortalChamado } from '../email/modelos.js'
import { chavesDe, cifrar } from '../seguranca/cifra.js'
import { FILAS } from '../worker/filas.js'
import type { ManipuladorDeEvento } from '../worker/outbox/relay.js'
import type { WorkerFilas } from '../worker/worker-filas.service.js'

/** Tipo do evento do outbox que vira notificações (sino e e-mail) dos chamados. */
export const EVENTO_NOTIFICAR_CHAMADO = 'chamado.notificar'

export const TIPOS_DE_NOTIFICACAO_DE_CHAMADO = [
  'aberto',
  'triado',
  'atribuido',
  'assumido',
  'mensagem',
  'aguardando_cliente',
  'resolvido',
  'reaberto',
] as const
export type TipoDeNotificacaoDeChamado = (typeof TIPOS_DE_NOTIFICACAO_DE_CHAMADO)[number]

export interface PayloadDaNotificacao {
  chamadoId: string
  tipo: TipoDeNotificacaoDeChamado
  /** Quem fez, se for da equipe (nunca é notificado do que ele mesmo fez) */
  atorId: string | null
  /** Quem fez, se for o cliente do portal (contato) */
  atorContatoId?: string
  mensagemId?: string
}

/** Grava o evento na mesma transação do ato (o sino e o e-mail só saem depois do commit). */
export async function agendarNotificacao(
  tx: Transacao,
  tenantId: string,
  p: PayloadDaNotificacao,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_NOTIFICAR_CHAMADO}, ${p.chamadoId}, ${JSON.stringify(p)}::jsonb)`)
}

/** UUID estável (formato v5) a partir de partes: a mesma entrega repetida cai na mesma notificação. */
export function idDeterministico(...partes: string[]): string {
  const h = createHash('sha1').update(partes.join('|')).digest()
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

type ChamadoParaNotificar = {
  id: string
  numero: number
  assunto: string
  status: string
  area_id: string | null
  area_nome: string | null
  responsavel_id: string | null
  solicitante_membro_id: string | null
  origem: 'interna' | 'portal'
  contato_id: string | null
}

interface Destinatario {
  id: string
  nome: string
  email: string | null
  /** Pessoa certa para o aviso (recebe também por e-mail); o resto só no sino */
  direto: boolean
}

const TEXTO: Record<TipoDeNotificacaoDeChamado, (c: string) => string> = {
  aberto: (c) => `${c} · Novo chamado`,
  triado: (c) => `${c} · Chamado triado para a sua área`,
  atribuido: (c) => `${c} · Chamado atribuído a você`,
  assumido: (c) => `${c} · Seu chamado foi assumido`,
  mensagem: (c) => `${c} · Nova mensagem`,
  aguardando_cliente: (c) => `${c} · Aguardando a sua resposta`,
  resolvido: (c) => `${c} · Chamado resolvido`,
  reaberto: (c) => `${c} · Chamado reaberto`,
}

const PREVIA = 140

/**
 * Quem recebe o aviso (docs/funcionalidades.md, seção 3E). Pessoas específicas (`direto`) recebem sino e
 * e-mail; grupos (a triagem, a área) só o sino. Quem fez o ato nunca é avisado dele.
 */
async function destinatarios(
  tx: Transacao,
  c: ChamadoParaNotificar,
  p: PayloadDaNotificacao,
): Promise<Destinatario[]> {
  const membros = async (ids: (string | null)[], direto: boolean): Promise<Destinatario[]> => {
    const validos = ids.filter((i): i is string => i !== null)
    if (validos.length === 0) return []
    const linhas = await tx.execute<{ id: string; nome: string; email: string | null }>(sql`
      SELECT id, nome, email::text AS email FROM membros
      WHERE id = ANY (${`{${validos.join(',')}}`}::uuid[]) AND ativo AND excluido_em IS NULL`)
    return linhas.map((l) => ({ ...l, direto }))
  }
  const comPermissao = (permissao: string) => sql`EXISTS (
    SELECT 1 FROM perfil_permissoes pp WHERE pp.perfil_id = m.perfil_id AND pp.permissao = ${permissao})`
  const triadores = async (): Promise<Destinatario[]> => {
    const linhas = await tx.execute<{ id: string; nome: string; email: string | null }>(sql`
      SELECT m.id, m.nome, m.email::text AS email FROM membros m, config_triagem t
      WHERE m.ativo AND m.excluido_em IS NULL AND ${comPermissao('chamados.triar')}
        AND (NOT t.ativa OR m.perfil_id = t.perfil_id
          OR EXISTS (SELECT 1 FROM triagem_membros tm WHERE tm.membro_id = m.id))`)
    return linhas.map((l) => ({ ...l, direto: false }))
  }
  const daArea = async (): Promise<Destinatario[]> => {
    if (c.area_id === null) return []
    const linhas = await tx.execute<{ id: string; nome: string; email: string | null }>(sql`
      SELECT m.id, m.nome, m.email::text AS email FROM membros m
      WHERE m.ativo AND m.excluido_em IS NULL AND ${comPermissao('chamados.atender')}
        AND EXISTS (SELECT 1 FROM area_membros am WHERE am.area_id = ${c.area_id}
          AND (am.membro_id = m.id OR am.perfil_id = m.perfil_id))`)
    if (linhas.length > 0) return linhas.map((l) => ({ ...l, direto: false }))
    // Área sem ninguém cadastrado: quem gere as áreas fica sabendo
    const gestores = await tx.execute<{ id: string; nome: string; email: string | null }>(sql`
      SELECT m.id, m.nome, m.email::text AS email FROM membros m
      WHERE m.ativo AND m.excluido_em IS NULL AND ${comPermissao('chamados.gerir_areas')}`)
    return gestores.map((l) => ({ ...l, direto: false }))
  }
  const responsavelOuArea = async (direto: boolean) =>
    c.responsavel_id ? membros([c.responsavel_id], direto) : daArea()

  switch (p.tipo) {
    case 'aberto':
      return c.status === 'aguardando_triagem' ? triadores() : daArea()
    case 'triado':
      return responsavelOuArea(true)
    case 'atribuido':
      return membros([c.responsavel_id], true)
    case 'assumido':
    case 'aguardando_cliente':
    case 'resolvido':
      return membros([c.solicitante_membro_id], p.tipo !== 'assumido')
    case 'mensagem':
      // O cliente do portal respondeu: quem atende fica sabendo
      if (p.atorContatoId) return responsavelOuArea(true)
      return p.atorId === c.solicitante_membro_id
        ? responsavelOuArea(true)
        : membros([c.solicitante_membro_id], true)
    case 'reaberto':
      return responsavelOuArea(true)
  }
}

/** Publica no tempo real (SSE): `canal` e `mensagem` já prontos. Falha aqui não desfaz a entrega. */
export type Publicador = (canal: string, mensagem: string) => Promise<unknown>

export const canalDoSino = (config: Configuracao, tenantId: string, membroId: string) =>
  `${config.FILA_PREFIXO}:notif:${tenantId}:${membroId}`

/**
 * Manipulador do evento `chamado.notificar`: resolve quem recebe, grava o sino (idempotente: o id da
 * notificação sai do evento e do destinatário), enfileira o e-mail de quem é a pessoa certa e, DEPOIS do
 * commit, avisa o tempo real para o sino das pessoas conectadas atualizar na hora.
 */
export function manipuladorDeNotificacaoDeChamado(
  config: Configuracao,
  publicar: Publicador,
): ManipuladorDeEvento {
  return async (evento, { tx, filas }) => {
    const p = evento.payload as PayloadDaNotificacao
    const [c] = await tx.execute<ChamadoParaNotificar>(sql`
      SELECT c.id, c.numero, c.assunto, c.status, c.area_id, a.nome AS area_nome, c.responsavel_id,
        c.solicitante_membro_id, c.origem::text AS origem, c.contato_id
      FROM chamados c LEFT JOIN areas_atendimento a ON a.id = c.area_id
      WHERE c.id = ${p.chamadoId} AND c.excluido_em IS NULL`)
    if (!c) return
    const [ator] = p.atorId
      ? await tx.execute<{ nome: string }>(sql`SELECT nome FROM membros WHERE id = ${p.atorId}`)
      : p.atorContatoId
        ? await tx.execute<{ nome: string }>(
            sql`SELECT nome FROM contatos WHERE id = ${p.atorContatoId}`,
          )
        : []
    let previa: string | null = null
    if (p.tipo === 'mensagem' && p.mensagemId) {
      const [m] = await tx.execute<{ corpo: string }>(sql`
        SELECT corpo FROM chamado_mensagens WHERE id = ${p.mensagemId}`)
      if (m) previa = m.corpo.length > PREVIA ? `${m.corpo.slice(0, PREVIA)}…` : m.corpo
    }
    const codigo = codigoDoChamado(c.numero)
    const titulo = TEXTO[p.tipo](codigo)
    const mensagem = [c.assunto, previa ? `${ator?.nome ?? 'Alguém'}: ${previa}` : null]
      .filter(Boolean)
      .join(' — ')
    const link = `/chamados/${c.id}`
    const lista = (await destinatarios(tx, c, p)).filter((d) => d.id !== p.atorId)
    const unicos = [...new Map(lista.map((d) => [d.id, d])).values()]

    const novos: { membroId: string; id: string; tipo: string; titulo: string }[] = []
    for (const d of unicos) {
      const id = idDeterministico(evento.id, d.id, 'sino')
      const [feita] = await tx.execute<{ id: string }>(sql`
        INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, membro_id, canal, chamado_id, tipo, titulo, mensagem, link)
        VALUES (${id}, ${evento.tenantId}, 'membro', ${d.id}, 'sino', ${c.id}, ${`chamado.${p.tipo}`}, ${titulo}, ${mensagem}, ${link})
        ON CONFLICT (id) DO NOTHING RETURNING id`)
      if (!feita) continue
      novos.push({ membroId: d.id, id, tipo: `chamado.${p.tipo}`, titulo })
      if (d.direto && d.email && config.TOKEN_ENCRYPTION_KEY && config.SMTP_HOST) {
        const idEmail = idDeterministico(evento.id, d.id, 'email')
        await tx.execute(sql`
          INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, membro_id, canal, chamado_id, tipo, titulo, mensagem, link, enviada_em)
          VALUES (${idEmail}, ${evento.tenantId}, 'membro', ${d.id}, 'email', ${c.id}, ${`chamado.${p.tipo}`}, ${titulo}, ${mensagem}, ${link}, now())
          ON CONFLICT (id) DO NOTHING`)
        const modelo = emailChamado({
          nome: d.nome,
          titulo,
          assunto: c.assunto,
          previa,
          autor: ator?.nome ?? null,
          link: `${new URL(config.APP_URL).origin}${link}`,
        })
        const conteudo = cifrar(JSON.stringify({ para: d.email, ...modelo }), chavesDe(config))
        await filas.fila(FILAS.email).add(
          'enviar',
          { p: conteudo },
          {
            jobId: `chamado-email-${idEmail}`,
            attempts: config.EMAIL_TENTATIVAS,
            backoff: { type: 'exponential', delay: config.EMAIL_ESPERA_MS },
          },
        )
      }
    }

    // O cliente do portal (o contato que abriu o chamado) fica sabendo da resposta da equipe, de que a bola
    // está com ele e de que o chamado foi resolvido: sino no portal e e-mail
    const doCliente = await notificarCliente(
      config,
      tx,
      filas,
      evento,
      c,
      p,
      ator?.nome ?? null,
      previa,
    )
    if (doCliente) novos.push(doCliente)

    if (novos.length === 0) return
    return async () => {
      for (const n of novos) {
        await publicar(
          canalDoSino(config, evento.tenantId, n.membroId),
          JSON.stringify({ id: n.id, tipo: n.tipo, titulo: n.titulo }),
        ).catch(() => undefined)
      }
    }
  }
}

const TEXTO_DO_CLIENTE: Partial<Record<TipoDeNotificacaoDeChamado, (c: string) => string>> = {
  mensagem: (c) => `${c} · Nova resposta da equipe`,
  aguardando_cliente: (c) => `${c} · Aguardando a sua resposta`,
  resolvido: (c) => `${c} · Chamado resolvido`,
}

/**
 * Aviso ao contato que abriu o chamado pelo portal (sino e e-mail). Só quando a equipe age (a resposta do
 * próprio cliente não o avisa dele mesmo) e só se o contato tem acesso ativo e o portal está ligado.
 * Devolve o aviso do sino (para o tempo real), ou nulo.
 */
async function notificarCliente(
  config: Configuracao,
  tx: Transacao,
  filas: WorkerFilas,
  evento: { id: string; tenantId: string },
  c: ChamadoParaNotificar,
  p: PayloadDaNotificacao,
  autor: string | null,
  previa: string | null,
): Promise<{ membroId: string; id: string; tipo: string; titulo: string } | null> {
  const texto = TEXTO_DO_CLIENTE[p.tipo]
  if (!texto || c.origem !== 'portal' || !c.contato_id || p.atorContatoId) return null
  const [a] = await tx.execute<{
    nome: string
    email: string
    portal_ativo: boolean | null
    portal_nome: string | null
    empresa_nome: string
  }>(sql`
    SELECT ct.nome, pa.email::text AS email, tc.portal_ativo, tc.portal_nome,
           coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome
    FROM portal_acessos pa
    JOIN contatos ct ON ct.id = pa.contato_id
    JOIN empresas e ON e.id = pa.empresa_id
    LEFT JOIN tenant_configuracoes tc ON tc.tenant_id = pa.tenant_id
    WHERE pa.contato_id = ${c.contato_id} AND pa.situacao = 'ativo' AND pa.excluido_em IS NULL
    ORDER BY pa.criado_em LIMIT 1`)
  if (!a || a.portal_ativo !== true) return null
  const titulo = texto(codigoDoChamado(c.numero))
  const mensagem = c.assunto
  const link = `/chamados/${c.id}`
  const id = idDeterministico(evento.id, c.contato_id, 'sino-cliente')
  const [feita] = await tx.execute<{ id: string }>(sql`
    INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, canal, chamado_id, tipo, titulo, mensagem, link)
    VALUES (${id}, ${evento.tenantId}, 'contato', ${c.contato_id}, 'sino', ${c.id}, ${`chamado.${p.tipo}`}, ${titulo}, ${mensagem}, ${link})
    ON CONFLICT (id) DO NOTHING RETURNING id`)
  if (!feita) return null
  if (config.PORTAL_URL && config.TOKEN_ENCRYPTION_KEY && config.SMTP_HOST) {
    const idEmail = idDeterministico(evento.id, c.contato_id, 'email-cliente')
    await tx.execute(sql`
      INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, canal, chamado_id, tipo, titulo, mensagem, link, enviada_em)
      VALUES (${idEmail}, ${evento.tenantId}, 'contato', ${c.contato_id}, 'email', ${c.id}, ${`chamado.${p.tipo}`}, ${titulo}, ${mensagem}, ${link}, now())
      ON CONFLICT (id) DO NOTHING`)
    const modelo = emailPortalChamado({
      nome: a.nome,
      portal: a.portal_nome ?? a.empresa_nome,
      titulo,
      assunto: c.assunto,
      previa: p.tipo === 'mensagem' ? previa : null,
      autor,
      link: `${new URL(config.PORTAL_URL).origin}${link}`,
    })
    const conteudo = cifrar(JSON.stringify({ para: a.email, ...modelo }), chavesDe(config))
    await filas.fila(FILAS.email).add(
      'enviar',
      { p: conteudo },
      {
        jobId: `chamado-email-${idEmail}`,
        attempts: config.EMAIL_TENTATIVAS,
        backoff: { type: 'exponential', delay: config.EMAIL_ESPERA_MS },
      },
    )
  }
  return { membroId: c.contato_id, id, tipo: `chamado.${p.tipo}`, titulo }
}
