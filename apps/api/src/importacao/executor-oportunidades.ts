import { schema, sql } from '@leadtogo/db'
import {
  decidirOportunidade,
  lerLinhaDeOportunidade,
  paraComparar,
  tituloSugerido,
} from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { fusoDaEmpresa } from '../carteira/atividades-leitura.js'
import { inserirOportunidade, registrarFechamento } from '../carteira/oportunidades-gravacao.js'
import {
  type CadastrosDaOportunidade,
  carregarCadastros,
  type MapeamentoDeOportunidades,
  resolverCadastros,
} from './cadastros-da-oportunidade.js'
import {
  ExecutorBase,
  type Importador,
  type LimitesDoBloco,
  type LinhaPendente,
  type Lote,
  type RetornoDaLinha,
} from './executor-base.js'

const { oportunidades } = schema

/** Sem Receita para esperar: blocos como os de atividades (10.000 linhas em ~50 blocos). */
export const LIMITES_DO_BLOCO_DE_OPORTUNIDADES: LimitesDoBloco = { linhas: 200, duracaoMs: 90_000 }

interface EstadoDeOportunidades {
  campos: Record<string, string>
  fuso: string
  cadastros: CadastrosDaOportunidade
  /** E-mail do responsável → membro ativo da empresa (ou nulo), lembrado entre as linhas do bloco */
  responsaveis: Map<string, string | null>
  importadorId: string
}

/**
 * Executa um lote de importação de OPORTUNIDADES, uma linha por transação, com as mesmas regras e a mesma
 * gravação do cadastro manual (`oportunidades-gravacao.ts`): empresa pelo CNPJ, um funil por lote (o
 * escolhido ou o padrão), fase, motivo, origem e solução pelo mapeamento de valores, responsável pelo
 * e-mail ou o vendedor da empresa, contato só pelo e-mail e com vínculo ativo. A fechada entra Ativa e é
 * fechada em seguida (histórico, fase em que parou, retomada da Suspensa e, se o lote pedir, empresa vira
 * Cliente). Oportunidade com a mesma empresa, funil e título que já existe é pulada.
 */
export class ExecutorDeOportunidades extends ExecutorBase<EstadoDeOportunidades> {
  protected readonly limitesPadrao = LIMITES_DO_BLOCO_DE_OPORTUNIDADES

  protected async preparar(
    tenantId: string,
    lote: Lote,
    importador: Importador,
  ): Promise<{ falha: string } | { estado: EstadoDeOportunidades }> {
    const mapeamento = lote.mapeamento as MapeamentoDeOportunidades
    const campos = mapeamento.campos ?? {}
    if (!campos['documento']) {
      return { falha: 'O lote não está completo (indique a coluna do CNPJ).' }
    }
    await this.prepararDocumentos(tenantId, lote.id, campos['documento'])
    const lidos = await this.noTenant(tenantId, async (tx) => ({
      fuso: await fusoDaEmpresa(tx, tenantId),
      cadastros: await carregarCadastros(tx, mapeamento),
    }))
    if ('falha' in lidos.cadastros) return { falha: lidos.cadastros.falha }
    return {
      estado: {
        campos,
        fuso: lidos.fuso,
        cadastros: lidos.cadastros,
        responsaveis: new Map(),
        importadorId: importador.id,
      },
    }
  }

  protected notificacao(
    lote: Lote,
    situacao: 'concluida' | 'falhou',
    totais: Record<string, number>,
    motivo?: string,
  ) {
    return {
      titulo:
        situacao === 'concluida'
          ? `Importação "${lote.nome}" concluída`
          : `Importação "${lote.nome}" parou`,
      mensagem:
        situacao === 'concluida'
          ? `${totais['criada'] ?? 0} oportunidades importadas.`
          : (motivo ?? 'A importação parou.'),
      link: `/importacao/${lote.id}`,
    }
  }

