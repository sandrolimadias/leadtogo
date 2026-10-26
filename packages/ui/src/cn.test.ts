import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('junta classes e resolve conflitos do Tailwind (a última vence)', () => {
    expect(cn('p-2', { hidden: 1 > 2 }, 'p-4', ['text-ink'])).toBe('p-4 text-ink')
  })
})
