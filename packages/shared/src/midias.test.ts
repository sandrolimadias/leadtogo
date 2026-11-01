import { describe, expect, it } from 'vitest'

import {
  adicionarImagemSchema,
  adicionarVideoSchema,
  enderecoDoEmbed,
  extrairVideo,
} from './midias.js'

describe('vídeo da publicação (Fase 4D)', () => {
  it('aceita os formatos do YouTube e do Vimeo e guarda só o ID', () => {
    expect(extrairVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toEqual({
      provedor: 'youtube',
      id: 'dQw4w9WgXcQ',
    })
    expect(extrairVideo('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provedor: 'youtube',
      id: 'dQw4w9WgXcQ',
    })
    expect(extrairVideo('https://youtube.com/shorts/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ')
    expect(extrairVideo('https://m.youtube.com/watch?v=dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ')
    expect(extrairVideo('https://vimeo.com/76979871')).toEqual({
      provedor: 'vimeo',
      id: '76979871',
    })
    expect(extrairVideo('https://player.vimeo.com/video/76979871')?.id).toBe('76979871')
  })

  it('recusa http, outros sites, IDs malformados e tentativas de injeção', () => {
    expect(extrairVideo('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(extrairVideo('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(extrairVideo('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(extrairVideo('https://www.youtube.com/watch?v=abc')).toBeNull()
    expect(extrairVideo('https://www.youtube.com/watch?v="><script>')).toBeNull()
    expect(extrairVideo('javascript:alert(1)')).toBeNull()
    expect(extrairVideo('não é link')).toBeNull()
  })

  it('o embed usa o domínio sem cookies do YouTube', () => {
    expect(enderecoDoEmbed({ provedor: 'youtube', id: 'dQw4w9WgXcQ' })).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
    expect(enderecoDoEmbed({ provedor: 'vimeo', id: '76979871' })).toBe(
      'https://player.vimeo.com/video/76979871',
    )
  })

  it('valida as entradas', () => {
    expect(adicionarVideoSchema.safeParse({ url: 'https://youtu.be/dQw4w9WgXcQ' }).success).toBe(
      true,
    )
    expect(adicionarVideoSchema.safeParse({ url: 'https://exemplo.com/v.mp4' }).success).toBe(false)
    const imagem = {
      textoAlternativo: 'Equipe no evento',
      arquivo: { nome: 'foto.jpg', mime: 'image/jpeg', tamanho: 1000 },
    }
    expect(adicionarImagemSchema.safeParse(imagem).success).toBe(true)
    expect(
      adicionarImagemSchema.safeParse({
        ...imagem,
        arquivo: { ...imagem.arquivo, mime: 'image/svg+xml' },
      }).success,
    ).toBe(false)
    expect(
      adicionarImagemSchema.safeParse({
        ...imagem,
        arquivo: { ...imagem.arquivo, tamanho: 11 * 1024 * 1024 },
      }).success,
    ).toBe(false)
    expect(adicionarImagemSchema.safeParse({ ...imagem, textoAlternativo: '' }).success).toBe(false)
  })
})
