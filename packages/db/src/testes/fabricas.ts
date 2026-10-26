import { novoId } from '../id.js'
import type { TransactionSql } from 'postgres'

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

// Visitas (G3a): modelos, versões e resultados
const modeloDeVisita = async (tx: Sql | TransactionSql, tenantId: string): Promise<string> => {
  const id = novoId()
  await tx`INSERT INTO visita_modelos (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Modelo ${id}`})`
  return id
}

fabricas['visita_modelos'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  criar: modeloDeVisita,
})

fabricas['visita_modelo_versoes'] = definirFabrica<string>({
  colunaAlteravel: 'numero',
  preparar: (owner, tenantId) => comTenant(owner, tenantId, (tx) => modeloDeVisita(tx, tenantId)),
  criar: async (tx, tenantId, modeloId) => {
    const id = novoId()
    await tx`INSERT INTO visita_modelo_versoes (id, tenant_id, modelo_id, numero)
      VALUES (${id}, ${tenantId}, ${modeloId}, ${Math.floor(Math.random() * 1e6)})`
    return id
  },
})

fabricas['visita_resultados'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  preparar: (owner, tenantId) => comTenant(owner, tenantId, (tx) => modeloDeVisita(tx, tenantId)),
  criar: async (tx, tenantId, modeloId) => {
    const id = novoId()
    await tx`INSERT INTO visita_resultados (id, tenant_id, nome, modelo_id)
      VALUES (${id}, ${tenantId}, ${`Resultado ${id}`}, ${modeloId})`
    return id
  },
})

// Relatórios de visita (G3b): pais são a empresa, o responsável e um tipo; cada relatório tem a sua atividade
fabricas['relatorios_visita'] = definirFabrica<{
  empresaId: string
  membroId: string
  tipoId: string
}>({
  colunaAlteravel: 'respostas',
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const empresaId = novoId()
      const membroId = novoId()
      const tipoId = novoId()
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Vendedor de teste')`
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, 'Empresa de teste', ${membroId})`
      await tx`INSERT INTO tipos_atividade (id, tenant_id, nome, icone) VALUES (${tipoId}, ${tenantId}, ${`Visita ${tipoId}`}, 'map-pin')`
      return { empresaId, membroId, tipoId }
    }),
  criar: async (tx, tenantId, { empresaId, membroId, tipoId }) => {
    const atividadeId = novoId()
    const id = novoId()
    await tx`INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, responsavel_id, data_inicio, situacao)
      VALUES (${atividadeId}, ${tenantId}, ${tipoId}, 'Visita', ${empresaId}, ${membroId}, now(), 'em_execucao')`
    await tx`INSERT INTO relatorios_visita (id, tenant_id, empresa_id, atividade_id, responsavel_id, sem_checkin)
      VALUES (${id}, ${tenantId}, ${empresaId}, ${atividadeId}, ${membroId}, true)`
    return id
  },
})

// Rotas (G4): pontos de partida, rotas e paradas
const pontoGeo = 'SRID=4326;POINT(-40.3 -20.3)'

fabricas['rota_pontos_partida'] = definirFabrica<undefined>({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO rota_pontos_partida (id, tenant_id, nome, localizacao)
      VALUES (${id}, ${tenantId}, ${`Ponto ${id}`}, ${pontoGeo}::geography)`
    return id
  },
})

const membroDeRota = async (tx: Sql | TransactionSql, tenantId: string): Promise<string> => {
  const id = novoId()
  await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Vendedor de rota')`
  return id
}

fabricas['rotas'] = definirFabrica<string>({
  colunaAlteravel: 'nome',
  preparar: (owner, tenantId) => comTenant(owner, tenantId, (tx) => membroDeRota(tx, tenantId)),
  criar: async (tx, tenantId, membroId) => {
    const id = novoId()
    await tx`INSERT INTO rotas (id, tenant_id, codigo, nome, data, responsavel_id)
      VALUES (${id}, ${tenantId}, ${Math.floor(Math.random() * 1e9)}, 'Rota de teste', current_date, ${membroId})`
    return id
  },
})

