import type {
  ChamadoDoPortal,
  EventoDoPortal,
  InicioDoPortal,
  PublicacaoDoPortal,
  ItemDeChamadoDoPortal,
  SessaoDoPortal,
} from '@leadtogo/api-client'
import { render } from '@testing-library/react'
import { createMemoryHistory, type RouterHistory } from '@tanstack/react-router'
import { vi } from 'vitest'

import { App } from '@/App'
import { falha, ok, type Resultado } from '@/servicos/resultado'
import type { ServicosDoPortal } from '@/servicos/tipos'

import { registrarRoteador } from './roteadores'

export { falha, ok }

export const id = (n: number) => `01a11111-1111-7111-8111-${String(n).padStart(12, '0')}`

export const sessao = (extra: Partial<SessaoDoPortal> = {}): SessaoDoPortal => ({
  acessoId: id(1),
  contato: { id: id(2), nome: 'Daniel Prates', email: 'daniel@usidantec.com.br' },
  empresaCliente: { id: id(3), nome: 'Usidantec' },
  papel: 'responsavel',
  nomeDoPortal: 'Dias Automação',
  logoUrl: null,
  segundoFatorAtivo: false,
  segundoFatorExigido: false,
  segundoFatorPendente: false,
  ...extra,
})

export const item = (extra: Partial<ItemDeChamadoDoPortal> = {}): ItemDeChamadoDoPortal => ({
  id: id(10),
  codigo: 'CH-0042',
  assunto: 'Segunda via do boleto de outubro',
  estado: 'aguardando_voce',
  area: 'Financeiro',
  abertoPor: 'Daniel Prates',
  criadoEm: '2026-10-20T09:14:00.000Z',
  atualizadoEm: '2026-10-21T12:00:00.000Z',
  ...extra,
})

export const chamado = (extra: Partial<ChamadoDoPortal> = {}): ChamadoDoPortal => ({
  ...item(),
  descricao: 'Preciso do boleto atualizado.',
  resolvidoEm: null,
  mensagens: [
    {
      id: id(20),
      autor: { nome: 'Ana Atendente', daEquipe: true, voce: false },
      corpo: 'Qual o CNPJ da filial?',
      anexos: [],
      criadoEm: '2026-10-21T12:00:00.000Z',
    },
  ],
  marcos: [{ tipo: 'aberto', em: '2026-10-20T09:14:00.000Z' }],
  avaliacao: null,
  acoes: { responder: true, reabrir: false, avaliar: false },
  ...extra,
})

export const evento = (extra: Partial<EventoDoPortal> = {}): EventoDoPortal => ({
  id: id(80),
  titulo: 'Encontro anual de clientes 2026',
  descricao: 'Um dia de **troca** entre clientes e equipe.',
  local: 'Auditório da sede',
  linkOnline: null,
  inicioEm: '2026-11-12T21:30:00.000Z',
  fimEm: '2026-11-13T01:00:00.000Z',
  prazoConfirmacao: null,
  cancelado: false,
  vagasRestantes: 8,
  lotado: false,
  vagasDaEmpresa: { limite: 2, confirmados: 0 },
  minhaSituacao: 'nenhuma',
  podeConfirmar: true,
  podeCancelar: false,
  motivoDoBloqueio: null,
  ...extra,
})

export const publicacao = (extra: Partial<PublicacaoDoPortal> = {}): PublicacaoDoPortal => ({
  id: id(50),
  titulo: 'Expediente reduzido na sexta',
  corpo: 'Lembrete: o expediente desta sexta encerra às **14h** por manutenção elétrica.',
  publicadaEm: '2026-10-21T12:00:00.000Z',
  fixada: false,
  reacoes: { curtir: 0, apoiar: 0, parabens: 0 },
  minhasReacoes: [],
  comentarios: 0,
  comentariosAbertos: true,
  ...extra,
})

export const inicioVazio: InicioDoPortal = {
  chamadosAbertos: 0,
  aguardandoVoce: 0,
  resolvidosParaAvaliar: 0,
  recentes: [],
}

const naoAutenticado = (): Resultado<never> =>
  falha({ codigo: 'nao_autenticado', mensagem: 'Sua sessão terminou. Entre de novo.', status: 401 })

