import { isIP } from 'node:net'

import { novoId, sql } from '@leadtogo/db'
import type {
  AlterarChaveEntrada,
  ChaveCriada,
  ChaveDeApi,
  CriarChaveEntrada,
  ListaDeChaves,
  RotacionarChaveEntrada,
  SituacaoDaChave,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { ambienteDe, gerarTokenDaChave } from './token-chave.js'

type LinhaChave = {
  id: string
  nome: string
  prefixo: string
  ambiente: 'live' | 'test'
  membro_id: string
  permissoes: string[]
  responsavel_padrao_id: string | null
  responsavel_padrao_nome: string | null
  ips_permitidos: string[]
  expira_em: string | Date | null
  revogada_em: string | Date | null
  substituida_por: string | null
  ultimo_uso_em: string | Date | null
  ultimo_ip: string | null
  criado_em: string | Date
  criado_por: string | null
  criado_por_nome: string | null
  vencida: boolean
}

const SELECAO = sql`
  SELECT c.id, c.nome, c.prefixo, c.ambiente, c.membro_id, c.permissoes, c.responsavel_padrao_id,
    r.nome AS responsavel_padrao_nome, c.ips_permitidos,
    c.expira_em, c.revogada_em, c.substituida_por, c.ultimo_uso_em, host(c.ultimo_ip) AS ultimo_ip,
    c.criado_em, c.criado_por, cp.nome AS criado_por_nome,
    (c.expira_em IS NOT NULL AND c.expira_em <= now()) AS vencida
  FROM api_chaves c
  LEFT JOIN membros r ON r.id = c.responsavel_padrao_id
  LEFT JOIN membros cp ON cp.id = c.criado_por`

const iso = (v: string | Date | null): string | null => (v ? new Date(v).toISOString() : null)

/** Nome do membro de integração: é o que o histórico mostra como autor. */
export const nomeDoMembroDaChave = (nome: string) => `Integração: ${nome}`

/**
 * Chaves de API da empresa ativa (docs/plano_api_aberta.md, seção 4): criar, alterar, rotacionar e revogar.
 * Cada chave nasce com o seu membro de integração (`membros.tipo = 'integracao'`, sem login e inativo, fora das
 * listas da equipe), que assina tudo o que a chave faz. O token só existe na resposta da criação e da rotação.
 */
@Injectable()
export class ChavesService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  async listar(): Promise<ListaDeChaves> {
    const linhas = await this.ctx.db().execute<LinhaChave>(sql`
      ${SELECAO} WHERE c.excluido_em IS NULL ORDER BY c.revogada_em IS NOT NULL, c.criado_em DESC`)
    return { itens: [...linhas].map((l) => this.dto(l)) }
  }

  async criar(dados: CriarChaveEntrada, com2fa: boolean): Promise<ChaveCriada> {
    if (!com2fa) {
      throw new ErroApi(
        '2fa_obrigatorio',
        'Ative a verificação em duas etapas para criar chaves de API.',
        403,
      )
    }
    const ips = this.ips(dados.ipsPermitidos ?? [])
    await this.conferirResponsavel(dados.responsavelPadraoId ?? null)
    this.conferirValidade(dados.expiraEm ?? null)
    const membroId = novoId()
    await this.ctx.db().execute(sql`
      INSERT INTO membros (id, tenant_id, nome, tipo, ativo, criado_por, atualizado_por)
      VALUES (${membroId}, ${this.ctx.tenantId}, ${nomeDoMembroDaChave(dados.nome)}, 'integracao', false,
              ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    const { id, token } = await this.inserir({
      nome: dados.nome,
      membroId,
      permissoes: [...new Set(dados.permissoes)],
      responsavelPadraoId: dados.responsavelPadraoId ?? null,
      ips,
      expiraEm: dados.expiraEm ?? null,
    })
    await this.auditoria.registrar({
      entidade: 'api_chave',
      entidadeId: id,
      acao: 'criada',
      alteracoes: {
        nome: dados.nome,
        permissoes: dados.permissoes,
        ipsPermitidos: ips,
        expiraEm: dados.expiraEm ?? null,
      },
    })
    return { chave: await this.obter(id), token }
  }

  async alterar(id: string, dados: AlterarChaveEntrada): Promise<ChaveDeApi> {
    const atual = await this.paraAlterar(id)
    const ips = dados.ipsPermitidos === undefined ? undefined : this.ips(dados.ipsPermitidos)
    if (dados.responsavelPadraoId !== undefined)
      await this.conferirResponsavel(dados.responsavelPadraoId)
    if (dados.expiraEm !== undefined) this.conferirValidade(dados.expiraEm)
    const db = this.ctx.db()
    await db.execute(sql`
      UPDATE api_chaves SET
        nome = coalesce(${dados.nome ?? null}, nome),
        permissoes = coalesce(${dados.permissoes ? `{${[...new Set(dados.permissoes)].join(',')}}` : null}::text[], permissoes),
        ips_permitidos = coalesce(${ips ? `{${ips.map((i) => `"${i}"`).join(',')}}` : null}::text[], ips_permitidos),
        responsavel_padrao_id = ${dados.responsavelPadraoId === undefined ? sql`responsavel_padrao_id` : sql`${dados.responsavelPadraoId}::uuid`},
        expira_em = ${dados.expiraEm === undefined ? sql`expira_em` : sql`${dados.expiraEm}::timestamptz`},
        aviso_vencimento_em = ${dados.expiraEm === undefined ? sql`aviso_vencimento_em` : sql`NULL`},
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    if (dados.nome && dados.nome !== atual.nome) {
      await db.execute(sql`
        UPDATE membros SET nome = ${nomeDoMembroDaChave(dados.nome)}, atualizado_em = now(),
          atualizado_por = ${this.ctx.membro.id}
        WHERE id = ${atual.membro_id}`)
    }
    const depois = await this.obter(id)
    await this.auditoria.registrar({
      entidade: 'api_chave',
      entidadeId: id,
      acao: 'alterada',
      alteracoes: {
        antes: {
          nome: atual.nome,
          permissoes: atual.permissoes,
          ipsPermitidos: atual.ips_permitidos,
          expiraEm: iso(atual.expira_em),
        },
        depois: {
          nome: depois.nome,
          permissoes: depois.permissoes,
          ipsPermitidos: depois.ipsPermitidos,
          expiraEm: depois.expiraEm,
        },
      },
    })
    return depois
  }

  /**
   * Cria uma chave nova com os mesmos dados e o mesmo membro de integração (o histórico continua com o mesmo
   * autor). A antiga vale por mais `prazoDias` (0 = revogada agora), para trocar no n8n sem parada.
   */
  async rotacionar(
    id: string,
    dados: RotacionarChaveEntrada,
    com2fa: boolean,
  ): Promise<ChaveCriada> {
    if (!com2fa) {
      throw new ErroApi(
        '2fa_obrigatorio',
        'Ative a verificação em duas etapas para rotacionar chaves de API.',
        403,
      )
    }
    const atual = await this.paraAlterar(id)
    if (atual.substituida_por) {
      throw new ErroApi('chave_ja_rotacionada', 'Esta chave já foi substituída por outra.', 409)
    }
    const nova = await this.inserir({
      nome: atual.nome,
      membroId: atual.membro_id,
      permissoes: atual.permissoes,
      responsavelPadraoId: atual.responsavel_padrao_id,
      ips: atual.ips_permitidos,
      expiraEm: iso(atual.expira_em),
    })
    const db = this.ctx.db()
    if (dados.prazoDias === 0) {
      await db.execute(sql`
        UPDATE api_chaves SET substituida_por = ${nova.id}, revogada_em = now(), revogada_por = ${this.ctx.membro.id},
          atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
        WHERE id = ${id}`)
    } else {
      await db.execute(sql`
        UPDATE api_chaves SET substituida_por = ${nova.id},
          expira_em = least(coalesce(expira_em, 'infinity'::timestamptz), now() + make_interval(days => ${dados.prazoDias})),
          aviso_vencimento_em = now(),
          atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
        WHERE id = ${id}`)
    }
    await this.auditoria.registrar({
      entidade: 'api_chave',
      entidadeId: id,
      acao: 'rotacionada',
      alteracoes: { novaChaveId: nova.id, prazoDias: dados.prazoDias },
    })
    return { chave: await this.obter(nova.id), token: nova.token }
  }

  async revogar(id: string): Promise<ChaveDeApi> {
    await this.paraAlterar(id)
    await this.ctx.db().execute(sql`
      UPDATE api_chaves SET revogada_em = now(), revogada_por = ${this.ctx.membro.id},
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({ entidade: 'api_chave', entidadeId: id, acao: 'revogada' })
    return this.obter(id)
  }

  // ---------------------------------------------------------------------------------------------- apoio

  private async inserir(d: {
    nome: string
    membroId: string
    permissoes: string[]
    responsavelPadraoId: string | null
    ips: string[]
    expiraEm: string | null
  }): Promise<{ id: string; token: string }> {
    const id = novoId()
    const { token, prefixo, hash } = gerarTokenDaChave(ambienteDe(this.config.NODE_ENV))
    await this.ctx.db().execute(sql`
      INSERT INTO api_chaves (id, tenant_id, nome, prefixo, hash, ambiente, membro_id, permissoes,
        responsavel_padrao_id, ips_permitidos, expira_em, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${d.nome}, ${prefixo}, ${hash}, ${ambienteDe(this.config.NODE_ENV)},
        ${d.membroId}, ${`{${d.permissoes.join(',')}}`}::text[], ${d.responsavelPadraoId},
        ${`{${d.ips.map((i) => `"${i}"`).join(',')}}`}::text[], ${d.expiraEm}::timestamptz,
        ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    return { id, token }
  }

  private async obter(id: string): Promise<ChaveDeApi> {
    const [linha] = await this.ctx.db().execute<LinhaChave>(sql`${SELECAO} WHERE c.id = ${id}`)
    if (!linha) throw new ErroApi('chave_nao_encontrada', 'Chave de API não encontrada.', 404)
    return this.dto(linha)
  }

  /** A chave para alterar, travada; revogada ou vencida não muda mais (409). */
  private async paraAlterar(id: string): Promise<LinhaChave> {
    const [linha] = await this.ctx.db().execute<LinhaChave>(sql`
      ${SELECAO} WHERE c.id = ${id} AND c.excluido_em IS NULL FOR UPDATE OF c`)
    if (!linha) throw new ErroApi('chave_nao_encontrada', 'Chave de API não encontrada.', 404)
    if (linha.revogada_em || linha.vencida) {
      throw new ErroApi('chave_revogada', 'Esta chave já foi revogada ou venceu.', 409)
    }
    return linha
  }

  private async conferirResponsavel(id: string | null): Promise<void> {
    if (!id) return
    const [m] = await this.ctx.db().execute<{ id: string }>(sql`
      SELECT id FROM membros WHERE id = ${id} AND tipo = 'pessoa' AND ativo AND excluido_em IS NULL`)
    if (!m) {
      throw new ErroApi(
        'responsavel_invalido',
        'O responsável padrão precisa ser um membro ativo da equipe.',
        422,
      )
    }
  }

  private conferirValidade(expiraEm: string | null): void {
    if (expiraEm && new Date(expiraEm).getTime() <= Date.now()) {
      throw new ErroApi('validade_no_passado', 'A validade precisa ser uma data futura.', 422)
    }
  }

  /** Confere cada IP ou faixa (o schema já filtrou o formato) e devolve sem repetição. */
  private ips(lista: string[]): string[] {
    for (const valor of lista) {
      const [ip] = valor.split('/')
      if (!ip || isIP(ip) === 0) {
        throw new ErroApi('ip_invalido', `IP ou faixa inválido: ${valor}`, 422, [
          { campo: 'ipsPermitidos', mensagem: `IP ou faixa inválido: ${valor}` },
        ])
      }
    }
    return [...new Set(lista)]
  }

  private dto(l: LinhaChave): ChaveDeApi {
    const situacao: SituacaoDaChave = l.revogada_em
      ? 'revogada'
      : l.vencida
        ? 'vencida'
        : l.substituida_por
          ? 'substituida'
          : 'ativa'
    return {
      id: l.id,
      nome: l.nome,
      prefixo: `ltg_${l.ambiente}_${l.prefixo}`,
      ambiente: l.ambiente,
      permissoes: l.permissoes,
      responsavelPadrao: l.responsavel_padrao_id
        ? { id: l.responsavel_padrao_id, nome: l.responsavel_padrao_nome ?? '' }
        : null,
      ipsPermitidos: l.ips_permitidos,
      expiraEm: iso(l.expira_em),
      revogadaEm: iso(l.revogada_em),
      substituidaPor: l.substituida_por,
      ultimoUsoEm: iso(l.ultimo_uso_em),
      ultimoIp: l.ultimo_ip,
      situacao,
      criadoEm: new Date(l.criado_em).toISOString(),
      criadoPor: l.criado_por ? { id: l.criado_por, nome: l.criado_por_nome ?? '' } : null,
    }
  }
}
