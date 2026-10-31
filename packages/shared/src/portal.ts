import { z } from 'zod'

import {
  MAXIMO_DE_ANEXOS_POR_MENSAGEM,
  estadoDeAnexoSchema,
  podeReabrir,
  type StatusDoChamado,
} from './chamados.js'
import { TAMANHO_MAXIMO_DE_PAGINA } from './paginacao.js'

// Portal do cliente — Fase 3A (docs/plano_portal_cliente.md). O cliente tem formatos próprios (lista de
// permissão): nada daqui reaproveita o DTO do CRM, e o que é interno (notas, triagem, prioridade, prazos,
// e-mail do atendente) não tem campo para vazar.

// ---- Constantes de acesso ----

export const PAPEIS_DO_PORTAL = ['responsavel', 'colega'] as const
export const papelDoPortalSchema = z.enum(PAPEIS_DO_PORTAL).meta({ id: 'PapelDoPortal' })
export type PapelDoPortal = z.infer<typeof papelDoPortalSchema>
export const ROTULO_DO_PAPEL_DO_PORTAL: Record<PapelDoPortal, string> = {
  responsavel: 'Responsável',
  colega: 'Colega',
}

export const SITUACOES_DO_ACESSO = ['convidado', 'ativo', 'suspenso', 'revogado'] as const
export const situacaoDoAcessoSchema = z.enum(SITUACOES_DO_ACESSO).meta({ id: 'SituacaoDoAcesso' })
export type SituacaoDoAcesso = z.infer<typeof situacaoDoAcessoSchema>
export const ROTULO_DA_SITUACAO_DO_ACESSO: Record<SituacaoDoAcesso, string> = {
  convidado: 'Convite enviado',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  revogado: 'Revogado',
}

/** Validades (constantes únicas, usadas pela API, pelos e-mails e pelas telas). */
export const VALIDADE_DO_CONVITE_DIAS = 7
export const VALIDADE_DO_LINK_DE_ENTRADA_MIN = 15
export const VALIDADE_DA_SESSAO_DIAS = 30
export const VALIDADE_MAXIMA_DA_SESSAO_DIAS = 90
export const VALIDADE_DO_DOWNLOAD_SEGUNDOS = 60

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email('e-mail inválido'))

/** O token do link: `<empresa>.<256 bits em base64url>` (a empresa permite achar o link antes do login). */
export const tokenDoLinkSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
    'link inválido',
  )

// ---- Equipe: dar e gerir acessos (CRM) ----

export const darAcessoAoPortalSchema = z
  .object({
    contatoId: z.uuid(),
    empresaClienteId: z.uuid(),
    /** Em branco: usa o e-mail principal do contato */
    email: emailSchema.optional(),
    papel: papelDoPortalSchema.default('colega'),
  })
  .strict()
  .meta({ id: 'DarAcessoAoPortalEntrada' })
export type DarAcessoAoPortalEntrada = z.infer<typeof darAcessoAoPortalSchema>

export const alterarAcessoDoPortalSchema = z
  .object({
    papel: papelDoPortalSchema.optional(),
    situacao: z.enum(['ativo', 'suspenso']).optional(),
  })
  .strict()
  .refine((d) => d.papel !== undefined || d.situacao !== undefined, 'informe o que mudar')
  .meta({ id: 'AlterarAcessoDoPortalEntrada' })
export type AlterarAcessoDoPortalEntrada = z.infer<typeof alterarAcessoDoPortalSchema>

export const consultaDeAcessosDoPortalSchema = z
  .object({
    empresaClienteId: z.uuid().optional(),
    contatoId: z.uuid().optional(),
    situacao: situacaoDoAcessoSchema.optional(),
    busca: z.string().trim().max(100).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(25),
  })
  .strict()
export type ConsultaDeAcessosDoPortal = z.infer<typeof consultaDeAcessosDoPortalSchema>

