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