// Cada parada tem a sua empresa (uma empresa aparece uma vez por rota)
fabricas['rota_paradas'] = definirFabrica<{ rotaId: string; membroId: string }>({
  colunaAlteravel: 'ordem',
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const membroId = await membroDeRota(tx, tenantId)
      const rotaId = novoId()
      await tx`INSERT INTO rotas (id, tenant_id, codigo, nome, data, responsavel_id)
        VALUES (${rotaId}, ${tenantId}, 1, 'Rota de teste', current_date, ${membroId})`
      return { rotaId, membroId }
    }),
  criar: async (tx, tenantId, { rotaId, membroId }) => {
    const empresaId = novoId()
    const id = novoId()
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, 'Empresa de teste', ${membroId})`
    await tx`INSERT INTO rota_paradas (id, tenant_id, rota_id, empresa_id, ordem)
      VALUES (${id}, ${tenantId}, ${rotaId}, ${empresaId}, ${1 + Math.floor(Math.random() * 30)})`
    return id
  },
})

// Central de chamados (Fase 2)
const membroDeChamado = async (tx: Sql | TransactionSql, tenantId: string): Promise<string> => {
  const id = novoId()
  await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Atendente de teste')`
  return id
}

/** Área, membro e um chamado interno aberto (o pai das tabelas do chamado). */
const prepararChamado = (owner: Sql, tenantId: string) =>
  comTenant(owner, tenantId, async (tx) => {
    const membroId = await membroDeChamado(tx, tenantId)
    const areaId = novoId()
    const chamadoId = novoId()
    await tx`INSERT INTO areas_atendimento (id, tenant_id, nome) VALUES (${areaId}, ${tenantId}, ${`Área ${areaId}`})`
    await tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, solicitante_membro_id)
      VALUES (${chamadoId}, ${tenantId}, 1, 'Chamado de teste', ${areaId}, ${membroId})`
    return { membroId, areaId, chamadoId }
  })

fabricas['areas_atendimento'] = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO areas_atendimento (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Área ${id}`})`
    return id
  },
})

fabricas['area_membros'] = definirFabrica<{ areaId: string; membroId: string }>({
  colunaAlteravel: 'gestor',
  preparar: (owner, tenantId) =>
    comTenant(owner, tenantId, async (tx) => {
      const membroId = await membroDeChamado(tx, tenantId)
      const areaId = novoId()
      await tx`INSERT INTO areas_atendimento (id, tenant_id, nome) VALUES (${areaId}, ${tenantId}, ${`Área ${areaId}`})`
      return { areaId, membroId }
    }),
  criar: async (tx, tenantId, { areaId, membroId }) => {
    const id = novoId()
    await tx`INSERT INTO area_membros (id, tenant_id, area_id, membro_id) VALUES (${id}, ${tenantId}, ${areaId}, ${membroId})`
    return id
  },
})

fabricas['config_triagem'] = definirFabrica({
  chave: 'tenant_id',
  colunaAlteravel: 'ativa',
  criar: async (tx, tenantId) => {
    await tx`INSERT INTO config_triagem (tenant_id) VALUES (${tenantId})`
    return tenantId
  },
})

fabricas['triagem_membros'] = definirFabrica<string>({
  colunaAlteravel: 'atualizado_em',
  preparar: (owner, tenantId) => comTenant(owner, tenantId, (tx) => membroDeChamado(tx, tenantId)),
  criar: async (tx, tenantId, membroId) => {
    const id = novoId()
    await tx`INSERT INTO triagem_membros (id, tenant_id, membro_id) VALUES (${id}, ${tenantId}, ${membroId})`
    return id
  },
})

fabricas['chamados'] = definirFabrica<{ membroId: string; areaId: string }>({
  colunaAlteravel: 'assunto',
  preparar: async (owner, tenantId) => {
    const { membroId, areaId } = await prepararChamado(owner, tenantId)
    return { membroId, areaId }
  },
  criar: async (tx, tenantId, { membroId, areaId }) => {
    const id = novoId()
    await tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, solicitante_membro_id)
      VALUES (${id}, ${tenantId}, ${2 + Math.floor(Math.random() * 1e9)}, 'Outro chamado', ${areaId}, ${membroId})`
    return id
  },
})

