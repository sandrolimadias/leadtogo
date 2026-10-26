import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner, type Sql } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const owner = conectarOwner()
const app = conectarApp()
afterAll(async () => {
  await owner.end()
  await app.end()
})

type Sessao = { acesso: string; empresa: string; contato: string }
type Tx = Parameters<Parameters<Sql['begin']>[1]>[0]

const comoCliente = <T>(c: { tenantId: string }, sessao: Sessao, fn: (tx: Tx) => Promise<T>) =>
  comTenant(app, c.tenantId, async (tx) => {
    await tx`SELECT set_config('app.portal_acesso_id', ${sessao.acesso}, true)`
    await tx`SELECT set_config('app.portal_empresa_id', ${sessao.empresa}, true)`
    await tx`SELECT set_config('app.portal_contato_id', ${sessao.contato}, true)`
    return fn(tx)
  })

async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const membro = novoId()
  const empresaA = novoId()
  const empresaB = novoId()
  const ids = {
    aviso: novoId(),
    acessoA: novoId(),
    acessoB: novoId(),
    contatoA: novoId(),
    contatoB: novoId(),
  }
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membro}, ${tenantId}, 'Equipe')`
    for (const [empresa, contato, acesso] of [
      [empresaA, ids.contatoA, ids.acessoA],
      [empresaB, ids.contatoB, ids.acessoB],
    ] as const) {
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresa}, ${tenantId}, ${`Cliente ${empresa}`}, ${membro})`
      await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${contato}, ${tenantId}, 'Contato')`
      await tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (${novoId()}, ${tenantId}, ${empresa}, ${contato})`
      await tx`INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email, situacao)
        VALUES (${acesso}, ${tenantId}, ${contato}, ${empresa}, ${`${acesso}@exemplo.com.br`}, 'ativo')`
    }
    await tx`INSERT INTO avisos (id, tenant_id, mensagem, enviar_em) VALUES (${ids.aviso}, ${tenantId}, 'Expediente encerra às 14h', now() - interval '1 minute')`
    for (const [acesso, empresa] of [
      [ids.acessoA, empresaA],
      [ids.acessoB, empresaB],
    ] as const) {
      await tx`INSERT INTO aviso_entregas (id, tenant_id, aviso_id, acesso_id, empresa_id, push_enviar_em)
        VALUES (${novoId()}, ${tenantId}, ${ids.aviso}, ${acesso}, ${empresa}, now() - interval '1 minute')`
    }
  })
  const sessaoA: Sessao = { acesso: ids.acessoA, empresa: empresaA, contato: ids.contatoA }
  const sessaoB: Sessao = { acesso: ids.acessoB, empresa: empresaB, contato: ids.contatoB }
  return { tenantId, ids, sessaoA, sessaoB }
}

describe('avisos: o cliente não lê nem grava a gestão', () => {
  it('avisos e alcance ficam fechados ao portal (só a equipe e o worker)', async () => {
    const c = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM avisos`).toHaveLength(0)
      expect(await tx`SELECT id FROM aviso_empresas`).toHaveLength(0)
    })
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO avisos (id, tenant_id, mensagem) VALUES (${novoId()}, ${c.tenantId}, 'X')`,
      ),
    ).rejects.toThrow(/row-level security/)
    await comTenant(app, c.tenantId, async (tx) => {
      expect(await tx`SELECT id FROM avisos`).toHaveLength(1)
    })
  })

  it('a entrega: o cliente lê e marca como lida só a própria; não cria nem apaga', async () => {
    const c = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      const linhas = await tx`SELECT acesso_id FROM aviso_entregas`
      expect(linhas.map((l) => String(l['acesso_id']))).toEqual([c.ids.acessoA])
      expect(await tx`UPDATE aviso_entregas SET lido_em = now() RETURNING id`).toHaveLength(1)
      expect(await tx`DELETE FROM aviso_entregas RETURNING id`).toHaveLength(0)
    })
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) => tx`INSERT INTO aviso_entregas (id, tenant_id, aviso_id, acesso_id, empresa_id)
        VALUES (${novoId()}, ${c.tenantId}, ${c.ids.aviso}, ${c.ids.acessoA}, ${c.sessaoA.empresa})`,
      ),
    ).rejects.toThrow(/row-level security/)
    await comTenant(owner, c.tenantId, async (tx) => {
      const lidos = await tx`SELECT acesso_id FROM aviso_entregas WHERE lido_em IS NOT NULL`
      expect(lidos.map((l) => String(l['acesso_id']))).toEqual([c.ids.acessoA])
    })
  })
})

