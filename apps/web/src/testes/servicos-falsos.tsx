import type { Me } from '@leadtogo/api-client'
import { PERMISSOES_PADRAO, nomeDoPerfilDeSistema } from '@leadtogo/shared'
import { createMemoryHistory, type RouterHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { vi } from 'vitest'

import { App } from '@/App'
import type { ErroDeAcesso, Resultado, ServicosDeAcesso } from '@/auth/tipos'
import { registrarRoteador } from './roteadores'

export const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados })
export const falha = (codigo: string, mensagem: string, status = 400): Resultado<never> => ({
  ok: false,
  erro: { codigo, mensagem, status } satisfies ErroDeAcesso,
})

type EmpresaDoMe = Me['empresas'][number]
/** Empresa dos testes: sem perfil e permissões, valem os padrões do perfil de sistema do papel */
export type EmpresaDeTeste = Omit<EmpresaDoMe, 'perfil' | 'permissoes'> &
  Partial<Pick<EmpresaDoMe, 'perfil' | 'permissoes'>>

const PERFIL_DE_TESTE = {
  admin: '0192f0a0-0000-7000-8000-0000000000f1',
  gestor: '0192f0a0-0000-7000-8000-0000000000f2',
  vendedor: '0192f0a0-0000-7000-8000-0000000000f3',
} as const

/** O perfil de sistema do papel e as permissões padrão dele (packages/shared/src/permissoes.ts) */
export const perfilDoPapel = (papel: EmpresaDoMe['papel']) => ({
  perfil: { id: PERFIL_DE_TESTE[papel], nome: nomeDoPerfilDeSistema[papel] },
  permissoes: { ...PERMISSOES_PADRAO[papel] },
})

export const comPerfil = (e: EmpresaDeTeste): EmpresaDoMe => ({ ...perfilDoPapel(e.papel), ...e })

