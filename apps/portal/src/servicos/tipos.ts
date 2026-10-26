import type {
  AreaDoPortal,
  ChamadoDoPortal,
  ComentarioDoPortal,
  EventoDoPortal,
  ListaDeEventosDoPortal,
  ProximosEventosDoPortal,
  PreferenciasDoPortal,
  ConfiguracaoDePush,
  ResultadoDaBuscaDoPortal,
  ListaDeDocumentosDoPortal,
  FeedDoPortal,
  ListaDeComentariosDoPortal,
  ReacoesDaPublicacao,
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

import type { MotivoDeDenuncia, TipoDeReacao } from '@leadtogo/shared'

import type { Resultado } from './resultado'

export interface ConsultaDeDocumentos {
  busca?: string
  pagina?: number
}

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
  /** Agenda de eventos da equipe (Fase 3D): lista, confirmar presença (ou lista de espera) e cancelar */
  eventos: {
    listar: (
      aba: 'proximos' | 'passados',
      pagina?: number,
    ) => Promise<Resultado<ListaDeEventosDoPortal>>
    proximos: () => Promise<Resultado<ProximosEventosDoPortal>>
    confirmar: (id: string) => Promise<Resultado<EventoDoPortal>>
    cancelar: (id: string) => Promise<Resultado<EventoDoPortal>>
  }
  /** Documentos que a equipe compartilha (Fase 3C): lista e download (registrado, URL de 60 segundos) */
  documentos: {
    listar: (consulta: ConsultaDeDocumentos) => Promise<Resultado<ListaDeDocumentosDoPortal>>
    baixar: (id: string) => Promise<Resultado<{ url: string }>>
  }
  /** Publicações da equipe (Fase 3B): feed, reações, comentários, denúncia e leitura */
  publicacoes: {
    feed: (pagina?: number) => Promise<Resultado<FeedDoPortal>>
    comentarios: (id: string) => Promise<Resultado<ListaDeComentariosDoPortal>>
    comentar: (id: string, corpo: string) => Promise<Resultado<ComentarioDoPortal>>
    reagir: (id: string, tipo: TipoDeReacao) => Promise<Resultado<ReacoesDaPublicacao>>
    denunciar: (comentarioId: string, motivo: MotivoDeDenuncia) => Promise<Resultado>
    marcarLidas: (ids: string[]) => Promise<Resultado<{ marcadas: number }>>
  }
  /** Preferências da própria pessoa (Fase 3E): horário de silêncio e e-mail por tipo */
  preferencias: {
    obter: () => Promise<Resultado<PreferenciasDoPortal>>
    salvar: (dados: PreferenciasDoPortal) => Promise<Resultado<PreferenciasDoPortal>>
  }
  /** Push (Web Push/VAPID): só depois do consentimento da pessoa, por aparelho */
  push: {
    configuracao: () => Promise<Resultado<ConfiguracaoDePush>>
    inscrever: (inscricao: {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }) => Promise<Resultado<ConfiguracaoDePush>>
    remover: (endpoint: string) => Promise<Resultado<ConfiguracaoDePush>>
  }
  /** Busca global: chamados, documentos, eventos e publicações que a pessoa pode ver */
  busca: (q: string) => Promise<Resultado<ResultadoDaBuscaDoPortal>>
  pedidos: {
    listar: () => Promise<Resultado<ListaDePedidosDoCliente>>
    pedir: (dados: { nome: string; email: string; cargo?: string | null }) => Promise<Resultado>
  }
}
