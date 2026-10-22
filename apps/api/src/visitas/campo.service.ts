import { CHAVE_TAG_ENDERECO_A_CONFIRMAR, schema, sql } from '@leadtogo/db'
import {
  type CampoDeVisita,
  type ContatoDaResposta,
  criarAtividadeSchema,
  criarContatoSchema,
  decidirCheckin,
  type DistanciaDoCheckin,
  estaNoFuturo,
  type ItemDeVisita,
  type ModoDeCheckin,
  type PosicaoDoAparelho,
  type ProximoPassoDaResposta,
  type RelatorioDeVisita,
  type RespostaGravada,
  type SalvarVisitaEntrada,
  validarRespostas,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { recalcularCarteira } from '../carteira/atividades-efeitos.js'
import { condicaoDeVisibilidadeDaAtividade } from '../carteira/atividades-leitura.js'
import { AtividadesService } from '../carteira/atividades.service.js'
import { ContatosService } from '../carteira/contatos.service.js'
import { gravarDiferencaDeTags, tagsAtuaisDaEmpresa } from '../carteira/empresa-tags.js'
import {
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
  podeVer,
} from '../carteira/regras-de-carteira.js'
import { ErroApi } from '../http/erro-api.js'

const { atividades } = schema

const naoEncontrado = () =>
  new ErroApi('visita_nao_encontrada', 'Relatório de visita não encontrado.', 404)
const invalido = (codigo: string, mensagem: string, campo = 'respostas') =>
  new ErroApi(codigo, mensagem, 400, [{ campo, mensagem }])

type LinhaDoRelatorio = {
  id: string
  empresa_id: string
  empresa_nome: string
  vendedor_id: string
  atividade_id: string
  atividade_situacao: string
  responsavel_id: string
  responsavel_nome: string
  situacao: 'rascunho' | 'concluido'
  sem_checkin: boolean
  checkin_em: string | null
  checkin_offline: boolean
  fora_do_limite: boolean
  distancia_m: number | null
  latitude: number | null
  longitude: number | null
  resultado_id: string | null
  resultado_nome: string | null
  resultado_chave: 'nao_localizada' | 'encerrada' | null
  modelo_versao_id: string | null
  versao_numero: number | null
  versao_campos: CampoDeVisita[] | null
  respostas: RespostaGravada[]
  concluido_em: string | null
  criado_em: string
  atualizado_em: string
}

const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString())

/**
 * Visitas no campo (G3b): check-in, relatório e os efeitos ao concluir. O relatório nasce com o id do
 * aparelho, e `salvar` é um upsert nesse id: reenviar (a fila do offline) não duplica nada, e reenviar um
 * relatório já concluído devolve o que está gravado. Ver docs/funcionalidades.md, seção 3C.
 */