fabricas['chamado_mensagens'] = definirFabrica<{ membroId: string; chamadoId: string }>({
  colunaAlteravel: 'corpo',
  preparar: async (owner, tenantId) => {
    const { membroId, chamadoId } = await prepararChamado(owner, tenantId)
    return { membroId, chamadoId }
  },
  criar: async (tx, tenantId, { membroId, chamadoId }) => {
    const id = novoId()
    await tx`INSERT INTO chamado_mensagens (id, tenant_id, chamado_id, autor_tipo, autor_membro_id, corpo)
      VALUES (${id}, ${tenantId}, ${chamadoId}, 'membro', ${membroId}, 'Olá')`
    return id
  },
})

fabricas['chamado_notas_internas'] = definirFabrica<{ membroId: string; chamadoId: string }>({
  colunaAlteravel: 'corpo',
  preparar: async (owner, tenantId) => {
    const { membroId, chamadoId } = await prepararChamado(owner, tenantId)
    return { membroId, chamadoId }
  },
  criar: async (tx, tenantId, { membroId, chamadoId }) => {
    const id = novoId()
    await tx`INSERT INTO chamado_notas_internas (id, tenant_id, chamado_id, autor_membro_id, corpo)
      VALUES (${id}, ${tenantId}, ${chamadoId}, ${membroId}, 'Só a equipe vê')`
    return id
  },
})

fabricas['chamado_eventos'] = definirFabrica<{ membroId: string; chamadoId: string }>({
  colunaAlteravel: 'dados',
  appSemAlterar: true,
  preparar: async (owner, tenantId) => {
    const { membroId, chamadoId } = await prepararChamado(owner, tenantId)
    return { membroId, chamadoId }
  },
  criar: async (tx, tenantId, { membroId, chamadoId }) => {
    const id = novoId()
    await tx`INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo, ator_membro_id)
      VALUES (${id}, ${tenantId}, ${chamadoId}, 'aberto', 'membro', ${membroId})`
    return id
  },
})

fabricas['chamado_anexos'] = definirFabrica<{ chamadoId: string }>({
  colunaAlteravel: 'nome',
  preparar: async (owner, tenantId) => {
    const { chamadoId } = await prepararChamado(owner, tenantId)
    return { chamadoId }
  },
  criar: async (tx, tenantId, { chamadoId }) => {
    const id = novoId()
    await tx`INSERT INTO chamado_anexos (id, tenant_id, chamado_id, chave_arquivo, nome, mime, tamanho)
      VALUES (${id}, ${tenantId}, ${chamadoId}, ${`${tenantId}/chamados/${id}`}, 'contrato.pdf', 'application/pdf', 2048)`
    return id
  },
})

fabricas['calendario_expediente'] = definirFabrica({
  colunaAlteravel: 'fim',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO calendario_expediente (id, tenant_id, dia_semana, inicio, fim)
      VALUES (${id}, ${tenantId}, 1, '08:00', '18:00')`
    return id
  },
})

fabricas['feriados'] = definirFabrica({
  colunaAlteravel: 'nome',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO feriados (id, tenant_id, data, nome) VALUES (${id}, ${tenantId}, '2026-12-25', 'Natal')`
    return id
  },
})