  protected async processarLinha(p: {
    tenantId: string
    lote: Lote
    linha: LinhaPendente
    importador: Importador
    estado: EstadoDeOportunidades
    restanteDoBlocoMs: () => number
  }): Promise<RetornoDaLinha> {
    const { tenantId, lote, linha, estado, importador } = p
    const leitura = lerLinhaDeOportunidade(linha.dados as Record<string, string>, estado.campos)
    if (!leitura.ok) {
      await this.gravar(tenantId, linha.id, {
        resultado: 'pulada_invalida',
        motivo: leitura.motivo,
      })
      return {}
    }
    const o = leitura.oportunidade
    const decisao = decidirOportunidade(o, new Date(), estado.fuso)
    if (!decisao.ok) {
      await this.gravar(tenantId, linha.id, {
        resultado: 'pulada_invalida',
        motivo: decisao.motivo,
      })
      return {}
    }
    const cad = resolverCadastros(o, estado.cadastros)
    if (!cad.ok) {
      await this.gravar(tenantId, linha.id, { resultado: 'pulada_invalida', motivo: cad.motivo })
      return {}
    }
    const avisos = [...leitura.avisos, ...decisao.avisos, ...cad.avisos]

    await this.noTenant(tenantId, async (tx) => {
      // Transação curta: trava a linha e confere que ainda está pendente (outro executor, ou um bloco repetido)
      if (!(await this.travarPendente(tx, linha.id))) return
      const [empresa] = await tx.execute<{ id: string; nome: string; vendedor_id: string }>(sql`
        SELECT id, coalesce(nome_fantasia, razao_social) AS nome, vendedor_id FROM empresas
        WHERE documento = ${linha.documento} AND excluido_em IS NULL LIMIT 1`)
      if (!empresa) {
        await this.gravarEm(tx, linha.id, {
          resultado: 'pulada_empresa_inexistente',
          motivo: 'O CNPJ não está na carteira.',
        })
        return
      }
      const titulo = o.titulo ?? tituloSugerido(empresa.nome, cad.solucao?.nome ?? null)
      const funilId = estado.cadastros.funil.id
      // Duas linhas iguais (neste ou em outro lote) não criam duas oportunidades
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:oportunidade:${empresa.id}:${funilId}:${paraComparar(titulo)}`}, 0))`,
      )
      const doFunil = await tx.execute<{ id: string; titulo: string }>(sql`
        SELECT id, titulo FROM oportunidades
        WHERE empresa_id = ${empresa.id} AND funil_id = ${funilId} AND excluido_em IS NULL`)
      const igual = doFunil.find((x) => paraComparar(x.titulo) === paraComparar(titulo))
      if (igual) {
        await this.gravarEm(tx, linha.id, {
          resultado: 'pulada_duplicada',
          motivo: 'Já existe uma oportunidade com este título na empresa, no mesmo funil.',
          empresaId: empresa.id,
          oportunidadeId: igual.id,
        })
        return
      }

      const responsavel = await this.responsavel(tx, estado, o.emailResponsavel)
      if (o.emailResponsavel && !responsavel) {
        avisos.push(
          `Responsável ${o.emailResponsavel} não é usuário da empresa: ficou com o vendedor da empresa.`,
        )
      }
      let contatoId: string | null = null
      if (o.emailContato) {
        const [c] = await tx.execute<{ id: string }>(sql`
          SELECT c.id FROM contato_emails e
          JOIN contatos c ON c.id = e.contato_id AND c.excluido_em IS NULL
          JOIN empresa_contatos ec ON ec.contato_id = c.id AND ec.empresa_id = ${empresa.id} AND ec.ativo
          WHERE e.email = ${o.emailContato} ORDER BY c.criado_em, c.id LIMIT 1`)
        contatoId = c?.id ?? null
        if (!contatoId) {
          avisos.push(
            `Contato ${o.emailContato} não tem vínculo ativo com a empresa: importada sem contato.`,
          )
        }
      }

      const id = await inserirOportunidade(tx, tenantId, importador.id, {
        titulo,
        empresaId: empresa.id,
        contatoId,
        solucaoId: cad.solucao?.id ?? null,
        origemId: cad.origem?.id ?? null,
        funilId,
        fase: cad.fase,
        responsavelId: responsavel ?? empresa.vendedor_id,
        valorUnico: o.valorUnico,
        valorMensal: o.valorMensal,
        meses: o.meses ?? undefined,
        probabilidade: o.probabilidade ?? undefined,
        dataPrevistaFechamento: o.dataPrevista,
        observacoes: o.observacoes,
        importacaoId: lote.id,
      })
      if (o.status !== 'ativo') {
        const [criada] = await tx
          .select()
          .from(oportunidades)
          .where(sql`${oportunidades.id} = ${id}`)
        if (!criada) throw new Error('Oportunidade importada não encontrada')
        await registrarFechamento(
          tx,
          tenantId,
          importador.id,
          criada,
          {
            status: o.status,
            motivoId: cad.motivoId,
            detalhe: o.motivoDetalhe,
            retomarEm: o.retomarEm,
            viraCliente: estado.cadastros.clienteAoConquistar,
            dataFechamento: decisao.dataFechamento,
            importacaoId: lote.id,
          },
          estado.fuso,
        )
      }
      await this.gravarEm(tx, linha.id, {
        resultado: 'criada',
        empresaId: empresa.id,
        oportunidadeId: id,
        contatoId,
        ...(avisos.length > 0 ? { avisos } : {}),
      })
    })
    return {}
  }

  /** O membro ativo com este e-mail (o do cadastro da equipe ou o do login), ou nulo. */
  private async responsavel(
    tx: Transacao,
    estado: EstadoDeOportunidades,
    email: string | null,
  ): Promise<string | null> {
    if (!email) return null
    if (estado.responsaveis.has(email)) return estado.responsaveis.get(email) ?? null
    const [m] = await tx.execute<{ id: string }>(sql`
      SELECT m.id FROM membros m LEFT JOIN auth."user" u ON u.id = m.usuario_id
      WHERE m.ativo AND m.excluido_em IS NULL AND (m.email = ${email} OR lower(u.email) = ${email})
      ORDER BY m.criado_em LIMIT 1`)
    estado.responsaveis.set(email, m?.id ?? null)
    return m?.id ?? null
  }
}
