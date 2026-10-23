import type { Chamado, ItemDeChamado } from '@leadtogo/api-client'

import { meDeAdmin } from '@/testes/servicos-falsos'

export const EMPRESA = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
export const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`

/** Um perfil só com as permissões dos chamados dadas (sem as padrão do papel). */
export const meComChamados = (permissoes: Record<string, 'propria' | 'equipe' | 'todas' | true>) =>
  meDeAdmin({
    empresas: [
      {
        id: EMPRESA,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel: 'vendedor',
        situacao: 'ativo',
        ativa: true,
        perfil: { id: id(990), nome: 'Atendimento' },
        permissoes: { 'empresas.ver': 'propria', ...permissoes },
      },
    ],
    empresaAtivaId: EMPRESA,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

export const itemDeChamado = (extra: Partial<ItemDeChamado> = {}): ItemDeChamado => ({
  id: id(1),
  numero: 42,
  codigo: 'CH-0042',
  assunto: 'Revisar contrato do cliente',
  status: 'pendente',
  prioridade: 'normal',
  area: { id: id(10), nome: 'Jurídico' },
  responsavel: null,
  solicitante: { tipo: 'membro', nome: 'Maria Solicitante' },
  empresaCliente: null,
  origem: 'interna',
  criadoEm: '2026-10-20T14:00:00.000Z',
  atualizadoEm: '2026-10-21T14:00:00.000Z',
  statusAlteradoEm: '2026-10-20T14:00:00.000Z',
  primeiraRespostaEm: null,
  resolvidoEm: null,
  prazoResposta: null,
  prazoResolucao: null,
  ...extra,
})

export const chamadoCompleto = (extra: Partial<Chamado> = {}): Chamado => ({
  ...itemDeChamado(),
  descricao: 'Preciso que o contrato seja revisado até sexta.',
  fechadoEm: null,
  reaberturas: 0,
  mensagens: [],
  notasInternas: [],
  eventos: [
    {
      id: id(500),
      tipo: 'aberto',
      ator: { tipo: 'membro', nome: 'Maria Solicitante' },
      statusDe: null,
      statusPara: 'pendente',
      areaDe: null,
      areaPara: 'Jurídico',
      responsavelDe: null,
      responsavelPara: null,
      prioridadeDe: null,
      prioridadePara: 'normal',
      em: '2026-10-20T14:00:00.000Z',
    },
  ],
  acoes: {
    responder: true,
    notaInterna: false,
    triar: false,
    atribuir: false,
    assumir: false,
    alterarStatus: false,
    reabrir: false,
    statusPossiveis: [],
  },
  ...extra,
})
