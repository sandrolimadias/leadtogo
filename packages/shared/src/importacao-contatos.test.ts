import { describe, expect, it } from 'vitest'

import { lerLinhaDeContato } from './importacao-contatos.js'

const CAMPOS = {
  documento: 'CNPJ',
  nome: 'Nome',
  cargo: 'Cargo',
  email: 'E-mail',
  telefone: 'Telefone',
  celular: 'Celular',
  papel: 'Papel',
  aniversario: 'Aniversário',
  linkedin: 'LinkedIn',
  principal: 'Principal',
  naoQuerContato: 'Não quer contato',
  observacoes: 'Obs',
}
const linha = (extra: Record<string, string> = {}) => ({
  CNPJ: '00.000.000/0001-91',
  Nome: 'Maria Silva',
  ...extra,
})

describe('lerLinhaDeContato', () => {
  it('lê uma linha completa: telefones em E.164, e-mail em minúsculas, sim/não e aniversário', () => {
    const r = lerLinhaDeContato(
      linha({
        Cargo: 'Diretora',
        'E-mail': ' Maria@Exemplo.com ',
        Telefone: '(27) 3064-3021',
        Celular: '27 99999-8888',
        Papel: 'Decisor',
        Aniversário: '15/03',
        LinkedIn: 'https://www.linkedin.com/in/maria',
        Principal: 'sim',
        'Não quer contato': 'não',
        Obs: 'Gosta de café',
      }),
      CAMPOS,
    )
    expect(r).toEqual({
      ok: true,
      avisos: [],
      contato: {
        nome: 'Maria Silva',
        cargo: 'Diretora',
        email: 'maria@exemplo.com',
        telefones: [
          { numero: '2730643021', e164: '+552730643021', tipo: 'fixo' },
          { numero: '27999998888', e164: '+5527999998888', tipo: 'celular' },
        ],
        papel: 'Decisor',
        aniversario: { dia: 15, mes: 3 },
        linkedin: 'https://www.linkedin.com/in/maria',
        principal: true,
        naoQuerContato: false,
        observacoes: 'Gosta de café',
      },
    })
  })

  it('E-MAIL ou TELEFONE inválido pula a linha (servem para achar duplicados)', () => {
    const email = lerLinhaDeContato(linha({ 'E-mail': 'maria@' }), CAMPOS)
    expect(email).toMatchObject({ ok: false })
    expect(email.ok === false && email.motivo).toContain('E-mail inválido')
    const fixo = lerLinhaDeContato(linha({ Telefone: '123' }), CAMPOS)
    expect(fixo.ok === false && fixo.motivo).toContain('Telefone inválido')
    const cel = lerLinhaDeContato(linha({ Celular: 'abc' }), CAMPOS)
    expect(cel.ok === false && cel.motivo).toContain('Celular inválido')
  })

  it('ANIVERSÁRIO ou LINKEDIN inválido entra sem o campo e com aviso na linha', () => {
    const r = lerLinhaDeContato(linha({ Aniversário: '31/02', LinkedIn: 'meu perfil' }), CAMPOS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.contato.aniversario).toBeNull()
    expect(r.contato.linkedin).toBeNull()
    expect(r.avisos).toHaveLength(2)
    expect(r.avisos[0]).toContain('Aniversário inválido')
    expect(r.avisos[1]).toContain('LinkedIn inválido')
  })

  it('nome em branco, curto ou longo demais pula a linha', () => {
    expect(lerLinhaDeContato(linha({ Nome: '' }), CAMPOS)).toMatchObject({
      ok: false,
      motivo: 'Nome em branco.',
    })
    expect(lerLinhaDeContato(linha({ Nome: 'A' }), CAMPOS)).toMatchObject({ ok: false })
    expect(lerLinhaDeContato(linha({ Nome: 'x'.repeat(201) }), CAMPOS)).toMatchObject({ ok: false })
  })

  it('"Não quer contato" que não é sim nem não pula a linha; "Principal" estranho vira aviso', () => {
    const r = lerLinhaDeContato(linha({ 'Não quer contato': 'talvez' }), CAMPOS)
    expect(r).toMatchObject({ ok: false })
    const p = lerLinhaDeContato(linha({ Principal: 'quem sabe' }), CAMPOS)
    expect(p.ok && p.contato.principal).toBe(false)
    expect(p.ok && p.avisos[0]).toContain('Principal')
    const sim = lerLinhaDeContato(linha({ 'Não quer contato': 'SIM' }), CAMPOS)
    expect(sim.ok && sim.contato.naoQuerContato).toBe(true)
  })

  it('telefone e celular iguais viram um só; campos sem coluna mapeada ficam vazios', () => {
    const r = lerLinhaDeContato(
      linha({ Telefone: '27 99999-8888', Celular: '(27) 99999-8888' }),
      CAMPOS,
    )
    expect(r.ok && r.contato.telefones).toHaveLength(1)
    const so = lerLinhaDeContato(
      { CNPJ: '1', Nome: 'João Souza' },
      { documento: 'CNPJ', nome: 'Nome' },
    )
    expect(so).toMatchObject({
      ok: true,
      contato: { email: null, telefones: [], papel: null, principal: false },
    })
  })
})
