import { z } from 'zod'

import { pedirEnvioDeAnexoSchema } from './chamados.js'

// Portal, Fase 4D (B-3): imagens e vídeo nas publicações. Imagem pelo pipeline de arquivos (Garage + ClamAV);
// vídeo só por link do YouTube ou do Vimeo, guardando só o ID (o portal monta o embed; nunca um iframe livre).

export const MAXIMO_DE_MIDIAS_POR_PUBLICACAO = 6
export const TAMANHO_MAXIMO_DA_IMAGEM = 10 * 1024 * 1024
export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PROVEDORES_DE_VIDEO = ['youtube', 'vimeo'] as const
export type ProvedorDeVideo = (typeof PROVEDORES_DE_VIDEO)[number]

const ID_DO_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
const ID_DO_VIMEO = /^\d{6,12}$/

/**
 * O provedor e o ID do vídeo a partir do link (só endereços https conhecidos). Nulo se não for um link aceito:
 * youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/, vimeo.com/<id>, player.vimeo.com/video/<id>.
 */
export function extrairVideo(link: string): { provedor: ProvedorDeVideo; id: string } | null {
  let u: URL
  try {
    u = new URL(link.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  const partes = u.pathname.split('/').filter(Boolean)
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      u.pathname === '/watch'
        ? u.searchParams.get('v')
        : ['shorts', 'embed', 'live'].includes(partes[0] ?? '')
          ? (partes[1] ?? null)
          : null
    return id && ID_DO_YOUTUBE.test(id) ? { provedor: 'youtube', id } : null
  }
  if (host === 'youtu.be') {
    const id = partes[0] ?? ''
    return ID_DO_YOUTUBE.test(id) ? { provedor: 'youtube', id } : null
  }
  if (host === 'vimeo.com') {
    const id = partes[0] ?? ''
    return ID_DO_VIMEO.test(id) ? { provedor: 'vimeo', id } : null
  }
  if (host === 'player.vimeo.com' && partes[0] === 'video') {
    const id = partes[1] ?? ''
    return ID_DO_VIMEO.test(id) ? { provedor: 'vimeo', id } : null
  }
  return null
}

/** O endereço do embed (o portal só carrega ao tocar na capa). */
export const enderecoDoEmbed = (v: { provedor: ProvedorDeVideo; id: string }): string =>
  v.provedor === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${v.id}`
    : `https://player.vimeo.com/video/${v.id}`

const legendaSchema = z
  .string()
  .trim()
  .max(200, 'no máximo 200 caracteres')
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))

export const adicionarImagemSchema = z
  .object({
    /** Descrição da imagem para quem usa leitor de tela (obrigatória) */
    textoAlternativo: z.string().trim().min(3, 'descreva a imagem').max(300),
    legenda: legendaSchema,
    arquivo: pedirEnvioDeAnexoSchema.superRefine((a, ctx) => {
      if (!(TIPOS_DE_IMAGEM as readonly string[]).includes(a.mime)) {
        ctx.addIssue({ code: 'custom', path: ['mime'], message: 'use JPG, PNG ou WebP' })
      }
      if (a.tamanho > TAMANHO_MAXIMO_DA_IMAGEM) {
        ctx.addIssue({ code: 'custom', path: ['tamanho'], message: 'use até 10 MB' })
      }
    }),
  })
  .strict()
  .meta({ id: 'AdicionarImagemEntrada' })
export type AdicionarImagemEntrada = z.infer<typeof adicionarImagemSchema>

export const adicionarVideoSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(500)
      .refine((v) => extrairVideo(v) !== null, 'use um link do YouTube ou do Vimeo'),
    legenda: legendaSchema,
  })
  .strict()
  .meta({ id: 'AdicionarVideoEntrada' })
export type AdicionarVideoEntrada = z.infer<typeof adicionarVideoSchema>

const videoSchema = z.object({ provedor: z.enum(PROVEDORES_DE_VIDEO), id: z.string() })

/** A mídia como a equipe vê (com o estado do arquivo). */
export const midiaDaPublicacaoSchema = z
  .object({
    id: z.uuid(),
    tipo: z.enum(['imagem', 'video']),
    ordem: z.number().int(),
    legenda: z.string().nullable(),
    textoAlternativo: z.string().nullable(),
    imagem: z
      .object({
        nome: z.string(),
        tamanho: z.number().int(),
        estado: z.enum(['pendente_varredura', 'limpo', 'infectado']),
        enviada: z.boolean(),
        /** URL de leitura de 10 minutos, só da imagem limpa */
        url: z.string().nullable(),
      })
      .nullable(),
    video: videoSchema.nullable(),
  })
  .meta({ id: 'MidiaDaPublicacao' })
export type MidiaDaPublicacao = z.infer<typeof midiaDaPublicacaoSchema>

export const envioDeImagemSchema = z
  .object({
    midia: midiaDaPublicacaoSchema,
    envio: z.object({
      url: z.url(),
      cabecalhos: z.record(z.string(), z.string()),
      expiraEm: z.iso.datetime(),
    }),
  })
  .meta({ id: 'EnvioDeImagem' })
export type EnvioDeImagem = z.infer<typeof envioDeImagemSchema>

/** A mídia como o cliente vê: só imagem limpa (com URL de 10 minutos) e vídeo. */
export const midiaDoPortalSchema = z
  .object({
    id: z.uuid(),
    tipo: z.enum(['imagem', 'video']),
    legenda: z.string().nullable(),
    textoAlternativo: z.string().nullable(),
    imagemUrl: z.string().nullable(),
    video: videoSchema.nullable(),
  })
  .meta({ id: 'MidiaDoPortal' })
export type MidiaDoPortal = z.infer<typeof midiaDoPortalSchema>
