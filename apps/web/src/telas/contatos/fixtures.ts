import type { Contato, ItemDaLista, PapelDecisao } from '@leadtogo/api-client'

import { meDeAdmin } from '@/testes/servicos-falsos'

export const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
export const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`

export const meComPapel = (papel: 'admin' | 'gestor' | 'vendedor' = 'admin') =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel,
        situacao: 'ativo' as const,
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

export const papeis: PapelDecisao[] = [
  { id: id(1), nome: 'Decisor', ativo: true, ordem: 0 },
  { id: id(2), nome: 'Influenciador', ativo: true, ordem: 1 },
  { id: id(3), nome: 'Técnico', ativo: false, ordem: 2 },
]

export const contato = (extra: Partial<Contato> = {}): Contato => ({
  id: id(100),
  nome: 'Rogério Bindaco',
  papelDecisao: { id: id(1), nome: 'Decisor' },
  aniversario: { dia: 10, mes: 5 },
  linkedinUrl: 'https://www.linkedin.com/in/rogerio',
  observacoes: 'Prefere ligação de manhã.',
  aceitaWhatsapp: true,
  aceitaEmail: true,
  consentimentoEm: null,
  consentimentoOrigem: null,
  telefones: [
    {
      id: id(301),
      numero: '2732431907',
      e164: '+552732431907',
      tipo: 'fixo',
      descricao: null,
      principal: true,
    },
    {
      id: id(302),
      numero: '27998472210',
      e164: '+5527998472210',
      tipo: 'whatsapp',
      descricao: null,
      principal: false,
    },
  ],
  emails: [{ id: id(401), email: 'rogerio@exemplo.com.br', tipo: 'trabalho', principal: true }],
  vinculos: [
    {
      id: id(501),
      empresa: { id: id(200), nome: 'Usidantec' },
      cargo: 'Diretor',
      principal: true,
      ativo: true,
      desde: null,
      ate: null,
    },
  ],
  criadoEm: '2026-08-01T12:00:00.000Z',
  atualizadoEm: '2026-09-12T12:00:00.000Z',
  permissoes: { editar: true, excluir: true },
  ...extra,
})

export const itemDeEmpresa = (n: number, extra: Partial<ItemDaLista> = {}): ItemDaLista => ({
  id: id(200 + n),
  nome: `Empresa ${n}`,
  razaoSocial: `Empresa ${n} Ltda`,
  tipoDocumento: 'cnpj',
  documento: '11222333000181',
  matrizFilial: 'matriz',
  vendedor: { id: id(900), nome: 'Ana' },
  cidade: { nome: 'Vitória', uf: 'ES' },
  tags: [],
  telefone: null,
  enderecoParaRota: null,
  ultimaVisitaEm: null,
  ultimoContatoEm: null,
  proximaAtividadeEm: null,
  situacaoNaoVerificada: false,
  editavel: true,
  ...extra,
})
