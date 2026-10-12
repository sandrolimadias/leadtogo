import type { Me } from '@leadtogo/api-client'
import { createMemoryHistory, type RouterHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { vi } from 'vitest'

import { App } from '@/App'
import type { ErroDeAcesso, Resultado, ServicosDeAcesso } from '@/auth/tipos'

export const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados })
export const falha = (codigo: string, mensagem: string, status = 400): Resultado<never> => ({
  ok: false,
  erro: { codigo, mensagem, status } satisfies ErroDeAcesso,
})

export const meDeAdmin = (extra: Partial<Me> = {}): Me => ({
  usuario: {
    id: '0192f0a0-0000-7000-8000-000000000001',
    nome: 'Alessandro Dias',
    email: 'alessandro@exemplo.com.br',
    emailVerificado: true,
    twoFactorEnabled: true,
  },
  empresas: [],
  empresaAtivaId: null,
  precisaEscolherEmpresa: false,
  administradorDeConta: true,
  doisFatoresPendente: false,
  doisFatoresObrigatorio: true,
  doisFatoresMotivo: { origem: 'conta', empresaId: null, papel: null },
  ...extra,
})

/** Serviços de mentira: por padrão, sem sessão, sem Google e com o primeiro acesso fechado. */
export function servicosFalsos(troca: Partial<ServicosDeAcesso> = {}) {
  const s = {
    me: vi.fn(async () => null),
    opcoes: vi.fn(async () => ({ loginGoogle: false })),
    primeiroAcessoAberto: vi.fn(async () => false),
    preferencias: vi.fn(async () => ({
      tema: 'sistema' as const,
      menuRecolhido: false,
      visaoDashboard: 'minha' as const,
      filtroPadrao: {},
    })),
    alterarPreferencias: vi.fn(async () =>
      ok({
        tema: 'sistema' as const,
        menuRecolhido: false,
        visaoDashboard: 'minha' as const,
        filtroPadrao: {},
      }),
    ),
    trocarEmpresa: vi.fn(async () => ok(undefined)),
    entrar: vi.fn(async () => ok({ doisFatores: false })),
    entrarComGoogle: vi.fn(async () => undefined),
    verificarCodigo: vi.fn(async () => ok(undefined)),
    verificarCodigoDeRecuperacao: vi.fn(async () => ok(undefined)),
    sair: vi.fn(async () => undefined),
    pedirNovaSenha: vi.fn(async () => ok(undefined)),
    redefinirSenha: vi.fn(async () => ok(undefined)),
    reenviarVerificacao: vi.fn(async () => ok(undefined)),
    prepararDoisFatores: vi.fn(async () =>
      ok({
        totpUri: 'otpauth://totp/Leadtogo:a@b.com?secret=JBSWY3DPEHPK3PXP&issuer=Leadtogo',
        chave: 'JBSWY3DPEHPK3PXP',
        codigosDeBackup: ['aaaa-1111', 'bbbb-2222', 'cccc-3333', 'dddd-4444'],
      }),
    ),
    confirmarDoisFatores: vi.fn(async () => ok(undefined)),
    desativarDoisFatores: vi.fn(async () => ok(undefined)),
    gerarNovosCodigos: vi.fn(async () => ok(['nova-1111', 'nova-2222', 'nova-3333', 'nova-4444'])),
    consultarConvite: vi.fn(async () => falha('convite_invalido', 'Convite inválido.', 404)),
    aceitarConvite: vi.fn(async () =>
      ok({ tenantId: 't', membroId: 'm', usuarioId: 'u', contaCriada: true }),
    ),
    criarPrimeiroAcesso: vi.fn(async () =>
      ok({
        usuarioId: 'u',
        contaId: 'c',
        tenantId: 't',
        membroId: 'm',
        verificacaoEmailPendente: false,
      }),
    ),
    criarEmpresa: vi.fn(async () =>
      ok({
        empresa: {
          id: '0192f0a0-0000-7000-8000-0000000000b1',
          razaoSocial: 'Filial Ltda',
          nomeFantasia: null,
          papel: 'admin' as const,
          situacao: 'teste' as const,
          ativa: false,
        },
        cnpjRepetidoNaConta: false,
      }),
    ),
    equipe: vi.fn(async () => ok([])),
    convitesPendentes: vi.fn(async () => ok([])),
    convidar: vi.fn(async () =>
      ok({
        id: '0192f0a0-0000-7000-8000-0000000000c1',
        email: 'nova@exemplo.com.br',
        papel: 'vendedor' as const,
        expiraEm: '2026-10-20T12:00:00.000Z',
        criadoEm: '2026-10-13T12:00:00.000Z',
        situacao: 'pendente' as const,
        emailEnviado: true,
      }),
    ),
    cancelarConvite: vi.fn(async () => ok(undefined)),
    alterarMembro: vi.fn(async () => falha('membro_nao_encontrado', 'Membro não encontrado.', 404)),
    seguranca: vi.fn(async () => ok({ doisFatoresExigido: 'admin' as const })),
    alterarPoliticaDeDoisFatores: vi.fn(async (p: string) =>
      ok({ doisFatoresExigido: p as 'admin' | 'admin_gestor' | 'todos' }),
    ),
    ...troca,
  }
  return s as typeof s & ServicosDeAcesso
}

/** Monta o app inteiro (roteador, guardas, telas) numa rota, com histórico em memória. */
export function renderizar(
  servicos: ServicosDeAcesso,
  rota: string,
): ReturnType<typeof render> & { historico: RouterHistory } {
  const historico = createMemoryHistory({ initialEntries: [rota] })
  const r = render(<App servicos={servicos} historico={historico} />)
  return { ...r, historico }
}
