import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { ModulesContainer } from '@nestjs/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CHAVE_PERMISSAO, CHAVE_TODO_MEMBRO } from '../acesso/acesso.decorators.js'
import { CATALOGO_DE_PERMISSOES } from '@leadtogo/shared'
import { criarAppComRotas } from '../testes/app-teste.js'

/**
 * "Nenhuma rota sem decisão" (perfis de acesso, Fase 1): toda rota de negócio declara `@Permissao`
 * (chaves do catálogo) ou `@TodoMembro`. As rotas públicas e de identidade (sessão, conta, 2FA,
 * empresa ativa, saúde) ficam nesta lista explícita, com o motivo; a lista não pode ter sobras.
 */
const FORA_DOS_PERFIS: Record<string, string> = {
  // públicas (sem login)
  'HealthController.verificar': 'saúde do serviço (pública)',
  'AlertasController.verificar': 'saúde dos alertas (pública)',
  'AuthController.tratar': 'Better Auth: login, sessão, 2FA, senha (confere a sessão sozinho)',
  'AcessoPublicoController.opcoes': 'opções do login (pública)',
  'PrimeiroAcessoController.estado': 'primeiro acesso aberto ou fechado (pública)',
  'PrimeiroAcessoController.criar': 'primeiro acesso: cria conta e empresa (pública)',
  'ConvitesPublicosController.consultar': 'convidado ainda sem conta (pública)',
  'ConvitesPublicosController.aceitar': 'convidado ainda sem conta (pública)',
  // identidade: a pessoa, a sessão e a conta, fora da empresa ativa
  'MeController.me': 'quem sou eu e minhas empresas (sem empresa ativa)',
  'MeController.trocarEmpresaAtiva': 'troca de empresa (sem empresa ativa)',
  'PreferenciasController.obter': 'preferências da própria pessoa',
  'PreferenciasController.alterar': 'preferências da própria pessoa',
  'EmpresasController.criar': 'criar empresa: dono ou administrador da conta (papel_conta)',
  'ReceitaController.consultar': 'consulta de CNPJ do formulário: decidida pela rota que grava',
}

type Rota = { chave: string; metodo: string; caminho: string; marcas: string[] }

let app: INestApplication<Server>
const rotas: Rota[] = []

beforeAll(async () => {
  app = await criarAppComRotas([])
  for (const modulo of app.get(ModulesContainer).values()) {
    for (const wrapper of modulo.controllers.values()) {
      const classe = wrapper.metatype as (new (...a: never[]) => unknown) | null
      if (!classe) continue
      const prototipo = classe.prototype as Record<string, unknown>
      for (const nome of Object.getOwnPropertyNames(prototipo)) {
        const handler = prototipo[nome]
        if (nome === 'constructor' || typeof handler !== 'function') continue
        const metodoHttp = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined
        if (metodoHttp === undefined) continue
        const marcas: string[] = []
        const permissao =
          (Reflect.getMetadata(CHAVE_PERMISSAO, handler) as string[] | undefined) ??
          (Reflect.getMetadata(CHAVE_PERMISSAO, classe) as string[] | undefined)
        if (permissao) marcas.push(...permissao.map((p) => `permissao:${p}`))
        if (
          Reflect.getMetadata(CHAVE_TODO_MEMBRO, handler) === true ||
          Reflect.getMetadata(CHAVE_TODO_MEMBRO, classe) === true
        ) {
          marcas.push('todo-membro')
        }
        rotas.push({
          chave: `${classe.name}.${nome}`,
          metodo: String(metodoHttp),
          caminho: `${String(Reflect.getMetadata(PATH_METADATA, classe))}/${String(Reflect.getMetadata(PATH_METADATA, handler))}`,
          marcas,
        })
      }
    }
  }
})
afterAll(() => app.close())

describe('nenhuma rota sem decisão', () => {
  it('achou as rotas da API', () => {
    expect(rotas.length).toBeGreaterThan(100)
  })

  it('toda rota de negócio declara @Permissao ou @TodoMembro', () => {
    const sem = rotas
      .filter((r) => r.marcas.length === 0 && !(r.chave in FORA_DOS_PERFIS))
      .map((r) => `${r.chave} (${r.caminho})`)
    expect(sem).toEqual([])
  })

  it('as rotas da lista explícita não declaram permissão (e a lista não tem sobras)', () => {
    const porChave = new Map(rotas.map((r) => [r.chave, r]))
    const sobras = Object.keys(FORA_DOS_PERFIS).filter((c) => !porChave.has(c))
    expect(sobras).toEqual([])
    const comMarca = Object.keys(FORA_DOS_PERFIS).filter(
      (c) => (porChave.get(c)?.marcas.length ?? 0) > 0,
    )
    expect(comMarca).toEqual([])
  })

  it('@Permissao só usa chaves do catálogo', () => {
    const catalogo = new Set(CATALOGO_DE_PERMISSOES.map((d) => d.chave))
    const desconhecidas = rotas.flatMap((r) =>
      r.marcas
        .filter((m) => m.startsWith('permissao:') && !catalogo.has(m.slice('permissao:'.length)))
        .map((m) => `${r.chave}: ${m}`),
    )
    expect(desconhecidas).toEqual([])
  })
})