/** Serviços de mentira: por padrão, uma pessoa logada e nenhum dado. Cada teste troca o que importa. */
export function servicosFalsos(troca: Partial<ServicosDoPortal> = {}): ServicosDoPortal {
  const base: ServicosDoPortal = {
    entrada: {
      pedir: vi.fn(async () =>
        ok({ mensagem: 'Se este e-mail tem acesso ao portal, enviamos um link.' }),
      ),
      previa: vi.fn(async () =>
        ok({
          finalidade: 'entrada' as const,
          nomeDoPortal: 'Dias Automação',
          empresaCliente: 'Usidantec',
          exigeAceiteDePrivacidade: false,
        }),
      ),
      consumir: vi.fn(async () => ok(sessao())),
    },
    sessao: {
      atual: vi.fn(async () => ok(sessao())),
      sair: vi.fn(async () => ok(undefined)),
      sessoes: vi.fn(async () =>
        ok({
          itens: [
            {
              id: id(30),
              agente: 'Chrome no Windows',
              ip: '10.0.0.1',
              criadaEm: '2026-10-20T09:00:00.000Z',
              ultimoUsoEm: '2026-10-21T09:00:00.000Z',
              atual: true,
            },
          ],
        }),
      ),
      encerrar: vi.fn(async () => ok(undefined)),
      encerrarOutras: vi.fn(async () => ok(undefined)),
      trocarEmail: vi.fn(async () => ok(undefined)),
      corrigirNome: vi.fn(async (nome: string) =>
        ok(sessao({ contato: { id: id(2), nome, email: 'daniel@usidantec.com.br' } })),
      ),
    },
    segundoFator: {
      iniciar: vi.fn(async () =>
        ok({
          segredo: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/Portal:daniel?secret=JBSWY3DPEHPK3PXP',
        }),
      ),
      confirmar: vi.fn(async () => ok({ codigosDeRecuperacao: ['aaaaa-bbbbb', 'ccccc-ddddd'] })),
      conferir: vi.fn(async () => ok(undefined)),
      desativar: vi.fn(async () => ok(undefined)),
    },
    inicio: vi.fn(async () => ok(inicioVazio)),
    areas: vi.fn(async () => ok({ itens: [{ id: id(40), nome: 'Financeiro' }] })),
    chamados: {
      listar: vi.fn(async () => ok({ itens: [], total: 0, abas: { abertos: 0, todos: 0 } })),
      obter: vi.fn(async () => ok(chamado())),
      abrir: vi.fn(async () => ok(chamado())),
      responder: vi.fn(async () => ok(chamado())),
      reabrir: vi.fn(async () => ok(chamado())),
      avaliar: vi.fn(async () => ok(chamado())),
      anexar: vi.fn(async (_id: string, arquivo: File) =>
        ok({ anexoId: id(50), nome: arquivo.name }),
      ),
      baixar: vi.fn(async () => ok({ url: 'https://armazenamento/arquivo' })),
    },
    notificacoes: {
      listar: vi.fn(async () => ok({ itens: [], naoLidas: 0 })),
      marcarLida: vi.fn(async () => ok({ naoLidas: 0 })),
      marcarTodas: vi.fn(async () => ok({ naoLidas: 0 })),
    },
    eventos: {
      listar: vi.fn(async () => ok({ itens: [], total: 0 })),
      proximos: vi.fn(async () => ok({ itens: [] })),
      confirmar: vi.fn(async () =>
        falha({ codigo: 'indisponivel', mensagem: 'Não configurado no teste.', status: 500 }),
      ),
      cancelar: vi.fn(async () =>
        falha({ codigo: 'indisponivel', mensagem: 'Não configurado no teste.', status: 500 }),
      ),
    },
    documentos: {
      listar: vi.fn(async () => ok({ itens: [], total: 0 })),
      baixar: vi.fn(async () => ok({ url: 'https://armazenamento/documento' })),
    },
    publicacoes: {
      feed: vi.fn(async () => ok({ itens: [], total: 0 })),
      comentarios: vi.fn(async () => ok({ itens: [], comentariosAbertos: true })),
      comentar: vi.fn(async (_id: string, corpo: string) =>
        ok({
          id: id(90),
          autorNome: 'Daniel P.',
          corpo,
          criadoEm: '2026-10-21T12:00:00.000Z',
          meu: true,
          oculto: false,
          ocultoMotivo: null,
          denunciado: false,
        }),
      ),
      reagir: vi.fn(async () =>
        ok({ reacoes: { curtir: 1, apoiar: 0, parabens: 0 }, minhasReacoes: ['curtir' as const] }),
      ),
      denunciar: vi.fn(async () => ok(undefined)),
      marcarLidas: vi.fn(async () => ok({ marcadas: 0 })),
    },
    pedidos: {
      listar: vi.fn(async () => ok({ itens: [] })),
      pedir: vi.fn(async () => ok(undefined)),
    },
  }
  return { ...base, ...troca }
}

/** Serviços de quem NÃO está logado: a sessão responde 401. */
export const servicosSemLogin = (troca: Partial<ServicosDoPortal> = {}) =>
  servicosFalsos({
    sessao: { ...servicosFalsos().sessao, atual: vi.fn(async () => naoAutenticado()) },
    ...troca,
  })

/** Monta o portal inteiro (roteador, guardas, telas) numa rota, com histórico em memória. */
export function renderizar(
  servicos: ServicosDoPortal,
  rota: string,
): ReturnType<typeof render> & { historico: RouterHistory } {
  const historico = createMemoryHistory({ initialEntries: [rota] })
  const r = render(
    <App servicos={servicos} historico={historico} aoCriarRoteador={registrarRoteador} />,
  )
  return { ...r, historico }
}
