import type { Conexao } from '@leadtogo/db'
import { novoId, schema, sql } from '@leadtogo/db'
import type { PrimeiroAcesso, PrimeiroAcessoResultado } from '@leadtogo/shared'
import { Inject, Injectable, Logger } from '@nestjs/common'

import { AuthService } from '../auth/auth.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { verificacaoEmailObrigatoria } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { BANCO } from '../infra/infra.module.js'
import { identificarNoLog } from '../log/contexto-log.js'

export interface OpcoesCriarConta {
  /** E-mail já confirmado (o comando do terminal confirma; o endpoint segue a flag de verificação) */
  emailVerificado?: boolean
}

const { contas, contaAdministradores, membros, tenantConfiguracoes, tenants } = schema

/**
 * Primeiro acesso: o usuário (Better Auth), a conta dona, o vínculo `dono`, a primeira empresa, as
 * configurações e o membro admin. Sem cadastros padrão (as tabelas ainda não existem).
 * Usado pelo endpoint e pelo comando `dist/criar-conta.js`: o mesmo fluxo nos dois.
 */
@Injectable()
export class PrimeiroAcessoService {
  private readonly log = new Logger(PrimeiroAcessoService.name)

  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly auth: AuthService,
  ) {}

  async criar(
    dados: PrimeiroAcesso,
    opcoes: OpcoesCriarConta = {},
  ): Promise<PrimeiroAcessoResultado> {
    const verificacaoPendente = !(
      opcoes.emailVerificado ?? !verificacaoEmailObrigatoria(this.config)
    )
    const usuario = await this.auth.criarUsuarioComSenha({
      nome: dados.nome,
      email: dados.email,
      senha: dados.senha,
      // Com a verificação desligada, o e-mail vale como confirmado; ligada, o usuário confirma pelo link
      emailVerificado: !verificacaoPendente,
    })

    const contaId = novoId()
    const tenantId = novoId()
    const membroId = novoId()
    try {
      // Tudo ou nada: conta, vínculo, empresa, configurações e membro numa transação só
      await this.banco.db.transaction(async (tx) => {
        await tx
          .insert(contas)
          .values({ id: contaId, nome: dados.contaNome ?? dados.empresa.razaoSocial })
        await tx
          .insert(contaAdministradores)
          .values({ contaId, usuarioId: usuario.id, papel: 'dono' })
        // tenants, configurações e membros têm RLS: a empresa nova precisa ser a ativa da transação
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
        await tx.insert(tenants).values({
          id: tenantId,
          contaId,
          razaoSocial: dados.empresa.razaoSocial,
          nomeFantasia: dados.empresa.nomeFantasia,
          cnpj: dados.empresa.cnpj,
        })
        await tx.insert(tenantConfiguracoes).values({ tenantId })
        await tx.insert(membros).values({
          id: membroId,
          tenantId,
          usuarioId: usuario.id,
          nome: dados.nome,
          email: dados.email,
          papel: 'admin',
        })
      })
    } catch (erro) {
      // Desfaz o usuário criado antes da transação (as contas e sessões dele caem em cascata)
      await this.banco.cliente`DELETE FROM auth."user" WHERE id = ${usuario.id}`.catch(
        (e: unknown) =>
          this.log.error(`não foi possível desfazer o usuário do primeiro acesso: ${String(e)}`),
      )
      throw erro
    }

    identificarNoLog({ tenantId, userId: usuario.id })
    this.log.log(`primeiro acesso: conta, empresa e administrador criados (tenant ${tenantId})`)

    if (verificacaoPendente) await this.auth.enviarVerificacaoDeEmail(dados.email)
    return {
      usuarioId: usuario.id,
      contaId,
      tenantId,
      membroId,
      verificacaoEmailPendente: verificacaoPendente,
    }
  }
}
