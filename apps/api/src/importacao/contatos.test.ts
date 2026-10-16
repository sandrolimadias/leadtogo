import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import {
  completarCnpj,
  type ListaDeLinhas,
  type LoteDeImportacao,
  type PreviaDaImportacao,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'
import { ExecutorDaImportacao } from './executor.js'

// Importação de CONTATOS: planilhas e pessoas inventadas aqui; nenhum dado real.

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
const log = pino({ level: 'silent' })
afterAll(async () => {
  await banco.cliente.end({ timeout: 5 })
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

let seq = 0
const cnpjNovo = () =>
  completarCnpj(`7${String(Date.now() % 1_000_000).padStart(6, '0')}${++seq % 10}0001`.slice(0, 12))

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

const descartarEventos = (tenantId: string) =>
  noTenant(
    tenantId,
    (tx) =>
      tx`UPDATE eventos_outbox SET processado_em = now()
         WHERE tipo = 'importacao.executar' AND processado_em IS NULL`,
  )

const chamar = (metodo: 'get' | 'post' | 'patch', cookie: string, url: string, corpo?: unknown) => {
  const r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}

const CABECALHO = [
  'CNPJ',
  'Nome',
  'Cargo',
  'E-mail',
  'Telefone',
  'Celular',
  'Papel',
  'Aniversário',
  'LinkedIn',
  'Principal',
  'Não quer contato',
  'Obs',
]
const CAMPOS = {
  documento: 'CNPJ',
  nome: 'Nome',
  cargo: 'Cargo',
  email: 'E-mail',
  telefone: 'Telefone',
  celular: 'Celular',
  papel: 'Papel',
  aniversario: 'Aniversário',
  linkedin: 'LinkedIn',
  principal: 'Principal',
  naoQuerContato: 'Não quer contato',
  observacoes: 'Obs',
}
/** Uma linha da planilha: só o que o teste precisa, o resto em branco. */
const linha = (cnpj: string, nome: string, extra: Record<string, string> = {}) =>
  CABECALHO.map((c) => (c === 'CNPJ' ? cnpj : c === 'Nome' ? nome : (extra[c] ?? ''))).join(';')

/** Empresa (com CNPJ) já na carteira. */
async function criarEmpresa(tenantId: string, membroId: string, nome: string) {
  const cnpj = cnpjNovo()
  const id = await noTenant(tenantId, async (tx) => {
    const [e] = await tx<{ id: string }[]>`
      INSERT INTO empresas (id, tenant_id, tipo_documento, documento, razao_social, vendedor_id)
      VALUES (gen_random_uuid(), ${tenantId}, 'cnpj', ${cnpj}, ${nome}, ${membroId}) RETURNING id`
    return (e as { id: string }).id
  })
  return { id, cnpj }
}

async function cenario(
  corpo: (a: { a: { id: string; cnpj: string }; b: { id: string; cnpj: string } }) => string[],
) {
  const d = await novoDono(app)
  const membroId = await noTenant(d.tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    return (m as { id: string }).id
  })
  const a = await criarEmpresa(d.tenantId, membroId, 'Empresa A')
  const b = await criarEmpresa(d.tenantId, membroId, 'Empresa B')
  const csv = [CABECALHO.join(';'), ...corpo({ a, b })].join('\n')
  const criado = await request(app.getHttpServer())
    .post('/v1/importacao/lotes?arquivo=contatos.csv&tipo=contatos')
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', d.cookie)
    .set('Content-Type', 'application/octet-stream')
    .send(csv)
  expect(criado.status, JSON.stringify(criado.body)).toBe(201)
  const lote = criado.body as LoteDeImportacao
  const r = await chamar('patch', d.cookie, `/v1/importacao/lotes/${lote.id}`, { campos: CAMPOS })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  expect((r.body as LoteDeImportacao).situacao).toBe('pronta')
  return { d, membroId, lote, a, b }
}

const executar = async (d: { cookie: string; tenantId: string }, id: string) => {
  expect((await chamar('post', d.cookie, `/v1/importacao/lotes/${id}/iniciar`)).status).toBe(200)
  await descartarEventos(d.tenantId)
  return new ExecutorDaImportacao({
    banco,
    receita: {
      consultar: () => Promise.reject(new Error('contatos não consultam a Receita')),
    },
    log,
    esperar: () => Promise.resolve(),
  }).executar(d.tenantId, id)
}

const linhasDe = (tenantId: string, loteId: string) =>
  noTenant(
    tenantId,
    (tx) =>
      tx<
        {
          numero: number
          resultado: string
          motivo: string | null
          avisos: string[]
          contato_id: string | null
        }[]
      >`SELECT numero, resultado::text AS resultado, motivo, avisos, contato_id
        FROM importacao_linhas WHERE importacao_id = ${loteId} ORDER BY numero`,
  )
const resultados = async (t: string, l: string) => (await linhasDe(t, l)).map((x) => x.resultado)

describe('importação de contatos: criar, vincular e pular', () => {
  it('lê a planilha, cria contatos, vincula o que já existe sem mexer nele e pula o que não vale', async () => {
    const c = await cenario(({ a, b }) => [
      // 1 novo, completo
      linha(a.cnpj, 'Maria Silva', {
        Cargo: 'Diretora',
        'E-mail': 'Maria@Exemplo.com.br',
        Telefone: '(27) 3064-3021',
        Celular: '27 99999-0001',
        Papel: 'decisor',
        Aniversário: '15/03',
        LinkedIn: 'https://www.linkedin.com/in/maria',
        Principal: 'sim',
      }),
      // 2 mesmo e-mail em OUTRA empresa: vincula ao existente (dados dele não mudam)
      linha(b.cnpj, 'Maria S. (outro nome)', { 'E-mail': 'maria@exemplo.com.br', Cargo: 'Sócia' }),
      // 3 mesmo telefone, e-mail novo: também é o mesmo contato
      linha(b.cnpj, 'Maria de novo', {
        'E-mail': 'outro@exemplo.com.br',
        Telefone: '27 99999-0001',
      }),
      // 4 já vinculada à empresa
      linha(a.cnpj, 'Maria Silva', { 'E-mail': 'maria@exemplo.com.br' }),
      // 5 CNPJ que não está na carteira
      linha(cnpjNovo(), 'Sem empresa', { 'E-mail': 'sem@exemplo.com.br' }),
      // 6 CNPJ inválido
      linha('123', 'CNPJ ruim'),
      // 7 e-mail inválido pula
      linha(a.cnpj, 'E-mail ruim', { 'E-mail': 'sem-arroba' }),
      // 8 telefone inválido pula
      linha(a.cnpj, 'Fone ruim', { Telefone: '12' }),
      // 9 aniversário e LinkedIn inválidos entram com aviso; papel inexistente também
      linha(a.cnpj, 'João Souza', {
        'E-mail': 'joao@exemplo.com.br',
        Aniversário: '31/02',
        LinkedIn: 'meu perfil',
        Papel: 'Rei do universo',
        'Não quer contato': 'sim',
      }),
      // 10 duplicado com "não quer contato": ignorado, com aviso
      linha(b.cnpj, 'João de novo', { 'E-mail': 'joao@exemplo.com.br', 'Não quer contato': 'sim' }),
      // 11 principal numa empresa que já tem principal: não troca
      linha(a.cnpj, 'Pedro Lima', { 'E-mail': 'pedro@exemplo.com.br', Principal: 'sim' }),
      // 12 nome em branco
      linha(a.cnpj, '', { 'E-mail': 'sem.nome@exemplo.com.br' }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')

    const linhas = await linhasDe(c.d.tenantId, c.lote.id)
    expect(linhas.map((l) => l.resultado)).toEqual([
      'criada',
      'vinculada',
      'ja_vinculada', // a linha 2 já ligou a Maria à B: o mesmo telefone na B não liga de novo
      'ja_vinculada',
      'pulada_empresa_inexistente',
      'pulada_sem_cnpj',
      'pulada_invalida',
      'pulada_invalida',
      'criada',
      'vinculada',
      'criada',
      'pulada_invalida',
    ])
    expect(linhas[6]?.motivo).toContain('E-mail inválido')
    expect(linhas[7]?.motivo).toContain('Telefone inválido')
    // avisos: aniversário, LinkedIn e papel (linha 9); "não quer contato" ignorado (linha 10); principal (linha 11)
    expect(linhas[8]?.avisos).toHaveLength(3)
    expect(linhas[9]?.avisos.join(' ')).toContain('Não quer contato')
    expect(linhas[10]?.avisos.join(' ')).toContain('principal')

    // Só 3 contatos nasceram (Maria, João, Pedro), todos com o lote registrado
    const contatos = await noTenant(
      c.d.tenantId,
      (tx) => tx<
        {
          nome: string
          aceita_whatsapp: boolean
          aceita_email: boolean
          origem: string | null
          papel: string | null
          dia: number | null
          linkedin: string | null
        }[]
      >`SELECT nome, aceita_whatsapp, aceita_email, consentimento_origem AS origem, papel_decisao_id::text AS papel,
               aniversario_dia AS dia, linkedin_url AS linkedin
        FROM contatos WHERE importacao_id = ${c.lote.id} ORDER BY nome`,
    )
    expect(contatos.map((x) => x.nome)).toEqual(['João Souza', 'Maria Silva', 'Pedro Lima'])
    const [joao, maria] = contatos
    expect(joao).toMatchObject({
      aceita_whatsapp: false,
      aceita_email: false,
      origem: 'importacao',
      papel: null,
      dia: null,
      linkedin: null,
    })
    expect(maria).toMatchObject({
      aceita_whatsapp: true,
      dia: 15,
      linkedin: 'https://www.linkedin.com/in/maria',
    })
    expect(maria?.papel).not.toBeNull() // "decisor" casa com o papel Decisor, sem maiúsculas

    // A Maria: dois telefones em E.164 (o primeiro é o principal) e um e-mail em minúsculas
    const dadosDaMaria = await noTenant(c.d.tenantId, async (tx) => ({
      tels: await tx<{ e: string; t: string; p: boolean; o: string }[]>`
        SELECT t.numero_e164 AS e, t.tipo::text AS t, t.principal AS p, t.origem::text AS o
        FROM contato_telefones t JOIN contatos c ON c.id = t.contato_id
        WHERE c.nome = 'Maria Silva' ORDER BY t.numero_e164`,
      emails: await tx<{ email: string }[]>`
        SELECT e.email::text AS email FROM contato_emails e JOIN contatos c ON c.id = e.contato_id
        WHERE c.nome = 'Maria Silva'`,
      vinculos: await tx<
        { empresa: string; cargo: string | null; principal: boolean; lote: string | null }[]
      >`
        SELECT e.razao_social AS empresa, ec.cargo, ec.principal, ec.importacao_id::text AS lote
        FROM empresa_contatos ec JOIN empresas e ON e.id = ec.empresa_id
        JOIN contatos c ON c.id = ec.contato_id WHERE c.nome = 'Maria Silva' ORDER BY e.razao_social`,
    }))
    expect(dadosDaMaria.tels.map((t) => t.e)).toEqual(['+552730643021', '+5527999990001'])
    expect(dadosDaMaria.tels.every((t) => t.o === 'importacao')).toBe(true)
    expect(dadosDaMaria.emails).toEqual([{ email: 'maria@exemplo.com.br' }])
    // vínculo com A (cargo e principal da linha 1) e com B (cargo da linha 2, sem principal)
    expect(dadosDaMaria.vinculos).toEqual([
      { empresa: 'Empresa A', cargo: 'Diretora', principal: true, lote: c.lote.id },
      { empresa: 'Empresa B', cargo: 'Sócia', principal: false, lote: c.lote.id },
    ])
    // o contato que já existia NÃO mudou: o nome continua o da primeira linha
    expect(dadosDaMaria.vinculos).toHaveLength(2)
    // Pedro pediu principal, mas A já tinha a Maria como principal
    const principalDeA = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ nome: string }[]>`
      SELECT c.nome FROM empresa_contatos ec JOIN contatos c ON c.id = ec.contato_id
      WHERE ec.empresa_id = ${c.a.id} AND ec.principal`,
    )
    expect(principalDeA).toEqual([{ nome: 'Maria Silva' }])
  })

  it('a prévia prevê o que o worker fez (mesma leitura) e não grava nada', async () => {
    const c = await cenario(({ a, b }) => [
      linha(a.cnpj, 'Ana Costa', { 'E-mail': 'ana@exemplo.com.br' }),
      linha(b.cnpj, 'Ana Costa', { 'E-mail': 'ana@exemplo.com.br' }),
      linha(a.cnpj, 'Ana Costa', { 'E-mail': 'ana@exemplo.com.br' }),
      linha(a.cnpj, 'Bruno Dias', { 'E-mail': 'sem-arroba' }),
      linha(cnpjNovo(), 'Carla Reis'),
      linha('', 'Sem CNPJ'),
    ])
    const antes = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM contatos`,
    )
    const previa = (await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/previa`))
      .body as PreviaDaImportacao
    expect(previa).toMatchObject({
      totalLinhas: 6,
      aImportar: 2,
      semCnpjValido: 1,
      consultaAReceita: false,
      previsao: {
        criada: 1,
        vinculada: 1,
        ja_vinculada: 1,
        pulada_invalida: 1,
        pulada_empresa_inexistente: 1,
        pulada_sem_cnpj: 1,
      },
    })
    const depois = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM contatos`,
    )
    expect(depois).toEqual(antes)
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const feitas = await resultados(c.d.tenantId, c.lote.id)
    const contagem = (r: string) => feitas.filter((x) => x === r).length
    expect(contagem('criada')).toBe(previa.previsao?.['criada'])
    expect(contagem('vinculada')).toBe(previa.previsao?.['vinculada'])
    expect(contagem('ja_vinculada')).toBe(previa.previsao?.['ja_vinculada'])
  })

  it('dois executores no mesmo lote não duplicam contato nem perdem linha', async () => {
    const c = await cenario(({ a, b }) => [
      ...Array.from({ length: 12 }, (_, i) =>
        linha(i % 2 ? a.cnpj : b.cnpj, `Pessoa ${i}`, {
          'E-mail': `p${Math.floor(i / 2)}@exemplo.com.br`,
        }),
      ),
    ])
    expect(
      (await chamar('post', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/iniciar`)).status,
    ).toBe(200)
    await descartarEventos(c.d.tenantId)
    const novo = () =>
      new ExecutorDaImportacao({
        banco,
        receita: { consultar: () => Promise.reject(new Error('sem Receita')) },
        log,
        esperar: () => Promise.resolve(),
        limites: { linhas: 3, duracaoMs: 90_000 },
      })
    const desfechos = await Promise.all([
      novo().executar(c.d.tenantId, c.lote.id),
      novo().executar(c.d.tenantId, c.lote.id),
    ])
    expect(desfechos.every((x) => x === 'concluida' || x === 'ignorada')).toBe(true)
    const feitas = await resultados(c.d.tenantId, c.lote.id)
    expect(feitas).toHaveLength(12)
    expect(feitas.every((x) => x !== 'pendente')).toBe(true)
    // 6 e-mails diferentes = 6 contatos, cada um com 2 vínculos (as duas empresas)
    const [n] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM contatos`,
    )
    expect(n?.n).toBe(6)
  })
})

describe('importação de contatos: desfazer', () => {
  it('tira os contatos que o lote criou, inativa os vínculos com quem já existia e mantém o que mudou depois', async () => {
    const c = await cenario(({ a, b }) => [
      linha(a.cnpj, 'Nova Um', { 'E-mail': 'um@exemplo.com.br' }),
      linha(a.cnpj, 'Nova Dois', { 'E-mail': 'dois@exemplo.com.br' }),
      linha(b.cnpj, 'Nova Um (B)', { 'E-mail': 'um@exemplo.com.br' }),
    ])
    // um contato que JÁ existia, ligado à empresa A, que a planilha vincula à B
    await noTenant(c.d.tenantId, async (tx) => {
      const [x] = await tx<{ id: string }[]>`
        INSERT INTO contatos (id, tenant_id, nome) VALUES (gen_random_uuid(), ${c.d.tenantId}, 'Antigo') RETURNING id`
      await tx`INSERT INTO contato_emails (id, tenant_id, contato_id, email) VALUES (gen_random_uuid(), ${c.d.tenantId}, ${(x as { id: string }).id}, 'antigo@exemplo.com.br')`
      await tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (gen_random_uuid(), ${c.d.tenantId}, ${c.a.id}, ${(x as { id: string }).id})`
    })
    // acrescenta a linha do contato antigo (e-mail igual) na empresa B
    const csvExtra = linha(c.b.cnpj, 'Antigo (outra grafia)', { 'E-mail': 'antigo@exemplo.com.br' })
    await noTenant(
      c.d.tenantId,
      (tx) => tx`
      INSERT INTO importacao_linhas (id, tenant_id, importacao_id, numero, dados)
      VALUES (gen_random_uuid(), ${c.d.tenantId}, ${c.lote.id}, 4,
              ${tx.json(Object.fromEntries(CABECALHO.map((h, i) => [h, csvExtra.split(';')[i] ?? ''])))})`,
    )
    await noTenant(
      c.d.tenantId,
      (tx) => tx`UPDATE importacoes SET total_linhas = 4 WHERE id = ${c.lote.id}`,
    )
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual([
      'criada',
      'criada',
      'vinculada',
      'vinculada',
    ])

    // Depois do lote alguém renomeia a "Nova Dois" (alteração: ela fica) pela API
    const dois = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM contatos WHERE nome = 'Nova Dois'`,
    )
    const alterado = await chamar('patch', c.d.cookie, `/v1/carteira/contatos/${dois[0]?.id}`, {
      nome: 'Nova Dois Editada',
    })
    expect(alterado.status, JSON.stringify(alterado.body)).toBe(200)

    const r = await chamar('post', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/desfazer`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((r.body as LoteDeImportacao).situacao).toBe('desfeita')

    const estado = await noTenant(c.d.tenantId, async (tx) => ({
      contatos: await tx<{ nome: string; excluido: boolean }[]>`
        SELECT nome, excluido_em IS NOT NULL AS excluido FROM contatos ORDER BY nome`,
      vinculos: await tx<{ nome: string; empresa: string; ativo: boolean }[]>`
        SELECT c.nome, e.razao_social AS empresa, ec.ativo FROM empresa_contatos ec
        JOIN contatos c ON c.id = ec.contato_id JOIN empresas e ON e.id = ec.empresa_id
        ORDER BY c.nome, e.razao_social`,
    }))
    // "Nova Um" saiu; "Nova Dois Editada" ficou (alterada); "Antigo" sempre fica
    expect(estado.contatos).toEqual([
      { nome: 'Antigo', excluido: false },
      { nome: 'Nova Dois Editada', excluido: false },
      { nome: 'Nova Um', excluido: true },
    ])
    // O vínculo do Antigo com A (anterior ao lote) continua; o com B, criado pelo lote, foi inativado
    expect(estado.vinculos).toContainEqual({ nome: 'Antigo', empresa: 'Empresa A', ativo: true })
    expect(estado.vinculos).toContainEqual({ nome: 'Antigo', empresa: 'Empresa B', ativo: false })
    // O contato mantido continua vinculado (alguém mexeu nele)
    expect(estado.vinculos).toContainEqual({
      nome: 'Nova Dois Editada',
      empresa: 'Empresa A',
      ativo: true,
    })
    const lote = (await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}`))
      .body as LoteDeImportacao
    expect(lote.desfeito).toEqual({ removidas: 4, mantidas: 2 })
  })
})

describe('importação de contatos: API e permissões', () => {
  it('só administrador e gestor; as escolhas das empresas não valem para contatos; mapeamento pede CNPJ e Nome', async () => {
    const c = await cenario(({ a }) => [linha(a.cnpj, 'Teste')])
    const vendedor = await usuarioSimples(app)
    await vincular(c.d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, c.d.tenantId)
    const csv = [CABECALHO.join(';'), linha(c.a.cnpj, 'X')].join('\n')
    const negado = await request(app.getHttpServer())
      .post('/v1/importacao/lotes?arquivo=c.csv&tipo=contatos')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', vendedor.cookie)
      .set('Content-Type', 'application/octet-stream')
      .send(csv)
    expect(negado.status).toBe(403)
    expect(
      (await chamar('get', vendedor.cookie, `/v1/importacao/modelo?tipo=contatos`)).status,
    ).toBe(403)

    const emp = await chamar('patch', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}`, {
      fonteDados: 'receita',
    })
    expect(emp.status).toBe(400)
    expect((emp.body as { erro: string }).erro).toBe('campo_so_de_empresas')
    const semNome = await chamar('patch', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}`, {
      campos: { documento: 'CNPJ' },
    })
    expect(semNome.status).toBe(200)
    expect((semNome.body as LoteDeImportacao).situacao).toBe('rascunho')
    expect((semNome.body as LoteDeImportacao).pendencias.join(' ')).toContain('Nome')
    expect(
      (await chamar('post', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/iniciar`)).status,
    ).toBe(409)
  })

  it('o modelo de contatos é um .xlsx; tipo desconhecido é 400', async () => {
    const c = await cenario(({ a }) => [linha(a.cnpj, 'Teste')])
    const ok = await chamar('get', c.d.cookie, '/v1/importacao/modelo?tipo=contatos').buffer(true)
    expect(ok.status).toBe(200)
    expect(ok.headers['content-disposition']).toContain('modelo-importacao-contatos.xlsx')
    expect((await chamar('get', c.d.cookie, '/v1/importacao/modelo?tipo=produtos')).status).toBe(
      400,
    )
  })

  it('uma empresa não importa contatos para a carteira de outra: o CNPJ da outra é "não está na carteira"', async () => {
    const outra = await novoDono(app)
    const membroDaOutra = await noTenant(outra.tenantId, async (tx) => {
      const [m] = await tx<
        { id: string }[]
      >`SELECT id FROM membros WHERE usuario_id = ${outra.usuarioId}`
      return (m as { id: string }).id
    })
    const daOutra = await criarEmpresa(outra.tenantId, membroDaOutra, 'Empresa da outra')
    const c = await cenario(() => [
      linha(daOutra.cnpj, 'Invasor', { 'E-mail': 'inv@exemplo.com.br' }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual(['pulada_empresa_inexistente'])
    const [n] = await noTenant(
      outra.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM contatos`,
    )
    expect(n?.n).toBe(0)
  })

  it('o relatório mostra o contato criado e os avisos; o CSV só traz o que não entrou', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, 'Com Aviso', { 'E-mail': 'aviso@exemplo.com.br', Aniversário: 'xx' }),
      linha(a.cnpj, 'E-mail Ruim', { 'E-mail': 'ruim' }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const lista = (await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/linhas`))
      .body as ListaDeLinhas
    expect(lista.itens[0]).toMatchObject({ resultado: 'criada', contatoNome: 'Com Aviso' })
    expect(lista.itens[0]?.avisos).toHaveLength(1)
    expect(lista.itens[1]).toMatchObject({ resultado: 'pulada_invalida', contatoId: null })
    const csv = await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/problemas.csv`)
    expect(csv.status).toBe(200)
    expect(csv.text).toContain('E-mail Ruim')
    expect(csv.text).not.toContain('Com Aviso')
    expect(csv.text).toContain('Pulada: dado inválido')
  })
})
