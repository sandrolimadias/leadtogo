import { and, eq, isNull, schema } from '@leadtogo/db'
import type { Contato } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { ContatosService } from './contatos.service.js'
import { escopoDaCarteira, podeEditar, podeVer } from './regras-de-carteira.js'

const { empresas, empresaSocios, qualificacoesSocio, contatos } = schema

/**
 * "Converter em contato": cria o contato com o nome do sócio e o vínculo com a empresa (cargo = qualificação,
 * sem telefone nem e-mail). O sócio guarda o `contato_id`, e por isso não converte duas vezes e o vínculo
 * sobrevive ao "Atualizar pela Receita" (ver `gravarSocios`).
 */
@Injectable()
export class ConverterSocioService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly contatosServico: ContatosService,
  ) {}

  async converter(empresaId: string, socioId: string): Promise<Contato> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)

    const [empresa] = await db
      .select({ id: empresas.id, vendedorId: empresas.vendedorId })
      .from(empresas)
      .where(and(eq(empresas.id, empresaId), isNull(empresas.excluidoEm)))
    if (!empresa || !podeVer(escopo, empresa.vendedorId)) {
      throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    }
    if (!podeEditar(escopo, empresa.vendedorId)) {
      throw new ErroApi(
        'acesso_negado',
        'Você só converte sócios de empresas da sua carteira.',
        403,
      )
    }

    const [socio] = await db
      .select({
        id: empresaSocios.id,
        nome: empresaSocios.nome,
        contatoId: empresaSocios.contatoId,
        qualificacaoTexto: empresaSocios.qualificacaoTexto,
        qualificacaoDescricao: qualificacoesSocio.descricao,
      })
      .from(empresaSocios)
      .leftJoin(qualificacoesSocio, eq(qualificacoesSocio.codigo, empresaSocios.qualificacaoCodigo))
      .where(and(eq(empresaSocios.id, socioId), eq(empresaSocios.empresaId, empresaId)))
    if (!socio) throw new ErroApi('socio_nao_encontrado', 'Sócio não encontrado.', 404)
    if (socio.contatoId) {
      throw new ErroApi('socio_ja_convertido', 'Este sócio já foi convertido em contato.', 409)
    }

    const cargo = socio.qualificacaoDescricao ?? socio.qualificacaoTexto ?? null
    const [criado] = await db
      .insert(contatos)
      .values({
        tenantId: this.ctx.tenantId,
        nome: socio.nome,
        criadoPor: escopo.membroId,
        atualizadoPor: escopo.membroId,
      })
      .returning({ id: contatos.id })
    if (!criado) throw new Error('INSERT de contato sem retorno')
    await this.contatosServico.vincular(db, this.ctx.tenantId, criado.id, empresaId, {
      cargo,
      principal: false,
    })
    await db
      .update(empresaSocios)
      .set({ contatoId: criado.id })
      .where(eq(empresaSocios.id, socio.id))
    await this.auditoria.registrar({
      entidade: 'contato',
      entidadeId: criado.id,
      acao: 'criar',
      alteracoes: { nome: socio.nome, empresaId, cargo, origem: 'socio' },
    })
    return this.contatosServico.detalhar(criado.id)
  }
}
