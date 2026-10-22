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

// Contatos (Módulo 3)
fabricas['papeis_decisao'] = cadastroSimples('papeis_decisao')

async function contatoPai(owner: Sql, tenantId: string): Promise<string> {
  return comTenant(owner, tenantId, async (tx) => {
    const id = novoId()
    await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Contato de teste')`
    return id
  })
}

fabricas['contatos'] = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Contato ${id}`})`
    return id
  },
})

fabricas['empresa_contatos'] = definirFabrica<{ empresaId: string; contatoId: string }>({
  colunaAlteravel: 'cargo',
  // Os pais: uma empresa (com vendedor) e um contato do tenant
  preparar: async (owner, tenantId) => ({
    empresaId: await empresaPai(owner, tenantId),
    contatoId: await contatoPai(owner, tenantId),
  }),
  criar: async (tx, tenantId, { empresaId, contatoId }) => {
    const id = novoId()
    await tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (${id}, ${tenantId}, ${empresaId}, ${contatoId})`
    return id
  },
})

fabricas['contato_telefones'] = definirFabrica<string>({
  colunaAlteravel: 'numero',
  preparar: contatoPai,
  criar: async (tx, tenantId, contatoId) => {
    const id = novoId()
    await tx`
      INSERT INTO contato_telefones (id, tenant_id, contato_id, numero, numero_e164)
      VALUES (${id}, ${tenantId}, ${contatoId}, '2730643021', '+552730643021')`
    return id
  },
})

fabricas['contato_emails'] = definirFabrica<string>({
  colunaAlteravel: 'tipo',
  preparar: contatoPai,
  criar: async (tx, tenantId, contatoId) => {
    const id = novoId()
    await tx`INSERT INTO contato_emails (id, tenant_id, contato_id, email) VALUES (${id}, ${tenantId}, ${contatoId}, ${`c-${id}@exemplo.com`})`
    return id
  },
})

// Importação de planilha (Módulo 4)
fabricas['importacao_perfis'] = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO importacao_perfis (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Perfil ${id}`})`
    return id
  },
})

async function importacaoPai(owner: Sql, tenantId: string): Promise<string> {
  return comTenant(owner, tenantId, async (tx) => {
    const id = novoId()
    await tx`INSERT INTO importacoes (id, tenant_id, nome, nome_arquivo) VALUES (${id}, ${tenantId}, 'Lote de teste', 'carteira.xlsx')`
    return id
  })
}

fabricas['importacoes'] = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO importacoes (id, tenant_id, nome, nome_arquivo) VALUES (${id}, ${tenantId}, ${`Lote ${id}`}, 'carteira.xlsx')`
    return id
  },
})

fabricas['importacao_linhas'] = definirFabrica<string>({
  colunaAlteravel: 'motivo',
  preparar: importacaoPai,
  criar: async (tx, tenantId, importacaoId) => {
    const id = novoId()
    await tx`INSERT INTO importacao_linhas (id, tenant_id, importacao_id, numero, dados) VALUES (${id}, ${tenantId}, ${importacaoId}, 1, '{"CNPJ":"00000000000191"}'::jsonb)`
    return id
  },
})

// Atividades (Módulo 5)
fabricas['atividades'] = definirFabrica<{ tipoId: string; membroId: string }>({
  colunaAlteravel: 'titulo',
  // Os pais: um tipo de atividade e um membro (responsável) do tenant
  preparar: async (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const tipoId = novoId()
      const membroId = novoId()
      await tx`INSERT INTO tipos_atividade (id, tenant_id, nome, icone) VALUES (${tipoId}, ${tenantId}, 'Tipo de teste', 'phone')`
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Responsável de teste')`
      return { tipoId, membroId }
    }),
  criar: async (tx, tenantId, { tipoId, membroId }) => {
    const id = novoId()
    await tx`INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, responsavel_id, data_inicio) VALUES (${id}, ${tenantId}, ${tipoId}, 'Atividade de teste', ${membroId}, now())`
    return id
  },
})

