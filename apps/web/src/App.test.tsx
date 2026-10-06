import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renderiza a aplicação', () => {
    render(<App />)
    expect(screen.getByRole('main').textContent).toBe('Leadtogo')
  })
})
