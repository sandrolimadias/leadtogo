import { describe, expect, it } from 'vitest'

import {
  abrirChamadoSchema,
  alterarChamadoSchema,
  codigoDoChamado,
  consultaDeChamadosSchema,
  enviarMensagemSchema,
  estaAberto,
  MAXIMO_DE_ANEXOS_POR_MENSAGEM,
  pedirEnvioDeAnexoSchema,
  podeReabrir,
  STATUS_DO_CHAMADO,
  TAMANHO_MAXIMO_DO_ANEXO,
  transicaoPermitida,
  TRANSICOES_DO_CHAMADO,
} from './chamados.js'
import {
  alterarAreaSchema,
  criarAreaSchema,
  definirExpedienteSchema,
  definirMembrosDaAreaSchema,
} from './chamados-config.js'

const uuid = '0198f3a2-0000-7000-8000-000000000001'
const outro = '0198f3a2-0000-7000-8000-000000000002'

describe('estados do chamado', () => {
  it('o código tem quatro dígitos', () => {
    expect(codigoDoChamado(7)).toBe('CH-0007')
    expect(codigoDoChamado(12345)).toBe('CH-12345')
  })

  it('só Resolvido e Fechado estão fechados', () => {
    expect(STATUS_DO_CHAMADO.filter((s) => !estaAberto(s))).toEqual(['resolvido', 'fechado'])
  })

  it('resolvido só vai a fechado; fechado e aguardando triagem não mudam pelo seletor', () => {
    expect(TRANSICOES_DO_CHAMADO.resolvido).toEqual(['fechado'])
    expect(TRANSICOES_DO_CHAMADO.fechado).toEqual([])
    expect(TRANSICOES_DO_CHAMADO.aguardando_triagem).toEqual([])
    expect(transicaoPermitida('pendente', 'em_atendimento')).toBe(true)
    expect(transicaoPermitida('pendente', 'fechado')).toBe(false)
    expect(transicaoPermitida('em_atendimento', 'aguardando_cliente')).toBe(true)
  })

  it('reabrir vale até 7 dias depois de resolvido, e só em Resolvido', () => {
    const resolvido = new Date('2026-10-01T12:00:00Z')
    expect(podeReabrir('resolvido', resolvido, new Date('2026-10-08T12:00:00Z'))).toBe(true)
    expect(podeReabrir('resolvido', resolvido, new Date('2026-10-08T12:00:01Z'))).toBe(false)
    expect(podeReabrir('fechado', resolvido, new Date('2026-10-02T00:00:00Z'))).toBe(false)
    expect(podeReabrir('pendente', null)).toBe(false)
  })
})

describe('entradas', () => {
  it('abrir: prioridade normal por padrão e a área pode ser desconhecida (triagem)', () => {
    const r = abrirChamadoSchema.parse({ assunto: 'Contrato do cliente X' })
    expect(r.prioridade).toBe('normal')
    expect(abrirChamadoSchema.parse({ assunto: 'Contrato', areaId: null }).areaId).toBeNull()
    expect(abrirChamadoSchema.safeParse({ assunto: 'ab' }).success).toBe(false)
    expect(abrirChamadoSchema.safeParse({ assunto: 'Assunto ok', origem: 'portal' }).success).toBe(
      false,
    )
  })

  it('consulta: aba "todos" e 25 por página por padrão', () => {
    expect(consultaDeChamadosSchema.parse({})).toMatchObject({
      aba: 'todos',
      pagina: 1,
      porPagina: 25,
    })
    expect(consultaDeChamadosSchema.safeParse({ porPagina: 500 }).success).toBe(false)
  })

  it('mensagem: até 5 anexos', () => {
    const anexos = (n: number) => Array.from({ length: n }, () => uuid)
    expect(
      enviarMensagemSchema.safeParse({
        corpo: 'Oi',
        anexoIds: anexos(MAXIMO_DE_ANEXOS_POR_MENSAGEM),
      }).success,
    ).toBe(true)
    expect(enviarMensagemSchema.safeParse({ corpo: 'Oi', anexoIds: anexos(6) }).success).toBe(false)
    expect(enviarMensagemSchema.safeParse({ corpo: '   ' }).success).toBe(false)
  })

  it('anexo: de 1 byte até 25 MB', () => {
    const base = { nome: 'a.pdf', mime: 'application/pdf' }
    expect(
      pedirEnvioDeAnexoSchema.safeParse({ ...base, tamanho: TAMANHO_MAXIMO_DO_ANEXO }).success,
    ).toBe(true)
    expect(
      pedirEnvioDeAnexoSchema.safeParse({ ...base, tamanho: TAMANHO_MAXIMO_DO_ANEXO + 1 }).success,
    ).toBe(false)
    expect(pedirEnvioDeAnexoSchema.safeParse({ ...base, tamanho: 0 }).success).toBe(false)
  })

  it('alterar: exige prioridade ou área', () => {
    expect(alterarChamadoSchema.safeParse({}).success).toBe(false)
    expect(alterarChamadoSchema.safeParse({ prioridade: 'alta' }).success).toBe(true)
  })
})

describe('configuração', () => {
  it('área: metas vazias por padrão (sem meta) e positivas quando preenchidas', () => {
    expect(criarAreaSchema.parse({ nome: 'Suporte' })).toMatchObject({
      metaRespostaMin: null,
      metaResolucaoMin: null,
      pulaTriagem: false,
      visivelNoPortal: false,
    })
    expect(criarAreaSchema.safeParse({ nome: 'Suporte', metaRespostaMin: 0 }).success).toBe(false)
    expect(alterarAreaSchema.safeParse({}).success).toBe(false)
    expect(alterarAreaSchema.safeParse({ metaRespostaMin: null }).success).toBe(true)
  })

  it('membros da área: sem repetir', () => {
    expect(
      definirMembrosDaAreaSchema.safeParse({
        membros: [{ membroId: uuid }, { membroId: outro, gestor: true }],
        perfilIds: [],
      }).success,
    ).toBe(true)
    expect(
      definirMembrosDaAreaSchema.safeParse({
        membros: [{ membroId: uuid }, { membroId: uuid }],
        perfilIds: [],
      }).success,
    ).toBe(false)
  })

  it('expediente: fim depois do início e faixas do mesmo dia sem sobreposição', () => {
    const faixa = (diaSemana: number, inicio: string, fim: string) => ({ diaSemana, inicio, fim })
    expect(
      definirExpedienteSchema.safeParse({
        faixas: [faixa(1, '08:00', '12:00'), faixa(1, '13:00', '18:00')],
      }).success,
    ).toBe(true)
    expect(
      definirExpedienteSchema.safeParse({
        faixas: [faixa(1, '08:00', '12:00'), faixa(1, '11:00', '18:00')],
      }).success,
    ).toBe(false)
    expect(
      definirExpedienteSchema.safeParse({ faixas: [faixa(1, '18:00', '08:00')] }).success,
    ).toBe(false)
    expect(
      definirExpedienteSchema.safeParse({ faixas: [faixa(7, '08:00', '18:00')] }).success,
    ).toBe(false)
    expect(definirExpedienteSchema.safeParse({ faixas: [faixa(1, '8:00', '18:00')] }).success).toBe(
      false,
    )
    expect(definirExpedienteSchema.safeParse({ faixas: [] }).success).toBe(true)
  })
})
