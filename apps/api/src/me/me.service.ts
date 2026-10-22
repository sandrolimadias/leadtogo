import type { Conexao } from '@leadtogo/db'
import { sql } from '@leadtogo/db'
import type {
  Alcance,
  EmpresaAtivaResposta,
  EmpresaDoUsuario,
  MeResposta,
  SituacaoEmpresa,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { perfilEfetivo, permissoesDoCatalogo } from '../acesso/permissoes-do-membro.js'
import type { DadosDeAcesso, Vinculo } from '../acesso/requisicao.js'
import {
  doisFatoresObrigatorio,
  doisFatoresPendente,
  motivoDoisFatores,
} from '../acesso/dois-fatores.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'

type LinhaEmpresa = {
  id: string
  razao_social: string
  nome_fantasia: string | null
  situacao: SituacaoEmpresa
}

type LinhaPerfil = {
  tenant_id: string
  perfil_id: string
  nome: string
  permissao: string | null
  alcance: Alcance | null
}

@Injectable()
export class MeService {
  constructor(@Inject(BANCO) private readonly banco: Conexao) {}

  /**
   * Dados das empresas do usuário (nome e situação). `tenants` tem RLS: lê-se numa transação
   * SOMENTE LEITURA com `app.tenant_ids` = as empresas em que ele já é membro (decididas pela
   * função de vínculos, não pelo cliente).
   */
  private async empresasDe(
    usuarioId: string,
    vinculos: Vinculo[],
    ativaId: string | null,
  ): Promise<EmpresaDoUsuario[]> {
    if (vinculos.length === 0) return []
    const ids = vinculos.map((v) => v.tenantId)
    const { linhas, perfis } = await this.banco.db.transaction(
      async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_ids', ${`{${ids.join(',')}}`}, true)`)
        return {
          linhas: await tx.execute<LinhaEmpresa>(
            sql`SELECT id, razao_social, nome_fantasia, situacao FROM tenants`,
          ),
          // Perfil efetivo em cada empresa: a mesma regra do TenantInterceptor (carregarPermissoes):
          // o do membro, ou o de sistema do papel enquanto ele não tem; excluído ou inativo = nenhum
          perfis: await tx.execute<LinhaPerfil>(sql`
            SELECT m.tenant_id, p.id AS perfil_id, p.nome, pp.permissao, pp.alcance::text AS alcance
            FROM membros m
            JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
            LEFT JOIN perfil_permissoes pp ON pp.perfil_id = p.id
            WHERE m.usuario_id = ${usuarioId} AND m.excluido_em IS NULL AND m.ativo`),
        }
      },
      { accessMode: 'read only' },
    )
    const porId = new Map<string, LinhaEmpresa>([...linhas].map((l) => [l.id, l]))
    const perfilDe = new Map<
      string,
      { id: string; nome: string; linhas: { permissao: string; alcance: Alcance | null }[] }
    >()
    for (const l of perfis) {
      const p = perfilDe.get(l.tenant_id) ?? { id: l.perfil_id, nome: l.nome, linhas: [] }
      if (l.permissao) p.linhas.push({ permissao: l.permissao, alcance: l.alcance })
      perfilDe.set(l.tenant_id, p)
    }
    return vinculos
      .map((v): EmpresaDoUsuario | null => {
        const e = porId.get(v.tenantId)
        if (!e) return null
        const perfil = perfilDe.get(e.id)
        return {
          id: e.id,
          razaoSocial: e.razao_social,
          nomeFantasia: e.nome_fantasia,
          papel: v.papel,
          perfil: perfil ? { id: perfil.id, nome: perfil.nome } : null,
          permissoes: permissoesDoCatalogo(perfil?.linhas ?? []),
          situacao: e.situacao,
          ativa: e.id === ativaId,
        }
      })
      .filter((e): e is EmpresaDoUsuario => e !== null)
      .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR'))
  }

  async me(acesso: DadosDeAcesso): Promise<MeResposta> {
    const { sessao, vinculos, administradorDeConta } = acesso
    const emailVerificado = (
      await this.banco.cliente<{ email_verified: boolean }[]>`
        SELECT email_verified FROM auth."user" WHERE id = ${sessao.usuarioId}`
    )[0]?.email_verified
    const empresas = await this.empresasDe(sessao.usuarioId, vinculos, sessao.empresaAtivaId)
    return {
      usuario: {
        id: sessao.usuarioId,
        nome: sessao.nome,
        email: sessao.email,
        emailVerificado: emailVerificado === true,
        twoFactorEnabled: sessao.twoFactorEnabled,
      },
      empresas,
      precisaEscolherEmpresa: empresas.length > 0 && !empresas.some((e) => e.ativa),
      empresaAtivaId: sessao.empresaAtivaId,
      administradorDeConta,
      doisFatoresPendente: doisFatoresPendente({
        twoFactorEnabled: sessao.twoFactorEnabled,
        administradorDeConta,
        vinculos,
        empresaAtivaId: sessao.empresaAtivaId,
      }),
      doisFatoresObrigatorio: doisFatoresObrigatorio({ administradorDeConta, vinculos }),
      doisFatoresMotivo: motivoDoisFatores({
        administradorDeConta,
        vinculos,
        empresaAtivaId: sessao.empresaAtivaId,
      }),
    }
  }

  /**
   * Troca a empresa ativa DESTA sessão (as outras sessões do usuário não mudam). Só empresas em que
   * ele é membro ativo e que estão em teste ou ativas. O id de uma empresa de que ele não é membro
   * e o de uma que não existe dão a mesma resposta (não revela cadastro).
   */
  async trocarEmpresaAtiva(
    acesso: DadosDeAcesso,
    empresaId: string,
  ): Promise<EmpresaAtivaResposta> {
    const { sessao, vinculos } = acesso
    const vinculo = vinculos.find((v) => v.tenantId === empresaId)
    if (!vinculo) {
      throw new ErroApi('empresa_nao_permitida', 'Você não é membro desta empresa.', 403)
    }
    const [empresa] = await this.empresasDe(sessao.usuarioId, [vinculo], null)
    if (!empresa)
      throw new ErroApi('empresa_nao_permitida', 'Você não é membro desta empresa.', 403)
    if (empresa.situacao !== 'teste' && empresa.situacao !== 'ativo') {
      throw new ErroApi('empresa_indisponivel', 'Esta empresa está suspensa ou cancelada.', 403)
    }
    // Sessões ficam só no Postgres (sem cache): gravar na linha é suficiente e vale na próxima requisição
    const atualizadas = await this.banco.cliente`
      UPDATE auth.session SET empresa_ativa_id = ${empresaId}, updated_at = now()
      WHERE id = ${sessao.sessaoId} AND user_id = ${sessao.usuarioId}
      RETURNING id`
    if (atualizadas.length === 0) throw new ErroApi('nao_autenticado', 'Entre para continuar.', 401)
    // lembra a escolha: o próximo login começa nesta empresa
    await this.banco
      .cliente`UPDATE auth."user" SET ultima_empresa_id = ${empresaId} WHERE id = ${sessao.usuarioId}`
    return { empresaAtivaId: empresaId, empresa: { ...empresa, ativa: true } }
  }
}
