import { sql } from '@leadtogo/db'
import { formatarCnae, type MeuPerfilDoPortal, type MinhaEmpresaDoPortal } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'

const primeiroNome = (nome: string | null): string | null => nome?.trim().split(/\s+/)[0] ?? null

/**
 * "Meu perfil" e "Minha empresa" do portal (Fase 4A, F-5 e F-6): o cadastro como a equipe guardou, em DTOs
 * próprios (lista de permissão). O banco já limita ao contato e à empresa da sessão (políticas do portal).
 */
@Injectable()
export class PortalPerfilService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async meuPerfil(): Promise<MeuPerfilDoPortal> {
    const p = this.ctx.portal
    const db = this.ctx.db()
    const [c] = await db.execute<{
      nome: string
      cargo: string | null
      aniversario_dia: number | null
      aniversario_mes: number | null
    }>(sql`
      SELECT c.nome, ec.cargo, c.aniversario_dia, c.aniversario_mes
      FROM contatos c
      LEFT JOIN empresa_contatos ec ON ec.contato_id = c.id AND ec.empresa_id = ${p.empresaId}
      WHERE c.id = ${p.contatoId} AND c.excluido_em IS NULL`)
    if (!c) throw new ErroApi('nao_encontrado', 'Cadastro não encontrado.', 404)
    const emails = await db.execute<{ email: string; tipo: 'pessoal' | 'trabalho' }>(sql`
      SELECT email::text AS email, tipo::text AS tipo FROM contato_emails
      WHERE contato_id = ${p.contatoId} ORDER BY principal DESC, criado_em`)
    const telefones = await db.execute<{
      numero: string
      tipo: 'fixo' | 'celular' | 'whatsapp' | 'outro'
    }>(sql`
      SELECT numero, tipo::text AS tipo FROM contato_telefones
      WHERE contato_id = ${p.contatoId} ORDER BY principal DESC, criado_em`)
    return {
      nome: c.nome,
      cargo: c.cargo,
      emailDeAcesso: p.email,
      emails: [...emails],
      telefones: [...telefones],
      aniversario:
        c.aniversario_dia && c.aniversario_mes
          ? { dia: c.aniversario_dia, mes: c.aniversario_mes }
          : null,
    }
  }

  async minhaEmpresa(): Promise<MinhaEmpresaDoPortal> {
    const db = this.ctx.db()
    const empresaId = this.ctx.portal.empresaId
    const [e] = await db.execute<{
      razao_social: string
      nome_fantasia: string | null
      tipo_documento: 'cnpj' | 'cpf' | 'nenhum'
      documento: string | null
      matriz_filial: 'matriz' | 'filial' | null
      porte: string | null
      data_inicio_atividades: string | null
      website: string | null
      cep: string | null
      tipo_logradouro: string | null
      logradouro: string | null
      numero: string | null
      complemento: string | null
      bairro: string | null
      municipio: string | null
      uf: string | null
      responsavel: string | null
    }>(sql`
      SELECT e.razao_social, e.nome_fantasia, e.tipo_documento::text AS tipo_documento, e.documento,
             e.matriz_filial::text AS matriz_filial, pt.descricao AS porte,
             e.data_inicio_atividades::text AS data_inicio_atividades, e.website, e.cep, e.tipo_logradouro,
             e.logradouro, e.numero, e.complemento, e.bairro, m.nome AS municipio, m.uf::text AS uf,
             v.nome AS responsavel
      FROM empresas e
      LEFT JOIN portes pt ON pt.codigo = e.porte_codigo
      LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
      LEFT JOIN membros v ON v.id = e.vendedor_id
      WHERE e.id = ${empresaId} AND e.excluido_em IS NULL`)
    if (!e) throw new ErroApi('nao_encontrado', 'Empresa não encontrada.', 404)
    const telefones = await db.execute<{
      numero: string
      tipo: 'fixo' | 'celular' | 'whatsapp' | 'outro'
    }>(sql`
      SELECT numero, tipo::text AS tipo FROM empresa_telefones
      WHERE empresa_id = ${empresaId} ORDER BY principal DESC, criado_em`)
    const cnaes = await db.execute<{ codigo: number; descricao: string; principal: boolean }>(sql`
      SELECT ec.cnae_codigo AS codigo, cn.descricao, ec.principal
      FROM empresa_cnaes ec JOIN cnaes cn ON cn.codigo = ec.cnae_codigo
      WHERE ec.empresa_id = ${empresaId} ORDER BY ec.principal DESC, ec.cnae_codigo`)
    const cnae = (l: { codigo: number; descricao: string }) => ({
      codigo: formatarCnae(Number(l.codigo)),
      descricao: l.descricao,
    })
    const principal = cnaes.find((l) => l.principal)
    return {
      razaoSocial: e.razao_social,
      nomeFantasia: e.nome_fantasia,
      tipoDocumento: e.tipo_documento,
      documento: e.documento,
      matrizFilial: e.matriz_filial,
      porte: e.porte,
      dataInicioAtividades: e.data_inicio_atividades,
      website: e.website,
      endereco: {
        cep: e.cep,
        logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' ') || null,
        numero: e.numero,
        complemento: e.complemento,
        bairro: e.bairro,
        municipio: e.municipio,
        uf: e.uf,
      },
      telefones: [...telefones],
      cnaePrincipal: principal ? cnae(principal) : null,
      cnaesSecundarios: cnaes.filter((l) => !l.principal).map(cnae),
      responsavel: primeiroNome(e.responsavel),
    }
  }
}
