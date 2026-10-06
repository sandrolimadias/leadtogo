import type { Server } from 'node:http'

import {
  Body,
  Controller,
  Get,
  type INestApplication,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { ErroApi } from './erro-api.js'
import type { RespostaDeErro } from './filtro-excecoes.js'
import { ZodPipe } from './zod.pipe.js'

const esquemaCadastro = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  idade: z.coerce.number().int().min(18).optional(),
})

@Controller('teste-http')
class RotasDeTeste {
  @Post('validado')
  validado(@Body(new ZodPipe(esquemaCadastro)) corpo: z.infer<typeof esquemaCadastro>) {
    return corpo
  }

  @Get('negocio')
  negocio(): never {
    throw new ErroApi('2fa_obrigatorio', 'Ative o 2FA para continuar.', 403)
  }

  @Get('inexistente')
  inexistente(): never {
    throw new NotFoundException('Empresa não encontrada.')
  }

  @Get('explode')
  explode(): never {
    throw new Error('FALHA INTERNA: select * from tabela_secreta falhou na linha 42')
  }

  @Get('explode-http')
  explodeHttp(): never {
    throw new InternalServerErrorException('detalhe interno que não pode vazar')
  }

  @Post('eco')
  eco(@Body() corpo: unknown) {
    return { corpo }
  }
}

// Simula a rota do Better Auth: o corpo tem que chegar intacto, sem o parser do Nest ter lido
@Controller('auth')
class RotaDeAuthDeTeste {
  @Post('corpo-cru')
  async corpoCru(@Req() req: Request) {
    const pedacos: Buffer[] = []
    for await (const pedaco of req) pedacos.push(Buffer.from(pedaco as Uint8Array))
    return { recebido: Buffer.concat(pedacos).toString('utf8'), bodyJaLido: req.body !== undefined }
  }
}