export const acessoDoPortalSchema = z
  .object({
    id: z.uuid(),
    contato: z.object({ id: z.uuid(), nome: z.string() }),
    empresaCliente: z.object({ id: z.uuid(), nome: z.string() }),
    email: z.string(),
    papel: papelDoPortalSchema,
    situacao: situacaoDoAcessoSchema,
    convidadoEm: z.iso.datetime(),
    aceitoEm: z.iso.datetime().nullable(),
    ultimoAcessoEm: z.iso.datetime().nullable(),
    /** O convite pendente já venceu (a ação é reenviar) */
    conviteVencido: z.boolean(),
  })
  .meta({ id: 'AcessoDoPortal' })
export type AcessoDoPortal = z.infer<typeof acessoDoPortalSchema>

export const listaDeAcessosDoPortalSchema = z
  .object({ itens: z.array(acessoDoPortalSchema), total: z.number().int() })
  .meta({ id: 'ListaDeAcessosDoPortal' })
export type ListaDeAcessosDoPortal = z.infer<typeof listaDeAcessosDoPortalSchema>

export const PEDIDO_DE_ACESSO_SITUACOES = ['pendente', 'aprovado', 'recusado'] as const
export const situacaoDoPedidoDeAcessoSchema = z.enum(PEDIDO_DE_ACESSO_SITUACOES)
export type SituacaoDoPedidoDeAcesso = z.infer<typeof situacaoDoPedidoDeAcessoSchema>

export const pedidoDeAcessoSchema = z
  .object({
    id: z.uuid(),
    empresaCliente: z.object({ id: z.uuid(), nome: z.string() }),
    pedidoPor: z.object({ id: z.uuid(), nome: z.string() }),
    nome: z.string(),
    email: z.string(),
    cargo: z.string().nullable(),
    situacao: situacaoDoPedidoDeAcessoSchema,
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'PedidoDeAcesso' })
export type PedidoDeAcesso = z.infer<typeof pedidoDeAcessoSchema>

export const consultaDePedidosDeAcessoSchema = z
  .object({ situacao: situacaoDoPedidoDeAcessoSchema.default('pendente') })
  .strict()
export type ConsultaDePedidosDeAcesso = z.infer<typeof consultaDePedidosDeAcessoSchema>

export const listaDePedidosDeAcessoSchema = z
  .object({ itens: z.array(pedidoDeAcessoSchema), total: z.number().int() })
  .meta({ id: 'ListaDePedidosDeAcesso' })
export type ListaDePedidosDeAcesso = z.infer<typeof listaDePedidosDeAcessoSchema>

/** O que o Responsável vê dos pedidos que fez (a equipe decide; o motivo da recusa aparece para ele). */
export const pedidoDoClienteSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    email: z.string(),
    cargo: z.string().nullable(),
    situacao: situacaoDoPedidoDeAcessoSchema,
    motivo: z.string().nullable(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'PedidoDeAcessoDoCliente' })
export type PedidoDoCliente = z.infer<typeof pedidoDoClienteSchema>

export const listaDePedidosDoClienteSchema = z
  .object({ itens: z.array(pedidoDoClienteSchema) })
  .meta({ id: 'ListaDePedidosDoCliente' })
export type ListaDePedidosDoCliente = z.infer<typeof listaDePedidosDoClienteSchema>

export const tratarPedidoDeAcessoSchema = z
  .object({
    decisao: z.enum(['aprovar', 'recusar']),
    motivo: z.string().trim().max(500).optional(),
  })
  .strict()
  .meta({ id: 'TratarPedidoDeAcessoEntrada' })
export type TratarPedidoDeAcessoEntrada = z.infer<typeof tratarPedidoDeAcessoSchema>

// ---- Configuração do portal (CRM) ----

export const configuracaoDoPortalSchema = z
  .object({
    ativo: z.boolean(),
    nome: z.string().nullable(),
    logoUrl: z.string().nullable(),
    exigeDoisFatoresDoResponsavel: z.boolean(),
    /** Chave geral: desligada, ninguém comenta nas publicações */
    comentariosAtivos: z.boolean(),
    /** Quantos avisos normais cada cliente pode receber por semana (os urgentes não contam) */
    avisosLimiteSemanal: z.number().int().min(1).max(20),
  })
  .meta({ id: 'ConfiguracaoDoPortal' })
