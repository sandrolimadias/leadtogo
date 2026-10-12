import { novoId } from '../id.js'
import { comTenant, type Sql } from './conexoes.js'
import { definirFabrica, type FabricaRegistrada } from './isolamento.js'

/**
 * Fábricas do teste de isolamento: uma por tabela com `tenant_id`. Quem cria uma tabela com
 * `tenant_id` registra aqui como inserir UMA linha válida dela; sem isso o teste falha.
 * (`tenants` isola por `id` e é testada à parte, em plataforma.test.ts.)
 */
export const fabricas: Record<string, FabricaRegistrada> = {
  tenants: definirFabrica<string>({
    colunaTenant: 'id',
    colunaAlteravel: 'razao_social',
    // Os pais da linha: uma conta
    preparar: async (owner) => {
      const contaId = novoId()
      await owner`INSERT INTO contas (id, nome) VALUES (${contaId}, 'Conta de teste')`
      return contaId
    },
    criar: async (tx, tenantId, contaId) => {
      await tx`INSERT INTO tenants (id, razao_social, conta_id) VALUES (${tenantId}, 'Empresa de teste', ${contaId})`
      return tenantId
    },
  }),

  tenant_configuracoes: definirFabrica({
    chave: 'tenant_id',
    colunaAlteravel: 'dias_sem_contato_alerta',
    criar: async (tx, tenantId) => {
      await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
      return tenantId
    },
  }),

  membros: definirFabrica({
    colunaAlteravel: 'nome',
    criar: async (tx, tenantId) => {
      const id = novoId()
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Membro de teste')`
      return id
    },
  }),
}

fabricas['convites'] = definirFabrica<string>({
  colunaAlteravel: 'email',
  // O pai: quem convida (um membro do tenant)
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const id = novoId()
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Quem convida')`
      return id
    }),
  criar: async (tx, tenantId, convidadoPor) => {
    const id = novoId()
    await tx`
      INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por)
      VALUES (${id}, ${tenantId}, ${`c-${id}@exemplo.com`}, 'vendedor', ${`hash-${id}`}, now() + interval '7 days', ${convidadoPor})`
    return id
  },
})

fabricas['arquivos'] = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`
      INSERT INTO arquivos (id, tenant_id, chave_arquivo, nome, mime, tamanho)
      VALUES (${id}, ${tenantId}, ${`${tenantId}/teste/${id}`}, 'foto.jpg', 'image/jpeg', 1024)`
    return id
  },
})

fabricas['notificacoes'] = definirFabrica<string>({
  colunaAlteravel: 'titulo',
  // O pai: um membro do tenant
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const id = novoId()
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Destinatário')`
      return id
    }),
  criar: async (tx, tenantId, membroId) => {
    const id = novoId()
    await tx`
      INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo)
      VALUES (${id}, ${tenantId}, ${membroId}, 'teste', 'Olá')`
    return id
  },
})

fabricas['eventos_outbox'] = definirFabrica({
  colunaAlteravel: 'tipo',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo) VALUES (${id}, ${tenantId}, 'empresa.criada')`
    return id
  },
})

fabricas['auditoria'] = definirFabrica({
  colunaAlteravel: 'acao',
  appSemAlterar: true,
  criar: async (tx, tenantId) => {
    const [linha] = await tx<{ id: string }[]>`
      INSERT INTO auditoria (tenant_id, entidade, acao) VALUES (${tenantId}, 'empresas', 'criar') RETURNING id`
    return String(linha?.id)
  },
})

// Cadastros auxiliares (Módulo 1): as simples só precisam de nome; as com pai criam o pai antes.
const cadastroSimples = (tabela: string, extra = '') =>
  definirFabrica({
    colunaAlteravel: 'nome',
    criar: async (tx, tenantId) => {
      const id = novoId()
      await tx.unsafe(
        `INSERT INTO ${tabela} (id, tenant_id, nome${extra ? ', aplica_a' : ''}) VALUES ($1, $2, $3${extra ? ', $4' : ''})`,
        extra ? [id, tenantId, `Item ${id}`, extra] : [id, tenantId, `Item ${id}`],
      )
      return id
    },
  })

fabricas['verticais'] = cadastroSimples('verticais')
fabricas['solucoes'] = cadastroSimples('solucoes')
fabricas['origens'] = cadastroSimples('origens')
fabricas['motivos'] = cadastroSimples('motivos', '{perdido}')

fabricas['tag_grupos'] = cadastroSimples('tag_grupos')

fabricas['tags'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  // O pai: um grupo de tags do tenant
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const id = novoId()
      await tx`INSERT INTO tag_grupos (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Grupo')`
      return id
    }),
  criar: async (tx, tenantId, grupoId) => {
    const id = novoId()
    await tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id) VALUES (${id}, ${tenantId}, ${`Tag ${id}`}, ${grupoId})`
    return id
  },
})

fabricas['tipos_atividade'] = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO tipos_atividade (id, tenant_id, nome, icone) VALUES (${id}, ${tenantId}, ${`Tipo ${id}`}, 'phone')`
    return id
  },
})

fabricas['funis'] = cadastroSimples('funis')

fabricas['funil_fases'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  // O pai: um funil do tenant
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const id = novoId()
      await tx`INSERT INTO funis (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Funil')`
      return id
    }),
  criar: async (tx, tenantId, funilId) => {
    const id = novoId()
    await tx`INSERT INTO funil_fases (id, tenant_id, nome, funil_id) VALUES (${id}, ${tenantId}, ${`Fase ${id}`}, ${funilId})`
    return id
  },
})

/** Cria o que as fábricas pressupõem para os tenants de teste: uma conta e a linha de cada tenant. */
export async function prepararTenants(owner: Sql, ids: string[]): Promise<void> {
  const contaId = novoId()
  await owner`INSERT INTO contas (id, nome) VALUES (${contaId}, 'Conta de teste')`
  for (const id of ids) {
    await comTenant(
      owner,
      id,
      (tx) =>
        tx`INSERT INTO tenants (id, razao_social, conta_id) VALUES (${id}, ${`Empresa ${id.slice(-6)}`}, ${contaId})`,
    )
  }
}
