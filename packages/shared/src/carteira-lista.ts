import { z } from 'zod'

import { tipoDocumentoSchema } from './carteira-empresas.js'

// Lista de empresas da carteira (GET /v1/carteira/empresas): consulta, itens, contagens dos chips e
// opções dos filtros. Especificação: docs/prototipo/README.md (tela 2) e docs/escopo_mvp.md (Módulo 2).

/** Visita a partir deste número de dias (ou nunca) é alerta na lista. */
export const DIAS_ALERTA_DE_VISITA = 90

/** Chips fixos da lista, na ordem da tela. */
export const CHIPS_DA_LISTA = [
  'todas',
  'minha',
  'sem_visita_90',
  'nunca_visitadas',
  'sem_proxima_atividade',
] as const
export const chipDaListaSchema = z.enum(CHIPS_DA_LISTA)
export type ChipDaLista = z.infer<typeof chipDaListaSchema>

export const ORDENS_DA_LISTA = [
  'nome',
  'ultima_visita',
  'ultimo_contato',
  'proxima_atividade',
  'criado_em',
] as const

const textoDeBusca = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === '' ? undefined : v))
  .optional()

const listaDeIds = z
  .string()
  .regex(
    /^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36}){0,19}$/,
    'tags: até 20 ids de tag separados por vírgula',
  )
  .transform((v) => v.split(','))
  .optional()

/**
 * Consulta da lista. Tudo opcional. `chip` escolhe o filtro salvo; os demais filtros se somam a ele.
 * Os chips "Sem visita há 90 dias", "Nunca visitadas" e "Sem próxima atividade" consideram por padrão
 * só empresas com Status Cliente ou Prospect; `incluirLeads=true` traz também os demais Status.
 */
export const consultaDaListaSchema = z
  .object({
    /** Nome, razão social, CNPJ/CPF (com ou sem máscara) ou cidade; sem acento nem diferença de caixa */
    busca: textoDeBusca,
    chip: chipDaListaSchema.default('todas'),
    incluirLeads: z.enum(['true', 'false']).default('false'),
    /** Ids de tags separados por vírgula: a empresa precisa ter todas (ex.: um Status e uma Visitação) */
    tags: listaDeIds,
    vendedorId: z.uuid().optional(),
    /** Código IBGE da cidade */
    municipio: z.coerce.number().int().positive().optional(),
    /** 30: visitada nos últimos 30 dias · 60 e 90: sem visita há 60/90 dias (inclui nunca) · nunca */
    ultimaVisita: z.enum(['30', '60', '90', 'nunca']).optional(),
    ordem: z.enum(ORDENS_DA_LISTA).default('nome'),
    sentido: z.enum(['asc', 'desc']).default('asc'),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
export type ConsultaDaLista = z.output<typeof consultaDaListaSchema>
export type ConsultaDaListaEntrada = z.input<typeof consultaDaListaSchema>

export const itemDaListaSchema = z
  .object({
    id: z.uuid(),
    /** Nome fantasia, ou a razão social */
    nome: z.string(),
    razaoSocial: z.string(),
    tipoDocumento: tipoDocumentoSchema,
    documento: z.string().nullable(),
    matrizFilial: z.enum(['matriz', 'filial']).nullable(),
    vendedor: z.object({ id: z.uuid(), nome: z.string() }),
    cidade: z.object({ nome: z.string(), uf: z.string() }).nullable(),
    /** Todas as tags da empresa (a lista não corta em "+N") */
    tags: z.array(
      z.object({ id: z.uuid(), nome: z.string(), cor: z.string(), tagGrupoId: z.uuid() }),
    ),
    /** Telefone principal em E.164 (Ligar e WhatsApp); nulo se a empresa não tem telefone */
    telefone: z.string().nullable(),
    /** Endereço em uma linha, para abrir a rota no mapa; nulo se não há o que buscar */
    enderecoParaRota: z.string().nullable(),
    ultimaVisitaEm: z.string().nullable(),
    ultimoContatoEm: z.string().nullable(),
    proximaAtividadeEm: z.string().nullable(),
    situacaoNaoVerificada: z.boolean(),
    /** O usuário pode editar (o vendedor só edita a própria carteira): habilita ações em massa */
    editavel: z.boolean(),
  })
  .meta({ id: 'ItemDaListaDeEmpresas' })
export type ItemDaLista = z.infer<typeof itemDaListaSchema>

export const listaDeEmpresasSchema = z
  .object({
    itens: z.array(itemDaListaSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
  })
  .meta({ id: 'ListaDeEmpresas' })
export type ListaDeEmpresas = z.infer<typeof listaDeEmpresasSchema>

/** Contagem de cada chip (a consulta `incluirLeads` vale para os três últimos). */
export const contagensDaListaSchema = z
  .object({
    todas: z.number().int(),
    minha: z.number().int(),
    semVisita90: z.number().int(),
    nuncaVisitadas: z.number().int(),
    semProximaAtividade: z.number().int(),
  })
  .meta({ id: 'ContagensDaLista' })
export type ContagensDaLista = z.infer<typeof contagensDaListaSchema>

export const consultaDeContagensSchema = z
  .object({ incluirLeads: z.enum(['true', 'false']).default('false') })
  .strict()

/** Opções dos filtros da lista (o que o usuário pode escolher). */
export const opcoesDaListaSchema = z
  .object({
    /** Membros ativos da equipe */
    vendedores: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    /** Só uma pessoa na equipe: o front esconde o filtro Vendedor e o chip "Minha carteira" */
    unicoMembro: z.boolean(),
    /** Cidades das empresas que o usuário vê */
    cidades: z.array(z.object({ codigoIbge: z.number().int(), nome: z.string(), uf: z.string() })),
    /** Dias sem contato a partir dos quais a lista alerta (configuração da empresa; padrão 60) */
    diasAlertaDeContato: z.number().int(),
  })
  .meta({ id: 'OpcoesDaLista' })
export type OpcoesDaLista = z.infer<typeof opcoesDaListaSchema>
