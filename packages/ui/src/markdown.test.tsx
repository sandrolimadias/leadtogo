import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Markdown } from './markdown'
import { blocosDoMarkdown } from './markdown-blocos'

describe('Markdown restrito', () => {
  it('separa parágrafos, listas e subtítulos', () => {
    expect(
      blocosDoMarkdown('## Título\n\nLinha 1\nLinha 2\n\n- um\n- dois\n\n1. primeiro\n2) segundo'),
    ).toEqual([
      { tipo: 'subtitulo', texto: 'Título' },
      { tipo: 'paragrafo', linhas: ['Linha 1', 'Linha 2'] },
      { tipo: 'lista', ordenada: false, itens: ['um', 'dois'] },
      { tipo: 'lista', ordenada: true, itens: ['primeiro', 'segundo'] },
    ])
  })

  it('negrito, itálico e links viram elementos; o link abre em outra aba com rel seguro', () => {
    render(<Markdown texto={'Um **forte**, um *leve* e [o site](https://exemplo.com.br/a?b=1).'} />)
    expect(screen.getByText('forte').tagName).toBe('STRONG')
    expect(screen.getByText('leve').tagName).toBe('EM')
    const link = screen.getByRole('link', { name: 'o site' })
    expect(link).toHaveAttribute('href', 'https://exemplo.com.br/a?b=1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('HTML e links perigosos aparecem como texto, nunca como elemento', () => {
    const { container } = render(
      <Markdown
        texto={
          '<script>alert(1)</script> <b>x</b> [clique](javascript:alert(1)) [ok](mailto:a@b.com)'
        }
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(container.textContent).toContain('[clique](javascript:alert(1))')
    expect(screen.queryByRole('link', { name: 'clique' })).toBeNull()
    expect(screen.getByRole('link', { name: 'ok' })).toHaveAttribute('href', 'mailto:a@b.com')
  })

  it('quebra de linha simples vira <br> dentro do parágrafo', () => {
    const { container } = render(<Markdown texto={'a\nb'} />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })
})
