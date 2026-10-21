import { asc, eq, schema } from '@leadtogo/db'
import {
  type AplicarDaReceita,
  type CampoDaReceita,
  CAMPOS_DA_RECEITA,
  type ConsultaDaReceitaDaEmpresa,
  type DadosDaReceita,
  type EmpresaCarteira,
  ROTULO_DO_REGIME,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { type ConsultaDeCnpj, ReceitaService } from '../receita/receita.service.js'
import { situacaoDaReceita } from './empresa-leitura.js'
import { EmpresasDaCarteiraService } from './empresas.service.js'
import { type EscopoDaCarteira, escopoDaCarteira, podeEditar } from './regras-de-carteira.js'
import { normalizarTelefonesDaEmpresa } from './telefones.js'

const { empresas, empresaCnaes, empresaSocios, empresaTelefones, municipios } = schema

type Empresa = typeof empresas.$inferSelect

interface Mudanca {
  chave: CampoDaReceita
  rotulo: string
  atual: string | null
  receita: string | null
}

const dataLegivel = (iso: string | null): string | null => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const vazioParaNulo = (v: string | null | undefined): string | null => (v?.trim() ? v.trim() : null)

/** "RUA DAS FLORES, 567, GALPAO 2, CENTRO, VITORIA/ES, CEP 29100-001"; nulo se nada foi informado. */
function enderecoLegivel(e: {
  tipoLogradouro: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}): string | null {
  const rua = [e.tipoLogradouro, e.logradouro].filter(Boolean).join(' ')
  const cidade = e.cidade ? (e.uf ? `${e.cidade}/${e.uf}` : e.cidade) : null
  const cep = e.cep ? `CEP ${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : null
  const texto = [rua, e.numero, e.complemento, e.bairro, cidade, cep].filter(Boolean).join(', ')
  return texto || null
}

const cnaesLegiveis = (principal: number | null, secundarios: number[]): string | null => {
  const lista = [
    ...(principal === null ? [] : [`${principal} (principal)`]),
    ...[...secundarios].sort((a, b) => a - b).map(String),
  ]
  return lista.length > 0 ? lista.join(', ') : null
}

/**
 * "Atualizar pela Receita" (ficha da empresa): reconsulta ignorando o cache, atualiza a situação e a
 * data da consulta e mostra o que mudou; o usuário aplica (tudo ou campos) ou mantém como está.
 * Só CNPJ. Uma empresa que deixou de ser ativa continua na carteira, só com o aviso de situação.
 */
@Injectable()
export class AtualizarPelaReceitaService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly receita: ReceitaService,
    private readonly empresas: EmpresasDaCarteiraService,
  ) {}

  /** Passo 1: reconsulta (sem cache), registra a situação e a data e devolve a comparação. */
  async consultar(id: string): Promise<ConsultaDaReceitaDaEmpresa> {
    // A Receita pode levar até 16 s: a consulta fica FORA da transação (não segura conexão do banco).
    // A situação anterior é lida antes, porque a consulta renova o cache de onde ela vem.
    const previo = await this.ctx.transacao(async () => {
      const db = this.ctx.db()
      const { empresa } = await this.empresaEditavel(db, id)
      const documento = empresa.documento ?? ''
      return { documento, anterior: await situacaoDaReceita(db, documento) }
    })
    const consulta = await this.consultarAgora(previo.documento)
    return this.ctx.transacao(() => this.registrarConsulta(id, consulta, previo.anterior))
  }

  private async registrarConsulta(
    id: string,
    consulta: ConsultaDeCnpj,
    anterior: Awaited<ReturnType<typeof situacaoDaReceita>>,
  ): Promise<ConsultaDaReceitaDaEmpresa> {
    const db = this.ctx.db()
    const { empresa, escopo } = await this.empresaEditavel(db, id)
    await db
      .update(empresas)
      .set({
        receitaAtualizadoEm: consulta.consultadoEm,
        situacaoNaoVerificada: false,
        atualizadoPor: escopo.membroId,
      })
      .where(eq(empresas.id, id))
    const mudancas = await this.comparar(db, empresa, consulta.dados)
    const { situacao } = consulta.dados
    await this.auditoria.registrar({
      entidade: 'empresa',
      entidadeId: id,
      acao: 'consultar_receita',
      alteracoes: {
        situacao: { de: anterior?.situacao ?? null, para: situacao.descricao },
        diferencas: mudancas.map((m) => m.chave),
      },
    })
    return {
      consultadoEm: consulta.consultadoEm.toISOString(),
      fonte: consulta.fonte,
      situacao: {
        descricao: situacao.descricao,
        motivo: situacao.motivo,
        ativa: situacao.ativa,
        desde: situacao.desde,
      },
      situacaoAnterior: anterior?.situacao ?? null,
      mudancas: mudancas.map(({ chave, rotulo, atual, receita }) => ({
        chave,
        rotulo,
        atual,
        receita,
      })),
    }
  }

  /** Passo 2: "Aplicar alterações". Sem `campos`, aplica tudo o que a comparação apontou. */
  async aplicar(id: string, dados: AplicarDaReceita): Promise<EmpresaCarteira> {
    const documento = await this.ctx.transacao(
      async () => (await this.empresaEditavel(this.ctx.db(), id)).empresa.documento ?? '',
    )
    // O passo 1 acabou de renovar o cache: esta leitura vem dele, sem nova chamada à Receita (e, se vier a
    // chamar, fica fora da transação)
    const consulta = await this.receita.consultar(documento)
    return this.ctx.transacao(() => this.aplicarNaTransacao(id, dados, consulta.dados))
  }

  private async aplicarNaTransacao(
    id: string,
    dados: AplicarDaReceita,
    dadosReceita: DadosDaReceita,
  ): Promise<EmpresaCarteira> {
    const db = this.ctx.db()
    const { empresa, escopo } = await this.empresaEditavel(db, id)
    const apontadas = await this.comparar(db, empresa, dadosReceita)
    const escolhidas = new Set<CampoDaReceita>(dados.campos ?? CAMPOS_DA_RECEITA)
    const aplicar = apontadas.filter((m) => escolhidas.has(m.chave))
    if (aplicar.length === 0) return this.empresas.detalhar(id)

    const chaves = new Set(aplicar.map((m) => m.chave))
    const patch: Partial<typeof empresas.$inferInsert> = {}
    if (chaves.has('razaoSocial')) patch.razaoSocial = dadosReceita.razaoSocial
    if (chaves.has('nomeFantasia')) patch.nomeFantasia = dadosReceita.nomeFantasia
    if (chaves.has('mei')) patch.mei = dadosReceita.mei
    if (chaves.has('dataInicioAtividades')) {
      patch.dataInicioAtividades = dadosReceita.dataInicioAtividades
    }
    if (chaves.has('regimeTributario')) patch.regimeTributario = dadosReceita.regimeTributario
    if (chaves.has('porteCodigo')) {
      patch.porteCodigo = await this.codigoDePorte(db, dadosReceita.porteCodigo)
    }
    if (chaves.has('endereco')) {
      const e = dadosReceita.endereco
      Object.assign(patch, {
        cep: e.cep,
        tipoLogradouro: e.tipoLogradouro,
        logradouro: e.logradouro,
        numero: e.numero,
        complemento: e.complemento,
        bairro: e.bairro,
        municipioCodigo: await this.codigoDeMunicipio(db, e.municipioCodigoIbge),
        paisCodigo: e.paisCodigo,
      })
    }
    await db
      .update(empresas)
      .set({ ...patch, atualizadoPor: escopo.membroId })
      .where(eq(empresas.id, id))

    const tenantId = this.ctx.tenantId
    if (chaves.has('cnaes')) {
      const { principal, secundarios } = dadosReceita.cnaes
      const lista = await this.empresas.resolverCnaes(
        db,
        { principal: principal?.codigo ?? null, secundarios: secundarios.map((c) => c.codigo) },
        dadosReceita,
      )
      await this.empresas.gravarCnaes(db, tenantId, id, lista)
    }
    if (chaves.has('telefones')) {
      // A Receita só acrescenta: o telefone que a equipe digitou não é trocado
      const atuais = await db
        .select()
        .from(empresaTelefones)
        .where(eq(empresaTelefones.empresaId, id))
        .orderBy(asc(empresaTelefones.criadoEm))
      const novos = dadosReceita.telefones.filter(
        (t) => !atuais.some((a) => a.numeroE164 === t.e164),
      )
      const todos = [
        ...atuais.map((a) => ({
          numero: a.numero,
          tipo: a.tipo,
          descricao: a.descricao ?? undefined,
          principal: a.principal,
        })),
        ...novos.map((t) => ({ numero: t.numero, tipo: t.tipo })),
      ]
      await this.empresas.gravarTelefones(
        db,
        tenantId,
        id,
        normalizarTelefonesDaEmpresa(todos).map((t) => ({
          ...t,
          origem: novos.some((n) => n.e164 === t.numeroE164)
            ? ('receita' as const)
            : (atuais.find((a) => a.numeroE164 === t.numeroE164)?.origem ?? 'manual'),
        })),
      )
    }
    if (chaves.has('socios')) {
      await this.empresas.gravarSocios(db, tenantId, id, dadosReceita)
    }

    await this.auditoria.registrar({
      entidade: 'empresa',
      entidadeId: id,
      acao: 'atualizar_receita',
      alteracoes: Object.fromEntries(
        aplicar.map((m) => [m.chave, { de: m.atual, para: m.receita }]),
      ),
    })
    return this.empresas.detalhar(id)
  }

  // ---- apoio ----

  /** A empresa (visível, editável e com CNPJ) da ficha em que o usuário está. */
  private async empresaEditavel(
    db: Transacao,
    id: string,
  ): Promise<{ empresa: Empresa; escopo: EscopoDaCarteira }> {
    const escopo = await escopoDaCarteira(this.ctx)
    const empresa = await this.empresas.carregar(db, escopo, id)
    if (!podeEditar(escopo, empresa.vendedorId)) {
      throw new ErroApi('acesso_negado', 'Você só atualiza empresas da sua carteira.', 403)
    }
    if (empresa.tipoDocumento !== 'cnpj' || !empresa.documento) {
      throw new ErroApi(
        'sem_cnpj',
        'Só empresa cadastrada com CNPJ pode ser atualizada pela Receita.',
        409,
      )
    }
    return { empresa, escopo }
  }

  /** Consulta ignorando o cache; cache vencido (as duas fontes fora do ar) não vale como atualização. */
  private async consultarAgora(cnpj: string) {
    const r = await this.receita.consultar(cnpj, { forcar: true })
    if (r.expirada) {
      throw new ErroApi(
        'receita_indisponivel',
        'Não foi possível consultar a Receita agora. Tente de novo em instantes.',
        503,
      )
    }
    return r
  }

  private async codigoDeMunicipio(db: Transacao, codigo: number | null): Promise<number | null> {
    if (codigo === null) return null
    const [m] = await db
      .select({ c: municipios.codigoIbge })
      .from(municipios)
      .where(eq(municipios.codigoIbge, codigo))
    return m ? codigo : null
  }

  private async codigoDePorte(db: Transacao, codigo: number | null): Promise<number | null> {
    if (codigo === null) return null
    const [p] = await db
      .select({ c: schema.portes.codigo })
      .from(schema.portes)
      .where(eq(schema.portes.codigo, codigo))
    return p ? codigo : null
  }

  /** O que difere entre o cadastro e a Receita, já legível. */
  private async comparar(db: Transacao, e: Empresa, r: DadosDaReceita): Promise<Mudanca[]> {
    const mudancas: Mudanca[] = []
    const compara = (
      chave: CampoDaReceita,
      rotulo: string,
      atual: string | null,
      receita: string | null,
    ) => {
      if (atual !== receita) mudancas.push({ chave, rotulo, atual, receita })
    }
    compara('razaoSocial', 'Razão social', e.razaoSocial, r.razaoSocial)
    compara('nomeFantasia', 'Nome fantasia', vazioParaNulo(e.nomeFantasia), r.nomeFantasia)
    compara('mei', 'MEI', e.mei ? 'Sim' : 'Não', r.mei ? 'Sim' : 'Não')
    compara(
      'dataInicioAtividades',
      'Início das atividades',
      dataLegivel(e.dataInicioAtividades),
      dataLegivel(r.dataInicioAtividades),
    )
    compara(
      'regimeTributario',
      'Regime tributário',
      ROTULO_DO_REGIME[e.regimeTributario],
      ROTULO_DO_REGIME[r.regimeTributario],
    )
    const portes = await db.select().from(schema.portes)
    const porte = (codigo: number | null) =>
      codigo === null
        ? null
        : (portes.find((p) => p.codigo === codigo)?.descricao ?? String(codigo))
    compara('porteCodigo', 'Porte', porte(e.porteCodigo), porte(r.porteCodigo))

    const [cidade] = e.municipioCodigo
      ? await db
          .select({ nome: municipios.nome, uf: municipios.uf })
          .from(municipios)
          .where(eq(municipios.codigoIbge, e.municipioCodigo))
      : []
    const re = r.endereco
    const igual =
      (e.cep ?? null) === re.cep &&
      (e.tipoLogradouro ?? null) === re.tipoLogradouro &&
      (e.logradouro ?? null) === re.logradouro &&
      (e.numero ?? null) === re.numero &&
      (e.complemento ?? null) === re.complemento &&
      (e.bairro ?? null) === re.bairro &&
      (e.municipioCodigo ?? null) === re.municipioCodigoIbge &&
      (e.paisCodigo ?? null) === re.paisCodigo
    if (!igual) {
      mudancas.push({
        chave: 'endereco',
        rotulo: 'Endereço',
        atual: enderecoLegivel({ ...e, cidade: cidade?.nome ?? null, uf: cidade?.uf ?? null }),
        receita: enderecoLegivel({
          ...re,
          cidade: re.municipioNome,
          uf: re.uf,
        }),
      })
    }

    const cnaesAtuais = await db
      .select({ codigo: empresaCnaes.cnaeCodigo, principal: empresaCnaes.principal })
      .from(empresaCnaes)
      .where(eq(empresaCnaes.empresaId, e.id))
    const atualPrincipal = cnaesAtuais.find((c) => c.principal)?.codigo ?? null
    const atualSecundarios = cnaesAtuais.filter((c) => !c.principal).map((c) => c.codigo)
    const receitaPrincipal = r.cnaes.principal?.codigo ?? null
    const receitaSecundarios = r.cnaes.secundarios.map((c) => c.codigo)
    const assinatura = (p: number | null, s: number[]) => `${p ?? ''}|${[...s].sort().join(',')}`
    if (
      assinatura(atualPrincipal, atualSecundarios) !==
      assinatura(receitaPrincipal, receitaSecundarios)
    ) {
      mudancas.push({
        chave: 'cnaes',
        rotulo: 'CNAEs',
        atual: cnaesLegiveis(atualPrincipal, atualSecundarios),
        receita: cnaesLegiveis(receitaPrincipal, receitaSecundarios),
      })
    }

    const telefonesAtuais = await db
      .select({ e164: empresaTelefones.numeroE164 })
      .from(empresaTelefones)
      .where(eq(empresaTelefones.empresaId, e.id))
    const faltam = r.telefones.filter((t) => !telefonesAtuais.some((a) => a.e164 === t.e164))
    if (faltam.length > 0) {
      mudancas.push({
        chave: 'telefones',
        rotulo: 'Telefones',
        atual: telefonesAtuais.map((t) => t.e164).join(', ') || null,
        receita: [...telefonesAtuais.map((t) => t.e164), ...faltam.map((t) => t.e164)].join(', '),
      })
    }

    const sociosAtuais = await db
      .select({ nome: empresaSocios.nome })
      .from(empresaSocios)
      .where(eq(empresaSocios.empresaId, e.id))
    const nomesAtuais = sociosAtuais.map((s) => s.nome).sort()
    const nomesReceita = r.socios.map((s) => s.nome).sort()
    if (JSON.stringify(nomesAtuais) !== JSON.stringify(nomesReceita)) {
      mudancas.push({
        chave: 'socios',
        rotulo: 'Sócios',
        atual: nomesAtuais.join(', ') || null,
        receita: nomesReceita.join(', ') || null,
      })
    }
    return mudancas
  }
}
