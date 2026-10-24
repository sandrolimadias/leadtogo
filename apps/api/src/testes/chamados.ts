import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { ORIGEM_DO_FRONT } from './auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from './mundo.js'

// Apoio dos testes da central de chamados: pessoas com perfis de acesso sob medida, chamadas HTTP e SQL
// direto do owner (com o tenant ativo, por causa do RLS).

export type Metodo = 'get' | 'put' | 'post' | 'patch' | 'delete'

let ip = 0
export const chamarEm =
  (app: () => INestApplication<Server>) =>
  (metodo: Metodo, cookie: string, url: string, corpo?: unknown) => {
    ip += 1
    const r = request(app().getHttpServer())
      [metodo](`/v1${url}`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('X-Forwarded-For', `10.9.${Math.floor(ip / 250)}.${ip % 250}`)
      .set('Cookie', cookie)
    return corpo === undefined ? r : r.send(corpo as object)
  }

export const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

export interface Pessoa {
  usuarioId: string
  membroId: string
  cookie: string
  perfilId: string
}

/** Atalhos das permissões (alcance `null` onde a permissão não admite alcance). */
export const PERMISSOES = {
  /** Abre chamados e vê/atende o que é dele */
  solicitante: { 'chamados.ver': 'propria', 'chamados.criar': null } as Permissoes,
  atendente: {
    'chamados.ver': 'propria',
    'chamados.criar': null,
    'chamados.atender': 'propria',
  } as Permissoes,
  triador: {
    'chamados.ver': 'propria',
    'chamados.criar': null,
    'chamados.triar': null,
  } as Permissoes,
  gestorDeArea: {
    'chamados.ver': 'propria',
    'chamados.criar': null,
    'chamados.atender': 'propria',
    'chamados.atribuir': null,
  } as Permissoes,
  tudo: {
    'chamados.ver': 'todas',
    'chamados.criar': null,
    'chamados.atender': 'todas',
    'chamados.triar': null,
    'chamados.atribuir': null,
    'chamados.gerir_areas': null,
    'chamados.ver_metricas': 'todas',
    'chamados.exportar': null,
  } as Permissoes,
}
export type Permissoes = Record<string, string | null>

/** Uma empresa nova com o administrador (dono) e um jeito de criar pessoas com perfis sob medida. */
export async function empresaDeChamados(app: INestApplication<Server>) {
  const d = await novoDono(app)
  const [admin] = await noTenant(
    d.tenantId,
    (tx) => tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`,
  )
  const adminId = admin?.id ?? ''
  const pessoa = async (
    nome: string,
    permissoes: Permissoes,
    opcoes: { gestorId?: string } = {},
  ): Promise<Pessoa> => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, 'vendedor', nome)
    await ativar(u.id, d.tenantId)
    const perfilId = novoId()
    await noTenant(d.tenantId, async (tx) => {
      await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${perfilId}, ${d.tenantId}, ${`${nome} ${perfilId.slice(-6)}`})`
      for (const [permissao, alcance] of Object.entries(permissoes)) {
        await tx`INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
          VALUES (${d.tenantId}, ${perfilId}, ${permissao}, ${alcance}::alcance_permissao)`
      }
      await tx`UPDATE membros SET perfil_id = ${perfilId}, gestor_id = ${opcoes.gestorId ?? null} WHERE id = ${membroId}`
    })
    return { usuarioId: u.id, membroId, cookie: u.cookie, perfilId }
  }
  const areaPadrao = async (chave: string) => {
    const [a] = await noTenant(
      d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM areas_atendimento WHERE chave_sistema = ${chave}`,
    )
    return a?.id ?? ''
  }
  return { d, adminId, pessoa, areaPadrao }
}