describe('preferências e inscrições de push', () => {
  it('cada cliente cuida só das próprias preferências; uma por acesso; silêncio com os dois horários e diferentes', async () => {
    const c = await cenario()
    const inserir = (s: Sessao, extra = '') =>
      comoCliente(c, s, (tx) =>
        tx.unsafe(
          `INSERT INTO portal_preferencias (id, tenant_id, acesso_id ${extra ? ', ' + extra.split('|')[0] : ''})
           VALUES ('${novoId()}', '${c.tenantId}', '${s.acesso}' ${extra ? ', ' + extra.split('|')[1] : ''})`,
        ),
      )
    await inserir(c.sessaoA, "silencio_inicio, silencio_fim|'22:00', '07:00'")
    await expect(inserir(c.sessaoA)).rejects.toThrow(/portal_preferencias_acesso_uq/)
    await expect(inserir(c.sessaoB, "silencio_inicio|'22:00'")).rejects.toThrow(
      /portal_preferencias_silencio_chk/,
    )
    await expect(
      inserir(c.sessaoB, "silencio_inicio, silencio_fim|'22:00', '22:00'"),
    ).rejects.toThrow(/portal_preferencias_silencio_chk/)
    await expect(
      comoCliente(
        c,
        c.sessaoB,
        (tx) => tx`INSERT INTO portal_preferencias (id, tenant_id, acesso_id)
        VALUES (${novoId()}, ${c.tenantId}, ${c.ids.acessoA})`,
      ),
    ).rejects.toThrow(/row-level security/)
    await comoCliente(c, c.sessaoB, async (tx) => {
      expect(await tx`SELECT id FROM portal_preferencias`).toHaveLength(0)
      expect(
        await tx`UPDATE portal_preferencias SET email_avisos = false RETURNING id`,
      ).toHaveLength(0)
    })
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(
        await tx`UPDATE portal_preferencias SET email_avisos = false RETURNING id`,
      ).toHaveLength(1)
      expect(await tx`DELETE FROM portal_preferencias RETURNING id`).toHaveLength(0)
    })
  })

  it('o cliente gerencia só as próprias inscrições de push; o endereço é único', async () => {
    const c = await cenario()
    const inscrever = (s: Sessao, endpoint: string, acesso = s.acesso) =>
      comoCliente(
        c,
        s,
        (
          tx,
        ) => tx`INSERT INTO portal_push_inscricoes (id, tenant_id, acesso_id, endpoint, chave_p256dh, chave_auth)
        VALUES (${novoId()}, ${c.tenantId}, ${acesso}, ${endpoint}, 'k', 'a')`,
      )
    const e1 = `https://push.exemplo.com/${novoId()}`
    await inscrever(c.sessaoA, e1)
    await expect(inscrever(c.sessaoB, e1)).rejects.toThrow(/portal_push_endpoint_uq/)
    await expect(
      inscrever(c.sessaoB, `https://push.exemplo.com/${novoId()}`, c.ids.acessoA),
    ).rejects.toThrow(/row-level security/)
    await comoCliente(c, c.sessaoB, async (tx) => {
      expect(await tx`SELECT id FROM portal_push_inscricoes`).toHaveLength(0)
      expect(await tx`DELETE FROM portal_push_inscricoes RETURNING id`).toHaveLength(0)
    })
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM portal_push_inscricoes`).toHaveLength(1)
      expect(await tx`DELETE FROM portal_push_inscricoes RETURNING id`).toHaveLength(1)
    })
  })
})

describe('regras da tabela de avisos e varredura do worker', () => {
  it('mensagem de 1 a 140 caracteres, link do portal ou http(s), situação e datas coerentes', async () => {
    const c = await cenario()
    const inserir = (mensagem: string, extra = '') =>
      comTenant(owner, c.tenantId, (tx) =>
        tx.unsafe(
          `INSERT INTO avisos (id, tenant_id, mensagem ${extra ? ', ' + extra.split('|')[0] : ''}) VALUES ('${novoId()}', '${c.tenantId}', $1 ${extra ? ', ' + extra.split('|')[1] : ''})`,
          [mensagem],
        ),
      )
    await expect(inserir('   ')).rejects.toThrow(/avisos_mensagem_chk/)
    await expect(inserir('x'.repeat(141))).rejects.toThrow(/(avisos_mensagem_chk|value too long)/)
    await inserir('x'.repeat(140))
    await inserir('Veja a agenda', "link|'/agenda'")
    await inserir('Veja o site', "link|'https://exemplo.com.br/novidade'")
    await expect(inserir('Link ruim', "link|'javascript:alert(1)'")).rejects.toThrow(
      /avisos_link_chk/,
    )
    await expect(inserir('Link ruim', "link|'//evil.com'")).rejects.toThrow(/avisos_link_chk/)
    await expect(inserir('Enviado sem data', "situacao|'enviado'")).rejects.toThrow(
      /avisos_enviado_chk/,
    )
    await expect(inserir('Cancelado sem data', "situacao|'cancelado'")).rejects.toThrow(
      /avisos_cancelado_chk/,
    )
  })

  it('app_avisos_a_enviar e app_pushes_pendentes acham só o que já venceu, em qualquer empresa', async () => {
    const c = await cenario()
    const futuro = novoId()
    await comTenant(owner, c.tenantId, async (tx) => {
      await tx`INSERT INTO avisos (id, tenant_id, mensagem, enviar_em) VALUES (${futuro}, ${c.tenantId}, 'Amanhã', now() + interval '1 day')`
    })
    const avisos = (await app`SELECT id FROM app_avisos_a_enviar()`).map((l) => String(l['id']))
    expect(avisos).toContain(c.ids.aviso)
    expect(avisos).not.toContain(futuro)
    const pushes = await app`SELECT id, tenant_id FROM app_pushes_pendentes()`
    expect(pushes.filter((p) => String(p['tenant_id']) === c.tenantId)).toHaveLength(2)
    // enviado não volta
    await comTenant(
      owner,
      c.tenantId,
      (tx) => tx`UPDATE aviso_entregas SET push_enviado_em = now()`,
    )
    const depois = await app`SELECT id, tenant_id FROM app_pushes_pendentes()`
    expect(depois.filter((p) => String(p['tenant_id']) === c.tenantId)).toHaveLength(0)
    // sem as funções, o app sem empresa não lê avisos nem entregas
    expect(await app`SELECT id FROM avisos`).toHaveLength(0)
    expect(await app`SELECT id FROM aviso_entregas`).toHaveLength(0)
  })
})