@Injectable()
export class VisitasDoCampoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly contatos: ContatosService,
    private readonly atividadesSvc: AtividadesService,
  ) {}

  private get permissao() {
    return new PermissaoService(this.ctx)
  }

  /** A distância do aparelho até a empresa e o que o modo configurado faz com ela (o aviso antes do check-in). */
  async distancia(empresaId: string, posicao: PosicaoDoAparelho): Promise<DistanciaDoCheckin> {
    const escopo = await escopoDaCarteira(this.ctx)
    const empresa = await this.empresaVisivel(escopo, empresaId)
    const config = await this.configuracao()
    const distanciaM = await this.distanciaAte(empresa.id, posicao)
    const d = decidirCheckin(distanciaM, config.modo, config.limiteM)
    return {
      empresaTemPosicao: distanciaM !== null,
      distanciaM,
      limiteM: config.limiteM,
      modo: config.modo,
      foraDoLimite: d.foraDoLimite,
      bloqueado: d.bloqueado,
    }
  }

  async salvar(id: string, dados: SalvarVisitaEntrada): Promise<RelatorioDeVisita> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    // trava o relatório (ou o id) para dois envios do mesmo aparelho não correrem juntos
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`)
    let atual = await this.linha(id)
    if (atual && atual.responsavel_id !== escopo.membroId) {
      // o id existe e é de outra pessoa (ou de outra empresa, que o RLS esconde): nunca se sobrescreve
      throw new ErroApi('visita_de_outra_pessoa', 'Este relatório é de outra pessoa.', 409)
    }
    if (atual && atual.empresa_id !== dados.empresaId) {
      throw invalido('empresa_diferente', 'O relatório é de outra empresa.', 'empresaId')
    }
    if (atual?.situacao === 'concluido') return this.paraDto(atual)
    if (atual && atual.atividade_situacao === 'cancelada') {
      throw new ErroApi('visita_cancelada', 'A atividade desta visita foi cancelada.', 409)
    }

    if (!atual) {
      await this.criar(id, dados, escopo)
      atual = await this.linha(id)
      if (!atual) throw new Error('relatório sem linha depois de criado')
    }

    // resultado e versão do modelo: a versão é a atual do modelo do resultado quando ele é escolhido
    let versaoId = atual.modelo_versao_id
    let campos: CampoDeVisita[] = atual.versao_campos ?? []
    let resultado: { id: string; nome: string; chave: string | null } | null = null
    if (dados.resultadoId) {
      resultado = await this.resultado(dados.resultadoId)
      if (!resultado)
        throw invalido('resultado_invalido', 'Escolha um resultado da visita ativo.', 'resultadoId')
      if (dados.resultadoId !== atual.resultado_id || !versaoId) {
        const v = await this.versaoAtualDoResultado(dados.resultadoId)
        versaoId = v.id
        campos = v.campos
      }
    } else if (dados.concluir) {
      throw invalido('resultado_obrigatorio', 'Escolha o resultado da visita.', 'resultadoId')
    } else {
      versaoId = null
      campos = []
    }

    const { respostas, erros } = validarRespostas(campos, dados.respostas, dados.concluir)
    if (erros.length > 0) {
      throw new ErroApi(
        'respostas_invalidas',
        erros[0]?.mensagem ?? 'Confira as respostas.',
        400,
        erros.map((e) => ({ campo: `respostas.${e.campoId}`, mensagem: e.mensagem })),
      )
    }
    if (dados.concluir && resultado) {
      await this.concluir(atual, dados, resultado, versaoId, campos, respostas, escopo)
    } else {
      await db.execute(sql`
        UPDATE relatorios_visita SET resultado_id = ${dados.resultadoId}::uuid,
          modelo_versao_id = ${versaoId}::uuid, respostas = ${JSON.stringify(respostas)}::jsonb,
          atualizado_por = ${escopo.membroId}, atualizado_em = now()
        WHERE id = ${id}`)
    }
    const final = await this.linha(id)
    if (!final) throw new Error('relatório sumiu')
    return this.paraDto(final)
  }

  async obter(id: string): Promise<RelatorioDeVisita> {
    const escopo = await escopoDaCarteira(this.ctx)
    const [l] = await this.ler(escopo, sql`r.id = ${id}`)
    if (!l) throw naoEncontrado()
    return this.paraDto(l)
  }

  /** Os relatórios que a pessoa vê: os de uma empresa, ou só os rascunhos dela (`pendentes`). */
  async listar(filtro: { empresaId?: string; so?: 'pendentes' }): Promise<ItemDeVisita[]> {
    const escopo = await escopoDaCarteira(this.ctx)
    const condicoes = [
      filtro.empresaId ? sql`r.empresa_id = ${filtro.empresaId}` : null,
      filtro.so === 'pendentes'
        ? sql`r.situacao = 'rascunho' AND r.responsavel_id = ${escopo.membroId} AND atividades.situacao <> 'cancelada'`
        : null,
    ].filter((c) => c !== null)
    const onde = condicoes.length ? sql.join(condicoes, sql` AND `) : sql`true`
    const linhas = await this.ler(escopo, onde)
    return linhas.map((l) => {
      const d = this.paraDto(l)
      return {
        id: d.id,
        empresa: d.empresa,
        atividadeId: d.atividadeId,
        responsavel: d.responsavel,
        situacao: d.situacao,
        semCheckin: d.semCheckin,
        checkinEm: d.checkinEm,
        foraDoLimite: d.foraDoLimite,
        resultado: d.resultado,
        concluidoEm: d.concluidoEm,
        criadoEm: d.criadoEm,
      }
    })
  }

  // ---- Criação ----

  private async criar(id: string, dados: SalvarVisitaEntrada, escopo: EscopoDaCarteira) {
    this.permissao.exigir('atividades.criar', 'Seu perfil de acesso não permite registrar visitas.')
    const db = this.ctx.db()
    const empresa = await this.empresaVisivel(escopo, dados.empresaId)
    if (!podeEditar(escopo, empresa.vendedor_id)) {
      throw new ErroApi(
        'acesso_negado',
        'Você só registra visitas nas empresas da sua carteira.',
        403,
      )
    }
    const tipo = await this.tipoVisita()
    const config = await this.configuracao()
    const agora = new Date()
    let distanciaM: number | null = null
    let foraDoLimite = false
    if (dados.checkin) {
      if (estaNoFuturo(new Date(dados.checkin.em), agora)) {
        throw invalido('checkin_no_futuro', 'O check-in não pode estar no futuro.', 'checkin')
      }
      distanciaM = await this.distanciaAte(empresa.id, dados.checkin.posicao)
      const d = decidirCheckin(distanciaM, config.modo, config.limiteM)
      foraDoLimite = d.foraDoLimite
      // online, o modo "bloquear" recusa; offline o aparelho já decidiu, e o servidor só marca
      if (d.bloqueado && !dados.checkin.offline) {
        throw new ErroApi(
          'checkin_fora_do_limite',
          `Você está a ${distanciaM} m da empresa, além do limite de ${config.limiteM} m. Aproxime-se ou registre a visita depois, sem check-in.`,
          409,
        )
      }
    }
    const inicio = dados.checkin ? new Date(dados.checkin.em) : agora
    const atividadeId = crypto.randomUUID()
    await db.insert(atividades).values({
      id: atividadeId,
      tenantId: this.ctx.tenantId,
      tipoAtividadeId: tipo.id,
      titulo: `Visita a ${empresa.nome}`,
      empresaId: empresa.id,
      responsavelId: escopo.membroId,
      dataInicio: inicio,
      situacao: 'em_execucao',
      origem: 'manual',
      criadoPor: escopo.membroId,
      atualizadoPor: escopo.membroId,
    })
    const p = dados.checkin?.posicao
    await db.execute(sql`
      INSERT INTO relatorios_visita (id, tenant_id, empresa_id, atividade_id, responsavel_id, sem_checkin,
        checkin_em, checkin_local, checkin_precisao_m, distancia_m, fora_do_limite, checkin_offline,
        criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${empresa.id}, ${atividadeId}, ${escopo.membroId},
        ${!dados.checkin}, ${dados.checkin ? inicio.toISOString() : null}::timestamptz,
        ${p ? sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography` : sql`NULL`},
        ${p?.precisaoM ?? null}::int, ${distanciaM}::int, ${foraDoLimite},
        ${dados.checkin?.offline ?? false}, ${escopo.membroId}, ${escopo.membroId})`)
    await recalcularCarteira(db, this.ctx.tenantId, empresa.id, escopo.membroId)
    await this.auditoria.registrar({
      entidade: 'relatorio_visita',
      entidadeId: id,
      acao: dados.checkin ? 'checkin' : 'registrar_depois',
      alteracoes: {
        empresaId: empresa.id,
        atividadeId,
        ...(dados.checkin ? { distanciaM, foraDoLimite, offline: dados.checkin.offline } : {}),
      },
    })
  }

  // ---- Conclusão e efeitos ----

  private async concluir(
    atual: LinhaDoRelatorio,
    dados: SalvarVisitaEntrada,
    resultado: { id: string; nome: string; chave: string | null },
    versaoId: string | null,
    campos: CampoDeVisita[],
    respostas: RespostaGravada[],
    escopo: EscopoDaCarteira,
  ) {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const agora = new Date()
    const realizadaEm = dados.realizadaEm
      ? new Date(dados.realizadaEm)
      : atual.checkin_em
        ? new Date(atual.checkin_em)
        : agora
    if (estaNoFuturo(realizadaEm, agora)) {
      throw invalido('visita_no_futuro', 'A visita não pode estar no futuro.', 'realizadaEm')
    }
    const naoLocalizada = resultado.chave === 'nao_localizada'
    const tipoDo = (campoId: string) => campos.find((c) => c.id === campoId)

    // Campos de CRM, na mesma transação
    let contatoId: string | null = null
    const tagsParaAplicar: string[] = []
    const dadosDaEmpresa: Record<string, unknown> = {}
    for (const r of respostas) {
      const campo = tipoDo(r.campoId)
      if (!campo) continue
      if (campo.tipo === 'contato') {
        contatoId = await this.contatoDaResposta(atual.empresa_id, r.valor as ContatoDaResposta)
        r.valor = { contatoId }
      } else if (campo.tipo === 'proximo_passo') {
        const v = r.valor as ProximoPassoDaResposta
        const criado = await this.atividadesSvc.criar(
          criarAtividadeSchema.parse({
            tipoAtividadeId: v.tipoAtividadeId,
            titulo: v.titulo,
            empresaId: atual.empresa_id,
            contatoId,
            dataInicio: v.data,
            diaInteiro: v.diaInteiro,
            situacao: 'pendente',
          }),
        )
        r.valor = { ...v, atividadeId: criado.id }
      } else if (campo.tipo === 'tag' && r.valor === true) {
        tagsParaAplicar.push(campo.tagId)
      } else if (campo.tipo === 'dados_empresa') {
        dadosDaEmpresa[campo.campoEmpresa] = r.valor
      }
    }

    await db.execute(sql`
      UPDATE atividades SET situacao = 'realizada', realizada_em = ${realizadaEm.toISOString()}::timestamptz,
        resultado = ${resultado.nome}, contato_id = coalesce(${contatoId}::uuid, contato_id),
        conta_visita = ${!naoLocalizada}, atualizado_por = ${escopo.membroId}, atualizado_em = now()
      WHERE id = ${atual.atividade_id}`)
    await db.execute(sql`
      UPDATE relatorios_visita SET situacao = 'concluido', resultado_id = ${resultado.id},
        modelo_versao_id = ${versaoId}::uuid, respostas = ${JSON.stringify(respostas)}::jsonb,
        concluido_em = ${realizadaEm.toISOString()}::timestamptz, atualizado_por = ${escopo.membroId},
        atualizado_em = now()
      WHERE id = ${atual.id}`)

    await this.aplicarDadosDaEmpresa(atual.empresa_id, dadosDaEmpresa, escopo)
    const atuais = await tagsAtuaisDaEmpresa(db, atual.empresa_id)
    const finais = new Set(atuais)
    for (const tagId of tagsParaAplicar) await this.aplicarTag(finais, tagId)
    if (naoLocalizada) {
      const [t] = await db.execute<{ id: string }>(sql`
        SELECT id FROM tags WHERE chave_sistema = ${CHAVE_TAG_ENDERECO_A_CONFIRMAR} AND excluido_em IS NULL`)
      if (t) finais.add(t.id)
      await db.execute(sql`
        UPDATE empresas SET visita_tentada_em = greatest(visita_tentada_em, ${realizadaEm.toISOString()}::timestamptz)
        WHERE id = ${atual.empresa_id}`)
    }
    if (resultado.chave === 'encerrada' && dados.inativarEmpresa) await this.statusInativo(finais)
    await gravarDiferencaDeTags(db, tenantId, atual.empresa_id, atuais, finais, escopo.membroId)

    if (dados.atualizarPosicaoDaEmpresa && atual.latitude !== null && atual.longitude !== null) {
      await db.execute(sql`
        UPDATE empresas SET localizacao = ST_SetSRID(ST_MakePoint(${atual.longitude}, ${atual.latitude}), 4326)::geography,
          geo_precisao = 'exata', geo_aproximacao = NULL, geo_origem = 'checkin', geo_ajuste_manual = true,
          geo_atualizado_em = now(), visita_tentada_em = NULL, atualizado_por = ${escopo.membroId}
        WHERE id = ${atual.empresa_id}`)
    }
    await recalcularCarteira(db, tenantId, atual.empresa_id, escopo.membroId)
    await this.auditoria.registrar({
      entidade: 'relatorio_visita',
      entidadeId: atual.id,
      acao: 'concluir',
      alteracoes: {
        resultado: resultado.nome,
        respostas: respostas.length,
        ...(dados.atualizarPosicaoDaEmpresa ? { posicaoDaEmpresa: 'checkin' } : {}),
        ...(dados.inativarEmpresa && resultado.chave === 'encerrada' ? { status: 'inativo' } : {}),
        ...(Object.keys(dadosDaEmpresa).length ? { dadosDaEmpresa } : {}),
      },
    })
  }

  private async contatoDaResposta(empresaId: string, valor: ContatoDaResposta): Promise<string> {
    if ('contatoId' in valor) {
      const [v] = await this.ctx.db().execute<{ id: string }>(sql`
        SELECT contato_id AS id FROM empresa_contatos
        WHERE empresa_id = ${empresaId} AND contato_id = ${valor.contatoId} AND ativo`)
      if (!v) throw invalido('contato_invalido', 'Escolha um contato ativo da empresa.')
      return v.id
    }
    const n = valor.novo
    const entrada = criarContatoSchema.safeParse({
      nome: n.nome,
      ...(n.telefone ? { telefones: [{ numero: n.telefone }] } : {}),
      ...(n.email ? { emails: [{ email: n.email }] } : {}),
      vinculo: { empresaId, cargo: n.cargo ?? null },
      ignorarDuplicado: true,
    })
    if (!entrada.success) {
      throw invalido('contato_invalido', entrada.error.issues[0]?.message ?? 'Confira o contato.')
    }
    const criado = await this.contatos.criar(entrada.data)
    return criado.id
  }

  private async aplicarDadosDaEmpresa(
    empresaId: string,
    dados: Record<string, unknown>,
    escopo: EscopoDaCarteira,
  ) {
    if (Object.keys(dados).length === 0) return
    const db = this.ctx.db()
    if (typeof dados['vertical_id'] === 'string') {
      const [v] = await db.execute<{ id: string }>(sql`
        SELECT id FROM verticais WHERE id = ${dados['vertical_id']} AND ativo AND excluido_em IS NULL`)
      if (!v) throw invalido('vertical_invalida', 'Escolha uma vertical ativa.')
    }
    const sets = Object.entries(dados).map(([coluna, valor]) => {
      switch (coluna) {
        case 'nome_fantasia':
          return sql`nome_fantasia = ${valor as string}`
        case 'website':
          return sql`website = ${valor as string}`
        case 'vertical_id':
          return sql`vertical_id = ${valor as string}::uuid`
        case 'numero_funcionarios':
          return sql`numero_funcionarios = ${valor as number}::int`
        default:
          throw new Error(`campo da empresa desconhecido: ${coluna}`)
      }
    })
    await db.execute(sql`
      UPDATE empresas SET ${sql.join(sets, sql`, `)}, atualizado_por = ${escopo.membroId}, atualizado_em = now()
      WHERE id = ${empresaId}`)
  }

  /** Aplica a tag do campo (grupo de seleção única: troca a do mesmo grupo). */
  private async aplicarTag(finais: Set<string>, tagId: string) {
    const [t] = await this.ctx.db().execute<{
      grupo: string
      unica: boolean
      automatico: boolean
    }>(sql`
      SELECT g.id AS grupo, g.selecao = 'unica' AS unica, g.automatico
      FROM tags t JOIN tag_grupos g ON g.id = t.tag_grupo_id
      WHERE t.id = ${tagId} AND t.ativo AND t.excluido_em IS NULL AND g.excluido_em IS NULL`)
    // a tag foi inativada ou o grupo virou automático depois do modelo: o campo não aplica nada
    if (!t || t.automatico) return
    if (t.unica) {
      const doGrupo = await this.ctx.db().execute<{ id: string }>(sql`
        SELECT id FROM tags WHERE tag_grupo_id = ${t.grupo}`)
      for (const x of doGrupo) finais.delete(x.id)
    }
    finais.add(tagId)
  }

  /** "Empresa encerrada" com a confirmação: o Status passa a Inativo. */
  private async statusInativo(finais: Set<string>) {
    const status = await this.ctx.db().execute<{ id: string; chave: string | null }>(sql`
      SELECT t.id, t.chave_sistema AS chave FROM tags t JOIN tag_grupos g ON g.id = t.tag_grupo_id
      WHERE g.chave_sistema = 'status' AND t.excluido_em IS NULL`)
    const inativo = status.find((s) => s.chave === 'inativo')
    if (!inativo) return
    for (const s of status) finais.delete(s.id)
    finais.add(inativo.id)
  }

  // ---- Leitura e apoio ----

  private async ler(
    escopo: EscopoDaCarteira,
    onde: ReturnType<typeof sql>,
  ): Promise<LinhaDoRelatorio[]> {
    const visivel = condicaoDeVisibilidadeDaAtividade(escopo) ?? sql`true`
    return this.ctx.db().execute<LinhaDoRelatorio>(sql`
      SELECT r.id, r.empresa_id, coalesce(nullif(empresas.nome_fantasia, ''), empresas.razao_social) AS empresa_nome,
        empresas.vendedor_id, r.atividade_id, atividades.situacao::text AS atividade_situacao, r.responsavel_id,
        m.nome AS responsavel_nome, r.situacao::text AS situacao, r.sem_checkin, r.checkin_em,
        r.checkin_offline, r.fora_do_limite, r.distancia_m,
        ST_Y(r.checkin_local::geometry) AS latitude, ST_X(r.checkin_local::geometry) AS longitude,
        r.resultado_id, vr.nome AS resultado_nome, vr.chave_sistema::text AS resultado_chave,
        r.modelo_versao_id, v.numero AS versao_numero, v.campos AS versao_campos, r.respostas,
        r.concluido_em, r.criado_em, r.atualizado_em
      FROM relatorios_visita r
      JOIN atividades ON atividades.id = r.atividade_id
      JOIN empresas ON empresas.id = r.empresa_id
      JOIN membros m ON m.id = r.responsavel_id
      LEFT JOIN visita_resultados vr ON vr.id = r.resultado_id
      LEFT JOIN visita_modelo_versoes v ON v.id = r.modelo_versao_id
      WHERE r.excluido_em IS NULL AND atividades.excluido_em IS NULL AND (${onde}) AND ${visivel}
      ORDER BY r.criado_em DESC
      LIMIT 200`)
  }

  /** O relatório pelo id, para gravar (sem a regra de visibilidade: quem grava é o próprio responsável). */
  private async linha(id: string): Promise<LinhaDoRelatorio | undefined> {
    const escopo = await escopoDaCarteira(this.ctx)
    const todas = { ...escopo, atividades: { ver: null, editar: null } }
    const [l] = await this.ler(todas, sql`r.id = ${id}`)
    return l
  }

  private paraDto(l: LinhaDoRelatorio): RelatorioDeVisita {
    const local = this.permissao.pode('visitas.ver_localizacao')
    return {
      id: l.id,
      empresa: { id: l.empresa_id, nome: l.empresa_nome },
      atividadeId: l.atividade_id,
      responsavel: { id: l.responsavel_id, nome: l.responsavel_nome },
      situacao: l.situacao,
      semCheckin: l.sem_checkin,
      checkinEm: iso(l.checkin_em),
      checkinOffline: l.checkin_offline,
      foraDoLimite: l.fora_do_limite,
      distanciaM: local ? l.distancia_m : null,
      posicao:
        local && l.latitude !== null && l.longitude !== null
          ? { latitude: l.latitude, longitude: l.longitude }
          : null,
      localizacaoVisivel: local,
      resultado:
        l.resultado_id && l.resultado_nome
          ? { id: l.resultado_id, nome: l.resultado_nome, chaveSistema: l.resultado_chave }
          : null,
      modeloVersao:
        l.modelo_versao_id && l.versao_numero !== null
          ? { id: l.modelo_versao_id, numero: l.versao_numero, campos: l.versao_campos ?? [] }
          : null,
      respostas: l.respostas,
      concluidoEm: iso(l.concluido_em),
      criadoEm: iso(l.criado_em) ?? '',
      atualizadoEm: iso(l.atualizado_em) ?? '',
    }
  }

  private async empresaVisivel(escopo: EscopoDaCarteira, empresaId: string) {
    const [e] = await this.ctx.db().execute<{ id: string; nome: string; vendedor_id: string }>(sql`
      SELECT id, coalesce(nullif(nome_fantasia, ''), razao_social) AS nome, vendedor_id
      FROM empresas WHERE id = ${empresaId} AND excluido_em IS NULL`)
    if (!e || !podeVer(escopo, e.vendedor_id)) {
      throw new ErroApi('empresa_nao_encontrada', 'Empresa não encontrada.', 404)
    }
    return e
  }

  private async distanciaAte(empresaId: string, p: PosicaoDoAparelho): Promise<number | null> {
    const [d] = await this.ctx.db().execute<{ m: number | null }>(sql`
      SELECT round(ST_Distance(localizacao, ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography))::int AS m
      FROM empresas WHERE id = ${empresaId}`)
    return d?.m ?? null
  }

  private async configuracao(): Promise<{ modo: ModoDeCheckin; limiteM: number }> {
    const [c] = await this.ctx.db().execute<{ modo: ModoDeCheckin; limite: number }>(sql`
      SELECT checkin_modo::text AS modo, checkin_limite_m AS limite FROM tenant_configuracoes
      WHERE tenant_id = ${this.ctx.tenantId}`)
    return { modo: c?.modo ?? 'avisar', limiteM: c?.limite ?? 300 }
  }

  /** O tipo de atividade da visita: o "Visita" de sistema, ou o primeiro ativo que conta como visita. */
  private async tipoVisita(): Promise<{ id: string }> {
    const [t] = await this.ctx.db().execute<{ id: string }>(sql`
      SELECT id FROM tipos_atividade
      WHERE ativo AND excluido_em IS NULL AND conta_como = 'visita'
      ORDER BY (chave_sistema = 'visita') DESC NULLS LAST, ordem, nome LIMIT 1`)
    if (!t) {
      throw new ErroApi(
        'sem_tipo_visita',
        'Não há tipo de atividade ativo que conte como visita. Peça ao administrador para criar um.',
        409,
      )
    }
    return t
  }

  private async resultado(id: string) {
    const [r] = await this.ctx.db().execute<{ id: string; nome: string; chave: string | null }>(sql`
      SELECT id, nome, chave_sistema::text AS chave FROM visita_resultados
      WHERE id = ${id} AND ativo AND excluido_em IS NULL`)
    return r ?? null
  }

  private async versaoAtualDoResultado(
    resultadoId: string,
  ): Promise<{ id: string; campos: CampoDeVisita[] }> {
    const [v] = await this.ctx.db().execute<{ id: string; campos: CampoDeVisita[] }>(sql`
      SELECT v.id, v.campos FROM visita_resultados r
      JOIN visita_modelos m ON m.id = r.modelo_id
      JOIN visita_modelo_versoes v ON v.id = m.versao_atual_id
      WHERE r.id = ${resultadoId}`)
    if (!v) throw new Error(`resultado ${resultadoId} sem modelo`)
    return v
  }
}
