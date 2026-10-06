import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'

import { PrimeiroAcessoService } from '../primeiro-acesso/primeiro-acesso.service.js'
import {
  bancoDeTeste,
  cnpjUnico,
  criarUsuario,
  emailUnico,
  entrar,
  SENHA_PADRAO,
} from './auth-teste.js'

/**
 * Dados de teste para o controle de acesso: contas, empresas e usuários, montados pelo fluxo real
 * (primeiro acesso) e por SQL do owner (com o tenant ativo, por causa do RLS forçado).
 */
export const dono = bancoDeTeste()

export interface Dono {
  usuarioId: string
  email: string
  contaId: string
  tenantId: string
  cookie: string
}

/** Conta nova com uma empresa e o administrador (papel dono da conta e admin da empresa), já logado. */
export async function novoDono(
  app: INestApplication<Server>,
  opcoes: { com2fa?: boolean } = {},
): Promise<Dono> {
  const email = emailUnico('dono')
  const r = await app.get(PrimeiroAcessoService).criar(
    {
      nome: 'Dono de Teste',
      email,
      senha: SENHA_PADRAO,
      empresa: { razaoSocial: `Empresa ${novoId().slice(-8)} Ltda`, cnpj: cnpjUnico() },
    },
    { emailVerificado: true },
  )
  const { cookie } = await entrar(app, email)
  // O 2FA liga DEPOIS do login (com o flag ligado, o login pediria o código)
  if (opcoes.com2fa !== false) await ligar2fa(r.usuarioId)
  return { usuarioId: r.usuarioId, email, contaId: r.contaId, tenantId: r.tenantId, cookie }
}

export const ligar2fa = async (usuarioId: string) => {
  await dono`UPDATE auth."user" SET two_factor_enabled = true WHERE id = ${usuarioId}`
}

/** Nova empresa na mesma conta (como o owner, com o tenant ativo por causa do RLS). */
export async function novaEmpresa(contaId: string, situacao = 'ativo'): Promise<string> {
  const tenantId = novoId()
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO tenants (id, razao_social, conta_id, situacao) VALUES (${tenantId}, ${`Empresa ${tenantId.slice(-8)}`}, ${contaId}, ${situacao})`
  })
  return tenantId
}

/** Empresa em OUTRA conta (nova), para provar o isolamento entre contas. */
export async function empresaDeOutraConta(): Promise<{ contaId: string; tenantId: string }> {
  const contaId = novoId()
  await dono`INSERT INTO contas (id, nome) VALUES (${contaId}, 'Outra conta')`
  return { contaId, tenantId: await novaEmpresa(contaId) }
}

export async function vincular(
  tenantId: string,
  usuarioId: string,
  papel: 'admin' | 'gestor' | 'vendedor',
  nome = 'Membro',
) {
  const id = novoId()
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO membros (id, tenant_id, nome, usuario_id, papel) VALUES (${id}, ${tenantId}, ${nome}, ${usuarioId}, ${papel})`
  })
  return id
}

/** Membro sem login nesta empresa (vendedor externo): só para ter dado que o outro tenant não pode ver. */
export const membroSemLogin = (tenantId: string, nome: string) => vincularSemUsuario(tenantId, nome)
async function vincularSemUsuario(tenantId: string, nome: string) {
  const id = novoId()
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${nome})`
  })
  return id
}

/** Define a empresa ativa de todas as sessões do usuário (a rota de troca de empresa chega no c3). */
export async function ativar(usuarioId: string, tenantId: string | null) {
  await dono`UPDATE auth.session SET empresa_ativa_id = ${tenantId} WHERE user_id = ${usuarioId}`
}

export async function mudarMembro(
  tenantId: string,
  usuarioId: string,
  alteracao: 'ativo = false' | 'excluido_em = now()',
) {
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx.unsafe(`UPDATE membros SET ${alteracao} WHERE usuario_id = '${usuarioId}'`)
  })
}

export async function mudarSituacao(
  tenantId: string,
  situacao: 'suspenso' | 'cancelado' | 'ativo',
) {
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`UPDATE tenants SET situacao = ${situacao} WHERE id = ${tenantId}`
  })
}

export async function usuarioSimples(app: INestApplication<Server>) {
  const u = await criarUsuario(app)
  const { cookie } = await entrar(app, u.email)
  return { ...u, cookie }
}
