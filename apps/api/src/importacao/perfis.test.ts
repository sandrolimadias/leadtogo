import type { Server } from 'node:http'

import { formatarCnae, type PerfilDeImportacao } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')

/** CNAEs de mentira (faixa que nenhuma outra suíte usa): 126 códigos, como a lista que o Ale vai colar. */
const CODIGOS = Array.from({ length: 126 }, (_, i) => 9_980_001 + i)

beforeAll(async () => {
  for (const codigo of CODIGOS) {
    await dono`
      INSERT INTO cnaes (codigo, descricao, secao, divisao, grupo, classe)
      VALUES (${codigo}, ${`Atividade de teste ${codigo}`}, 'C', '99', '998', '99800')
      ON CONFLICT (codigo) DO NOTHING`
  }
})
afterAll(async () => {
  await dono`DELETE FROM cnaes WHERE codigo = ANY(${CODIGOS})`
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'patch' | 'delete'
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  let r = request(app.getHttpServer())
    [metodo](`/v1/importacao/perfis${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const perfilDe = (r: request.Response) => r.body as PerfilDeImportacao

async function equipe() {
  const d = await novoDono(app)
  const gestor = await usuarioSimples(app)
  await vincular(d.tenantId, gestor.id, 'gestor')
  await ativar(gestor.id, d.tenantId)
  const vendedor = await usuarioSimples(app)
  await vincular(d.tenantId, vendedor.id, 'vendedor')
  await ativar(vendedor.id, d.tenantId)
  return { d, gestor, vendedor }
}

describe('/v1/importacao/perfis', () => {
  it('sem sessão 401; qualquer membro lê; gestor e vendedor não escrevem (403)', async () => {
    const { d, gestor, vendedor } = await equipe()
    expect((await chamar('get', undefined, '')).status).toBe(401)
    const criado = perfilDe(await chamar('post', d.cookie, '', { nome: 'Existente' }))
    for (const cookie of [d.cookie, gestor.cookie, vendedor.cookie]) {
      expect((await chamar('get', cookie, '')).body).toHaveLength(1)
    }
    for (const cookie of [gestor.cookie, vendedor.cookie]) {
      const tentativas = [
        chamar('post', cookie, '', { nome: 'Invasor' }),
        chamar('patch', cookie, `/${criado.id}`, { nome: 'Invasor' }),
        chamar('delete', cookie, `/${criado.id}`),
      ]
      for (const r of await Promise.all(tentativas)) {
        expect(r.status).toBe(403)
        expect(erroDe(r)).toBe('acesso_negado')
      }
    }
  })

  it('não nasce nenhum perfil: dados de um cliente não entram no sistema', async () => {
    const { d } = await equipe()
    expect((await chamar('get', d.cookie, '?incluirInativos=true')).body).toEqual([])
  })

  it('cria com as regras padrão, altera e registra a auditoria (a lista de CNAEs só pela quantidade)', async () => {
    const { d } = await equipe()
    const r = await chamar('post', d.cookie, '', { nome: '  Metalurgia ' })
    expect(r.status).toBe(201)
    expect(perfilDe(r)).toMatchObject({
      nome: 'Metalurgia',
      exigeSituacaoAtiva: true,
      estabelecimento: 'ambas',
      excluirMei: false,
      cnaes: [],
      aceitarCnaeSecundario: false,
      acaoForaDoPerfil: 'pular',
      ativo: true,
    })
    const id = perfilDe(r).id

    const alt = await chamar('patch', d.cookie, `/${id}`, {
      estabelecimento: 'matriz',
      excluirMei: true,
      cnaes: CODIGOS.slice(0, 3),
      acaoForaDoPerfil: 'importar_com_tag',
    })
    expect(alt.status).toBe(200)
    expect(perfilDe(alt)).toMatchObject({
      estabelecimento: 'matriz',
      excluirMei: true,
      cnaes: CODIGOS.slice(0, 3),
      acaoForaDoPerfil: 'importar_com_tag',
    })

    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'importacao_perfil')
    expect(reg.map((x) => x.acao)).toEqual(['criar', 'alterar'])
    expect(reg[1]?.alteracoes).toMatchObject({
      estabelecimento: { de: 'ambas', para: 'matriz' },
      cnaes: { de: 0, para: 3 },
    })

    // repetir o mesmo valor não é mudança
    await chamar('patch', d.cookie, `/${id}`, { estabelecimento: 'matriz' })
    expect(
      (await auditoriaDe(d.tenantId)).filter(
        (x) => x.entidade === 'importacao_perfil' && x.acao === 'alterar',
      ),
    ).toHaveLength(1)
  })

  it('guarda uma lista de 126 CNAEs de uma vez', async () => {
    const { d } = await equipe()
    const r = await chamar('post', d.cookie, '', { nome: 'Lista grande', cnaes: CODIGOS })
    expect(r.status).toBe(201)
    const lido = (await chamar('get', d.cookie, '')).body as PerfilDeImportacao[]
    expect(lido[0]?.cnaes).toEqual(CODIGOS)
  })

  it('CNAE que não existe na tabela: 400 cnaes_invalidos e nada é gravado', async () => {
    const { d } = await equipe()
    const r = await chamar('post', d.cookie, '', { nome: 'Ruim', cnaes: [CODIGOS[0], 1_000_001] })
    expect(r.status).toBe(400)
    expect(erroDe(r)).toBe('cnaes_invalidos')
    expect((r.body as RespostaDeErro).mensagem).toContain('1000001')
    expect((await chamar('get', d.cookie, '?incluirInativos=true')).body).toEqual([])
    const ok = perfilDe(await chamar('post', d.cookie, '', { nome: 'Bom' }))
    const alt = await chamar('patch', d.cookie, `/${ok.id}`, { cnaes: [1_000_001] })
    expect(alt.status).toBe(400)
    expect(erroDe(alt)).toBe('cnaes_invalidos')
  })

  it('valida o corpo; nome repetido (sem caixa) 409; id inválido 400; inexistente 404', async () => {
    const { d } = await equipe()
    await chamar('post', d.cookie, '', { nome: 'Único' })
    const dup = await chamar('post', d.cookie, '', { nome: 'ÚNICO' })
    expect(dup.status).toBe(409)
    expect(erroDe(dup)).toBe('nome_duplicado')
    for (const ruim of [
      { nome: '   ' },
      {},
      { nome: 'X', estabelecimento: 'todas' },
      { nome: 'X', acaoForaDoPerfil: 'apagar' },
      { nome: 'X', cnaes: [123] },
      { nome: 'X', extra: 1 },
    ]) {
      expect((await chamar('post', d.cookie, '', ruim)).status, JSON.stringify(ruim)).toBe(400)
    }
    expect((await chamar('patch', d.cookie, '/nao-e-uuid', { nome: 'A' })).status).toBe(400)
    expect(
      (await chamar('patch', d.cookie, '/0199a000-0000-7000-8000-000000000001', { nome: 'A' }))
        .status,
    ).toBe(404)
    const outro = perfilDe(await chamar('post', d.cookie, '', { nome: 'Outro' }))
    expect((await chamar('patch', d.cookie, `/${outro.id}`, { nome: 'único' })).status).toBe(409)
    expect((await chamar('patch', d.cookie, `/${outro.id}`, {})).status).toBe(400)
  })

  it('inativa (some da lista, volta com incluirInativos) e exclui (404 depois, nome liberado)', async () => {
    const { d } = await equipe()
    const p = perfilDe(await chamar('post', d.cookie, '', { nome: 'Para sair' }))
    await chamar('patch', d.cookie, `/${p.id}`, { ativo: false })
    expect((await chamar('get', d.cookie, '')).body).toEqual([])
    expect((await chamar('get', d.cookie, '?incluirInativos=true')).body).toHaveLength(1)
    expect((await chamar('delete', d.cookie, `/${p.id}`)).status).toBe(204)
    expect((await chamar('delete', d.cookie, `/${p.id}`)).status).toBe(404)
    expect((await chamar('post', d.cookie, '', { nome: 'Para sair' })).status).toBe(201)
  })

  it('perfil já usado em um lote só se inativa (409 perfil_em_uso)', async () => {
    const { d } = await equipe()
    const p = perfilDe(await chamar('post', d.cookie, '', { nome: 'Usado' }))
    // O dono do banco também passa pelo RLS forçado: grava com o tenant na sessão
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`
        INSERT INTO importacoes (id, tenant_id, nome, nome_arquivo, perfil_id)
        VALUES (gen_random_uuid(), ${d.tenantId}, 'Lote', 'a.xlsx', ${p.id})`
    })
    const r = await chamar('delete', d.cookie, `/${p.id}`)
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('perfil_em_uso')
    expect((await chamar('patch', d.cookie, `/${p.id}`, { ativo: false })).status).toBe(200)
  })

  it('o perfil de uma empresa não aparece nem se altera em outra (isolamento)', async () => {
    const a = await equipe()
    const b = await equipe()
    const p = perfilDe(await chamar('post', a.d.cookie, '', { nome: 'Da A' }))
    expect((await chamar('get', b.d.cookie, '?incluirInativos=true')).body).toEqual([])
    expect((await chamar('patch', b.d.cookie, `/${p.id}`, { nome: 'Invadido' })).status).toBe(404)
    expect((await chamar('delete', b.d.cookie, `/${p.id}`)).status).toBe(404)
    // O mesmo nome vale em outra empresa
    expect((await chamar('post', b.d.cookie, '', { nome: 'Da A' })).status).toBe(201)
  })
})

describe('POST /v1/importacao/perfis/cnaes/conferir', () => {
  it('lê os 126 códigos colados de uma vez, em formatos e separadores misturados', async () => {
    const { d, vendedor } = await equipe()
    const texto = CODIGOS.map((c, i) => (i % 2 === 0 ? formatarCnae(c) : String(c)))
      .map((c, i) => c + (i % 3 === 0 ? '\n' : i % 3 === 1 ? ', ' : ' ; '))
      .join('')
    // O vendedor também pode conferir (é só leitura)
    for (const cookie of [d.cookie, vendedor.cookie]) {
      const r = await chamar('post', cookie, '/cnaes/conferir', { texto })
      expect(r.status).toBe(200)
      const corpo = r.body as { validos: { codigo: number }[]; invalidos: unknown[] }
      expect(corpo.validos.map((v) => v.codigo)).toEqual(CODIGOS)
      expect(corpo.invalidos).toEqual([])
    }
  })

  it('separa os inválidos antes de salvar: formato errado, inexistente e repetido', async () => {
    const { d } = await equipe()
    const r = await chamar('post', d.cookie, '/cnaes/conferir', {
      texto: `${formatarCnae(CODIGOS[0] as number)}, 123, abc, 1000001, ${CODIGOS[0]}`,
    })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      validos: [{ codigo: CODIGOS[0], descricao: `Atividade de teste ${CODIGOS[0]}` }],
      invalidos: [
        { texto: '123', motivo: 'o CNAE tem 6 ou 7 dígitos' },
        { texto: 'abc', motivo: 'não tem dígitos' },
        { texto: '1000001', motivo: 'não existe na tabela de CNAEs' },
      ],
      repetidos: 1,
    })
    expect((await chamar('post', d.cookie, '/cnaes/conferir', {})).status).toBe(400)
    expect((await chamar('post', undefined, '/cnaes/conferir', { texto: '' })).status).toBe(401)
  })
})