export type ConfiguracaoDoPortal = z.infer<typeof configuracaoDoPortalSchema>

export const atualizarConfiguracaoDoPortalSchema = z
  .object({
    ativo: z.boolean().optional(),
    nome: z.string().trim().min(2, 'informe o nome').max(80).nullable().optional(),
    exigeDoisFatoresDoResponsavel: z.boolean().optional(),
    comentariosAtivos: z.boolean().optional(),
    avisosLimiteSemanal: z.number().int().min(1).max(20).optional(),
  })
  .strict()
  .meta({ id: 'AtualizarConfiguracaoDoPortalEntrada' })
export type AtualizarConfiguracaoDoPortalEntrada = z.infer<
  typeof atualizarConfiguracaoDoPortalSchema
>

// ---- Cliente: entrada, convite e sessão ----

/** A resposta é sempre a mesma, exista o e-mail ou não (não revela quem tem acesso). */
export const pedirEntradaSchema = z
  .object({ email: emailSchema })
  .strict()
  .meta({ id: 'PedirEntradaEntrada' })
export type PedirEntradaEntrada = z.infer<typeof pedirEntradaSchema>

export const respostaDePedirEntradaSchema = z
  .object({ mensagem: z.string() })
  .meta({ id: 'RespostaDePedirEntrada' })
export const MENSAGEM_DE_ENTRADA_ENVIADA =
  'Se este e-mail tem acesso ao portal, enviamos um link de entrada. Ele vale 15 minutos.'

/** O que a página de confirmação mostra antes do clique (a leitura não consome o link). */
export const consultaDoLinkSchema = z
  .object({ token: tokenDoLinkSchema })
  .strict()
  .meta({ id: 'ConsultaDoLinkEntrada' })
export const previaDoLinkSchema = z
  .object({
    finalidade: z.enum(['convite', 'entrada', 'troca_email']),
    nomeDoPortal: z.string(),
    empresaCliente: z.string(),
    /** Convite: exige o aceite do aviso de privacidade no primeiro acesso */
    exigeAceiteDePrivacidade: z.boolean(),
  })
  .meta({ id: 'PreviaDoLink' })
export type PreviaDoLink = z.infer<typeof previaDoLinkSchema>

export const consumirLinkSchema = z
  .object({
    token: tokenDoLinkSchema,
    /** Obrigatório (true) quando a prévia pede o aceite */
    aceitaPrivacidade: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'ConsumirLinkEntrada' })
export type ConsumirLinkEntrada = z.infer<typeof consumirLinkSchema>

export const sessaoDoPortalSchema = z
  .object({
    acessoId: z.uuid(),
    contato: z.object({ id: z.uuid(), nome: z.string(), email: z.string() }),
    empresaCliente: z.object({ id: z.uuid(), nome: z.string() }),
    papel: papelDoPortalSchema,
    nomeDoPortal: z.string(),
    logoUrl: z.string().nullable(),
    /** A pessoa já ligou o 2FA */
    segundoFatorAtivo: z.boolean(),
    /** O 2FA vale para esta pessoa (ligado por ela ou exigido pela empresa ao Responsável) */
    segundoFatorExigido: z.boolean(),
    /** Exigido e ainda não conferido nesta sessão: o portal só deixa ativar ou conferir o 2FA */
    segundoFatorPendente: z.boolean(),
  })
  .meta({ id: 'SessaoDoPortal' })
export type SessaoDoPortal = z.infer<typeof sessaoDoPortalSchema>

export const sessaoAtivaSchema = z
  .object({
    id: z.uuid(),
    agente: z.string().nullable(),
    ip: z.string().nullable(),
    criadaEm: z.iso.datetime(),
    ultimoUsoEm: z.iso.datetime(),
    atual: z.boolean(),
  })
  .meta({ id: 'SessaoAtivaDoPortal' })
export type SessaoAtiva = z.infer<typeof sessaoAtivaSchema>

export const listaDeSessoesSchema = z
  .object({ itens: z.array(sessaoAtivaSchema) })
  .meta({ id: 'ListaDeSessoesDoPortal' })

