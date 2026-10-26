import type { ErroDaApi } from '@leadtogo/api-client'

import { api } from '@/api/cliente'

import { limparTudo } from '@/lib/offline/banco'

import { authClient } from './cliente'
import { erroDeRede, traduzirErro } from './erros'
import type {
  ConfiguracaoDoDoisFatores,
  Resultado,
  ServicosDeAcesso,
  ServicosDeCadastro,
} from './tipos'

const ok = <T>(dados: T): Resultado<T> => ({ ok: true, dados })

/** Resposta de erro do Better Auth: `{ status, message, code }`. */
interface ErroDoAuth {
  status: number
  message?: string
  code?: string
}
const falhaDoAuth = (e: ErroDoAuth): Resultado<never> => ({
  ok: false,
  erro: traduzirErro(e.status, { code: e.code ?? '', message: e.message ?? '' }),
})

/** Executa uma chamada e transforma queda de rede em erro de acesso, nunca em exceção solta. */
async function protegido<T>(chamada: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await chamada()
  } catch {
    return { ok: false, erro: erroDeRede() }
  }
}

/** Resposta do openapi-fetch → Resultado. */
function daApi<T>(r: { data?: T; error?: ErroDaApi; response: Response }): Resultado<T> {
  if (r.data !== undefined && r.response.ok) return ok(r.data)
  return {
    ok: false,
    erro: traduzirErro(
      r.response.status,
      r.error ? { erro: r.error.erro, mensagem: r.error.mensagem, dados: r.error.dados } : null,
    ),
  }
}

/** Resposta sem corpo (204): sucesso se o status for 2xx; senão, o erro da API. */
function semCorpo(r: { error?: ErroDaApi; response: Response }): Resultado {
  if (r.response.ok) return ok(undefined)
  return daApi({ ...r, data: undefined })
}

/**
 * Os cinco cadastros simples têm a mesma API (`GET/POST /v1/configuracoes/<rota>`, `PATCH/DELETE
 * /<rota>/{id}`, `PUT /<rota>/ordem`). O cliente tipado exige o caminho literal de cada rota, então a
 * fábrica fala com ele por esta forma mínima; os tipos de cada cadastro vêm da interface
 * `ServicosDeCadastros`, e `servicos.test.ts` confere método, caminho e corpo das cinco rotas.
 */
interface ClienteCru {
  GET: (url: string, init?: object) => Promise<RespostaCrua>
  POST: (url: string, init?: object) => Promise<RespostaCrua>
  PATCH: (url: string, init?: object) => Promise<RespostaCrua>
  PUT: (url: string, init?: object) => Promise<RespostaCrua>
  DELETE: (url: string, init?: object) => Promise<RespostaCrua>
}
type RespostaCrua = { data?: unknown; error?: ErroDaApi; response: Response }

function cadastroReal<Item, Criar, Alterar>(
  rota: string,
): ServicosDeCadastro<Item, Criar, Alterar> {
  const cru = api as unknown as ClienteCru
  const base = `/v1/configuracoes/${rota}`
  const porId = (id: string) => ({ params: { path: { id } } })
  return {
    listar: () =>
      protegido(async () =>
        daApi<Item[]>(
          (await cru.GET(base, { params: { query: { incluirInativos: 'true' } } })) as never,
        ),
      ),
    criar: (dados) =>
      protegido(async () => daApi<Item>((await cru.POST(base, { body: dados })) as never)),
    alterar: (id, dados) =>
      protegido(async () =>
        daApi<Item>((await cru.PATCH(`${base}/{id}`, { ...porId(id), body: dados })) as never),
      ),
    excluir: (id) =>
      protegido(async () => semCorpo((await cru.DELETE(`${base}/{id}`, porId(id))) as never)),
    reordenar: (ids) =>
      protegido(async () =>
        daApi<Item[]>((await cru.PUT(`${base}/ordem`, { body: { ids } })) as never),
      ),
  }
}

function chaveDoUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? ''
  } catch {
    return ''
  }
}