export const meDeAdmin = ({
  empresas = [],
  ...extra
}: Omit<Partial<Me>, 'empresas'> & { empresas?: EmpresaDeTeste[] } = {}): Me => ({
  usuario: {
    id: '0192f0a0-0000-7000-8000-000000000001',
    nome: 'Alessandro Dias',
    email: 'alessandro@exemplo.com.br',
    emailVerificado: true,
    twoFactorEnabled: true,
  },
  empresaAtivaId: null,
  precisaEscolherEmpresa: false,
  administradorDeConta: true,
  doisFatoresPendente: false,
  doisFatoresObrigatorio: true,
  doisFatoresMotivo: { origem: 'conta', empresaId: null, papel: null },
  ...extra,
  empresas: empresas.map(comPerfil),
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
      porPagina: {},
      kanbanColapsadas: {},
    })),
    alterarPreferencias: vi.fn(async () =>
      ok({
        tema: 'sistema' as const,
        menuRecolhido: false,
        visaoDashboard: 'minha' as const,
        filtroPadrao: {},
        porPagina: {},
        kanbanColapsadas: {},
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
          ...perfilDoPapel('admin'),
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
    contatos: {
      listar: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 25 })),
      opcoes: vi.fn(async () => ok({ cargos: [] })),
      criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      detalhar: vi.fn(async () => falha('contato_nao_encontrado', 'Contato não encontrado.', 404)),
      alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluir: vi.fn(async () => ok(undefined)),
      vincular: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      alterarVinculo: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      historico: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 20 })),
      converterSocio: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      daEmpresa: vi.fn(async () => ok([])),
    },
    atividades: {
      criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      listar: vi.fn(async () =>
        ok({
          itens: [],
          total: 0,
          pagina: 1,
          porPagina: 25,
          contagens: { agendadas: 0, atrasadas: 0, realizadas: 0, hoje: 0, proximos7: 0 },
        }),
      ),
      detalhar: vi.fn(async () =>
        falha('atividade_nao_encontrada', 'Atividade não encontrada.', 404),
      ),
      alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      concluir: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      cancelar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluir: vi.fn(async () => ok(undefined)),
    },
    oportunidades: {
      kanban: vi.fn(async () =>
        ok({
          funil: { id: '0192f0a0-0000-7000-8000-0000000000f1', nome: 'Vendas' },
          fases: [],
          resumo: { ativas: 0, total: 0, mensal: 0, ponderado: 0 },
          suspensas: 0,
        }),
      ),
      listar: vi.fn(async () =>
        ok({
          itens: [],
          total: 0,
          pagina: 1,
          porPagina: 25,
          somas: { total: 0, mensal: 0, ponderado: 0 },
        }),
      ),
      criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      detalhar: vi.fn(async () =>
        falha('oportunidade_nao_encontrada', 'Oportunidade não encontrada.', 404),
      ),
      alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      mover: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      fechar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      reabrir: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluir: vi.fn(async () => ok(undefined)),
    },
    dashboard: {
      carregar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
    },
    configuracaoDaCarteira: vi.fn(async () =>
      ok({ bloquearEmpresaNaoAtiva: true, vendedorVeTodasEmpresas: false }),
    ),
    alterarConfiguracaoDaCarteira: vi.fn(async () =>
      ok({ bloquearEmpresaNaoAtiva: true, vendedorVeTodasEmpresas: false }),
    ),
    funis: {
      listar: vi.fn(async () => ok([])),
      criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluir: vi.fn(async () => ok(undefined)),
      reordenar: vi.fn(async () => ok([])),
      criarFase: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      alterarFase: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluirFase: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      reordenarFases: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
    },
    tags: {
      listar: vi.fn(async () => ok([])),
      criarGrupo: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      alterarGrupo: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluirGrupo: vi.fn(async () => ok(undefined)),
      reordenarGrupos: vi.fn(async () => ok([])),
      criarTag: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      alterarTag: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluirTag: vi.fn(async () => ok(undefined)),
      reordenarTags: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
    },
    carteira: {
      listar: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 25 })),
      contagens: vi.fn(async () =>
        ok({ todas: 0, minha: 0, semVisita90: 0, nuncaVisitadas: 0, semProximaAtividade: 0 }),
      ),
      opcoes: vi.fn(async () =>
        ok({ vendedores: [], unicoMembro: true, cidades: [], diasAlertaDeContato: 60 }),
      ),
      consultarCnpj: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      detalhar: vi.fn(async () => falha('empresa_nao_encontrada', 'Empresa não encontrada.', 404)),
      historico: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 20 })),
      consultarReceitaDaEmpresa: vi.fn(async () =>
        falha('indisponivel', 'Não configurado no teste.', 500),
      ),
      aplicarReceitaDaEmpresa: vi.fn(async () =>
        falha('indisponivel', 'Não configurado no teste.', 500),
      ),
      definirTags: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      excluir: vi.fn(async () => ok(undefined)),
      aplicarTagEmMassa: vi.fn(async () => ok({ aplicadas: 0, semMudanca: 0, ignoradas: 0 })),
    },
    geolocalizacao: {
      resumo: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      fila: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 25 })),
      regioes: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
      },
      lotes: {
        previa: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        listar: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 10 })),
        detalhar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        cancelar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        retomar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      },
      posicao: {
        ler: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        ajustar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        confirmarEndereco: vi.fn(async () =>
          falha('indisponivel', 'Não configurado no teste.', 500),
        ),
        geocodificarDeNovo: vi.fn(async () =>
          falha('indisponivel', 'Não configurado no teste.', 500),
        ),
      },
    },
    mapa: {
      opcoes: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
      legenda: {
        ler: vi.fn(async () => ok({ entradas: [] })),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        restaurar: vi.fn(async () => ok({ entradas: [] })),
      },
      pontos: vi.fn(async () =>
        ok({
          total: 0,
          pontos: [],
          agrupamentos: [],
          leads: { mostrados: 0, total: 0, limite: 500 },
        }),
      ),
      proximas: vi.fn(async () => ok({ total: 0, limite: 500, itens: [] })),
      selecao: vi.fn(async () => ok({ total: 0, limite: 500, itens: [] })),
      cobertura: vi.fn(async () => ok({ municipios: [] })),
    },
    importacao: {
      perfis: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
        conferirCnaes: vi.fn(async () => ok({ validos: [], invalidos: [], repetidos: 0 })),
      },
      lotes: {
        listar: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 20 })),
        enviar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        valoresDoTipo: vi.fn(async () => ok({ itens: [] })),
        detalhar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        previa: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        iniciar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        cancelar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        andamento: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        linhas: vi.fn(async () =>
          ok({ itens: [], total: 0, pagina: 1, porPagina: 50, colunas: [] }),
        ),
        desfazer: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        importarForaDoPerfil: vi.fn(async () =>
          falha('indisponivel', 'Não configurado no teste.', 500),
        ),
      },
    },
    cadastros: {
      verticais: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
        reordenar: vi.fn(async () => ok([])),
      },
      papeisDecisao: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
        reordenar: vi.fn(async () => ok([])),
      },
      solucoes: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
        reordenar: vi.fn(async () => ok([])),
      },
      origens: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
        reordenar: vi.fn(async () => ok([])),
      },
      motivos: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
        reordenar: vi.fn(async () => ok([])),
      },
      tiposAtividade: {
        listar: vi.fn(async () => ok([])),
        criar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        alterar: vi.fn(async () => falha('indisponivel', 'Não configurado no teste.', 500)),
        excluir: vi.fn(async () => ok(undefined)),
        reordenar: vi.fn(async () => ok([])),
      },
    },
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
  const r = render(
    <App servicos={servicos} historico={historico} aoCriarRoteador={registrarRoteador} />,
  )
  return { ...r, historico }
}
