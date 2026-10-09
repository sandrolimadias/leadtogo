import { parseArgs } from 'node:util'

import { criarConexao } from '@leadtogo/db'
import { limparTexto } from '@leadtogo/shared'
import { z } from 'zod'

export const AJUDA = `Trata os eventos do outbox que esgotaram as tentativas (e-mails e notificações que não saíram).
O alerta do /health/alertas só apaga quando todos foram tratados. Nunca use SQL manual para isso.

Uso:
  node dist/outbox-tratar.js --listar
  node dist/outbox-tratar.js --reprocessar <id> --por "Nome de quem trata"
  node dist/outbox-tratar.js --descartar <id> --por "Nome de quem trata"

  --listar        mostra os eventos esgotados ainda não tratados (id, empresa, tipo, tentativas, quando, último erro)
  --reprocessar   devolve o evento ao relay: zera as tentativas e ele é entregue de novo (use depois de
                  corrigir a causa, como o SMTP fora do ar)
  --descartar     abandona o evento (apaga o conteúdo); use quando reenviar já não faz sentido
  --por           obrigatório nas duas ações: quem tratou fica registrado, com a data, no próprio evento

Códigos de saída: 0 feito; 1 falha (evento inexistente, já tratado, banco fora); 2 uso incorreto.`

/** Uma linha da listagem: sem o payload (o comando nunca o mostra). */
export interface EventoEsgotado {
  id: string
  tenant_id: string
  tipo: string
  tentativas: number
  falhou_em: Date
  ultimo_erro: string | null
}

/** O que o comando precisa do banco (as funções SECURITY DEFINER da migração 0013). */
export interface BancoDoOutbox {
  listar: () => Promise<EventoEsgotado[]>
  tratar: (id: string, acao: 'reprocessar' | 'descartar', por: string) => Promise<boolean>
  fechar: () => Promise<void>
}

export interface SaidaDoComando {
  imprimir: (linha: string) => void
  imprimirErro: (linha: string) => void
}

/** Banco real: conecta como `leadtogo_app` (DATABASE_URL), sem nenhum papel que ignore o RLS. */
export function bancoReal(url: string): BancoDoOutbox {
  const { cliente } = criarConexao(url, { max: 1, onnotice: () => undefined })
  return {
    // o cliente do banco devolve timestamptz como texto: converte aqui
    listar: async () =>
      (
        await cliente<
          (Omit<EventoEsgotado, 'falhou_em'> & { falhou_em: string | Date })[]
        >`SELECT * FROM app_listar_eventos_esgotados(500)`
      ).map((e) => ({ ...e, falhou_em: new Date(e.falhou_em) })),
    tratar: async (id, acao, por) => {
      const [linha] = await cliente<
        { r: boolean }[]
      >`SELECT app_tratar_evento_esgotado(${id}, ${acao}, ${por}) AS r`
      return linha?.r === true
    },
    fechar: () => cliente.end({ timeout: 5 }),
  }
}

/** Executa o comando e devolve o código de saída. Recebe tudo por parâmetro para poder ser testado. */
export async function executarTratar(
  argv: string[],
  abrirBanco: () => BancoDoOutbox,
  io: SaidaDoComando,
): Promise<number> {
  let opcoes
  try {
    opcoes = parseArgs({
      args: argv,
      options: {
        listar: { type: 'boolean' },
        reprocessar: { type: 'string' },
        descartar: { type: 'string' },
        por: { type: 'string' },
        ajuda: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }).values
  } catch (erro) {
    io.imprimirErro(`${erro instanceof Error ? erro.message : String(erro)}\n\n${AJUDA}`)
    return 2
  }
  if (opcoes.ajuda) {
    io.imprimir(AJUDA)
    return 0
  }

  const acoes = [opcoes.listar ? 'listar' : null, opcoes.reprocessar, opcoes.descartar].filter(
    (a) => a !== null && a !== undefined,
  )
  if (acoes.length !== 1) {
    io.imprimirErro(`Informe exatamente uma ação.\n\n${AJUDA}`)
    return 2
  }

  const tratamento = opcoes.reprocessar ? 'reprocessar' : opcoes.descartar ? 'descartar' : null
  const id = opcoes.reprocessar ?? opcoes.descartar
  if (tratamento) {
    if (!z.uuid().safeParse(id).success) {
      io.imprimirErro('O id do evento deve ser um UUID (veja --listar).')
      return 2
    }
    const por = (opcoes.por ?? '').trim()
    if (por === '' || por.length > 100) {
      io.imprimirErro('Informe quem trata o evento: --por "Nome" (1 a 100 caracteres).')
      return 2
    }
  }

  let banco: BancoDoOutbox | undefined
  try {
    banco = abrirBanco()
    if (!tratamento) {
      const eventos = await banco.listar()
      if (eventos.length === 0) {
        io.imprimir('Nenhum evento esgotado pendente de tratamento.')
        return 0
      }
      io.imprimir(`${eventos.length} evento(s) esgotado(s) pendente(s):`)
      for (const e of eventos) {
        // o último erro pode citar um destinatário: sai com e-mail, CPF e telefone mascarados
        const erro = limparTexto(e.ultimo_erro ?? '(sem erro registrado)').slice(0, 200)
        io.imprimir(
          `${e.id}  empresa ${e.tenant_id}  ${e.tipo}  ${e.tentativas} tentativas  ${e.falhou_em.toISOString()}  ${erro}`,
        )
      }
      return 0
    }
    const por = (opcoes.por ?? '').trim()
    const feito = await banco.tratar(id ?? '', tratamento, por)
    if (!feito) {
      io.imprimirErro('Evento não encontrado, ou já tratado (veja --listar).')
      return 1
    }
    io.imprimir(
      tratamento === 'reprocessar'
        ? `Evento ${id} devolvido ao relay (tentativas zeradas). Tratado por ${por}.`
        : `Evento ${id} descartado. Tratado por ${por}.`,
    )
    return 0
  } catch (erro) {
    io.imprimirErro(`Falha: ${erro instanceof Error ? erro.message : String(erro)}`)
    return 1
  } finally {
    await banco?.fechar().catch(() => undefined)
  }
}
