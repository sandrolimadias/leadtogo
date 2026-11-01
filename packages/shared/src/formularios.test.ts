import { describe, expect, it } from 'vitest'

import {
  camposVisiveis,
  definicaoDeFormularioSchema,
  definicaoInicial,
  interpolar,
  paginasDoFormulario,
  validarRespostasDoFormulario,
} from './formularios.js'

const def = (campos: unknown[], botoes: unknown[] = [{ id: 'enviar', rotulo: 'Enviar' }]) =>
  definicaoDeFormularioSchema.parse({ campos, botoes })

const base = def([
  { id: 'nome', tipo: 'texto', rotulo: 'Nome', obrigatorio: true },
  {
    id: 'vai',
    tipo: 'selecao',
    rotulo: 'Vai ao jantar?',
    obrigatorio: true,
    opcoes: [
      { valor: 'sim', rotulo: 'Sim' },
      { valor: 'nao', rotulo: 'Não' },
    ],
  },
  {
    id: 'acompanhantes',
    tipo: 'numero',
    rotulo: 'Acompanhantes',
    obrigatorio: true,
    minimo: 0,
    maximo: 3,
    visivelQuando: {
      combinacao: 'todas',
      condicoes: [{ campo: 'vai', operador: 'igual', valor: 'sim' }],
    },
  },
  { id: 'quebra', tipo: 'quebra_de_pagina', rotulo: '—' },
  { id: 'email', tipo: 'email', rotulo: 'E-mail' },
  { id: 'cnpj', tipo: 'cnpj', rotulo: 'CNPJ' },
  { id: 'nota', tipo: 'avaliacao', rotulo: 'Nota' },
  { id: 'termos', tipo: 'aceite', rotulo: 'Aceito', obrigatorio: true },
])

describe('definição do formulário', () => {
  it('a inicial é válida', () => {
    expect(definicaoDeFormularioSchema.safeParse(definicaoInicial()).success).toBe(true)
  })

  it('recusa id repetido, seleção sem opções e condição que olha para a frente', () => {
    const r = definicaoDeFormularioSchema.safeParse({
      campos: [
        {
          id: 'a',
          tipo: 'texto',
          rotulo: 'A',
          visivelQuando: {
            combinacao: 'todas',
            condicoes: [{ campo: 'b', operador: 'preenchido' }],
          },
        },
        { id: 'b', tipo: 'selecao', rotulo: 'B' },
        { id: 'b', tipo: 'texto', rotulo: 'B2' },
      ],
      botoes: [{ id: 'enviar', rotulo: 'Enviar' }],
    })
    expect(r.success).toBe(false)
    const mensagens = r.error?.issues.map((i) => i.message) ?? []
    expect(mensagens).toContain('id repetido')
    expect(mensagens).toContain('acrescente opções')
    expect(mensagens).toContain('a condição só pode usar um campo de resposta que vem antes')
  })

  it('ação de e-mail para um campo exige um campo de e-mail; webhook só https', () => {
    const r = definicaoDeFormularioSchema.safeParse({
      campos: [{ id: 'nome', tipo: 'texto', rotulo: 'Nome' }],
      botoes: [
        {
          id: 'enviar',
          rotulo: 'Enviar',
          acoes: [
            { tipo: 'email', para: 'campo', campo: 'nome', assunto: 'Oi', mensagem: 'Olá' },
            { tipo: 'webhook', url: 'http://exemplo.com/gancho' },
          ],
        },
      ],
    })
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      'escolha um campo de e-mail do formulário',
      'use um endereço https',
    ])
  })

  it('separa as páginas pelas quebras', () => {
    expect(paginasDoFormulario(base).map((p) => p.map((c) => c.id))).toEqual([
      ['nome', 'vai', 'acompanhantes'],
      ['email', 'cnpj', 'nota', 'termos'],
    ])
  })
})

describe('condicionais e validação', () => {
  it('campo escondido pela condição não aparece, não é exigido e não é guardado', () => {
    expect(camposVisiveis(base, { vai: 'nao' }).has('acompanhantes')).toBe(false)
    expect(camposVisiveis(base, { vai: 'sim' }).has('acompanhantes')).toBe(true)
    const r = validarRespostasDoFormulario(base, {
      nome: ' Ana ',
      vai: 'nao',
      acompanhantes: 2,
      termos: true,
      intruso: 'x',
    })
    expect(r).toEqual({ ok: true, valores: { nome: 'Ana', vai: 'nao', termos: true }, erros: {} })
  })

  it('obrigatórios, faixas, opções e formatos', () => {
    const r = validarRespostasDoFormulario(base, {
      vai: 'talvez',
      email: 'nao-e-email',
      cnpj: '11.111.111/1111-11',
      nota: 7,
      termos: false,
    })
    expect(r.ok).toBe(false)
    expect(r.erros).toEqual({
      nome: 'obrigatório',
      vai: 'escolha uma das opções',
      email: 'e-mail inválido',
      cnpj: 'CNPJ inválido',
      nota: 'dê uma nota de 1 a 5',
      termos: 'é preciso aceitar',
    })
    const faixa = validarRespostasDoFormulario(base, {
      nome: 'A',
      vai: 'sim',
      acompanhantes: 5,
      termos: true,
    })
    expect(faixa.erros).toEqual({ acompanhantes: 'no máximo 3' })
  })

  it('normaliza CNPJ, e-mail e número; o valor travado vence o que veio do navegador', () => {
    const r = validarRespostasDoFormulario(
      base,
      {
        nome: 'Outro nome',
        vai: 'sim',
        acompanhantes: '2',
        email: 'Ana@Exemplo.com',
        cnpj: '11.222.333/0001-81',
        termos: true,
      },
      { nome: 'Ana Souza' },
    )
    expect(r.ok).toBe(true)
    expect(r.valores).toMatchObject({
      nome: 'Ana Souza',
      acompanhantes: 2,
      email: 'ana@exemplo.com',
      cnpj: '11222333000181',
    })
  })

  it('condições: qualquer/todas, contém, maior e vazio', () => {
    const d = def([
      { id: 'a', tipo: 'numero', rotulo: 'A' },
      { id: 'b', tipo: 'texto', rotulo: 'B' },
      {
        id: 'c',
        tipo: 'texto',
        rotulo: 'C',
        visivelQuando: {
          combinacao: 'qualquer',
          condicoes: [
            { campo: 'a', operador: 'maior', valor: '10' },
            { campo: 'b', operador: 'contem', valor: 'urgente' },
          ],
        },
      },
      {
        id: 'd',
        tipo: 'texto',
        rotulo: 'D',
        visivelQuando: { combinacao: 'todas', condicoes: [{ campo: 'b', operador: 'vazio' }] },
      },
    ])
    expect(camposVisiveis(d, { a: 11 }).has('c')).toBe(true)
    expect(camposVisiveis(d, { a: 5, b: 'É URGENTE' }).has('c')).toBe(true)
    expect(camposVisiveis(d, { a: 5, b: 'normal' }).has('c')).toBe(false)
    expect(camposVisiveis(d, {}).has('d')).toBe(true)
    expect(camposVisiveis(d, { b: 'x' }).has('d')).toBe(false)
  })

  it('interpolar troca {{campo}} pelo valor, em texto puro', () => {
    expect(
      interpolar('Olá, {{nome}}! Lista: {{itens}}. {{nada}}', { nome: 'Ana', itens: ['a', 'b'] }),
    ).toBe('Olá, Ana! Lista: a,b. ')
  })
})
