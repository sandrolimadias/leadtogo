import type {
  AreaDoPortal,
  ChamadoDoPortal,
  InicioDoPortal,
  IniciarSegundoFatorResposta,
  ListaDeChamadosDoPortal,
  ListaDeNotificacoesDoPortal,
  ListaDePedidosDoCliente,
  PreviaDoLink,
  SegundoFatorConfirmado,
  SessaoAtivaDoPortal,
  SessaoDoPortal,
} from '@leadtogo/api-client'

import type { Resultado } from './resultado'

export interface ConsultaDeChamados {
  aba?: 'abertos' | 'todos'
  busca?: string
  pagina?: number
}

/** O que o portal faz na API (`/v1/portal/*`). Os testes trocam por uma implementação de mentira. */
export interface ServicosDoPortal {
  entrada: {
    /** A resposta é sempre a mesma, tenha o e-mail acesso ou não */
    pedir: (email: string) => Promise<Resultado<{ mensagem: string }>>
    previa: (token: string) => Promise<Resultado<PreviaDoLink>>
    consumir: (token: string, aceitaPrivacidade: boolean) => Promise<Resultado<SessaoDoPortal>>
  }
  sessao: {
    atual: () => Promise<Resultado<SessaoDoPortal>>
    sair: () => Promise<Resultado>
    sessoes: () => Promise<Resultado<{ itens: SessaoAtivaDoPortal[] }>>
    encerrar: (id: string) => Promise<Resultado>
    encerrarOutras: () => Promise<Resultado>
    trocarEmail: (email: string) => Promise<Resultado>
    corrigirNome: (nome: string) => Promise<Resultado<SessaoDoPortal>>
  }
  segundoFator: {
    iniciar: () => Promise<Resultado<IniciarSegundoFatorResposta>>
    confirmar: (codigo: string) => Promise<Resultado<SegundoFatorConfirmado>>
    conferir: (codigo: string) => Promise<Resultado>
    desativar: (codigo: string) => Promise<Resultado>
  }
  inicio: () => Promise<Resultado<InicioDoPortal>>
  areas: () => Promise<Resultado<{ itens: AreaDoPortal[] }>>
  chamados: {
    listar: (consulta: ConsultaDeChamados) => Promise<Resultado<ListaDeChamadosDoPortal>>
    obter: (id: string) => Promise<Resultado<ChamadoDoPortal>>
    abrir: (dados: {
      assunto: string
      descricao?: string | null
      areaId?: string | null
    }) => Promise<Resultado<ChamadoDoPortal>>
    responder: (
      id: string,
      dados: { corpo: string; anexoIds: string[] },
    ) => Promise<Resultado<ChamadoDoPortal>>
    reabrir: (id: string) => Promise<Resultado<ChamadoDoPortal>>
    avaliar: (
      id: string,
      dados: { nota: number; comentario?: string | null },
    ) => Promise<Resultado<ChamadoDoPortal>>
    /** Reserva o anexo, envia o arquivo direto ao armazenamento e confirma; devolve o id do anexo */
    anexar: (id: string, arquivo: File) => Promise<Resultado<{ anexoId: string; nome: string }>>
    baixar: (id: string, anexoId: string) => Promise<Resultado<{ url: string }>>
  }
  notificacoes: {
    listar: (apenasNaoLidas?: boolean) => Promise<Resultado<ListaDeNotificacoesDoPortal>>
    marcarLida: (id: string) => Promise<Resultado<{ naoLidas: number }>>
    marcarTodas: () => Promise<Resultado<{ naoLidas: number }>>
  }
  pedidos: {
    listar: () => Promise<Resultado<ListaDePedidosDoCliente>>
    pedir: (dados: { nome: string; email: string; cargo?: string | null }) => Promise<Resultado>
  }
}
