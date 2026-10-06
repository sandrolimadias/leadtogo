import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('monta o roteador e o Query e mostra a rota inicial', async () => {
    render(<App />)
    expect(await screen.findByText('Leadtogo')).toBeInTheDocument()
  })
})