// Portal do Cliente (Fase 3A)
interface PaisDoPortal {
  empresaId: string
  contatoId: string
  membroId: string
}
/** Empresa-cliente, contato e membro (o pai das tabelas do portal). */
const prepararPortal = (owner: Sql, tenantId: string) =>
  comTenant(owner, tenantId, async (tx): Promise<PaisDoPortal> => {
    const membroId = await membroDeChamado(tx, tenantId)
    const empresaId = novoId()
    const contatoId = novoId()
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, ${`Cliente ${empresaId}`}, ${membroId})`
    await tx`INSERT INTO contatos (id, tenant_id, nome) VALUES (${contatoId}, ${tenantId}, ${`Contato ${contatoId}`})`
    return { empresaId, contatoId, membroId }
  })

const inserirAcessoDoPortal = async (
  tx: TransactionSql,
  tenantId: string,
  pais: PaisDoPortal,
  extra: { contatoId?: string; email?: string } = {},
): Promise<string> => {
  const id = novoId()
  await tx`INSERT INTO portal_acessos (id, tenant_id, contato_id, empresa_id, email, situacao)
    VALUES (${id}, ${tenantId}, ${extra.contatoId ?? pais.contatoId}, ${pais.empresaId},
      ${extra.email ?? `cliente-${id}@exemplo.com.br`}, 'ativo')`
  return id
}

fabricas['portal_acessos'] = definirFabrica<PaisDoPortal>({
  colunaAlteravel: 'email',
  preparar: prepararPortal,
  criar: (tx, tenantId, pais) => inserirAcessoDoPortal(tx, tenantId, pais),
})

fabricas['portal_links'] = definirFabrica<{ acessoId: string }>({
  colunaAlteravel: 'ip',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPortal(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => ({
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    }))
  },
  criar: async (tx, tenantId, { acessoId }) => {
    const id = novoId()
    await tx`INSERT INTO portal_links (id, tenant_id, acesso_id, finalidade, token_hash, expira_em)
      VALUES (${id}, ${tenantId}, ${acessoId}, 'entrada', ${`hash-${id}`}, now() + interval '15 minutes')`
    return id
  },
})

fabricas['portal_sessoes'] = definirFabrica<{ acessoId: string }>({
  colunaAlteravel: 'agente',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPortal(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => ({
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    }))
  },
  criar: async (tx, tenantId, { acessoId }) => {
    const id = novoId()
    await tx`INSERT INTO portal_sessoes (id, tenant_id, acesso_id, token_hash, expira_em, valida_ate_em)
      VALUES (${id}, ${tenantId}, ${acessoId}, ${`hash-${id}`}, now() + interval '30 days', now() + interval '90 days')`
    return id
  },
})

fabricas['portal_segundo_fator'] = definirFabrica<{ acessoId: string }>({
  colunaAlteravel: 'segredo_cifrado',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPortal(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => ({
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    }))
  },
  criar: async (tx, tenantId, { acessoId }) => {
    const id = novoId()
    await tx`INSERT INTO portal_segundo_fator (id, tenant_id, acesso_id, segredo_cifrado)
      VALUES (${id}, ${tenantId}, ${acessoId}, 'segredo-cifrado')`
    return id
  },
})

fabricas['portal_pedidos_acesso'] = definirFabrica<{ acessoId: string; empresaId: string }>({
  colunaAlteravel: 'nome',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPortal(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => ({
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
      empresaId: pais.empresaId,
    }))
  },
  criar: async (tx, tenantId, { acessoId, empresaId }) => {
    const id = novoId()
    await tx`INSERT INTO portal_pedidos_acesso (id, tenant_id, empresa_id, pedido_por, nome, email)
      VALUES (${id}, ${tenantId}, ${empresaId}, ${acessoId}, 'Colega', ${`colega-${id}@exemplo.com.br`})`
    return id
  },
})

fabricas['chamado_avaliacoes'] = definirFabrica<{ acessoId: string; chamadoId: string }>({
  colunaAlteravel: 'comentario',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPortal(owner, tenantId)
    const { chamadoId } = await prepararChamado(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => ({
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
      chamadoId,
    }))
  },
  criar: async (tx, tenantId, { acessoId, chamadoId }) => {
    const id = novoId()
    await tx`INSERT INTO chamado_avaliacoes (id, tenant_id, chamado_id, acesso_id, nota)
      VALUES (${id}, ${tenantId}, ${chamadoId}, ${acessoId}, 5)`
    return id
  },
})

fabricas['chamado_atividades'] = definirFabrica<{ chamadoId: string; atividadeId: string }>({
  colunaAlteravel: 'excluido_em',
  preparar: async (owner, tenantId) => {
    const { chamadoId, membroId } = await prepararChamado(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => {
      const tipoId = novoId()
      const atividadeId = novoId()
      await tx`INSERT INTO tipos_atividade (id, tenant_id, nome, icone) VALUES (${tipoId}, ${tenantId}, 'Tipo de teste', 'phone')`
      await tx`INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, responsavel_id, data_inicio)
        VALUES (${atividadeId}, ${tenantId}, ${tipoId}, 'Tarefa do chamado', ${membroId}, now())`
      return { chamadoId, atividadeId }
    })
  },
  criar: async (tx, tenantId, { chamadoId, atividadeId }) => {
    const id = novoId()
    await tx`INSERT INTO chamado_atividades (id, tenant_id, chamado_id, atividade_id)
      VALUES (${id}, ${tenantId}, ${chamadoId}, ${atividadeId})`
    return id
  },
})

// Portal do Cliente (Fase 3B): publicações
interface PaisDaPublicacao {
  acessoId: string
  empresaId: string
  publicacaoId: string
}
const prepararPublicacao = async (owner: Sql, tenantId: string): Promise<PaisDaPublicacao> => {
  const pais = await prepararPortal(owner, tenantId)
  return comTenant(owner, tenantId, async (tx) => {
    const publicacaoId = novoId()
    await tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, publicada_em)
      VALUES (${publicacaoId}, ${tenantId}, 'Aviso', 'Corpo', 'publicada', now())`
    return {
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
      empresaId: pais.empresaId,
      publicacaoId,
    }
  })
}

