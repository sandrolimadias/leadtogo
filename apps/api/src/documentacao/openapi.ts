import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'

import { componentesRegistrados } from './documenta.js'
import { listarRotas } from './rotas.js'

const NOME_DO_COOKIE = 'leadtogo.session_token'
const NOME_DO_COOKIE_DO_PORTAL = '__Host-portal'

/** Cabeçalho do documento. As rotas /v1/auth/* são do Better Auth e não entram na lista (ver descrição). */
export function montarDocumento(app: INestApplication, versao: string): OpenAPIObject {
  const configuracao = new DocumentBuilder()
    .setTitle('Leadtogo API')
    .setDescription(
      [
        'API REST do Leadtogo (CRM multiempresa de gestão de carteira).',
        '',
        '**Autenticação.** Cookie de sessão `HttpOnly` emitido pela própria API (`' +
          NOME_DO_COOKIE +
          '`, com o prefixo `__Secure-` em produção); chame sempre com `credentials: "include"`.',
        'Login, logout, sessão, 2FA, recuperação de senha e verificação de e-mail são servidos pelo **Better Auth** em `/v1/auth/*`: use o cliente dele (`better-auth/client`) para essas rotas; elas não aparecem abaixo.',
        '',
        '**Portal do cliente.** As rotas `/v1/portal/*` (tag "Portal do cliente") usam outro cookie, `' +
          NOME_DO_COOKIE_DO_PORTAL +
          '` (`portal_dev` fora de produção), emitido por `POST /v1/portal/link/consumir`; a sessão do CRM não vale nelas e a do portal não vale no CRM. Toda alteração exige o cabeçalho `Origin` do portal.',
        '',
        '**Empresa ativa.** Quase toda rota exige uma empresa ativa na sessão (`POST /v1/sessao/empresa-ativa`); a empresa nunca vem do cliente por cabeçalho, query ou corpo.',
        '',
        '**Erros.** Todos usam o schema `Erro`; trate pelo código estável em `erro`, não pela mensagem.',
      ].join('\n'),
    )
    .setVersion(versao)
    .addCookieAuth(NOME_DO_COOKIE, { type: 'apiKey', in: 'cookie', name: NOME_DO_COOKIE }, 'sessao')
    .addCookieAuth(
      NOME_DO_COOKIE_DO_PORTAL,
      { type: 'apiKey', in: 'cookie', name: NOME_DO_COOKIE_DO_PORTAL },
      'sessaoPortal',
    )
    .addSecurityRequirements('sessao')
    .addTag('Saúde', 'Verificação de saúde do deploy')
    .addTag('Primeiro acesso', 'Criação da primeira conta (pode estar fechada em produção)')
    .addTag('Usuário', 'Quem sou eu, empresa ativa e preferências')
    .addTag('Equipe e convites', 'Membros da empresa ativa e convites')
    .build()
  const documento = SwaggerModule.createDocument(app, configuracao)

  // Schemas nomeados dos decorators @Documenta, em ordem alfabética (arquivo estável no git)
  const nomeados = componentesRegistrados()
  documento.components = documento.components ?? {}
  documento.components.schemas = Object.fromEntries(
    Object.entries({ ...(documento.components.schemas ?? {}), ...nomeados }).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  )

  // Rotas públicas não pedem o cookie de sessão; as do portal pedem o cookie do portal
  const rotas = listarRotas(app)
  const publicas = new Set(
    rotas.filter((r) => r.publica).map((r) => `${r.metodo} ${r.caminhoOpenApi}`),
  )
  const doPortal = new Set(
    rotas.filter((r) => r.portal && !r.publica).map((r) => `${r.metodo} ${r.caminhoOpenApi}`),
  )
  for (const [caminho, operacoes] of Object.entries(documento.paths)) {
    for (const [metodo, operacao] of Object.entries(
      operacoes as Record<string, { security?: unknown[] }>,
    )) {
      if (publicas.has(`${metodo} ${caminho}`)) operacao.security = []
      else if (doPortal.has(`${metodo} ${caminho}`)) operacao.security = [{ sessaoPortal: [] }]
    }
  }
  // A API pública tem documento próprio (montarDocumentoPublico): fica fora deste
  documento.paths = Object.fromEntries(
    Object.entries(documento.paths)
      .filter(([caminho]) => !caminho.startsWith(PREFIXO_PUBLICO))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  // Os schemas da API pública (`PublicaEmpresa`...) também ficam só no documento dela
  documento.components.schemas = Object.fromEntries(
    Object.entries(documento.components.schemas).filter(([nome]) => !/^Publica[A-Z]/.test(nome)),
  )
  documento.tags = (documento.tags ?? []).filter((t) => !t.name.startsWith('API pública'))
  return documento
}

/** Prefixo das rotas da API pública (`@ApiPublica`, docs/plano_api_aberta.md). */
export const PREFIXO_PUBLICO = '/v1/publica'

/** Os componentes que o documento usa, direta ou indiretamente (os da outra API ficam de fora). */
function apenasReferenciados(
  documento: OpenAPIObject,
  todos: Record<string, unknown> = {},
): Record<string, unknown> {
  const usados = new Set<string>()
  const visitar = (valor: unknown) => {
    for (const m of JSON.stringify(valor).matchAll(/#\/components\/schemas\/([^"]+)/g)) {
      const nome = m[1] ?? ''
      if (usados.has(nome)) continue
      usados.add(nome)
      visitar(todos[nome])
    }
  }
  visitar(documento.paths)
  return Object.fromEntries(Object.entries(todos).filter(([nome]) => usados.has(nome)))
}

/**
 * O documento da API pública (`/v1/publica/*`): só as rotas públicas, autenticação por chave de API (Bearer), aberto
 * em produção em `/v1/publica/openapi.json` e `/v1/publica/docs`. O retrato versionado fica em
 * docs/api/publica-v1.openapi.json e o CI confere que está em dia e que a mudança foi só aditiva.
 */
export function montarDocumentoPublico(app: INestApplication): OpenAPIObject {
  const configuracao = new DocumentBuilder()
    .setTitle('Leadtogo — API pública')
    .setDescription(
      [
        'API para integrações (n8n, ERPs, site). Contrato estável: dentro da v1 só entram mudanças **aditivas**.',
        '',
        '**Autenticação.** Chave de API da empresa, criada em Configurações → Integrações, no cabeçalho `Authorization: Bearer ltg_live_…` (nunca na URL). A chave age com as permissões dela em todas as carteiras; o que ela faz aparece no histórico como "Integração: nome da chave".',
        '',
        '**Limites.** 120 requisições por minuto e 20.000 por dia por chave (cabeçalhos `X-RateLimit-*`; 429 com `Retry-After`). Corpo de até 1 MB; lotes de até 500 itens.',
        '',
        '**Convenções.** Campos em português e `snake_case`; datas em ISO 8601 com fuso; dinheiro como string decimal (`"350.00"`); tags pela `chave_sistema` (ou pelo id), nunca pelo nome. Listas paginadas por cursor: `limite` e `cursor` (o `proximo_cursor` da página anterior); `atualizado_desde` para sincronizar.',
        '',
        '**Idempotência.** Os POST aceitam `Idempotency-Key`: repetir a mesma chave com o mesmo corpo devolve a mesma resposta por 24 h (`Idempotent-Replayed: true`); com outro corpo, 409.',
        '',
        '**Erros.** Formato `Erro`; trate pelo código estável em `erro` (`chave_invalida`, `escopo_insuficiente`, `responsavel_obrigatorio`...), não pela mensagem.',
      ].join('\n'),
    )
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'ltg_live_…' }, 'chaveApi')
    .addSecurityRequirements('chaveApi')
    .build()
  const documento = SwaggerModule.createDocument(app, configuracao)
  documento.components = documento.components ?? {}
  const todos = { ...(documento.components.schemas ?? {}), ...componentesRegistrados() }
  documento.paths = Object.fromEntries(
    Object.entries(documento.paths)
      .filter(([caminho]) => caminho.startsWith(PREFIXO_PUBLICO))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  documento.components.schemas = Object.fromEntries(
    Object.entries(apenasReferenciados(documento, todos)).sort(([a], [b]) => a.localeCompare(b)),
  ) as NonNullable<OpenAPIObject['components']>['schemas']
  documento.tags = [
    ...new Set(
      Object.values(documento.paths).flatMap((ops) =>
        Object.values(ops as Record<string, { tags?: string[] }>).flatMap((o) => o.tags ?? []),
      ),
    ),
  ]
    .sort()
    .map((name) => ({ name, description: '' }))
  return documento
}

/** Serve o documento da API pública (aberto também em produção: só descreve o que é público). */
export function servirDocumentacaoPublica(app: INestApplication): void {
  SwaggerModule.setup('v1/publica/docs', app, () => montarDocumentoPublico(app), {
    jsonDocumentUrl: 'v1/publica/openapi.json',
    yamlDocumentUrl: 'v1/publica/openapi.yaml',
    customSiteTitle: 'Leadtogo — API pública',
  })
}
