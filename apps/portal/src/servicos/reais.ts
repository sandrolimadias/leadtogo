import { api } from '@/api/cliente'

import { erroDeRede, falha, ok, type Resultado, traduzirErro } from './resultado'
import type { ServicosDoPortal } from './tipos'

type RespostaApi<T> = { data?: T; error?: unknown; response: Response }

/** Executa uma chamada e transforma queda de rede em erro do portal, nunca em exceção solta. */
async function protegido<T>(chamada: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await chamada()
  } catch {
    return falha(erroDeRede())
  }
}

/** Resposta do openapi-fetch → Resultado. */
function daApi<T>(r: RespostaApi<T>): Resultado<T> {
  if (r.response.ok && r.data !== undefined) return ok(r.data)
  return falha(
    traduzirErro(r.response.status, r.error as { erro?: string; mensagem?: string } | null),
  )
}

/** Resposta sem corpo (204): sucesso se o status for 2xx. */
function semCorpo(r: RespostaApi<unknown>): Resultado {
  if (r.response.ok) return ok(undefined)
  return falha(
    traduzirErro(r.response.status, r.error as { erro?: string; mensagem?: string } | null),
  )
}

const chave = (id: string) => ({ params: { path: { id } } })

export const servicosReais: ServicosDoPortal = {
  entrada: {
    pedir: (email) =>
      protegido(async () => daApi(await api.POST('/v1/portal/entrada', { body: { email } }))),
    previa: (token) =>
      protegido(async () => daApi(await api.POST('/v1/portal/link/consulta', { body: { token } }))),
    consumir: (token, aceitaPrivacidade) =>
      protegido(async () =>
        daApi(await api.POST('/v1/portal/link/consumir', { body: { token, aceitaPrivacidade } })),
      ),
  },
  sessao: {
    atual: () => protegido(async () => daApi(await api.GET('/v1/portal/sessao'))),
    sair: () => protegido(async () => semCorpo(await api.POST('/v1/portal/sair'))),
    sessoes: () => protegido(async () => daApi(await api.GET('/v1/portal/sessoes'))),
    encerrar: (id) =>
      protegido(async () => semCorpo(await api.DELETE('/v1/portal/sessoes/{id}', chave(id)))),
    encerrarOutras: () =>
      protegido(async () => semCorpo(await api.POST('/v1/portal/sessoes/encerrar-outras'))),
    trocarEmail: (email) =>
      protegido(async () =>
        semCorpo(await api.POST('/v1/portal/email/troca', { body: { email } })),
      ),
    corrigirNome: (nome) =>
      protegido(async () => daApi(await api.PUT('/v1/portal/perfil', { body: { nome } }))),
  },
  segundoFator: {
    iniciar: () => protegido(async () => daApi(await api.POST('/v1/portal/2fa/iniciar'))),
    confirmar: (codigo) =>
      protegido(async () =>
        daApi(await api.POST('/v1/portal/2fa/confirmar', { body: { codigo } })),
      ),
    conferir: (codigo) =>
      protegido(async () =>
        semCorpo(await api.POST('/v1/portal/2fa/conferir', { body: { codigo } })),
      ),
    desativar: (codigo) =>
      protegido(async () =>
        semCorpo(await api.POST('/v1/portal/2fa/desativar', { body: { codigo } })),
      ),
  },
  inicio: () => protegido(async () => daApi(await api.GET('/v1/portal/inicio'))),
  areas: () => protegido(async () => daApi(await api.GET('/v1/portal/areas'))),
  chamados: {
    listar: (consulta) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/portal/chamados', {
            params: {
              query: {
                ...(consulta.aba ? { aba: consulta.aba } : {}),
                ...(consulta.busca ? { busca: consulta.busca } : {}),
                ...(consulta.pagina ? { pagina: consulta.pagina } : {}),
              },
            },
          }),
        ),
      ),
    obter: (id) =>
      protegido(async () => daApi(await api.GET('/v1/portal/chamados/{id}', chave(id)))),
    abrir: (dados) =>
      protegido(async () => daApi(await api.POST('/v1/portal/chamados', { body: dados }))),
    responder: (id, dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/portal/chamados/{id}/mensagens', { ...chave(id), body: dados })),
      ),
    reabrir: (id) =>
      protegido(async () => daApi(await api.POST('/v1/portal/chamados/{id}/reabrir', chave(id)))),
    avaliar: (id, dados) =>
      protegido(async () =>
        daApi(await api.POST('/v1/portal/chamados/{id}/avaliacao', { ...chave(id), body: dados })),
      ),
    anexar: (id, arquivo) =>
      protegido(async () => {
        const pedido = daApi(
          await api.POST('/v1/portal/chamados/{id}/anexos', {
            ...chave(id),
            body: {
              nome: arquivo.name,
              mime: arquivo.type || 'application/octet-stream',
              tamanho: arquivo.size,
            },
          }),
        )
        if (!pedido.ok) return pedido
        const envio = await fetch(pedido.dados.url, { method: 'PUT', body: arquivo })
        if (!envio.ok) {
          return falha({
            codigo: 'envio_falhou',
            mensagem: 'Não foi possível enviar o arquivo. Tente de novo.',
            status: envio.status,
          })
        }
        const confirmado = daApi(
          await api.POST('/v1/portal/chamados/{id}/anexos/{anexoId}/confirmar', {
            params: { path: { id, anexoId: pedido.dados.anexoId } },
          }),
        )
        if (!confirmado.ok) return confirmado
        return ok({ anexoId: pedido.dados.anexoId, nome: arquivo.name })
      }),
    baixar: (id, anexoId) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/portal/chamados/{id}/anexos/{anexoId}/download', {
            params: { path: { id, anexoId } },
          }),
        ),
      ),
  },
  notificacoes: {
    listar: (apenasNaoLidas) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/portal/notificacoes', {
            params: { query: { somenteNaoLidas: apenasNaoLidas ? 'true' : 'false' } },
          }),
        ),
      ),
    marcarLida: (id) =>
      protegido(async () => daApi(await api.POST('/v1/portal/notificacoes/{id}/lida', chave(id)))),
    marcarTodas: () =>
      protegido(async () => daApi(await api.POST('/v1/portal/notificacoes/lidas'))),
  },
  eventos: {
    listar: (aba, pagina) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/portal/eventos', {
            params: { query: { aba, ...(pagina ? { pagina } : {}) } },
          }),
        ),
      ),
    proximos: () => protegido(async () => daApi(await api.GET('/v1/portal/eventos/proximos'))),
    confirmar: (id) =>
      protegido(async () =>
        daApi(await api.POST('/v1/portal/eventos/{id}/confirmacao', chave(id))),
      ),
    cancelar: (id) =>
      protegido(async () =>
        daApi(await api.DELETE('/v1/portal/eventos/{id}/confirmacao', chave(id))),
      ),
  },
  documentos: {
    listar: (consulta) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/portal/documentos', {
            params: {
              query: {
                ...(consulta.busca ? { busca: consulta.busca } : {}),
                ...(consulta.pagina ? { pagina: consulta.pagina } : {}),
              },
            },
          }),
        ),
      ),
    baixar: (id) =>
      protegido(async () =>
        daApi(await api.POST('/v1/portal/documentos/{id}/download', chave(id))),
      ),
  },
  publicacoes: {
    feed: (pagina) =>
      protegido(async () =>
        daApi(
          await api.GET('/v1/portal/publicacoes', {
            params: { query: { ...(pagina ? { pagina } : {}) } },
          }),
        ),
      ),
    comentarios: (id) =>
      protegido(async () =>
        daApi(await api.GET('/v1/portal/publicacoes/{id}/comentarios', chave(id))),
      ),
    comentar: (id, corpo) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/portal/publicacoes/{id}/comentarios', {
            ...chave(id),
            body: { corpo },
          }),
        ),
      ),
    reagir: (id, tipo) =>
      protegido(async () =>
        daApi(
          await api.POST('/v1/portal/publicacoes/{id}/reacoes', { ...chave(id), body: { tipo } }),
        ),
      ),
    denunciar: (comentarioId, motivo) =>
      protegido(async () =>
        semCorpo(
          await api.POST('/v1/portal/publicacoes/comentarios/{comentarioId}/denuncia', {
            params: { path: { comentarioId } },
            body: { motivo },
          }),
        ),
      ),
    marcarLidas: (ids) =>
      protegido(async () =>
        daApi(await api.POST('/v1/portal/publicacoes/leituras', { body: { ids } })),
      ),
  },
  pedidos: {
    listar: () => protegido(async () => daApi(await api.GET('/v1/portal/pedidos-de-acesso'))),
    pedir: (dados) =>
      protegido(async () =>
        semCorpo(await api.POST('/v1/portal/pedidos-de-acesso', { body: dados })),
      ),
  },
}