fabricas['publicacoes'] = definirFabrica({
  colunaAlteravel: 'titulo',
  criar: async (tx, tenantId) => {
    const id = novoId()
    await tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo) VALUES (${id}, ${tenantId}, 'Rascunho', 'Corpo')`
    return id
  },
})

fabricas['publicacao_empresas'] = definirFabrica<PaisDaPublicacao>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararPublicacao,
  criar: async (tx, tenantId, { empresaId, publicacaoId }) => {
    const id = novoId()
    await tx`INSERT INTO publicacao_empresas (id, tenant_id, publicacao_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${publicacaoId}, ${empresaId})`
    return id
  },
})

fabricas['publicacao_reacoes'] = definirFabrica<PaisDaPublicacao>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararPublicacao,
  criar: async (tx, tenantId, { acessoId, empresaId, publicacaoId }) => {
    const id = novoId()
    await tx`INSERT INTO publicacao_reacoes (id, tenant_id, publicacao_id, acesso_id, empresa_id, tipo)
      VALUES (${id}, ${tenantId}, ${publicacaoId}, ${acessoId}, ${empresaId}, 'curtir')`
    return id
  },
})

fabricas['publicacao_comentarios'] = definirFabrica<PaisDaPublicacao>({
  colunaAlteravel: 'corpo',
  preparar: prepararPublicacao,
  criar: async (tx, tenantId, { acessoId, empresaId, publicacaoId }) => {
    const id = novoId()
    await tx`INSERT INTO publicacao_comentarios (id, tenant_id, publicacao_id, acesso_id, empresa_id, autor_nome, corpo)
      VALUES (${id}, ${tenantId}, ${publicacaoId}, ${acessoId}, ${empresaId}, 'Maria S.', 'Comentário')`
    return id
  },
})

fabricas['publicacao_denuncias'] = definirFabrica<PaisDaPublicacao & { comentarioId: string }>({
  colunaAlteravel: 'atualizado_em',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPublicacao(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => {
      const comentarioId = novoId()
      await tx`INSERT INTO publicacao_comentarios (id, tenant_id, publicacao_id, acesso_id, empresa_id, autor_nome, corpo)
        VALUES (${comentarioId}, ${tenantId}, ${pais.publicacaoId}, ${pais.acessoId}, ${pais.empresaId}, 'Maria S.', 'Comentário')`
      return { ...pais, comentarioId }
    })
  },
  criar: async (tx, tenantId, { acessoId, comentarioId }) => {
    const id = novoId()
    await tx`INSERT INTO publicacao_denuncias (id, tenant_id, comentario_id, acesso_id, motivo)
      VALUES (${id}, ${tenantId}, ${comentarioId}, ${acessoId}, 'spam')`
    return id
  },
})

fabricas['publicacao_leituras'] = definirFabrica<PaisDaPublicacao>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararPublicacao,
  criar: async (tx, tenantId, { acessoId, empresaId, publicacaoId }) => {
    const id = novoId()
    await tx`INSERT INTO publicacao_leituras (id, tenant_id, publicacao_id, acesso_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${publicacaoId}, ${acessoId}, ${empresaId})`
    return id
  },
})

// Portal do Cliente (Fase 3C): documentos
interface PaisDoDocumento {
  acessoId: string
  empresaId: string
  documentoId: string
}
const inserirDocumento = async (tx: TransactionSql, tenantId: string, estado = 'limpo') => {
  const documentoId = novoId()
  await tx`INSERT INTO documentos (id, tenant_id, titulo, chave_arquivo, nome, mime, tamanho, estado, enviado_em)
    VALUES (${documentoId}, ${tenantId}, 'Guia rápido', ${`${tenantId}/documentos/${documentoId}`},
      'guia.pdf', 'application/pdf', 1024, ${estado}::estado_anexo, now())`
  return documentoId
}
const prepararDocumento = async (owner: Sql, tenantId: string): Promise<PaisDoDocumento> => {
  const pais = await prepararPortal(owner, tenantId)
  return comTenant(owner, tenantId, async (tx) => ({
    acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    empresaId: pais.empresaId,
    documentoId: await inserirDocumento(tx, tenantId),
  }))
}

fabricas['documentos'] = definirFabrica({
  colunaAlteravel: 'titulo',
  criar: (tx, tenantId) => inserirDocumento(tx, tenantId, 'pendente_varredura'),
})

fabricas['documento_empresas'] = definirFabrica<PaisDoDocumento>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararDocumento,
  criar: async (tx, tenantId, { empresaId, documentoId }) => {
    const id = novoId()
    await tx`INSERT INTO documento_empresas (id, tenant_id, documento_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${documentoId}, ${empresaId})`
    return id
  },
})

fabricas['documento_acessos'] = definirFabrica<PaisDoDocumento>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararDocumento,
  criar: async (tx, tenantId, { acessoId, empresaId, documentoId }) => {
    const id = novoId()
    await tx`INSERT INTO documento_acessos (id, tenant_id, documento_id, acesso_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${documentoId}, ${acessoId}, ${empresaId})`
    return id
  },
})

// Portal do Cliente (Fase 3D): agenda
interface PaisDoEvento {
  acessoId: string
  empresaId: string
  eventoId: string
}
const inserirEvento = async (tx: TransactionSql, tenantId: string) => {
  const eventoId = novoId()
  await tx`INSERT INTO eventos (id, tenant_id, titulo, inicio_em, fim_em, situacao, publicado_em)
    VALUES (${eventoId}, ${tenantId}, 'Encontro anual', now() + interval '10 days',
      now() + interval '10 days 3 hours', 'publicado', now())`
  return eventoId
}
const prepararEvento = async (owner: Sql, tenantId: string): Promise<PaisDoEvento> => {
  const pais = await prepararPortal(owner, tenantId)
  return comTenant(owner, tenantId, async (tx) => ({
    acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    empresaId: pais.empresaId,
    eventoId: await inserirEvento(tx, tenantId),
  }))
}

fabricas['eventos'] = definirFabrica({
  colunaAlteravel: 'titulo',
  criar: (tx, tenantId) => inserirEvento(tx, tenantId),
})

fabricas['evento_empresas'] = definirFabrica<PaisDoEvento>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararEvento,
  criar: async (tx, tenantId, { empresaId, eventoId }) => {
    const id = novoId()
    await tx`INSERT INTO evento_empresas (id, tenant_id, evento_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${eventoId}, ${empresaId})`
    return id
  },
})

fabricas['evento_confirmacoes'] = definirFabrica<PaisDoEvento>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararEvento,
  criar: async (tx, tenantId, { acessoId, empresaId, eventoId }) => {
    const id = novoId()
    await tx`INSERT INTO evento_confirmacoes (id, tenant_id, evento_id, acesso_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${eventoId}, ${acessoId}, ${empresaId})`
    return id
  },
})

// Portal do Cliente (Fase 3E): avisos, preferências e push
interface PaisDoAviso {
  acessoId: string
  empresaId: string
  avisoId: string
}
const inserirAviso = async (tx: TransactionSql, tenantId: string) => {
  const avisoId = novoId()
  await tx`INSERT INTO avisos (id, tenant_id, mensagem) VALUES (${avisoId}, ${tenantId}, 'Expediente encerra às 14h')`
  return avisoId
}
const prepararAviso = async (owner: Sql, tenantId: string): Promise<PaisDoAviso> => {
  const pais = await prepararPortal(owner, tenantId)
  return comTenant(owner, tenantId, async (tx) => ({
    acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    empresaId: pais.empresaId,
    avisoId: await inserirAviso(tx, tenantId),
  }))
}

fabricas['avisos'] = definirFabrica({
  colunaAlteravel: 'mensagem',
  criar: (tx, tenantId) => inserirAviso(tx, tenantId),
})

fabricas['aviso_empresas'] = definirFabrica<PaisDoAviso>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararAviso,
  criar: async (tx, tenantId, { empresaId, avisoId }) => {
    const id = novoId()
    await tx`INSERT INTO aviso_empresas (id, tenant_id, aviso_id, empresa_id) VALUES (${id}, ${tenantId}, ${avisoId}, ${empresaId})`
    return id
  },
})

fabricas['aviso_entregas'] = definirFabrica<PaisDoAviso>({
  colunaAlteravel: 'atualizado_em',
  preparar: prepararAviso,
  criar: async (tx, tenantId, { acessoId, empresaId, avisoId }) => {
    const id = novoId()
    await tx`INSERT INTO aviso_entregas (id, tenant_id, aviso_id, acesso_id, empresa_id)
      VALUES (${id}, ${tenantId}, ${avisoId}, ${acessoId}, ${empresaId})`
    return id
  },
})

fabricas['portal_preferencias'] = definirFabrica<{ acessoId: string }>({
  colunaAlteravel: 'email_avisos',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPortal(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => ({
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    }))
  },
  criar: async (tx, tenantId, { acessoId }) => {
    const id = novoId()
    await tx`INSERT INTO portal_preferencias (id, tenant_id, acesso_id) VALUES (${id}, ${tenantId}, ${acessoId})`
    return id
  },
})

fabricas['portal_push_inscricoes'] = definirFabrica<{ acessoId: string }>({
  colunaAlteravel: 'agente',
  preparar: async (owner, tenantId) => {
    const pais = await prepararPortal(owner, tenantId)
    return comTenant(owner, tenantId, async (tx) => ({
      acessoId: await inserirAcessoDoPortal(tx, tenantId, pais),
    }))
  },
  criar: async (tx, tenantId, { acessoId }) => {
    const id = novoId()
    await tx`INSERT INTO portal_push_inscricoes (id, tenant_id, acesso_id, endpoint, chave_p256dh, chave_auth)
      VALUES (${id}, ${tenantId}, ${acessoId}, ${`https://push.exemplo.com/${id}`}, 'p256dh', 'auth')`
    return id
  },
})