// ---- Cliente: verificação em duas etapas (aplicativo autenticador, TOTP) ----

export const iniciarSegundoFatorRespostaSchema = z
  .object({
    /** O segredo em base32, para digitar no aplicativo */
    segredo: z.string(),
    /** otpauth://..., que a tela mostra como QR code */
    uri: z.string(),
  })
  .meta({ id: 'IniciarSegundoFatorResposta' })

/** Código de 6 dígitos do aplicativo, ou um código de recuperação (uso único). */
export const codigoDeSegundoFatorSchema = z
  .object({ codigo: z.string().trim().min(6, 'informe o código').max(24) })
  .strict()
  .meta({ id: 'CodigoDeSegundoFatorEntrada' })
export type CodigoDeSegundoFatorEntrada = z.infer<typeof codigoDeSegundoFatorSchema>

export const segundoFatorConfirmadoSchema = z
  .object({ codigosDeRecuperacao: z.array(z.string()) })
  .meta({ id: 'SegundoFatorConfirmado' })

export const trocarEmailSchema = z
  .object({ email: emailSchema })
  .strict()
  .meta({ id: 'TrocarEmailEntrada' })
export type TrocarEmailEntrada = z.infer<typeof trocarEmailSchema>

/** O cliente corrige só o próprio nome; cargo e vínculo são da equipe (a empresa é cadastro do CRM). */
/** O que o cliente corrige no próprio perfil (Fase 4A): nome e cargo. E-mail e telefone são da equipe. */
export const perfilDoPortalSchema = z
  .object({
    nome: z.string().trim().min(2, 'informe o nome').max(120),
    /** Cargo na empresa da sessão; vazio apaga; ausente não muda */
    cargo: z.string().trim().max(80).nullable().optional(),
  })
  .strict()
  .meta({ id: 'PerfilDoPortalEntrada' })
export type PerfilDoPortalEntrada = z.infer<typeof perfilDoPortalSchema>

/** "Meu perfil": o cadastro do contato como a equipe guardou (só nome e cargo o cliente altera). */
export const meuPerfilDoPortalSchema = z
  .object({
    nome: z.string(),
    cargo: z.string().nullable(),
    /** O e-mail de entrada no portal */
    emailDeAcesso: z.string(),
    emails: z.array(z.object({ email: z.string(), tipo: z.enum(['pessoal', 'trabalho']) })),
    telefones: z.array(
      z.object({ numero: z.string(), tipo: z.enum(['fixo', 'celular', 'whatsapp', 'outro']) }),
    ),
    aniversario: z.object({ dia: z.number().int(), mes: z.number().int() }).nullable(),
  })
  .meta({ id: 'MeuPerfilDoPortal' })
export type MeuPerfilDoPortal = z.infer<typeof meuPerfilDoPortalSchema>

/** "Minha empresa": o cadastro completo da empresa-cliente, só para leitura (nada da carteira interna). */
export const minhaEmpresaDoPortalSchema = z
  .object({
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
    tipoDocumento: z.enum(['cnpj', 'cpf', 'nenhum']),
    documento: z.string().nullable(),
    matrizFilial: z.enum(['matriz', 'filial']).nullable(),
    porte: z.string().nullable(),
    dataInicioAtividades: z.string().nullable(),
    website: z.string().nullable(),
    endereco: z.object({
      cep: z.string().nullable(),
      logradouro: z.string().nullable(),
      numero: z.string().nullable(),
      complemento: z.string().nullable(),
      bairro: z.string().nullable(),
      municipio: z.string().nullable(),
      uf: z.string().nullable(),
    }),
    telefones: z.array(
      z.object({ numero: z.string(), tipo: z.enum(['fixo', 'celular', 'whatsapp', 'outro']) }),
    ),
    cnaePrincipal: z.object({ codigo: z.string(), descricao: z.string() }).nullable(),
    cnaesSecundarios: z.array(z.object({ codigo: z.string(), descricao: z.string() })),
    /** Primeiro nome de quem cuida da empresa na equipe */
    responsavel: z.string().nullable(),
  })
  .meta({ id: 'MinhaEmpresaDoPortal' })