describe('Helmet, CORS, parser e filtro de erros', () => {
  let app: INestApplication<Server>
  const erroDe = (r: request.Response) => r.body as RespostaDeErro
  const config = configuracaoDeTeste({ APP_URL: 'https://crm.aledias.com.br' })
  const origemPermitida = 'https://crm.aledias.com.br'

  beforeAll(async () => {
    app = await criarAppComRotas([RotasDeTeste, RotaDeAuthDeTeste], config)
  })
  afterAll(() => app.close())

  describe('Helmet', () => {
    it('envia os cabeçalhos de segurança e não anuncia o framework', async () => {
      const r = await request(app.getHttpServer()).get('/health')
      expect(r.headers['x-content-type-options']).toBe('nosniff')
      expect(r.headers['strict-transport-security']).toBeDefined()
      expect(r.headers['cross-origin-resource-policy']).toBe('same-site')
      expect(r.headers['x-powered-by']).toBeUndefined()
    })
  })

  describe('CORS', () => {
    it('libera só o front (APP_URL), com credenciais, e expõe o x-request-id', async () => {
      const r = await request(app.getHttpServer()).get('/health').set('Origin', origemPermitida)
      expect(r.headers['access-control-allow-origin']).toBe(origemPermitida)
      expect(r.headers['access-control-allow-credentials']).toBe('true')
      expect(r.headers['access-control-expose-headers']).toContain('X-Request-Id')
    })

    it('não devolve cabeçalho CORS para outra origem', async () => {
      for (const origem of [
        'https://malicioso.example',
        'http://crm.aledias.com.br',
        'https://crm.aledias.com.br.evil.com',
        'null',
      ]) {
        const r = await request(app.getHttpServer()).get('/health').set('Origin', origem)
        expect(r.headers['access-control-allow-origin'], origem).toBeUndefined()
      }
    })

    it('responde o preflight para o front e nega para outra origem', async () => {
      const ok = await request(app.getHttpServer())
        .options('/v1/teste-http/validado')
        .set('Origin', origemPermitida)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type')
      expect(ok.status).toBe(204)
      expect(ok.headers['access-control-allow-methods']).toContain('POST')
      expect(ok.headers['access-control-allow-origin']).toBe(origemPermitida)

      const negado = await request(app.getHttpServer())
        .options('/v1/teste-http/validado')
        .set('Origin', 'https://malicioso.example')
        .set('Access-Control-Request-Method', 'POST')
      expect(negado.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('filtro de erros padronizado', () => {
    it('404 de rota inexistente no formato padrão, com request_id', async () => {
      const r = await request(app.getHttpServer()).get('/v1/nao-existe').expect(404)
      expect(erroDe(r)).toMatchObject({ statusCode: 404, erro: 'nao_encontrado' })
      expect(typeof erroDe(r).mensagem).toBe('string')
      expect(erroDe(r).request_id).toBe(r.headers['x-request-id'])
    })

    it('HttpException comum vira código por status', async () => {
      const r = await request(app.getHttpServer()).get('/v1/teste-http/inexistente').expect(404)
      expect(r.body).toMatchObject({
        statusCode: 404,
        erro: 'nao_encontrado',
        mensagem: 'Empresa não encontrada.',
      })
    })

    it('erro de negócio leva o código estável', async () => {
      const r = await request(app.getHttpServer()).get('/v1/teste-http/negocio').expect(403)
      expect(r.body).toMatchObject({
        statusCode: 403,
        erro: '2fa_obrigatorio',
        mensagem: 'Ative o 2FA para continuar.',
      })
    })

    it('validação Zod: 400 validacao_invalida com os campos', async () => {
      const r = await request(app.getHttpServer())
        .post('/v1/teste-http/validado')
        .send({ nome: 'A', email: 'não-é-email', idade: 10 })
        .expect(400)
      expect(r.body).toMatchObject({ statusCode: 400, erro: 'validacao_invalida' })
      expect((erroDe(r).detalhes ?? []).map((d) => d.campo).sort()).toEqual([
        'email',
        'idade',
        'nome',
      ])
    })

    it('validação Zod: aceita e converte o corpo válido', async () => {
      const r = await request(app.getHttpServer())
        .post('/v1/teste-http/validado')
        .send({ nome: 'Ana', email: 'ana@exemplo.com', idade: '30' })
        .expect(201)
      expect(r.body).toEqual({ nome: 'Ana', email: 'ana@exemplo.com', idade: 30 })
    })

    it('500: mensagem genérica, sem stack, SQL nem detalhe interno', async () => {
      for (const rota of ['explode', 'explode-http']) {
        const r = await request(app.getHttpServer()).get(`/v1/teste-http/${rota}`).expect(500)
        expect(r.body).toMatchObject({ statusCode: 500, erro: 'erro_interno' })
        const texto = JSON.stringify(r.body)
        for (const proibido of [
          'tabela_secreta',
          'FALHA INTERNA',
          'detalhe interno',
          'at ',
          '.ts',
        ]) {
          expect(texto, rota).not.toContain(proibido)
        }
        expect(erroDe(r).request_id).toBeDefined()
      }
    })

    it('JSON malformado: 400 corpo_invalido; corpo grande demais: 413', async () => {
      const malformado = await request(app.getHttpServer())
        .post('/v1/teste-http/eco')
        .set('Content-Type', 'application/json')
        .send('{"quebrado": ')
        .expect(400)
      expect(malformado.body).toMatchObject({ statusCode: 400, erro: 'corpo_invalido' })

      const grande = await request(app.getHttpServer())
        .post('/v1/teste-http/eco')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ x: 'a'.repeat(1_200_000) }))
        .expect(413)
      expect(grande.body).toMatchObject({ statusCode: 413, erro: 'corpo_grande_demais' })
    })
  })

  describe('parser de corpo e o Better Auth', () => {
    it('lê o JSON das rotas normais', async () => {
      const r = await request(app.getHttpServer())
        .post('/v1/teste-http/eco')
        .send({ a: 1 })
        .expect(201)
      expect(r.body).toEqual({ corpo: { a: 1 } })
    })

    it('NÃO consome o corpo de /v1/auth/*: a rota recebe o stream intacto', async () => {
      const r = await request(app.getHttpServer())
        .post('/v1/auth/corpo-cru')
        .set('Content-Type', 'application/json')
        .send({ email: 'ana@exemplo.com', senha: 'x' })
        .expect(201)
      expect(r.body).toEqual({
        recebido: '{"email":"ana@exemplo.com","senha":"x"}',
        bodyJaLido: false,
      })
    })
  })
})
