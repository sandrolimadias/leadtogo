import { describe, expect, it } from 'vitest'

import { STATUS_DO_CHAMADO } from './chamados.js'
import {
  abrirChamadoNoPortalSchema,
  acoesDoCliente,
  avaliarChamadoSchema,
  chamadoDoPortalSchema,
  consumirLinkSchema,
  darAcessoAoPortalSchema,
  estadoNoPortal,
  pedirEntradaSchema,
  tokenDoLinkSchema,
} from './portal.js'

describe('estado do chamado no portal', () => {
  it('mapeia todo estado interno e junta triagem e pendente em "aberto"', () => {
    for (const s of STATUS_DO_CHAMADO) expect(estadoNoPortal(s)).toBeTypeOf('string')
    expect(estadoNoPortal('aguardando_triagem')).toBe('aberto')
    expect(estadoNoPortal('pendente')).toBe('aberto')
    expect(estadoNoPortal('aguardando_cliente')).toBe('aguardando_voce')
  })
})

describe('entradas do cliente', () => {
  it('abrir chamado recusa empresa, solicitante e prioridade no corpo', () => {
    const ok = abrirChamadoNoPortalSchema.safeParse({ assunto: 'Nota fiscal errada' })
    expect(ok.success).toBe(true)
    for (const extra of [
      { empresaClienteId: crypto.randomUUID() },
      { solicitanteId: crypto.randomUUID() },
      { prioridade: 'urgente' },
    ]) {
      expect(
        abrirChamadoNoPortalSchema.safeParse({ assunto: 'Nota fiscal errada', ...extra }).success,
      ).toBe(false)
    }
  })

  it('normaliza o e-mail da entrada e exige formato de token', () => {
    expect(pedirEntradaSchema.parse({ email: '  Ana@Exemplo.com ' }).email).toBe('ana@exemplo.com')
    expect(tokenDoLinkSchema.safeParse('a'.repeat(43)).success).toBe(true)
    expect(tokenDoLinkSchema.safeParse('curto').success).toBe(false)
    expect(consumirLinkSchema.safeParse({ token: 'a'.repeat(43), extra: 1 }).success).toBe(false)
  })

  it('a nota vai de 1 a 5', () => {
    expect(avaliarChamadoSchema.safeParse({ nota: 0 }).success).toBe(false)
    expect(avaliarChamadoSchema.safeParse({ nota: 6 }).success).toBe(false)
    expect(avaliarChamadoSchema.safeParse({ nota: 4.5 }).success).toBe(false)
    expect(avaliarChamadoSchema.safeParse({ nota: 5, comentario: 'ótimo' }).success).toBe(true)
  })

  it('dar acesso: papel padrão é colega', () => {
    const r = darAcessoAoPortalSchema.parse({
      contatoId: crypto.randomUUID(),
      empresaClienteId: crypto.randomUUID(),
    })
    expect(r.papel).toBe('colega')
  })
})

describe('DTO do portal em lista de permissão', () => {
  it('não tem campo para nota interna, prioridade, prazo nem responsável', () => {
    const campos = Object.keys(chamadoDoPortalSchema.shape)
    for (const proibido of [
      'notasInternas',
      'prioridade',
      'prazoResposta',
      'prazoResolucao',
      'responsavel',
    ]) {
      expect(campos).not.toContain(proibido)
    }
  })
})

describe('ações do cliente', () => {
  const agora = new Date('2026-03-10T12:00:00Z')
  it('responde enquanto aberto; reabre até 7 dias; avalia uma vez após resolver', () => {
    expect(acoesDoCliente('em_atendimento', null, false, agora)).toEqual({
      responder: true,
      reabrir: false,
      avaliar: false,
    })
    expect(acoesDoCliente('resolvido', '2026-03-08T12:00:00Z', false, agora)).toEqual({
      responder: false,
      reabrir: true,
      avaliar: true,
    })
    expect(acoesDoCliente('resolvido', '2026-02-01T12:00:00Z', true, agora)).toEqual({
      responder: false,
      reabrir: false,
      avaliar: false,
    })
  })
})