export type MinhaEmpresaDoPortal = z.infer<typeof minhaEmpresaDoPortalSchema>

export const pedirAcessoParaColegaSchema = z
  .object({
    nome: z.string().trim().min(2, 'informe o nome').max(120),
    email: emailSchema,
    cargo: z.string().trim().max(80).nullable().optional(),
  })
  .strict()
  .meta({ id: 'PedirAcessoParaColegaEntrada' })
export type PedirAcessoParaColegaEntrada = z.infer<typeof pedirAcessoParaColegaSchema>

// ---- Cliente: chamados ----

/** O que o cliente vê no lugar do estado interno (docs/plano_portal_cliente.md, seção 6). */
export const ESTADOS_DO_CHAMADO_NO_PORTAL = [
  'aberto',
  'em_atendimento',
  'aguardando_voce',
  'resolvido',
  'fechado',
] as const
export const estadoDoChamadoNoPortalSchema = z
  .enum(ESTADOS_DO_CHAMADO_NO_PORTAL)
  .meta({ id: 'EstadoDoChamadoNoPortal' })
export type EstadoDoChamadoNoPortal = z.infer<typeof estadoDoChamadoNoPortalSchema>

export const ROTULO_DO_ESTADO_NO_PORTAL: Record<EstadoDoChamadoNoPortal, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  aguardando_voce: 'Aguardando sua resposta',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

const ESTADO_NO_PORTAL: Record<StatusDoChamado, EstadoDoChamadoNoPortal> = {
  aguardando_triagem: 'aberto',
  pendente: 'aberto',
  em_atendimento: 'em_atendimento',
  aguardando_cliente: 'aguardando_voce',
  resolvido: 'resolvido',
  fechado: 'fechado',
}
export const estadoNoPortal = (status: StatusDoChamado): EstadoDoChamadoNoPortal =>
  ESTADO_NO_PORTAL[status]

const assuntoSchema = z.string().trim().min(3, 'descreva o assunto em poucas palavras').max(200)
const textoSchema = z
  .string()
  .trim()
  .min(1, 'escreva a mensagem')
  .max(10_000, 'use até 10.000 caracteres')

/**
 * Empresa-cliente e solicitante vêm da sessão, nunca do corpo (`.strict()` recusa o excedente). Os anexos entram
 * pela conversa, depois que o chamado existe (o arquivo precisa de um chamado para ser guardado).
 */
export const abrirChamadoNoPortalSchema = z
  .object({
    assunto: assuntoSchema,
    descricao: z.string().trim().max(10_000).nullable().optional(),
    /** Só áreas visíveis no portal; nulo = "não sei" (vai para a triagem) */
    areaId: z.uuid().nullable().optional(),
  })
  .strict()
  .meta({ id: 'AbrirChamadoNoPortalEntrada' })
export type AbrirChamadoNoPortalEntrada = z.infer<typeof abrirChamadoNoPortalSchema>

export const responderChamadoNoPortalSchema = z
  .object({
    corpo: textoSchema,
    anexoIds: z.array(z.uuid()).max(MAXIMO_DE_ANEXOS_POR_MENSAGEM).default([]),
  })
  .strict()
  .meta({ id: 'ResponderChamadoNoPortalEntrada' })
export type ResponderChamadoNoPortalEntrada = z.infer<typeof responderChamadoNoPortalSchema>

