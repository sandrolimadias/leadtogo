import type { ErroDaApi } from '@leadtogo/api-client'

import { api } from '@/api/cliente'

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
      r.error ? { erro: r.error.erro, mensagem: r.error.mensagem } : null,
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
  seguranca: () => protegido(async () => daApi(await api.GET('/v1/configuracoes/seguranca'))),
  alterarPoliticaDeDoisFatores: (politica) =>
    protegido(async () =>
      daApi(
        await api.PATCH('/v1/configuracoes/seguranca', {
          body: { doisFatoresExigido: politica },
        }),
      ),
    ),

  cadastros: {
    verticais: cadastroReal('verticais'),
    solucoes: cadastroReal('solucoes'),
    origens: cadastroReal('origens'),
    motivos: cadastroReal('motivos'),
    tiposAtividade: cadastroReal('tipos-atividade'),
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
}
