import { z } from 'zod'

import { type DefinicaoDeFormulario, definicaoDeFormularioSchema } from './formularios.js'

/**
 * Página pública de eventos e "Seja um Associado" (Fase 4H, F-3 e F-4). Sem login: só o mínimo de cada evento
 * (nada de participantes, nem o número exato de vagas).
 */

const instante = z.iso.datetime({ offset: true })

/** Disponibilidade sem expor números: "Poucas vagas" a partir de 80% ocupado (ou 5 vagas restantes) */
export const DISPONIBILIDADES_DO_EVENTO = ['disponivel', 'poucas_vagas', 'lotado'] as const
export type DisponibilidadeDoEvento = (typeof DISPONIBILIDADES_DO_EVENTO)[number]

export const eventoPublicoSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    descricao: z.string().nullable(),
    local: z.string().nullable(),
    online: z.boolean(),
    inicioEm: instante,
    fimEm: instante,
    prazoConfirmacao: instante.nullable(),
    /** false = exclusivo para associados: o botão leva ao login */
    inscricaoAberta: z.boolean(),
    disponibilidade: z.enum(DISPONIBILIDADES_DO_EVENTO),
  })
  .meta({ id: 'EventoPublico' })
export type EventoPublico = z.infer<typeof eventoPublicoSchema>

export const paginaPublicaSchema = z
  .object({
    nome: z.string(),
    logoUrl: z.string().nullable(),
    /** Há formulário de associação: mostra "Seja um Associado" */
    associacao: z.boolean(),
    eventos: z.array(eventoPublicoSchema),
  })
  .meta({ id: 'PaginaPublica' })
export type PaginaPublica = z.infer<typeof paginaPublicaSchema>

export const inscricaoPublicaFeitaSchema = z
  .object({
    situacao: z.enum(['confirmado', 'lista_espera']),
    mensagem: z.string(),
  })
  .meta({ id: 'InscricaoPublicaFeita' })
export type InscricaoPublicaFeita = z.infer<typeof inscricaoPublicaFeitaSchema>

/** Inscrição pública de evento sem formulário próprio: nome, e-mail, telefone e CNPJ (opcional). */
export const DEFINICAO_DA_INSCRICAO_PADRAO: DefinicaoDeFormulario =
  definicaoDeFormularioSchema.parse({
    campos: [
      { id: 'nome', tipo: 'texto', rotulo: 'Nome', obrigatorio: true, maximo: 160 },
      { id: 'email', tipo: 'email', rotulo: 'E-mail', obrigatorio: true },
      { id: 'telefone', tipo: 'telefone', rotulo: 'Telefone' },
      {
        id: 'cnpj',
        tipo: 'cnpj',
        rotulo: 'CNPJ da empresa',
        ajuda: 'Opcional. Ajuda a equipe a reconhecer a sua empresa.',
      },
    ],
    botoes: [{ id: 'enviar', rotulo: 'Inscrever-me' }],
  })