export const avaliarChamadoSchema = z
  .object({
    nota: z.number().int().min(1, 'dê uma nota de 1 a 5').max(5, 'dê uma nota de 1 a 5'),
    comentario: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
  .meta({ id: 'AvaliarChamadoEntrada' })
export type AvaliarChamadoEntrada = z.infer<typeof avaliarChamadoSchema>

export const ABAS_DE_CHAMADOS_NO_PORTAL = ['abertos', 'todos'] as const
export const consultaDeChamadosDoPortalSchema = z
  .object({
    aba: z.enum(ABAS_DE_CHAMADOS_NO_PORTAL).default('abertos'),
    busca: z.string().trim().max(100).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(20),
  })
  .strict()
export type ConsultaDeChamadosDoPortal = z.infer<typeof consultaDeChamadosDoPortalSchema>

export const itemDeChamadoDoPortalSchema = z
  .object({
    id: z.uuid(),
    codigo: z.string(),
    assunto: z.string(),
    estado: estadoDoChamadoNoPortalSchema,
    area: z.string().nullable(),
    abertoPor: z.string(),
    criadoEm: z.iso.datetime(),
    atualizadoEm: z.iso.datetime(),
  })
  .meta({ id: 'ItemDeChamadoDoPortal' })
export type ItemDeChamadoDoPortal = z.infer<typeof itemDeChamadoDoPortalSchema>

export const listaDeChamadosDoPortalSchema = z
  .object({
    itens: z.array(itemDeChamadoDoPortalSchema),
    total: z.number().int(),
    abas: z.object({ abertos: z.number().int(), todos: z.number().int() }),
  })
  .meta({ id: 'ListaDeChamadosDoPortal' })
export type ListaDeChamadosDoPortal = z.infer<typeof listaDeChamadosDoPortalSchema>

export const mensagemDoPortalSchema = z
  .object({
    id: z.uuid(),
    /** "Você", um colega ou o nome da equipe: o e-mail do atendente nunca sai */
    autor: z.object({ nome: z.string(), daEquipe: z.boolean(), voce: z.boolean() }),
    corpo: z.string(),
    anexos: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        mime: z.string(),
        tamanho: z.number().int(),
        estado: estadoDeAnexoSchema,
      }),
    ),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'MensagemDoPortal' })
export type MensagemDoPortal = z.infer<typeof mensagemDoPortalSchema>

export const marcoDoChamadoSchema = z
  .object({
    // Derivados das datas do próprio chamado: a linha do tempo interna não chega ao cliente
    tipo: z.enum(['aberto', 'em_atendimento', 'resolvido', 'fechado']),
    em: z.iso.datetime(),
  })
  .meta({ id: 'MarcoDoChamadoNoPortal' })

export const avaliacaoDoChamadoSchema = z
  .object({
    nota: z.number().int(),
    comentario: z.string().nullable(),
    criadaEm: z.iso.datetime(),
  })
  .meta({ id: 'AvaliacaoDoChamado' })

export const chamadoDoPortalSchema = itemDeChamadoDoPortalSchema
  .extend({
    descricao: z.string().nullable(),
    resolvidoEm: z.iso.datetime().nullable(),
    mensagens: z.array(mensagemDoPortalSchema),
    marcos: z.array(marcoDoChamadoSchema),
    avaliacao: avaliacaoDoChamadoSchema.nullable(),
    acoes: z.object({
      responder: z.boolean(),
      reabrir: z.boolean(),
      avaliar: z.boolean(),
    }),
  })
  .meta({ id: 'ChamadoDoPortal' })
export type ChamadoDoPortal = z.infer<typeof chamadoDoPortalSchema>

/** O que o cliente pode fazer agora (a API decide de novo; a tela só esconde botões). */
export function acoesDoCliente(
  status: StatusDoChamado,
  resolvidoEm: string | Date | null,
  jaAvaliou: boolean,
  agora: Date = new Date(),
): { responder: boolean; reabrir: boolean; avaliar: boolean } {
  return {
    responder: status !== 'fechado' && status !== 'resolvido',
    reabrir: podeReabrir(status, resolvidoEm, agora),
    avaliar: (status === 'resolvido' || status === 'fechado') && !jaAvaliou,
  }
}

export const areaDoPortalSchema = z
  .object({ id: z.uuid(), nome: z.string() })
  .meta({ id: 'AreaDoPortal' })
export const listaDeAreasDoPortalSchema = z
  .object({ itens: z.array(areaDoPortalSchema) })
  .meta({ id: 'ListaDeAreasDoPortal' })

// ---- Cliente: notificações e início ----

