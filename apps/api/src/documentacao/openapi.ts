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
  documento.paths = Object.fromEntries(
    Object.entries(documento.paths).sort(([a], [b]) => a.localeCompare(b)),
  )
  return documento
}
