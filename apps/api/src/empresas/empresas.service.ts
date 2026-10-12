import { type Conexao, criarPadroesDoTenant, novoId, schema, sql } from '@leadtogo/db'
import type { CriarEmpresa, EmpresaCriada } from '@leadtogo/shared'
import { Inject, Injectable, Logger } from '@nestjs/common'

import type { DadosDeAcesso } from '../acesso/requisicao.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO } from '../infra/infra.module.js'

const { membros, tenantConfiguracoes, tenants } = schema

/** Criação de empresas do grupo pelo administrador da conta. */
@Injectable()
export class EmpresasService {
  private readonly log = new Logger(EmpresasService.name)

  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    private readonly auditoria: AuditoriaService,
  ) {}

  async criar(acesso: DadosDeAcesso, dados: CriarEmpresa, ip?: string): Promise<EmpresaCriada> {
    if (!acesso.administradorDeConta) {
      throw new ErroApi(
        'acesso_negado',
        'Só o dono ou um administrador da conta cria empresas.',
        403,
      )
    }
    const { usuarioId, nome, email } = acesso.sessao
    const contaId = await this.contaDaNovaEmpresa(usuarioId, dados.contaId)
    const cnpjRepetidoNaConta = dados.cnpj
      ? await this.cnpjNaConta(usuarioId, contaId, dados.cnpj)
      : false

    const tenantId = novoId()
    const membroId = novoId()
    // Tudo ou nada: empresa, configurações, o criador como administrador e o registro de auditoria
    const empresa = await this.banco.db.transaction(async (tx) => {
      // tenants, configurações e membros têm RLS: a empresa nova precisa ser a ativa da transação
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      const [criada] = await tx
        .insert(tenants)
        .values({
          id: tenantId,
          contaId,
          razaoSocial: dados.razaoSocial,
          nomeFantasia: dados.nomeFantasia ?? null,
          cnpj: dados.cnpj ?? null,
        })
        .returning({ situacao: tenants.situacao })
      await tx.insert(tenantConfiguracoes).values({ tenantId })
      await tx
        .insert(membros)
        .values({ id: membroId, tenantId, usuarioId, nome, email, papel: 'admin' })
      await criarPadroesDoTenant(tx, tenantId, membroId)
      await this.auditoria.registrarEm(tx, tenantId, membroId, {
        entidade: 'empresa',
        entidadeId: tenantId,
        acao: 'criar_empresa',
        alteracoes: { razaoSocial: dados.razaoSocial, contaId },
        ip,
      })
      return criada
    })
    this.log.log(`empresa criada (tenant ${tenantId}) na conta ${contaId}`)

    return {
      empresa: {
        id: tenantId,
        razaoSocial: dados.razaoSocial,
        nomeFantasia: dados.nomeFantasia ?? null,
        papel: 'admin',
        situacao: empresa?.situacao ?? 'teste',
        ativa: false,
      },
      cnpjRepetidoNaConta,
    }
  }

  /** A conta (dono ou administrador) onde a empresa nasce; se a pessoa tem mais de uma, `contaId` é obrigatório. */
  private async contaDaNovaEmpresa(usuarioId: string, pedida: string | undefined): Promise<string> {
    const contas = await this.banco.cliente<{ conta_id: string }[]>`
      SELECT conta_id FROM conta_administradores
      WHERE usuario_id = ${usuarioId} AND papel IN ('dono', 'administrador') ORDER BY criado_em, conta_id`
    const ids = contas.map((c) => c.conta_id)
    if (pedida) {
      // conta alheia e inexistente dão a mesma resposta
      if (!ids.includes(pedida)) {
        throw new ErroApi('conta_nao_permitida', 'Você não administra esta conta.', 403)
      }
      return pedida
    }
    const [unica] = ids
    if (ids.length === 1 && unica) return unica
    throw new ErroApi(
      'conta_obrigatoria',
      'Você administra mais de uma conta: informe em qual criar a empresa.',
      400,
    )
  }

  /** Aviso de CNPJ repetido: só olha as empresas da MESMA conta (nunca revela outras contas). */
  private async cnpjNaConta(usuarioId: string, contaId: string, cnpj: string): Promise<boolean> {
    return this.banco.db.transaction(
      async (tx) => {
        const ids = await tx.execute<{ tenant_id: string }>(
          sql`SELECT tenant_id FROM app_empresas_da_conta_do_usuario(${usuarioId})`,
        )
        const lista = [...ids].map((l) => l.tenant_id)
        if (lista.length === 0) return false
        await tx.execute(sql`SELECT set_config('app.tenant_ids', ${`{${lista.join(',')}}`}, true)`)
        const achadas = await tx.execute(
          sql`SELECT 1 FROM tenants WHERE conta_id = ${contaId} AND cnpj = ${cnpj} LIMIT 1`,
        )
        return achadas.length > 0
      },
      { accessMode: 'read only' },
    )
  }
}