// Oportunidades (Módulo 6)
interface PaisDaOportunidade {
  empresaId: string
  membroId: string
  funilId: string
  faseId: string
}
async function paisDaOportunidade(owner: Sql, tenantId: string): Promise<PaisDaOportunidade> {
  return comTenant(owner, tenantId, async (tx) => {
    const membroId = novoId()
    const empresaId = novoId()
    const funilId = novoId()
    const faseId = novoId()
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Vendedor de teste')`
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, 'Empresa de teste', ${membroId})`
    await tx`INSERT INTO funis (id, tenant_id, nome) VALUES (${funilId}, ${tenantId}, 'Funil')`
    await tx`INSERT INTO funil_fases (id, tenant_id, nome, funil_id) VALUES (${faseId}, ${tenantId}, 'Fase', ${funilId})`
    return { empresaId, membroId, funilId, faseId }
  })
}

fabricas['oportunidades'] = definirFabrica<PaisDaOportunidade>({
  colunaAlteravel: 'titulo',
  preparar: paisDaOportunidade,
  criar: async (tx, tenantId, p) => {
    const id = novoId()
    await tx`INSERT INTO oportunidades (id, tenant_id, titulo, empresa_id, funil_id, fase_id, responsavel_id)
      VALUES (${id}, ${tenantId}, 'Oportunidade de teste', ${p.empresaId}, ${p.funilId}, ${p.faseId}, ${p.membroId})`
    return id
  },
})

fabricas['oportunidade_historico'] = definirFabrica<
  PaisDaOportunidade & { oportunidadeId: string }
>({
  colunaAlteravel: 'detalhe',
  preparar: async (owner, tenantId) => {
    const p = await paisDaOportunidade(owner, tenantId)
    const oportunidadeId = novoId()
    await comTenant(owner, tenantId, async (tx) => {
      await tx`INSERT INTO oportunidades (id, tenant_id, titulo, empresa_id, funil_id, fase_id, responsavel_id)
        VALUES (${oportunidadeId}, ${tenantId}, 'Oportunidade de teste', ${p.empresaId}, ${p.funilId}, ${p.faseId}, ${p.membroId})`
    })
    return { ...p, oportunidadeId }
  },
  criar: async (tx, tenantId, p) => {
    const id = novoId()
    await tx`INSERT INTO oportunidade_historico (id, tenant_id, oportunidade_id, acao, fase_para_id)
      VALUES (${id}, ${tenantId}, ${p.oportunidadeId}, 'criada', ${p.faseId})`
    return id
  },
})

// Geolocalização (migração 0026)
fabricas['geo_regioes'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO geo_regioes (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Região ${id}`})`
    return id
  },
})

fabricas['geo_regiao_municipios'] = definirFabrica<string>({
  colunaAlteravel: 'municipio_codigo',
  // O pai: uma região do tenant e o município (referência global, que o banco de teste não traz)
  preparar: async (owner, tenantId) => {
    await owner`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
    await owner`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES') ON CONFLICT DO NOTHING`
    return comTenant(owner, tenantId, async (tx) => {
      const id = novoId()
      await tx`INSERT INTO geo_regioes (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Região ${id}`})`
      return id
    })
  },
  criar: async (tx, tenantId, regiaoId) => {
    const id = novoId()
    await tx`INSERT INTO geo_regiao_municipios (id, tenant_id, regiao_id, municipio_codigo)
      VALUES (${id}, ${tenantId}, ${regiaoId}, 3205309)`
    return id
  },
})

fabricas['geo_lotes'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO geo_lotes (id, tenant_id, nome, municipios, escopo)
      VALUES (${id}, ${tenantId}, ${`Lote ${id}`}, ARRAY[3205309]::integer[], 'Vitória')`
    return id
  },
})

fabricas['geo_lote_empresas'] = definirFabrica<{ loteId: string; empresaId: string }>({
  colunaAlteravel: 'motivo',
  preparar: async (owner, tenantId) => {
    const vendedorId = novoId()
    const empresaId = novoId()
    const loteId = novoId()
    await comTenant(owner, tenantId, async (tx) => {
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${vendedorId}, ${tenantId}, 'Vendedor de teste')`
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, 'Empresa de teste', ${vendedorId})`
      await tx`INSERT INTO geo_lotes (id, tenant_id, nome, municipios, escopo)
        VALUES (${loteId}, ${tenantId}, 'Lote de teste', ARRAY[3205309]::integer[], 'Vitória')`
    })
    return { loteId, empresaId }
  },
  criar: async (tx, tenantId, p) => {
    const id = novoId()
    await tx`INSERT INTO geo_lote_empresas (id, tenant_id, lote_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${p.loteId}, ${p.empresaId})`
    return id
  },
})

fabricas['geo_consultas'] = definirFabrica<string>({
  colunaAlteravel: 'consulta',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO geo_consultas (id, tenant_id, provedor, consulta, resultado)
      VALUES (${id}, ${tenantId}, 'cnefe', ${`consulta ${id}`}, 'nao_achou')`
    return id
  },
})

fabricas['mapa_legenda'] = definirFabrica<string>({
  colunaAlteravel: 'cor',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO mapa_legenda (id, tenant_id, chave, cor) VALUES (${id}, ${tenantId}, 'sem_visita', 'vermelho')`
    return id
  },
})

fabricas['perfis_acesso'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Perfil ${id}`})`
    return id
  },
})

fabricas['perfil_permissoes'] = definirFabrica<string>({
  chave: 'permissao',
  colunaAlteravel: 'alcance',
  // O pai: um perfil da empresa
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const id = novoId()
      await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Perfil ${id}`})`
      return id
    }),
  criar: async (tx, tenantId, perfilId) => {
    const permissao = `empresas.ver.${novoId()}`
    await tx`INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
      VALUES (${tenantId}, ${perfilId}, ${permissao}, 'propria')`
    return permissao
  },
})
