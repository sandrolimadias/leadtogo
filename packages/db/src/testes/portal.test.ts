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

/** Roda como a API roda numa requisição do portal: tenant + as três variáveis do cliente. */
const comoCliente = <T>(
  c: { tenantId: string },
  sessao: { acesso: string; empresa: string; contato: string },
  fn: (tx: Parameters<Parameters<Sql['begin']>[1]>[0]) => Promise<T>,
) =>
  comTenant(app, c.tenantId, async (tx) => {
    await tx`SELECT set_config('app.portal_acesso_id', ${sessao.acesso}, true)`
    await tx`SELECT set_config('app.portal_empresa_id', ${sessao.empresa}, true)`
    await tx`SELECT set_config('app.portal_contato_id', ${sessao.contato}, true)`
    return fn(tx)
  })

async function cenario() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const ids = {
    membro: novoId(),
    area: novoId(),
    empresaA: novoId(),
    empresaB: novoId(),
    contatoA: novoId(),
    contatoA2: novoId(),
    contatoB: novoId(),
    acessoA: novoId(),
    acessoB: novoId(),
    chamadoA: novoId(),
    chamadoB: novoId(),
  }
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${ids.membro}, ${tenantId}, 'Atendente')`
    await tx`INSERT INTO areas_atendimento (id, tenant_id, nome, visivel_no_portal) VALUES (${ids.area}, ${tenantId}, 'Suporte', true)`
    for (const [empresa, nome] of [
      [ids.empresaA, 'Cliente A'],
      [ids.empresaB, 'Cliente B'],
    ] as const) {
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresa}, ${tenantId}, ${nome}, ${ids.membro})`
    }
    for (const [contato, empresa] of [
      [ids.contatoA, ids.empresaA],
      [ids.contatoA2, ids.empresaA],
      [ids.contatoB, ids.empresaB],
    ] as const) {
      await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${contato}, ${tenantId}, ${`Contato ${contato.slice(-4)}`})`
      await tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (${novoId()}, ${tenantId}, ${empresa}, ${contato})`
    }
    for (const [acesso, contato, empresa] of [
      [ids.acessoA, ids.contatoA, ids.empresaA],
      [ids.acessoB, ids.contatoB, ids.empresaB],
    ] as const) {
      await tx`INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email, situacao)
        VALUES (${acesso}, ${tenantId}, ${contato}, ${empresa}, ${`${acesso}@exemplo.com.br`}, 'ativo')`
    }
    let numero = 0
    for (const [chamado, empresa, contato] of [
      [ids.chamadoA, ids.empresaA, ids.contatoA],
      [ids.chamadoB, ids.empresaB, ids.contatoB],
    ] as const) {
      numero += 1
      await tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, origem, contato_id, empresa_cliente_id)
        VALUES (${chamado}, ${tenantId}, ${numero}, 'Assunto', ${ids.area}, 'portal', ${contato}, ${empresa})`
      await tx`INSERT INTO chamado_mensagens (id, tenant_id, chamado_id, autor_tipo, autor_contato_id, corpo)
        VALUES (${novoId()}, ${tenantId}, ${chamado}, 'contato', ${contato}, 'Preciso de ajuda')`
      await tx`INSERT INTO chamado_notas_internas (id, tenant_id, chamado_id, autor_membro_id, corpo)
        VALUES (${novoId()}, ${tenantId}, ${chamado}, ${ids.membro}, 'Só a equipe vê')`
      await tx`INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo)
        VALUES (${novoId()}, ${tenantId}, ${chamado}, 'aberto', 'sistema')`
      await tx`INSERT INTO notificacoes (id, tenant_id, destinatario_tipo, contato_id, tipo, titulo, chamado_id, canal)
        VALUES (${novoId()}, ${tenantId}, 'contato', ${contato}, 'chamado', 'Aviso', ${chamado}, 'sino')`
    }
  })
  const sessaoA = { acesso: ids.acessoA, empresa: ids.empresaA, contato: ids.contatoA }
  return { tenantId, ids, sessaoA }
}

describe('portal: o CRM não muda (sem as variáveis do portal)', () => {
  it('a equipe continua vendo tudo do tenant, inclusive notas e eventos', async () => {
    const c = await cenario()
    await comTenant(app, c.tenantId, async (tx) => {
      expect(await tx`SELECT id FROM chamados`).toHaveLength(2)
      expect(await tx`SELECT id FROM chamado_notas_internas`).toHaveLength(2)
      expect(await tx`SELECT id FROM chamado_eventos`).toHaveLength(2)
      expect(await tx`SELECT id FROM empresas`).toHaveLength(2)
      expect(await tx`SELECT id FROM portal_acessos`).toHaveLength(2)
    })
  })
})

describe('portal: isolamento pela empresa-cliente (camada 2)', () => {
  it('a sessão vê só os chamados, mensagens e notificações da própria empresa', async () => {
    const c = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect((await tx`SELECT id FROM chamados`).map((l) => String(l['id']))).toEqual([
        c.ids.chamadoA,
      ])
      expect(await tx`SELECT id FROM chamado_mensagens`).toHaveLength(1)
      expect(await tx`SELECT id FROM chamados WHERE id = ${c.ids.chamadoB}`).toHaveLength(0)
      expect(
        await tx`SELECT id FROM chamado_mensagens WHERE chamado_id = ${c.ids.chamadoB}`,
      ).toHaveLength(0)
      expect(await tx`SELECT id FROM notificacoes`).toHaveLength(1)
      expect(await tx`SELECT id FROM empresas`).toHaveLength(1)
      expect(await tx`SELECT id FROM portal_acessos`).toHaveLength(1)
    })
  })

  it('nota interna, linha do tempo e tabelas internas ficam fechadas para o cliente', async () => {
    const c = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(await tx`SELECT id FROM chamado_notas_internas`).toHaveLength(0)
      expect(await tx`SELECT id FROM chamado_eventos`).toHaveLength(0)
      expect(await tx`SELECT id FROM area_membros`).toHaveLength(0)
      expect(await tx`SELECT id FROM perfis_acesso`).toHaveLength(0)
      expect(await tx`SELECT id FROM atividades`).toHaveLength(0)
      expect(await tx`SELECT id FROM oportunidades`).toHaveLength(0)
    })
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO chamado_notas_internas (id, tenant_id, chamado_id, autor_membro_id, corpo)
            VALUES (${novoId()}, ${c.tenantId}, ${c.ids.chamadoA}, ${c.ids.membro}, 'tentativa')`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('abre chamado só para a própria empresa e só altera os dela', async () => {
    const c = await cenario()
    const abrir = (empresa: string, contato: string, numero: number) =>
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, origem, contato_id, empresa_cliente_id)
            VALUES (${novoId()}, ${c.tenantId}, ${numero}, 'Novo', ${c.ids.area}, 'portal', ${contato}, ${empresa})`,
      )
    await abrir(c.ids.empresaA, c.ids.contatoA, 10)
    await expect(abrir(c.ids.empresaB, c.ids.contatoB, 11)).rejects.toThrow(/row-level security/)
    await comoCliente(c, c.sessaoA, async (tx) => {
      const alterados = await tx`UPDATE chamados SET assunto = 'Mudou' RETURNING id`
      expect(alterados.map((l) => String(l['id']))).not.toContain(c.ids.chamadoB)
      expect(
        await tx`UPDATE chamados SET assunto = 'X' WHERE id = ${c.ids.chamadoB} RETURNING id`,
      ).toHaveLength(0)
      expect(await tx`DELETE FROM chamados WHERE id = ${c.ids.chamadoB} RETURNING id`).toHaveLength(
        0,
      )
    })
    await comTenant(owner, c.tenantId, async (tx) => {
      const [b] = await tx`SELECT assunto FROM chamados WHERE id = ${c.ids.chamadoB}`
      expect(b?.['assunto']).toBe('Assunto')
    })
  })

  it('o contato só altera o próprio cadastro; empresa e colegas só leitura', async () => {
    const c = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      // vê os dois contatos da própria empresa, não o da outra
      expect(await tx`SELECT id FROM contatos`).toHaveLength(2)
      expect(
        await tx`UPDATE contatos SET nome = 'Eu mesmo' WHERE id = ${c.ids.contatoA} RETURNING id`,
      ).toHaveLength(1)
      expect(
        await tx`UPDATE contatos SET nome = 'Outro' WHERE id = ${c.ids.contatoA2} RETURNING id`,
      ).toHaveLength(0)
      expect(await tx`UPDATE empresas SET razao_social = 'Mudou' RETURNING id`).toHaveLength(0)
      expect(await tx`UPDATE membros SET nome = 'Mudou' RETURNING id`).toHaveLength(0)
      expect(await tx`SELECT id FROM membros`).toHaveLength(1)
    })
    await expect(
      comoCliente(
        c,
        c.sessaoA,
        (tx) =>
          tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${novoId()}, ${c.tenantId}, 'Novo')`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('falha fechada: acesso preenchido e empresa vazia não enxerga nada escopado', async () => {
    const c = await cenario()
    await comTenant(app, c.tenantId, async (tx) => {
      await tx`SELECT set_config('app.portal_acesso_id', ${c.ids.acessoA}, true)`
      expect(await tx`SELECT id FROM chamados`).toHaveLength(0)
      expect(await tx`SELECT id FROM empresas`).toHaveLength(0)
      expect(await tx`SELECT id FROM notificacoes`).toHaveLength(0)
    })
  })

  it('a sessão do portal continua presa ao tenant (camada 1)', async () => {
    const c = await cenario()
    const outro = await cenario()
    await comoCliente(outro, { ...c.sessaoA }, async (tx) => {
      expect(await tx`SELECT id FROM chamados`).toHaveLength(0)
    })
  })

  it('o portal grava auditoria e outbox (a abertura do chamado precisa deles)', async () => {
    const c = await cenario()
    await comoCliente(c, c.sessaoA, async (tx) => {
      await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
        VALUES (${novoId()}, ${c.tenantId}, 'chamado.notificar', ${c.ids.chamadoA}, '{}'::jsonb)`
    })
  })
})

describe('portal: entrada pelo e-mail e limpeza', () => {
  it('app_portal_acessos_por_email acha só acessos ativos, sem diferença de caixa, em qualquer tenant', async () => {
    const a = await cenario()
    const b = await cenario()
    const email = `compartilhado-${novoId()}@Exemplo.com.br`
    await comTenant(
      owner,
      a.tenantId,
      (tx) => tx`UPDATE portal_acessos SET email = ${email} WHERE id = ${a.ids.acessoA}`,
    )
    await comTenant(
      owner,
      b.tenantId,
      (tx) => tx`UPDATE portal_acessos SET email = ${email} WHERE id = ${b.ids.acessoA}`,
    )
    const achados =
      await app`SELECT tenant_id, acesso_id FROM app_portal_acessos_por_email(${email.toLowerCase()})`
    expect(achados.map((l) => String(l['acesso_id'])).sort()).toEqual(
      [a.ids.acessoA, b.ids.acessoA].sort(),
    )

    await comTenant(
      owner,
      a.tenantId,
      (tx) => tx`UPDATE portal_acessos SET situacao = 'suspenso' WHERE id = ${a.ids.acessoA}`,
    )
    const depois = await app`SELECT acesso_id FROM app_portal_acessos_por_email(${email})`
    expect(depois.map((l) => String(l['acesso_id']))).toEqual([b.ids.acessoA])
    expect(
      await app`SELECT acesso_id FROM app_portal_acessos_por_email('ninguem@exemplo.com.br')`,
    ).toHaveLength(0)
  })

  it('sem tenant, o app não lê a tabela de acessos nem pela função aberta', async () => {
    await cenario()
    expect(await app`SELECT id FROM portal_acessos`).toHaveLength(0)
    expect(await app`SELECT id FROM portal_sessoes`).toHaveLength(0)
  })

  it('app_portal_limpar apaga links vencidos há 30 dias e sessões vencidas há 90', async () => {
    const c = await cenario()
    const velho = novoId()
    const novo = novoId()
    await comTenant(owner, c.tenantId, async (tx) => {
      await tx`INSERT INTO portal_links (id, tenant_id, acesso_id, finalidade, token_hash, expira_em)
        VALUES (${velho}, ${c.tenantId}, ${c.ids.acessoA}, 'entrada', ${`h-${velho}`}, now() - interval '40 days'),
               (${novo}, ${c.tenantId}, ${c.ids.acessoA}, 'entrada', ${`h-${novo}`}, now() - interval '1 day')`
      await tx`INSERT INTO portal_sessoes (id, tenant_id, acesso_id, token_hash, expira_em, valida_ate_em)
        VALUES (${velho}, ${c.tenantId}, ${c.ids.acessoA}, ${`s-${velho}`}, now() - interval '100 days', now() - interval '95 days'),
               (${novo}, ${c.tenantId}, ${c.ids.acessoA}, ${`s-${novo}`}, now() + interval '10 days', now() + interval '50 days')`
    })
    const [r] = await app`SELECT links, sessoes FROM app_portal_limpar()`
    expect(Number(r?.['links'])).toBeGreaterThanOrEqual(1)
    expect(Number(r?.['sessoes'])).toBeGreaterThanOrEqual(1)
    await comTenant(owner, c.tenantId, async (tx) => {
      expect((await tx`SELECT id FROM portal_links`).map((l) => String(l['id']))).toEqual([novo])
      expect((await tx`SELECT id FROM portal_sessoes`).map((l) => String(l['id']))).toEqual([novo])
    })
  })
})

describe('portal: regras das tabelas', () => {
  it('um acesso por contato e empresa, e e-mail único por empresa; revogado libera', async () => {
    const c = await cenario()
    const criar = (contato: string, email: string) =>
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email)
          VALUES (${novoId()}, ${c.tenantId}, ${contato}, ${c.ids.empresaA}, ${email})`,
      )
    await expect(criar(c.ids.contatoA, 'outro@exemplo.com.br')).rejects.toThrow(
      /portal_acessos_contato_uq/,
    )
    await expect(criar(c.ids.contatoA2, `${c.ids.acessoA}@exemplo.com.br`)).rejects.toThrow(
      /portal_acessos_email_uq/,
    )
    await comTenant(
      owner,
      c.tenantId,
      (tx) => tx`UPDATE portal_acessos SET situacao = 'revogado' WHERE id = ${c.ids.acessoA}`,
    )
    await criar(c.ids.contatoA, `${c.ids.acessoA}@exemplo.com.br`)
  })

  it('link de troca de e-mail exige o endereço novo; os outros não aceitam', async () => {
    const c = await cenario()
    const inserir = (finalidade: string, destino: string | null) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO portal_links (id, tenant_id, acesso_id, finalidade, token_hash, email_destino, expira_em)
          VALUES (${novoId()}, ${c.tenantId}, ${c.ids.acessoA}, ${finalidade}::finalidade_link_portal, ${novoId()}, ${destino}, now() + interval '1 hour')`,
      )
    await inserir('troca_email', 'novo@exemplo.com.br')
    await inserir('entrada', null)
    await expect(inserir('troca_email', null)).rejects.toThrow(/portal_links_troca_chk/)
    await expect(inserir('convite', 'x@exemplo.com.br')).rejects.toThrow(/portal_links_troca_chk/)
  })

  it('nota de 1 a 5, uma avaliação por chamado', async () => {
    const c = await cenario()
    const avaliar = (nota: number) =>
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`INSERT INTO chamado_avaliacoes (id, tenant_id, chamado_id, acesso_id, nota)
          VALUES (${novoId()}, ${c.tenantId}, ${c.ids.chamadoA}, ${c.ids.acessoA}, ${nota})`,
      )
    await expect(avaliar(0)).rejects.toThrow(/chamado_avaliacoes_nota_chk/)
    await expect(avaliar(6)).rejects.toThrow(/chamado_avaliacoes_nota_chk/)
    await avaliar(4)
    await expect(avaliar(5)).rejects.toThrow(/chamado_avaliacoes_chamado_uq/)
  })

  it('pedido de acesso: tratado só com data de tratamento', async () => {
    const c = await cenario()
    const pedir = (situacao: string, tratadoEm: string | null) =>
      comTenant(
        owner,
        c.tenantId,
        (
          tx,
        ) => tx`INSERT INTO portal_pedidos_acesso (id, tenant_id, empresa_id, pedido_por, nome, email, situacao, tratado_em)
          VALUES (${novoId()}, ${c.tenantId}, ${c.ids.empresaA}, ${c.ids.acessoA}, 'Colega', 'c@exemplo.com.br',
            ${situacao}::situacao_pedido_acesso, ${tratadoEm}::timestamptz)`,
      )
    await pedir('pendente', null)
    await pedir('aprovado', new Date().toISOString())
    await expect(pedir('aprovado', null)).rejects.toThrow(/portal_pedidos_tratado_chk/)
    await expect(pedir('pendente', new Date().toISOString())).rejects.toThrow(
      /portal_pedidos_tratado_chk/,
    )
  })
})

describe('portal: chamados internos e numeração (migração 0033)', () => {
  it('o chamado interno que cita a empresa-cliente fica invisível; o do portal aparece', async () => {
    const c = await cenario()
    const interno = novoId()
    await comTenant(
      owner,
      c.tenantId,
      (tx) =>
        tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, origem, solicitante_membro_id, empresa_cliente_id)
        VALUES (${interno}, ${c.tenantId}, 50, 'Entre a equipe', ${c.ids.area}, 'interna', ${c.ids.membro}, ${c.ids.empresaA})`,
    )
    await comoCliente(c, c.sessaoA, async (tx) => {
      const ids = (await tx`SELECT id FROM chamados`).map((l) => String(l['id']))
      expect(ids).toEqual([c.ids.chamadoA])
      expect(await tx`SELECT id FROM chamados WHERE id = ${interno}`).toHaveLength(0)
      expect(
        await tx`UPDATE chamados SET assunto = 'X' WHERE id = ${interno} RETURNING id`,
      ).toHaveLength(0)
    })
    // a equipe (sem as variáveis do portal) continua vendo os dois
    await comTenant(owner, c.tenantId, async (tx) => {
      expect(
        await tx`SELECT id FROM chamados WHERE empresa_cliente_id = ${c.ids.empresaA}`,
      ).toHaveLength(2)
    })
  })

  it('a função de numeração incrementa só a empresa da sessão, mesmo para o cliente', async () => {
    const c = await cenario()
    const outro = await cenario()
    const numero = () =>
      comoCliente(c, c.sessaoA, async (tx) => {
        const [r] = await tx`SELECT app_proximo_numero_chamado() AS n`
        return Number(r?.['n'])
      })
    expect(await numero()).toBe(1)
    expect(await numero()).toBe(2)
    await comTenant(owner, outro.tenantId, async (tx) => {
      const [l] = await tx`SELECT chamado_ultimo_numero AS n FROM tenant_configuracoes`
      expect(Number(l?.['n'])).toBe(0)
    })
    // a tabela continua só leitura para o cliente: nenhuma escrita direta
    await comoCliente(c, c.sessaoA, async (tx) => {
      expect(
        await tx`UPDATE tenant_configuracoes SET chamado_ultimo_numero = 999 RETURNING tenant_id`,
      ).toHaveLength(0)
    })
    // sem empresa na sessão a função recusa
    await expect(app.begin((tx) => tx`SELECT app_proximo_numero_chamado()`)).rejects.toThrow(
      /sem empresa/,
    )
  })
})

describe('portal: catálogo', () => {
  it('toda tabela com RLS por tenant tem política do portal (negada por padrão, escopada ou liberada de propósito)', async () => {
    const tabelas = await owner<{ tabela: string; com_portal: boolean }[]>`
      SELECT c.relname AS tabela,
        EXISTS (SELECT 1 FROM pg_policy q WHERE q.polrelid = c.oid AND NOT q.polpermissive
          AND (pg_get_expr(q.polqual, q.polrelid) ILIKE '%app_portal%'
            OR pg_get_expr(q.polwithcheck, q.polrelid) ILIKE '%app_portal%')) AS com_portal
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE p.polname = 'tenant_select' ORDER BY 1`
    // liberadas de propósito: o cliente grava auditoria e outbox (a numeração dos chamados passa por função)
    const liberadas = ['auditoria', 'eventos_outbox']
    const sem = tabelas
      .filter((t) => !t.com_portal && !liberadas.includes(t.tabela))
      .map((t) => t.tabela)
    expect(sem).toEqual([])
  })
})