export const TIPOS_DE_NOTIFICACAO_DO_PORTAL = [
  'chamado_resposta',
  'chamado_status',
  'chamado_aguardando_voce',
  'chamado_resolvido',
  'acesso',
  'aviso',
] as const
export const tipoDeNotificacaoDoPortalSchema = z.enum(TIPOS_DE_NOTIFICACAO_DO_PORTAL)
export type TipoDeNotificacaoDoPortal = z.infer<typeof tipoDeNotificacaoDoPortalSchema>

export const notificacaoDoPortalSchema = z
  .object({
    id: z.uuid(),
    tipo: z.string(),
    titulo: z.string(),
    corpo: z.string().nullable(),
    /** Rota do portal a abrir (ex.: `/chamados/<id>`) */
    destino: z.string().nullable(),
    lida: z.boolean(),
    criadaEm: z.iso.datetime(),
  })
  .meta({ id: 'NotificacaoDoPortal' })
export type NotificacaoDoPortal = z.infer<typeof notificacaoDoPortalSchema>

export const listaDeNotificacoesDoPortalSchema = z
  .object({ itens: z.array(notificacaoDoPortalSchema), naoLidas: z.number().int() })
  .meta({ id: 'ListaDeNotificacoesDoPortal' })

export const naoLidasDoPortalSchema = z
  .object({ naoLidas: z.number().int() })
  .meta({ id: 'NaoLidasDoPortal' })

export const inicioDoPortalSchema = z
  .object({
    chamadosAbertos: z.number().int(),
    aguardandoVoce: z.number().int(),
    resolvidosParaAvaliar: z.number().int(),
    recentes: z.array(itemDeChamadoDoPortalSchema),
  })
  .meta({ id: 'InicioDoPortal' })
export type InicioDoPortal = z.infer<typeof inicioDoPortalSchema>

// ---- CRM: hub do portal (aba Chamados) ----

export const consultaDoHubSchema = z
  .object({ dias: z.coerce.number().int().min(7).max(365).default(30) })
  .strict()
export type ConsultaDoHub = z.infer<typeof consultaDoHubSchema>

export const indicadoresDoHubSchema = z
  .object({
    /** Janela dos indicadores de prazo e de nota (Em aberto e Prazo estourando são sempre do momento) */
    periodoDias: z.number().int(),
    emAberto: z.number().int(),
    prazoEstourando: z.number().int(),
    /** Percentual (0 a 100) das primeiras respostas dentro da meta; nulo sem dados */
    primeiraRespostaNoPrazo: z.number().nullable(),
    notaMedia: z.number().nullable(),
    avaliacoes: z.number().int(),
    acessosAtivos: z.number().int(),
    pedidosPendentes: z.number().int(),
  })
  .meta({ id: 'IndicadoresDoHub' })
export type IndicadoresDoHub = z.infer<typeof indicadoresDoHubSchema>

export const aguardarClienteSchema = z
  .object({
    corpo: textoSchema,
    anexoIds: z.array(z.uuid()).max(MAXIMO_DE_ANEXOS_POR_MENSAGEM).default([]),
  })
  .strict()
  .meta({ id: 'AguardarClienteEntrada' })
export type AguardarClienteEntrada = z.infer<typeof aguardarClienteSchema>

export const tarefaDoChamadoSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    situacao: z.string(),
    responsavel: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    dataInicio: z.iso.datetime(),
  })
  .meta({ id: 'TarefaDoChamado' })
export type TarefaDoChamado = z.infer<typeof tarefaDoChamadoSchema>

export const listaDeTarefasDoChamadoSchema = z
  .object({ itens: z.array(tarefaDoChamadoSchema) })
  .meta({ id: 'ListaDeTarefasDoChamado' })

export const criarTarefaDoChamadoSchema = z
  .object({
    titulo: z.string().trim().min(3, 'informe o título').max(200),
    responsavelId: z.uuid().optional(),
    prazo: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .meta({ id: 'CriarTarefaDoChamadoEntrada' })
export type CriarTarefaDoChamadoEntrada = z.infer<typeof criarTarefaDoChamadoSchema>