export const servicosReais: ServicosDeAcesso = {
  async me() {
    const r = await api.GET('/v1/me')
    if (r.response.status === 401) return null
    if (!r.data) throw new Error(`GET /v1/me respondeu ${r.response.status}`)
    return r.data
  },
  async opcoes() {
    const r = await api.GET('/v1/acesso/opcoes')
    // Se a consulta falhar, a tela de login funciona sem o Google
    return { loginGoogle: r.data?.loginGoogle ?? false }
  },
  async primeiroAcessoAberto() {
    const r = await api.GET('/v1/primeiro-acesso/estado')
    return r.data?.aberto ?? false
  },

  async preferencias() {
    const r = await api.GET('/v1/me/preferencias')
    return r.data ?? null
  },
  alterarPreferencias: (patch) =>
    protegido(async () => daApi(await api.PATCH('/v1/me/preferencias', { body: patch }))),
  trocarEmpresa: (empresaId) =>
    protegido(async () => {
      const r = daApi(await api.POST('/v1/sessao/empresa-ativa', { body: { empresaId } }))
      return r.ok ? ok(undefined) : r
    }),

  entrar: (email, senha) =>
    protegido(async () => {
      const r = await authClient.signIn.email({ email, password: senha })
      if (r.error) return falhaDoAuth(r.error)
      const dados = r.data as { twoFactorRedirect?: boolean } | null
      return ok({ doisFatores: dados?.twoFactorRedirect === true })
    }),
  async entrarComGoogle() {
    await authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin })
  },
  verificarCodigo: (codigo, confiar) =>
    protegido(async () => {
      const r = await authClient.twoFactor.verifyTotp({ code: codigo, trustDevice: confiar })
      return r.error ? falhaDoAuth(r.error) : ok(undefined)
    }),
  verificarCodigoDeRecuperacao: (codigo, confiar) =>
    protegido(async () => {
      const r = await authClient.twoFactor.verifyBackupCode({ code: codigo, trustDevice: confiar })
      return r.error ? falhaDoAuth(r.error) : ok(undefined)
    }),
  async sair() {
    await authClient.signOut().catch(() => undefined)
    // Proteção do aparelho (lgpd.md 3.2): ao sair, os dados das visitas offline são apagados
    await limparTudo().catch(() => undefined)
  },

  pedirNovaSenha: (email) =>
    protegido(async () => {
      const r = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      // Só falha de verdade (limite, rede): conta inexistente responde igual a existente
      return r.error ? falhaDoAuth(r.error) : ok(undefined)
    }),
  redefinirSenha: (token, senha) =>
    protegido(async () => {
      const r = await authClient.resetPassword({ newPassword: senha, token })
      return r.error ? falhaDoAuth(r.error) : ok(undefined)
    }),
  reenviarVerificacao: (email) =>
    protegido(async () => {
      const r = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/verificar-email`,
      })
      return r.error ? falhaDoAuth(r.error) : ok(undefined)
    }),

  prepararDoisFatores: (senha) =>
    protegido(async () => {
      const r = await authClient.twoFactor.enable({ password: senha })
      if (r.error) return falhaDoAuth(r.error)
      if (r.data.method !== 'totp') return falhaDoAuth({ status: 500 })
      const configuracao: ConfiguracaoDoDoisFatores = {
        totpUri: r.data.totpURI,
        chave: chaveDoUri(r.data.totpURI),
        codigosDeBackup: r.data.backupCodes,
      }
      return ok(configuracao)
    }),
  confirmarDoisFatores: (codigo) =>
    protegido(async () => {
      const r = await authClient.twoFactor.verifyTotp({ code: codigo })
      return r.error ? falhaDoAuth(r.error) : ok(undefined)
    }),

  desativarDoisFatores: (senha, codigo) =>
    protegido(async () => {
      // o corpo leva `code` além da senha: a API exige os dois (o tipo do cliente só conhece a senha)
      const r = await authClient.$fetch('/two-factor/disable', {
        method: 'POST',
        body: { password: senha, code: codigo },
      })
      return r.error ? falhaDoAuth(r.error) : ok(undefined)
    }),
  gerarNovosCodigos: (senha) =>
    protegido(async () => {
      const r = await authClient.twoFactor.generateBackupCodes({ password: senha })
      return r.error ? falhaDoAuth(r.error) : ok(r.data.backupCodes)
    }),

  consultarConvite: (token) =>
    protegido(async () => daApi(await api.POST('/v1/convites/consultar', { body: { token } }))),
  aceitarConvite: (dados) =>
    protegido(async () => daApi(await api.POST('/v1/convites/aceitar', { body: dados }))),
  criarPrimeiroAcesso: (dados) =>
    protegido(async () => daApi(await api.POST('/v1/primeiro-acesso', { body: dados }))),

  criarEmpresa: (dados) =>
    protegido(async () => daApi(await api.POST('/v1/empresas', { body: dados }))),
  equipe: () =>
    protegido(async () =>
      daApi(await api.GET('/v1/membros', { params: { query: { incluirInativos: 'true' } } })),
    ),
  convitesPendentes: () => protegido(async () => daApi(await api.GET('/v1/convites'))),
  convidar: (dados) =>
    protegido(async () => daApi(await api.POST('/v1/convites', { body: dados }))),
  cancelarConvite: (id) =>
    protegido(async () => {
      const r = await api.DELETE('/v1/convites/{id}', { params: { path: { id } } })
      if (r.response.ok) return ok(undefined)
      return daApi({ ...r, data: undefined })
    }),
  alterarMembro: (id, dados) =>
    protegido(async () =>
      daApi(await api.PATCH('/v1/membros/{id}', { params: { path: { id } }, body: dados })),
    ),
  atribuirPerfil: (membroId, perfilId) =>
    protegido(async () =>
      daApi(
        await api.PUT('/v1/membros/{id}/perfil', {
          params: { path: { id: membroId } },
          body: { perfilId },
        }),
      ),
    ),
  perfis: {
    listar: () => protegido(async () => daApi(await api.GET('/v1/perfis'))),
    membros: (id) =>
      protegido(async () =>
        daApi(await api.GET('/v1/perfis/{id}/membros', { params: { path: { id } } })),
      ),
    criar: (dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/perfis', {
            body: { exige2fa: false, permissoes: {}, ...dados },
          }),
        ),
      ),
    duplicar: (id, nome) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/perfis/{id}/duplicar', { params: { path: { id } }, body: { nome } }),
        ),
      ),
    editar: (id, dados) =>
      protegido(async () =>
        daApi(await api.PATCH('/v1/perfis/{id}', { params: { path: { id } }, body: dados })),
      ),
    excluir: (id) =>
      protegido(async () => {
        const r = await api.DELETE('/v1/perfis/{id}', { params: { path: { id } } })
        if (r.response.ok) return ok(undefined)
        return daApi({ ...r, data: undefined })
      }),
  },
  seguranca: () => protegido(async () => daApi(await api.GET('/v1/configuracoes/seguranca'))),
  alterarDoisFatoresDosPerfis: (perfis) =>
    protegido(async () =>
      daApi(await api.PATCH('/v1/configuracoes/seguranca', { body: { perfis } })),
    ),

  contatos: {
    listar: (consulta) =>
      protegido(async () =>
        daApi(await api.GET('/v1/carteira/contatos', { params: { query: consulta as never } })),
      ),
    opcoes: () => protegido(async () => daApi(await api.GET('/v1/carteira/contatos/opcoes'))),
    criar: (dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/carteira/contatos', { body: dados as never })),
      ),
    detalhar: (id) =>
      protegido(async () =>
        daApi(await api.GET('/v1/carteira/contatos/{id}', { params: { path: { id } } })),
      ),
    alterar: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/carteira/contatos/{id}', {
            params: { path: { id } },
            body: dados as never,
          }),
        ),
      ),
    excluir: (id) =>
      protegido(async () =>
        semCorpo(await api.DELETE('/v1/carteira/contatos/{id}', { params: { path: { id } } })),
      ),
    vincular: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/contatos/{id}/vinculos', {
            params: { path: { id } },
            body: dados as never,
          }),
        ),
      ),
    alterarVinculo: (id, empresaId, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/carteira/contatos/{id}/vinculos/{empresaId}', {
            params: { path: { id, empresaId } },
            body: dados as never,
          }),
        ),
      ),
    historico: (id, pagina) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/carteira/contatos/{id}/historico', {
            params: { path: { id }, query: { pagina, porPagina: 20 } },
          }),
        ),
      ),
    converterSocio: (empresaId, socioId) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/empresas/{id}/socios/{socioId}/converter', {
            params: { path: { id: empresaId, socioId } },
          }),
        ),
      ),
    daEmpresa: (empresaId) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/carteira/empresas/{id}/contatos', {
            params: { path: { id: empresaId } },
          }),
        ),
      ),
  },

  atividades: {
    criar: (dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/carteira/atividades', { body: dados as never })),
      ),
    listar: (consulta) =>
      protegido(async () =>
        daApi(await api.GET('/v1/carteira/atividades', { params: { query: consulta as never } })),
      ),
    detalhar: (id) =>
      protegido(async () =>
        daApi(await api.GET('/v1/carteira/atividades/{id}', { params: { path: { id } } })),
      ),
    alterar: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/carteira/atividades/{id}', {
            params: { path: { id } },
            body: dados as never,
          }),
        ),
      ),
    concluir: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/atividades/{id}/concluir', {
            params: { path: { id } },
            body: dados as never,
          }),
        ),
      ),
    cancelar: (id) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/atividades/{id}/cancelar', { params: { path: { id } } }),
        ),
      ),
    excluir: (id) =>
      protegido(async () =>
        semCorpo(await api.DELETE('/v1/carteira/atividades/{id}', { params: { path: { id } } })),
      ),
  },

  oportunidades: {
    kanban: (consulta) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/carteira/oportunidades/kanban', {
            params: { query: consulta as never },
          }),
        ),
      ),
    listar: (consulta) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/carteira/oportunidades', { params: { query: consulta as never } }),
        ),
      ),
    criar: (dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/carteira/oportunidades', { body: dados as never })),
      ),
    detalhar: (id) =>
      protegido(async () =>
        daApi(await api.GET('/v1/carteira/oportunidades/{id}', { params: { path: { id } } })),
      ),
    alterar: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/carteira/oportunidades/{id}', {
            params: { path: { id } },
            body: dados as never,
          }),
        ),
      ),
    mover: (id, faseId) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/oportunidades/{id}/mover', {
            params: { path: { id } },
            body: { faseId },
          }),
        ),
      ),
    fechar: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/oportunidades/{id}/fechar', {
            params: { path: { id } },
            body: dados as never,
          }),
        ),
      ),
    reabrir: (id) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/oportunidades/{id}/reabrir', { params: { path: { id } } }),
        ),
      ),
    excluir: (id) =>
      protegido(async () =>
        semCorpo(await api.DELETE('/v1/carteira/oportunidades/{id}', { params: { path: { id } } })),
      ),
  },

  dashboard: {
    carregar: (consulta) =>
      protegido(async () =>
        daApi(await api.GET('/v1/carteira/dashboard', { params: { query: consulta as never } })),
      ),
  },

  configuracaoDaCarteira: () =>
    protegido(async () => daApi(await api.GET('/v1/configuracoes/carteira'))),
  alterarConfiguracaoDaCarteira: (patch) =>
    protegido(async () => daApi(await api.PATCH('/v1/configuracoes/carteira', { body: patch }))),

  cadastros: {
    verticais: cadastroReal('verticais'),
    papeisDecisao: cadastroReal('papeis-decisao'),
    solucoes: cadastroReal('solucoes'),
    origens: cadastroReal('origens'),
    motivos: cadastroReal('motivos'),
    tiposAtividade: cadastroReal('tipos-atividade'),
  },

  visitas: {
    resultados: cadastroReal('visitas/resultados'),
    modelos: {
      listar: () =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/configuracoes/visitas/modelos', {
              params: { query: { incluirInativos: 'true' } },
            }),
          ),
        ),
      versoes: (id) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/configuracoes/visitas/modelos/{id}/versoes', {
              params: { path: { id } },
            }),
          ),
        ),
      criar: (dados) =>
        protegido(async () =>
          daApi(await api.POST('/v1/configuracoes/visitas/modelos', { body: dados })),
        ),
      alterar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/configuracoes/visitas/modelos/{id}', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(
            await api.DELETE('/v1/configuracoes/visitas/modelos/{id}', {
              params: { path: { id } },
            }),
          ),
        ),
      reordenar: (ids) =>
        protegido(async () =>
          daApi(await api.PUT('/v1/configuracoes/visitas/modelos/ordem', { body: { ids } })),
        ),
    },
    campo: {
      distancia: (empresaId, p) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/visitas/distancia', {
              params: { query: { empresaId, latitude: p.latitude, longitude: p.longitude } },
            }),
          ),
        ),
      salvar: (id, dados) =>
        protegido(async () =>
          daApi(await api.PUT('/v1/visitas/{id}', { params: { path: { id } }, body: dados })),
        ),
      obter: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/visitas/{id}', { params: { path: { id } } })),
        ),
      listar: (filtro) =>
        protegido(async () => daApi(await api.GET('/v1/visitas', { params: { query: filtro } }))),
      offline: (empresaIds) =>
        protegido(async () =>
          daApi(await api.POST('/v1/visitas/offline', { body: { empresaIds } })),
        ),
    },
    configuracao: () =>
      protegido(async () => daApi(await api.GET('/v1/configuracoes/visitas/checkin'))),
    alterarConfiguracao: (dados) =>
      protegido(async () =>
        daApi(await api.PUT('/v1/configuracoes/visitas/checkin', { body: dados })),
      ),
  },

  rotas: {
    configuracao: () => protegido(async () => daApi(await api.GET('/v1/rotas/configuracao'))),
    alterarConfiguracao: (minutosPorVisita) =>
      protegido(async () =>
        daApi(await api.PUT('/v1/configuracoes/rotas', { body: { minutosPorVisita } })),
      ),
    pontos: {
      listar: () => protegido(async () => daApi(await api.GET('/v1/configuracoes/rotas/pontos'))),
      criar: (dados) =>
        protegido(async () =>
          daApi(await api.POST('/v1/configuracoes/rotas/pontos', { body: dados })),
        ),
      alterar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/configuracoes/rotas/pontos/{id}', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(
            await api.DELETE('/v1/configuracoes/rotas/pontos/{id}', { params: { path: { id } } }),
          ),
        ),
    },
    listar: (consulta) =>
      protegido(async () => daApi(await api.GET('/v1/rotas', { params: { query: consulta } }))),
    obter: (id) =>
      protegido(async () => daApi(await api.GET('/v1/rotas/{id}', { params: { path: { id } } }))),
    hoje: () => protegido(async () => daApi(await api.GET('/v1/rotas/hoje'))),
    daEmpresa: (empresaId) =>
      protegido(async () =>
        daApi(await api.GET('/v1/rotas/empresa/{empresaId}', { params: { path: { empresaId } } })),
      ),
    criar: (dados) => protegido(async () => daApi(await api.POST('/v1/rotas', { body: dados }))),
    salvar: (id, dados) =>
      protegido(async () =>
        daApi(await api.PUT('/v1/rotas/{id}', { params: { path: { id } }, body: dados })),
      ),
    otimizar: (dados) =>
      protegido(async () => daApi(await api.POST('/v1/rotas/otimizar', { body: dados }))),
    adicionar: (id, empresaIds) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/rotas/{id}/paradas', {
            params: { path: { id } },
            body: { empresaIds },
          }),
        ),
      ),
    pular: (id, paradaId, motivo) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/rotas/{id}/paradas/{paradaId}/pular', {
            params: { path: { id, paradaId } },
            body: { motivo },
          }),
        ),
      ),
    encerrar: (id) =>
      protegido(async () =>
        daApi(await api.POST('/v1/rotas/{id}/encerrar', { params: { path: { id } } })),
      ),
    cancelar: (id) =>
      protegido(async () =>
        daApi(await api.POST('/v1/rotas/{id}/cancelar', { params: { path: { id } } })),
      ),
  },

  chamados: {
    listar: (consulta) =>
      protegido(async () => daApi(await api.GET('/v1/chamados', { params: { query: consulta } }))),
    obter: (id) =>
      protegido(async () =>
        daApi(await api.GET('/v1/chamados/{id}', { params: { path: { id } } })),
      ),
    abrir: (dados) => protegido(async () => daApi(await api.POST('/v1/chamados', { body: dados }))),
    triar: (id, dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/chamados/{id}/triar', { params: { path: { id } }, body: dados })),
      ),
    atribuir: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/chamados/{id}/atribuir', { params: { path: { id } }, body: dados }),
        ),
      ),
    assumir: (id) =>
      protegido(async () =>
        daApi(await api.POST('/v1/chamados/{id}/assumir', { params: { path: { id } } })),
      ),
    alterarStatus: (id, status) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/chamados/{id}/status', {
            params: { path: { id } },
            body: { status },
          }),
        ),
      ),
    alterar: (id, dados) =>
      protegido(async () =>
        daApi(await api.PATCH('/v1/chamados/{id}', { params: { path: { id } }, body: dados })),
      ),
    reabrir: (id) =>
      protegido(async () =>
        daApi(await api.POST('/v1/chamados/{id}/reabrir', { params: { path: { id } } })),
      ),
    mensagem: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/chamados/{id}/mensagens', { params: { path: { id } }, body: dados }),
        ),
      ),
    nota: (id, dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/chamados/{id}/notas', { params: { path: { id } }, body: dados })),
      ),
    atendentes: (areaId) =>
      protegido(async () =>
        daApi(await api.GET('/v1/chamados/atendentes', { params: { query: { areaId } } })),
      ),
    anexos: {
      pedir: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/chamados/{id}/anexos', { params: { path: { id } }, body: dados }),
          ),
        ),
      // O arquivo vai direto ao armazenamento (URL pré-assinada): fora do cliente da API, sem cookie
      enviar: (url, arquivo) =>
        protegido(async () => {
          const r = await globalThis.fetch(url, { method: 'PUT', body: arquivo })
          return r.ok
            ? ok(undefined)
            : {
                ok: false,
                erro: traduzirErro(r.status, {
                  erro: 'envio_falhou',
                  mensagem: 'Não consegui enviar o arquivo.',
                }),
              }
        }),
      confirmar: (id, anexoId) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/chamados/{id}/anexos/{anexoId}/confirmar', {
              params: { path: { id, anexoId } },
            }),
          ),
        ),
      baixar: (id, anexoId) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/chamados/{id}/anexos/{anexoId}/download', {
              params: { path: { id, anexoId } },
            }),
          ),
        ),
    },
    areas: {
      listar: (incluirInativas = false) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/chamados/areas', {
              params: { query: { incluirInativas: incluirInativas ? 'true' : 'false' } },
            }),
          ),
        ),
      criar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/chamados/areas', { body: dados }))),
      alterar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/chamados/areas/{id}', { params: { path: { id } }, body: dados }),
          ),
        ),
      membros: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PUT('/v1/chamados/areas/{id}/membros', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(await api.DELETE('/v1/chamados/areas/{id}', { params: { path: { id } } })),
        ),
    },
    opcoesDeConfiguracao: () =>
      protegido(async () => daApi(await api.GET('/v1/chamados/opcoes-de-configuracao'))),
    triagem: {
      ver: () => protegido(async () => daApi(await api.GET('/v1/chamados/triagem'))),
      alterar: (dados) =>
        protegido(async () => daApi(await api.PUT('/v1/chamados/triagem', { body: dados }))),
    },
    expediente: {
      ver: () => protegido(async () => daApi(await api.GET('/v1/chamados/expediente'))),
      definir: (dados) =>
        protegido(async () => daApi(await api.PUT('/v1/chamados/expediente', { body: dados }))),
      criarFeriado: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/chamados/feriados', { body: dados }))),
      gerarFeriados: (ano) =>
        protegido(async () =>
          daApi(await api.POST('/v1/chamados/feriados/gerar', { body: { ano } })),
        ),
      excluirFeriado: (id) =>
        protegido(async () =>
          semCorpo(await api.DELETE('/v1/chamados/feriados/{id}', { params: { path: { id } } })),
        ),
    },
    aguardarCliente: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/chamados/{id}/aguardar-cliente', {
            params: { path: { id } },
            body: dados,
          }),
        ),
      ),
    tarefas: {
      listar: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/chamados/{id}/tarefas', { params: { path: { id } } })),
        ),
      criar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/chamados/{id}/tarefas', { params: { path: { id } }, body: dados }),
          ),
        ),
    },
    metricas: (consulta) =>
      protegido(async () =>
        daApi(await api.GET('/v1/chamados/metricas', { params: { query: consulta } })),
      ),
  },

  portal: {
    indicadores: (dias) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/portal-hub/indicadores', {
            params: { query: dias ? { dias } : {} },
          }),
        ),
      ),
    configuracao: {
      obter: () => protegido(async () => daApi(await api.GET('/v1/portal-configuracao'))),
      atualizar: (dados) =>
        protegido(async () => daApi(await api.PUT('/v1/portal-configuracao', { body: dados }))),
    },
    publicacoes: {
      listar: (consulta = {}) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-publicacoes', { params: { query: consulta } })),
        ),
      obter: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-publicacoes/{id}', { params: { path: { id } } })),
        ),
      criar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/portal-publicacoes', { body: dados }))),
      editar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/portal-publicacoes/{id}', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(await api.DELETE('/v1/portal-publicacoes/{id}', { params: { path: { id } } })),
        ),
      fixar: (id, fixada) =>
        protegido(async () =>
          daApi(
            await api.PUT('/v1/portal-publicacoes/{id}/fixada', {
              params: { path: { id } },
              body: { fixada },
            }),
          ),
        ),
      bloquearComentarios: (id, bloqueados) =>
        protegido(async () =>
          daApi(
            await api.PUT('/v1/portal-publicacoes/{id}/comentarios-bloqueados', {
              params: { path: { id } },
              body: { bloqueados },
            }),
          ),
        ),
      comentarios: (id) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/portal-publicacoes/{id}/comentarios', {
              params: { path: { id } },
            }),
          ),
        ),
      moderar: (id, comentarioId, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/portal-publicacoes/{id}/comentarios/{comentarioId}', {
              params: { path: { id, comentarioId } },
              body: dados,
            }),
          ),
        ),
    },
    avisos: {
      listar: (consulta = {}) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-avisos', { params: { query: consulta } })),
        ),
      criar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/portal-avisos', { body: dados }))),
      cancelar: (id) =>
        protegido(async () =>
          daApi(await api.POST('/v1/portal-avisos/{id}/cancelar', { params: { path: { id } } })),
        ),
    },
    eventos: {
      listar: (consulta = {}) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-eventos', { params: { query: consulta } })),
        ),
      obter: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-eventos/{id}', { params: { path: { id } } })),
        ),
      criar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/portal-eventos', { body: dados }))),
      editar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/portal-eventos/{id}', { params: { path: { id } }, body: dados }),
          ),
        ),
      publicar: (id) =>
        protegido(async () =>
          daApi(await api.POST('/v1/portal-eventos/{id}/publicar', { params: { path: { id } } })),
        ),
      cancelar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/portal-eventos/{id}/cancelar', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(await api.DELETE('/v1/portal-eventos/{id}', { params: { path: { id } } })),
        ),
      participantes: (id) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/portal-eventos/{id}/participantes', { params: { path: { id } } }),
          ),
        ),
      removerParticipante: (id, confirmacaoId) =>
        protegido(async () =>
          daApi(
            await api.DELETE('/v1/portal-eventos/{id}/participantes/{confirmacaoId}', {
              params: { path: { id, confirmacaoId } },
            }),
          ),
        ),
    },
    documentos: {
      listar: (consulta = {}) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-documentos', { params: { query: consulta } })),
        ),
      obter: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-documentos/{id}', { params: { path: { id } } })),
        ),
      criar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/portal-documentos', { body: dados }))),
      // O arquivo vai direto ao armazenamento (URL pré-assinada): fora do cliente da API, sem cookie
      enviar: (url, arquivo) =>
        protegido(async () => {
          const r = await globalThis.fetch(url, { method: 'PUT', body: arquivo })
          return r.ok
            ? ok(undefined)
            : {
                ok: false,
                erro: traduzirErro(r.status, {
                  erro: 'envio_falhou',
                  mensagem: 'Não consegui enviar o arquivo.',
                }),
              }
        }),
      confirmar: (id) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/portal-documentos/{id}/confirmar', { params: { path: { id } } }),
          ),
        ),
      editar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/portal-documentos/{id}', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(await api.DELETE('/v1/portal-documentos/{id}', { params: { path: { id } } })),
        ),
      baixar: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-documentos/{id}/download', { params: { path: { id } } })),
        ),
      baixas: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-documentos/{id}/baixas', { params: { path: { id } } })),
        ),
    },
    acessos: {
      listar: (consulta = {}) =>
        protegido(async () =>
          daApi(await api.GET('/v1/portal-acessos', { params: { query: consulta } })),
        ),
      dar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/portal-acessos', { body: dados }))),
      reenviar: (id) =>
        protegido(async () =>
          daApi(await api.POST('/v1/portal-acessos/{id}/reenviar', { params: { path: { id } } })),
        ),
      alterar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/portal-acessos/{id}', { params: { path: { id } }, body: dados }),
          ),
        ),
      revogar: (id) =>
        protegido(async () =>
          semCorpo(await api.DELETE('/v1/portal-acessos/{id}', { params: { path: { id } } })),
        ),
    },
    pedidos: {
      listar: (situacao) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/portal-pedidos', {
              params: { query: situacao ? { situacao } : {} },
            }),
          ),
        ),
      tratar: (id, dados) =>
        protegido(async () =>
          semCorpo(
            await api.POST('/v1/portal-pedidos/{id}/tratar', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
    },
  },

  notificacoes: {
    listar: (consulta = {}) =>
      protegido(async () =>
        daApi(await api.GET('/v1/notificacoes', { params: { query: consulta } })),
      ),
    marcarLida: (id) =>
      protegido(async () =>
        daApi(await api.POST('/v1/notificacoes/{id}/lida', { params: { path: { id } } })),
      ),
    marcarTodas: () => protegido(async () => daApi(await api.POST('/v1/notificacoes/lidas'))),
  },

  geolocalizacao: {
    resumo: () => protegido(async () => daApi(await api.GET('/v1/geolocalizacao/resumo'))),
    fila: (pagina = 1, porPagina = 25) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/geolocalizacao/fila', { params: { query: { pagina, porPagina } } }),
        ),
      ),
    regioes: {
      listar: (uf) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/geolocalizacao/regioes', {
              params: { query: uf ? { uf } : {} },
            }),
          ),
        ),
      criar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/geolocalizacao/regioes', { body: dados }))),
      alterar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PUT('/v1/geolocalizacao/regioes/{id}', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(
            await api.DELETE('/v1/geolocalizacao/regioes/{id}', { params: { path: { id } } }),
          ),
        ),
    },
    lotes: {
      previa: (escopo) =>
        protegido(async () =>
          daApi(await api.POST('/v1/geolocalizacao/lotes/previa', { body: escopo })),
        ),
      criar: (dados) =>
        protegido(async () => daApi(await api.POST('/v1/geolocalizacao/lotes', { body: dados }))),
      listar: (pagina = 1, porPagina = 10) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/geolocalizacao/lotes', { params: { query: { pagina, porPagina } } }),
          ),
        ),
      detalhar: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/geolocalizacao/lotes/{id}', { params: { path: { id } } })),
        ),
      cancelar: (id) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/geolocalizacao/lotes/{id}/cancelar', { params: { path: { id } } }),
          ),
        ),
      retomar: (id) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/geolocalizacao/lotes/{id}/retomar', { params: { path: { id } } }),
          ),
        ),
    },
    posicao: {
      ler: (empresaId) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/geolocalizacao/empresas/{id}/posicao', {
              params: { path: { id: empresaId } },
            }),
          ),
        ),
      ajustar: (empresaId, dados) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/geolocalizacao/empresas/{id}/posicao', {
              params: { path: { id: empresaId } },
              body: dados,
            }),
          ),
        ),
      confirmarEndereco: (empresaId, dados) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/geolocalizacao/empresas/{id}/confirmar-endereco', {
              params: { path: { id: empresaId } },
              body: dados,
            }),
          ),
        ),
      geocodificarDeNovo: (empresaId) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/geolocalizacao/empresas/{id}/geocodificar', {
              params: { path: { id: empresaId } },
            }),
          ),
        ),
    },
  },

  mapa: {
    opcoes: () => protegido(async () => daApi(await api.GET('/v1/mapa/opcoes'))),
    legenda: {
      ler: () => protegido(async () => daApi(await api.GET('/v1/mapa/legenda'))),
      alterar: (chave, dados) =>
        protegido(async () =>
          daApi(
            await api.PUT('/v1/mapa/legenda/{chave}', {
              params: { path: { chave } },
              body: dados,
            }),
          ),
        ),
      restaurar: () => protegido(async () => daApi(await api.POST('/v1/mapa/legenda/restaurar'))),
    },
    pontos: (consulta, signal) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/mapa/pontos', {
            ...(signal ? { signal } : {}),
            params: {
              query: {
                ...consulta,
                statusTagIds: consulta.statusTagIds.join(','),
                lotes: consulta.lotes.join(','),
              } as never,
            },
          }),
        ),
      ),
    proximas: (consulta) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/mapa/proximas', {
            params: {
              query: {
                ...consulta,
                statusTagIds: consulta.statusTagIds.join(','),
                lotes: consulta.lotes.join(','),
              } as never,
            },
          }),
        ),
      ),
    selecao: (dados) =>
      protegido(async () => daApi(await api.POST('/v1/mapa/selecao', { body: dados }))),
    cobertura: () => protegido(async () => daApi(await api.GET('/v1/mapa/cobertura'))),
  },

  importacao: {
    perfis: {
      listar: () =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/importacao/perfis', {
              params: { query: { incluirInativos: 'true' } },
            }),
          ),
        ),
      criar: (dados) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/importacao/perfis', {
              // o cliente gerado trata o que tem padrão como obrigatório: os padrões vão explícitos
              body: {
                nome: dados.nome,
                exigeSituacaoAtiva: dados.exigeSituacaoAtiva ?? true,
                estabelecimento: dados.estabelecimento ?? 'ambas',
                excluirMei: dados.excluirMei ?? false,
                cnaes: dados.cnaes ?? [],
                aceitarCnaeSecundario: dados.aceitarCnaeSecundario ?? false,
                acaoForaDoPerfil: dados.acaoForaDoPerfil ?? 'pular',
              },
            }),
          ),
        ),
      alterar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/importacao/perfis/{id}', {
              params: { path: { id } },
              body: dados,
            }),
          ),
        ),
      excluir: (id) =>
        protegido(async () =>
          semCorpo(await api.DELETE('/v1/importacao/perfis/{id}', { params: { path: { id } } })),
        ),
      conferirCnaes: (texto) =>
        protegido(async () =>
          daApi(await api.POST('/v1/importacao/perfis/cnaes/conferir', { body: { texto } })),
        ),
    },
    lotes: {
      listar: (pagina = 1, porPagina = 25, tipo) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/importacao/lotes', {
              params: { query: { pagina, porPagina, ...(tipo ? { tipo } : {}) } },
            }),
          ),
        ),
      valoresDoTipo: (id, coluna) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/importacao/lotes/{id}/valores-do-tipo', {
              params: { path: { id }, query: coluna ? { coluna } : {} },
            }),
          ),
        ),
      enviar: (arquivo, nome, tipo) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/importacao/lotes', {
              params: {
                query: {
                  arquivo: arquivo.name,
                  ...(nome ? { nome } : {}),
                  ...(tipo ? { tipo } : {}),
                },
              },
              // os bytes vão no corpo, sem serialização (o servidor lê o arquivo como octet-stream)
              body: arquivo as unknown as string,
              bodySerializer: (corpo) => corpo as BodyInit,
              headers: { 'Content-Type': 'application/octet-stream' },
            }),
          ),
        ),
      detalhar: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/importacao/lotes/{id}', { params: { path: { id } } })),
        ),
      alterar: (id, dados) =>
        protegido(async () =>
          daApi(
            await api.PATCH('/v1/importacao/lotes/{id}', { params: { path: { id } }, body: dados }),
          ),
        ),
      previa: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/importacao/lotes/{id}/previa', { params: { path: { id } } })),
        ),
      iniciar: (id) =>
        protegido(async () =>
          daApi(await api.POST('/v1/importacao/lotes/{id}/iniciar', { params: { path: { id } } })),
        ),
      cancelar: (id) =>
        protegido(async () =>
          daApi(await api.POST('/v1/importacao/lotes/{id}/cancelar', { params: { path: { id } } })),
        ),
      andamento: (id) =>
        protegido(async () =>
          daApi(await api.GET('/v1/importacao/lotes/{id}/andamento', { params: { path: { id } } })),
        ),
      linhas: (id, consulta) =>
        protegido(async () =>
          daApi(
            await api.GET('/v1/importacao/lotes/{id}/linhas', {
              params: {
                path: { id },
                query: {
                  pagina: consulta?.pagina ?? 1,
                  porPagina: consulta?.porPagina ?? 25,
                  ...(consulta?.resultado ? { resultado: consulta.resultado as never } : {}),
                },
              },
            }),
          ),
        ),
      desfazer: (id) =>
        protegido(async () =>
          daApi(await api.POST('/v1/importacao/lotes/{id}/desfazer', { params: { path: { id } } })),
        ),
      importarForaDoPerfil: (id, linhaIds) =>
        protegido(async () =>
          daApi(
            await api.POST('/v1/importacao/lotes/{id}/importar-fora-do-perfil', {
              params: { path: { id } },
              body: linhaIds ? { linhaIds } : {},
            }),
          ),
        ),
    },
  },

  funis: {
    listar: () =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/configuracoes/funis', {
            params: { query: { incluirInativos: 'true' } },
          }),
        ),
      ),
    criar: (dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/configuracoes/funis', {
            // o cliente gerado trata o que tem padrão como obrigatório: os padrões vão explícitos
            body: {
              nome: dados.nome,
              fases: dados.fases.map((f) => ({
                nome: f.nome,
                cor: f.cor ?? 'gray',
                probabilidadePadrao: f.probabilidadePadrao ?? 0,
                diasAlertaParada: f.diasAlertaParada ?? null,
              })),
            },
          }),
        ),
      ),
    alterar: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/configuracoes/funis/{id}', {
            params: { path: { id } },
            body: dados,
          }),
        ),
      ),
    excluir: (id) =>
      protegido(async () =>
        semCorpo(await api.DELETE('/v1/configuracoes/funis/{id}', { params: { path: { id } } })),
      ),
    reordenar: (ids) =>
      protegido(async () =>
        daApi(await api.PUT('/v1/configuracoes/funis/ordem', { body: { ids } })),
      ),
    criarFase: (funilId, dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/configuracoes/funis/{id}/fases', {
            params: { path: { id: funilId } },
            body: {
              nome: dados.nome,
              cor: dados.cor ?? 'gray',
              probabilidadePadrao: dados.probabilidadePadrao ?? 0,
              diasAlertaParada: dados.diasAlertaParada ?? null,
            },
          }),
        ),
      ),
    alterarFase: (faseId, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/configuracoes/funis/fases/{faseId}', {
            params: { path: { faseId } },
            body: dados,
          }),
        ),
      ),
    excluirFase: (faseId) =>
      protegido(async () =>
        daApi(
          await api.DELETE('/v1/configuracoes/funis/fases/{faseId}', {
            params: { path: { faseId } },
          }),
        ),
      ),
    reordenarFases: (funilId, ids) =>
      protegido(async () =>
        daApi(
          await api.PUT('/v1/configuracoes/funis/{id}/fases/ordem', {
            params: { path: { id: funilId } },
            body: { ids },
          }),
        ),
      ),
  },

  tags: {
    listar: () =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/configuracoes/tag-grupos', {
            params: { query: { incluirInativos: 'true' } },
          }),
        ),
      ),
    criarGrupo: (dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/configuracoes/tag-grupos', {
            // o cliente gerado trata o que tem padrão como obrigatório: o padrão é enviado explícito
            body: { ...dados, obrigatorio: dados.obrigatorio ?? false },
          }),
        ),
      ),
    alterarGrupo: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/configuracoes/tag-grupos/{id}', {
            params: { path: { id } },
            body: dados,
          }),
        ),
      ),
    excluirGrupo: (id) =>
      protegido(async () =>
        semCorpo(
          await api.DELETE('/v1/configuracoes/tag-grupos/{id}', { params: { path: { id } } }),
        ),
      ),
    reordenarGrupos: (ids) =>
      protegido(async () =>
        daApi(await api.PUT('/v1/configuracoes/tag-grupos/ordem', { body: { ids } })),
      ),
    criarTag: (dados) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/configuracoes/tags', {
            body: { ...dados, cor: dados.cor ?? 'gray' },
          }),
        ),
      ),
    alterarTag: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/configuracoes/tags/{id}', {
            params: { path: { id } },
            body: dados,
          }),
        ),
      ),
    excluirTag: (id) =>
      protegido(async () =>
        semCorpo(await api.DELETE('/v1/configuracoes/tags/{id}', { params: { path: { id } } })),
      ),
    reordenarTags: (grupoId, ids) =>
      protegido(async () =>
        daApi(
          await api.PUT('/v1/configuracoes/tag-grupos/{id}/tags/ordem', {
            params: { path: { id: grupoId } },
            body: { ids },
          }),
        ),
      ),
  },

  carteira: {
    listar: (consulta) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/carteira/empresas', {
            params: { query: consulta as never },
          }),
        ),
      ),
    contagens: (incluirLeads) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/carteira/empresas/contagens', {
            params: { query: { incluirLeads: incluirLeads ? 'true' : 'false' } },
          }),
        ),
      ),
    opcoes: () => protegido(async () => daApi(await api.GET('/v1/carteira/empresas/opcoes'))),
    consultarCnpj: (cnpj) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/receita/cnpj/{cnpj}', {
            params: { path: { cnpj }, query: { forcar: 'false' } },
          }),
        ),
      ),
    criar: (dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/carteira/empresas', { body: dados as never })),
      ),
    detalhar: (id) =>
      protegido(async () =>
        daApi(await api.GET('/v1/carteira/empresas/{id}', { params: { path: { id } } })),
      ),
    historico: (id, pagina) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/carteira/empresas/{id}/historico', {
            params: { path: { id }, query: { pagina, porPagina: 20 } },
          }),
        ),
      ),
    consultarReceitaDaEmpresa: (id) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/empresas/{id}/receita/consultar', {
            params: { path: { id } },
          }),
        ),
      ),
    aplicarReceitaDaEmpresa: (id) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/empresas/{id}/receita/aplicar', {
            params: { path: { id } },
            body: {},
          }),
        ),
      ),
    definirTags: (id, tagIds) =>
      protegido(async () =>
        daApi(
          await api.PUT('/v1/carteira/empresas/{id}/tags', {
            params: { path: { id } },
            body: { tagIds },
          }),
        ),
      ),
    alterar: (id, dados) =>
      protegido(async () =>
        daApi(
          await api.PATCH('/v1/carteira/empresas/{id}', {
            params: { path: { id } },
            body: dados as never,
          }),
        ),
      ),
    excluir: (id) =>
      protegido(async () =>
        semCorpo(await api.DELETE('/v1/carteira/empresas/{id}', { params: { path: { id } } })),
      ),
    aplicarTagEmMassa: (empresaIds, tagId) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/carteira/empresas/tags-em-massa', { body: { empresaIds, tagId } }),
        ),
      ),
  },
}
