import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { hashDoTokenDoPortal, novoTokenDoPortal } from '../portal/portal-token.js'
import { noTenant } from './chamados.js'
import type { Dono } from './mundo.js'
import { novoDono } from './mundo.js'

// Apoio dos testes do portal do cliente: o cliente é um contato com acesso; entra por link de uso único e
// fala com `/v1/portal/*` com o cookie do portal (separado do cookie do CRM).

/** Origem do portal nos testes (PORTAL_URL do ambiente de teste). */
export const ORIGEM_DO_PORTAL = 'http://localhost:5174'
export const COOKIE_DO_PORTAL = 'portal_dev'

let sequencia = 0
const base = Math.floor(Math.random() * 200) + 20
/** Cada chamada vem de um IP diferente (o limite por IP persiste no Valkey entre execuções); exige TRUST_PROXY=1. */
const ipNovo = () => {
  sequencia += 1
  return `10.${base}.${Math.floor(sequencia / 250) % 250}.${(sequencia % 250) + 1}`
}

export const configuracaoDoPortalDeTeste = { TRUST_PROXY: '1' }

type Metodo = 'get' | 'post' | 'put' | 'delete'
export const chamarPortalEm =
  (app: () => INestApplication<Server>) =>
  (
    metodo: Metodo,
    url: string,
    opcoes: { corpo?: unknown; cookie?: string | undefined; origem?: string | null } = {},
  ) => {
    const r = request(app().getHttpServer())[metodo](`/v1${url}`).set('X-Forwarded-For', ipNovo())
    if (opcoes.origem !== null) r.set('Origin', opcoes.origem ?? ORIGEM_DO_PORTAL)
    if (opcoes.cookie) r.set('Cookie', opcoes.cookie)
    return opcoes.corpo === undefined ? r : r.send(opcoes.corpo as object)
  }

export interface ClienteDoPortal {
  dono: Dono
  tenantId: string
  empresaId: string
  contatoId: string
  acessoId: string
  email: string
}

/** Liga (ou desliga) o portal da empresa e, opcionalmente, a exigência de 2FA do Responsável. */
export async function configurarPortal(
  tenantId: string,
  c: { ativo?: boolean; exige2fa?: boolean; nome?: string | null } = {},
) {
  await noTenant(tenantId, async (tx) => {
    const r = await tx`
      UPDATE tenant_configuracoes
      SET portal_ativo = ${c.ativo ?? true}, portal_nome = ${c.nome ?? 'Portal de Teste'},
          portal_exige_dois_fatores_responsavel = ${c.exige2fa ?? false}
      WHERE tenant_id = ${tenantId}`
    if (r.count === 0) {
      await tx`INSERT INTO tenant_configuracoes (tenant_id, portal_ativo, portal_nome, portal_exige_dois_fatores_responsavel)
        VALUES (${tenantId}, ${c.ativo ?? true}, ${c.nome ?? 'Portal de Teste'}, ${c.exige2fa ?? false})`
    }
  })
}

/** Empresa-cliente + contato (no tenant do dono) com um acesso ao portal. */
export async function novoAcesso(
  d: Dono,
  opcoes: {
    empresaId?: string
    papel?: 'responsavel' | 'colega'
    situacao?: 'convidado' | 'ativo' | 'suspenso' | 'revogado'
    email?: string
    nome?: string
  } = {},
): Promise<ClienteDoPortal> {
  const contatoId = novoId()
  const acessoId = novoId()
  const email = opcoes.email ?? `cliente-${acessoId}@exemplo.com.br`
  let empresaId = opcoes.empresaId ?? ''
  await noTenant(d.tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    if (!empresaId) {
      empresaId = novoId()
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id)
        VALUES (${empresaId}, ${d.tenantId}, ${`Cliente ${empresaId.slice(-8)} Ltda`}, ${m?.id ?? null})`
    }
    await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${contatoId}, ${d.tenantId}, ${opcoes.nome ?? `Contato ${contatoId.slice(-6)}`})`
    await tx`INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email, papel, situacao, aceito_em)
      VALUES (${acessoId}, ${d.tenantId}, ${contatoId}, ${empresaId}, ${email},
        ${opcoes.papel ?? 'colega'}::papel_portal, ${opcoes.situacao ?? 'ativo'}::situacao_acesso_portal,
        ${(opcoes.situacao ?? 'ativo') === 'ativo' ? new Date() : null})`
  })
  return { dono: d, tenantId: d.tenantId, empresaId, contatoId, acessoId, email }
}

/** Uma empresa (dono) com o portal ligado e um acesso ativo. */
export async function novoClienteDoPortal(
  app: INestApplication<Server>,
  opcoes: Parameters<typeof novoAcesso>[1] & { exige2fa?: boolean } = {},
): Promise<ClienteDoPortal> {
  const d = await novoDono(app)
  await configurarPortal(d.tenantId, { exige2fa: opcoes.exige2fa ?? false })
  return novoAcesso(d, opcoes)
}

/** Cria um link direto no banco (sem e-mail) e devolve o token. */
export async function criarLinkDireto(
  c: Pick<ClienteDoPortal, 'tenantId' | 'acessoId'>,
  finalidade: 'convite' | 'entrada' | 'troca_email',
  opcoes: { minutos?: number; emailDestino?: string } = {},
): Promise<string> {
  const { token, hash } = novoTokenDoPortal(c.tenantId)
  await noTenant(
    c.tenantId,
    (tx) =>
      tx`INSERT INTO portal_links (id, tenant_id, acesso_id, finalidade, token_hash, email_destino, expira_em)
      VALUES (${novoId()}, ${c.tenantId}, ${c.acessoId}, ${finalidade}::finalidade_link_portal, ${hash},
        ${opcoes.emailDestino ?? null}, now() + ${`${opcoes.minutos ?? 15} minutes`}::interval)`,
  )
  return token
}

/** Entra no portal pelo link e devolve o cookie (`nome=valor`) da sessão. */
export async function entrarNoPortal(
  chamar: ReturnType<typeof chamarPortalEm>,
  c: ClienteDoPortal,
): Promise<string> {
  const token = await criarLinkDireto(c, 'entrada')
  const r = await chamar('post', '/portal/link/consumir', {
    corpo: { token, aceitaPrivacidade: true },
  })
  if (r.status !== 200)
    throw new Error(`entrada no portal falhou: ${r.status} ${JSON.stringify(r.body)}`)
  return cookieDe(r)
}

export const cookieDe = (r: { headers: Record<string, unknown> }): string => {
  const set = r.headers['set-cookie'] as string[] | undefined
  const linha = set?.find((l) => l.startsWith(`${COOKIE_DO_PORTAL}=`))
  if (!linha) throw new Error('a resposta não trouxe o cookie do portal')
  return linha.split(';')[0] ?? ''
}

export const hashDe = hashDoTokenDoPortal
