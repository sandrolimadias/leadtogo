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

// Carteira de empresas (Módulo 2). A empresa de teste precisa de um vendedor (membro) do mesmo tenant.
async function empresaPai(owner: Sql, tenantId: string): Promise<string> {
  return comTenant(owner, tenantId, async (tx) => {
    const membroId = novoId()
    const empresaId = novoId()
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Vendedor de teste')`
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, 'Empresa de teste', ${membroId})`
    return empresaId
  })
}

fabricas['empresas'] = definirFabrica<string>({
  colunaAlteravel: 'razao_social',
  // O pai: o vendedor (um membro do tenant)
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const id = novoId()
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Vendedor de teste')`
      return id
    }),
  criar: async (tx, tenantId, vendedorId) => {
    const id = novoId()
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${id}, ${tenantId}, ${`Empresa ${id}`}, ${vendedorId})`
    return id
  },
})

fabricas['empresa_telefones'] = definirFabrica<string>({
  colunaAlteravel: 'numero',
  preparar: empresaPai,
  criar: async (tx, tenantId, empresaId) => {
    const id = novoId()
    await tx`INSERT INTO empresa_telefones (id, tenant_id, empresa_id, numero, numero_e164) VALUES (${id}, ${tenantId}, ${empresaId}, '2730643021', '+552730643021')`
    return id
  },
})

fabricas['empresa_socios'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  preparar: empresaPai,
  criar: async (tx, tenantId, empresaId) => {
    const id = novoId()
    await tx`INSERT INTO empresa_socios (id, tenant_id, empresa_id, nome) VALUES (${id}, ${tenantId}, ${empresaId}, 'Sócio de teste')`
    return id
  },
})

fabricas['empresa_cnaes'] = definirFabrica<string>({
  chave: 'empresa_id',
  colunaAlteravel: 'principal',
  // O pai: a empresa; o CNAE é global (tabela de referência) e só entra se faltar
  preparar: async (owner, tenantId) => {
    await owner`
      INSERT INTO cnaes (codigo, descricao, secao, divisao, grupo, classe)
      VALUES (9999901, 'CNAE de teste', 'U', '99', '999', '99999') ON CONFLICT (codigo) DO NOTHING`
    return empresaPai(owner, tenantId)
  },
  criar: async (tx, tenantId, empresaId) => {
    await tx`INSERT INTO empresa_cnaes (tenant_id, empresa_id, cnae_codigo, principal) VALUES (${tenantId}, ${empresaId}, 9999901, true)`
    return empresaId
  },
})

/** A empresa e uma tag, para as tabelas de tags da empresa */
async function empresaETag(
  owner: Sql,
  tenantId: string,
): Promise<{ empresaId: string; tagId: string }> {
  const empresaId = await empresaPai(owner, tenantId)
  const tagId = await comTenant(owner, tenantId, async (tx) => {
    const grupoId = novoId()
    const id = novoId()
    await tx`INSERT INTO tag_grupos (id, tenant_id, nome) VALUES (${grupoId}, ${tenantId}, 'Grupo')`
    await tx`INSERT INTO tags (id, tenant_id, nome, tag_grupo_id) VALUES (${id}, ${tenantId}, 'Tag', ${grupoId})`
    return id
  })
  return { empresaId, tagId }
}

fabricas['empresa_tags'] = definirFabrica<{ empresaId: string; tagId: string }>({
  chave: 'empresa_id',
  colunaAlteravel: 'automatica',
  preparar: empresaETag,
  criar: async (tx, tenantId, pais) => {
    await tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) VALUES (${tenantId}, ${pais.empresaId}, ${pais.tagId})`
    return pais.empresaId
  },
})

fabricas['empresa_tags_historico'] = definirFabrica<{ empresaId: string; tagId: string }>({
  colunaAlteravel: 'automatica',
  preparar: empresaETag,
  criar: async (tx, tenantId, pais) => {
    const id = novoId()
    await tx`INSERT INTO empresa_tags_historico (id, tenant_id, empresa_id, tag_id, acao) VALUES (${id}, ${tenantId}, ${pais.empresaId}, ${pais.tagId}, 'adicionada')`
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
