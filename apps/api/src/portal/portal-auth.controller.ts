import { sql } from '@leadtogo/db'
import {
  type CodigoDeSegundoFatorEntrada,
  codigoDeSegundoFatorSchema,
  type ConsumirLinkEntrada,
  consumirLinkSchema,
  consultaDoLinkSchema,
  type EntrarComCodigoEntrada,
  entrarComCodigoSchema,
  iniciarSegundoFatorRespostaSchema,
  listaDeEmpresasDoAcessoSchema,
  listaDeSessoesSchema,
  MENSAGEM_DE_ENTRADA_ENVIADA,
  type PedirEntradaEntrada,
  pedirEntradaSchema,
  type PerfilDoPortalEntrada,
  perfilDoPortalSchema,
  previaDoLinkSchema,
  respostaDePedirEntradaSchema,
  segundoFatorConfirmadoSchema,
  type SessaoDoPortal,
  sessaoDoPortalSchema,
  type TrocarEmailEntrada,
  trocarEmailSchema,
  type TrocarEmpresaEntrada,
  trocarEmpresaSchema,
  VALIDADE_DA_SESSAO_DIAS,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { Documenta } from '../documentacao/documenta.js'
import { ErroApi } from '../http/erro-api.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'
import { sessaoDoPortalDe } from './portal-dto.js'
import { PortalEntradaService } from './portal-entrada.service.js'
import { PortalSegundoFatorService } from './portal-segundo-fator.service.js'
import { PortalSessaoService } from './portal-sessao.service.js'
import { nomeDoCookieDoPortal } from './portal-token.js'
import { PortalPermiteSem2fa, PortalPublica, RotaDoPortal } from './portal.decorators.js'

@ApiTags('Portal do cliente: acesso')
@RotaDoPortal()
@Controller('portal')
export class PortalAuthController {
  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    private readonly ctx: ContextoTenantService,
    private readonly entrada: PortalEntradaService,
    private readonly sessoes: PortalSessaoService,
    private readonly segundoFator: PortalSegundoFatorService,
  ) {}

  private opcoesDoCookie() {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }
  }

  // ------------------------------------------------------------------------------------ sem sessão

  @Documenta({
    resumo: 'Pedir o código de entrada',
    descricao:
      'Público. Envia ao e-mail um código de 6 dígitos, de uso único, válido por 10 minutos (um por CRM, mesmo que o e-mail acesse várias empresas-clientes). A resposta é SEMPRE a mesma, tenha o e-mail acesso ao portal ou não. Limite por IP e por e-mail. Pedir de novo invalida o código anterior.',
    corpo: pedirEntradaSchema,
    resposta: respostaDePedirEntradaSchema,
    status: 202,
    erros: [400, 403, 429, 503],
  })
  @PortalPublica()
  @Post('entrada')
  @HttpCode(202)
  @Limite({ nome: 'portal-entrada', max: 20, janelaS: 3600, falhaFechada: true })
  pedirEntrada(
    @Body(new ZodPipe(pedirEntradaSchema)) dados: PedirEntradaEntrada,
    @Req() req: Request,
  ): { mensagem: string } {
    this.entrada.pedirEntrada(dados.email, req.ip)
    return { mensagem: MENSAGEM_DE_ENTRADA_ENVIADA }
  }

  @Documenta({
    resumo: 'Entrar com o código',
    descricao:
      'Público. Confere o código de 6 dígitos (uso único, 10 minutos; 5 erros queimam o código) e abre a sessão no cookie `HttpOnly`, no acesso usado por último. Quem acessa mais de uma empresa-cliente escolhe depois em `/portal/empresas`. Código errado ou vencido: 401 `codigo_invalido`. No primeiro acesso exige `aceitaPrivacidade: true` (422 `privacidade_obrigatoria`, sem gastar o código).',
    corpo: entrarComCodigoSchema,
    resposta: sessaoDoPortalSchema,
    erros: [400, 401, 403, 422, 429, 503],
  })
  @PortalPublica()
  @Post('entrada/codigo')
  @HttpCode(200)
  @Limite({ nome: 'portal-entrada-codigo', max: 30, janelaS: 3600, falhaFechada: true })
  async entrarComCodigo(
    @Body(new ZodPipe(entrarComCodigoSchema)) dados: EntrarComCodigoEntrada,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessaoDoPortal> {
    this.entrada.conferirPortal()
    const r = await this.entrada.entrarComCodigo(
      dados.email,
      dados.codigo,
      dados.aceitaPrivacidade,
      req.ip,
      req.headers['user-agent'],
    )
    this.gravarCookie(res, r.cookie)
    return sessaoDoPortalDe(r.portal)
  }

  @Documenta({
    resumo: 'Conferir um link',
    descricao:
      'Público. Mostra o que a página de confirmação exibe (portal, empresa, finalidade e se pede o aceite de privacidade). NÃO consome o link: só o POST de `/portal/link/consumir` o faz, para os verificadores de e-mail não queimarem o link.',
    corpo: consultaDoLinkSchema,
    resposta: previaDoLinkSchema,
    erros: [400, 403, 404, 429, 503],
  })
  @PortalPublica()
  @Post('link/consulta')
  @HttpCode(200)
  @Limite({ nome: 'portal-link-consulta', max: 60, janelaS: 3600 })
  consultarLink(@Body(new ZodPipe(consultaDoLinkSchema)) dados: { token: string }) {
    return this.entrada.previa(dados.token)
  }

  @Documenta({
    resumo: 'Confirmar o link e entrar',
    descricao:
      'Público. Consome o link (uso único) e abre a sessão do portal no cookie `HttpOnly` (30 dias deslizantes, no máximo 90). O convite ativa o acesso; a troca de e-mail grava o endereço novo. No primeiro acesso exige `aceitaPrivacidade: true` (422 `privacidade_obrigatoria`).',
    corpo: consumirLinkSchema,
    resposta: sessaoDoPortalSchema,
    erros: [400, 403, 404, 409, 422, 429, 503],
  })
  @PortalPublica()
  @Post('link/consumir')
  @HttpCode(200)
  @Limite({ nome: 'portal-link-consumir', max: 30, janelaS: 3600 })
  async consumirLink(
    @Body(new ZodPipe(consumirLinkSchema)) dados: ConsumirLinkEntrada,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessaoDoPortal> {
    const r = await this.entrada.consumir(
      dados.token,
      dados.aceitaPrivacidade,
      req.ip,
      req.headers['user-agent'],
    )
    this.gravarCookie(res, r.cookie)
    return sessaoDoPortalDe(r.portal)
  }

  private gravarCookie(res: Response, token: string): void {
    res.cookie(nomeDoCookieDoPortal(this.config), token, {
      ...this.opcoesDoCookie(),
      maxAge: VALIDADE_DA_SESSAO_DIAS * 86_400_000,
    })
  }

  // ------------------------------------------------------------------------------------- com sessão

  @Documenta({
    resumo: 'Sessão atual do portal',
    descricao:
      'Quem está logado no portal, a empresa-cliente e o estado do 2FA. Funciona mesmo com o 2FA pendente (para a tela saber o que pedir).',
    resposta: sessaoDoPortalSchema,
    erros: [401, 403, 503],
  })
  @PortalPermiteSem2fa()
  @Get('sessao')
  sessao(): SessaoDoPortal {
    return sessaoDoPortalDe(this.ctx.portal)
  }

  @Documenta({
    resumo: 'Minhas empresas',
    descricao:
      'As empresas-clientes que o mesmo e-mail acessa neste portal (acessos ativos), com a atual marcada. Com mais de uma, a tela oferece a troca.',
    resposta: listaDeEmpresasDoAcessoSchema,
    erros: [401, 403, 503],
  })
  @Get('empresas')
  async empresas() {
    return { itens: await this.entrada.empresasDoEmail(this.ctx.portal) }
  }

  @Documenta({
    resumo: 'Trocar de empresa',
    descricao:
      'Passa para outra empresa-cliente do mesmo e-mail sem pedir outro código: abre uma sessão no acesso escolhido (novo cookie) e encerra a atual. Acesso de outro e-mail, revogado ou suspenso: 404 `empresa_indisponivel`; a mesma empresa: 409.',
    corpo: trocarEmpresaSchema,
    resposta: sessaoDoPortalSchema,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Post('empresas/trocar')
  @HttpCode(200)
  @Limite({ nome: 'portal-trocar-empresa', max: 60, janelaS: 3600 })
  async trocarEmpresa(
    @Body(new ZodPipe(trocarEmpresaSchema)) dados: TrocarEmpresaEntrada,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessaoDoPortal> {
    const r = await this.entrada.trocarEmpresa(
      this.ctx.portal,
      dados.acessoId,
      req.ip,
      req.headers['user-agent'],
    )
    this.gravarCookie(res, r.cookie)
    return sessaoDoPortalDe(r.portal)
  }

  @Documenta({
    resumo: 'Sair do portal',
    descricao: 'Revoga a sessão atual e apaga o cookie.',
    status: 204,
    erros: [401, 503],
  })
  @PortalPermiteSem2fa()
  @Post('sair')
  @HttpCode(204)
  async sair(@Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessoes.revogar(this.ctx.db(), this.ctx.portal.acessoId, this.ctx.portal.sessaoId)
    res.clearCookie(nomeDoCookieDoPortal(this.config), this.opcoesDoCookie())
  }

  @Documenta({
    resumo: 'Sessões abertas',
    descricao: 'Os dispositivos com sessão aberta neste acesso. A atual vem marcada.',
    resposta: listaDeSessoesSchema,
    erros: [401, 403, 503],
  })
  @Get('sessoes')
  async listarSessoes() {
    const p = this.ctx.portal
    return { itens: await this.sessoes.listar(this.ctx.db(), p.acessoId, p.sessaoId) }
  }

  @Documenta({
    resumo: 'Encerrar uma sessão',
    descricao:
      'Revoga uma das sessões do próprio acesso. Sessão de outra pessoa ou inexistente dá 404.',
    status: 204,
    erros: [400, 401, 403, 404, 503],
  })
  @Delete('sessoes/:id')
  @HttpCode(204)
  async encerrarSessao(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const ok = await this.sessoes.revogar(this.ctx.db(), this.ctx.portal.acessoId, id)
    if (!ok) throw new ErroApi('sessao_nao_encontrada', 'Sessão não encontrada.', 404)
  }

  @Documenta({
    resumo: 'Sair em todos os outros dispositivos',
    descricao: 'Revoga todas as sessões do acesso, menos a atual.',
    status: 204,
    erros: [401, 403, 503],
  })
  @Post('sessoes/encerrar-outras')
  @HttpCode(204)
  async encerrarOutras(): Promise<void> {
    await this.sessoes.revogarTodas(
      this.ctx.db(),
      this.ctx.portal.acessoId,
      this.ctx.portal.sessaoId,
    )
  }

  // ------------------------------------------------------------------------------------------- 2FA

  @Documenta({
    resumo: 'Começar a ligar o 2FA',
    descricao:
      'Gera o segredo do aplicativo autenticador (e a URI do QR code). O 2FA só passa a valer depois de `/portal/2fa/confirmar`.',
    resposta: iniciarSegundoFatorRespostaSchema,
    status: 200,
    erros: [401, 403, 409, 503],
  })
  @PortalPermiteSem2fa()
  @Post('2fa/iniciar')
  @HttpCode(200)
  @Limite({ nome: 'portal-2fa-iniciar', max: 20, janelaS: 3600 })
  iniciarSegundoFator() {
    return this.segundoFator.iniciar()
  }

  @Documenta({
    resumo: 'Confirmar o 2FA',
    descricao:
      'Confere o primeiro código do aplicativo, liga o 2FA e devolve os códigos de recuperação (uso único; só aparecem agora).',
    corpo: codigoDeSegundoFatorSchema,
    resposta: segundoFatorConfirmadoSchema,
    erros: [400, 401, 403, 409, 422, 429, 503],
  })
  @PortalPermiteSem2fa()
  @Post('2fa/confirmar')
  @HttpCode(200)
  @Limite({ nome: 'portal-2fa', max: 30, janelaS: 900 })
  async confirmarSegundoFator(
    @Body(new ZodPipe(codigoDeSegundoFatorSchema)) dados: CodigoDeSegundoFatorEntrada,
  ) {
    return { codigosDeRecuperacao: await this.segundoFator.confirmar(dados.codigo) }
  }

  @Documenta({
    resumo: 'Conferir o 2FA desta sessão',
    descricao:
      'Código do aplicativo ou código de recuperação (que se gasta). Libera as rotas do portal nesta sessão. Limite de tentativas por acesso.',
    corpo: codigoDeSegundoFatorSchema,
    status: 204,
    erros: [400, 401, 403, 409, 422, 429, 503],
  })
  @PortalPermiteSem2fa()
  @Post('2fa/conferir')
  @HttpCode(204)
  @Limite({ nome: 'portal-2fa', max: 30, janelaS: 900 })
  async conferirSegundoFator(
    @Body(new ZodPipe(codigoDeSegundoFatorSchema)) dados: CodigoDeSegundoFatorEntrada,
  ): Promise<void> {
    await this.segundoFator.conferir(dados.codigo)
  }

  @Documenta({
    resumo: 'Desligar o 2FA',
    descricao:
      'Pede um código válido. O Responsável de uma empresa que exige o 2FA não pode desligar (409 `segundo_fator_obrigatorio`).',
    corpo: codigoDeSegundoFatorSchema,
    status: 204,
    erros: [400, 401, 403, 409, 422, 429, 503],
  })
  @Post('2fa/desativar')
  @HttpCode(204)
  @Limite({ nome: 'portal-2fa', max: 30, janelaS: 900 })
  async desativarSegundoFator(
    @Body(new ZodPipe(codigoDeSegundoFatorSchema)) dados: CodigoDeSegundoFatorEntrada,
  ): Promise<void> {
    await this.segundoFator.desativar(dados.codigo)
  }

  // ----------------------------------------------------------------------------- e-mail e perfil

  @Documenta({
    resumo: 'Pedir a troca do e-mail de entrada (desligado)',
    descricao:
      'Fase 4A: o e-mail e o telefone do cliente ficam travados; só a equipe altera, pela ficha do contato. Responde sempre 403 `email_travado` (a rota sai na contração).',
    corpo: trocarEmailSchema,
    status: 202,
    erros: [400, 401, 403],
  })
  @Post('email/troca')
  @HttpCode(202)
  trocarEmail(@Body(new ZodPipe(trocarEmailSchema)) _dados: TrocarEmailEntrada): void {
    throw new ErroApi(
      'email_travado',
      'O e-mail de acesso só pode ser alterado pela equipe. Fale com ela por um chamado.',
      403,
    )
  }

  @Documenta({
    resumo: 'Corrigir o próprio nome e cargo',
    descricao:
      'O cliente altera o próprio nome e o cargo na empresa da sessão (`cargo` ausente não muda; nulo apaga). E-mail, telefone e o vínculo com a empresa são da equipe.',
    corpo: perfilDoPortalSchema,
    resposta: sessaoDoPortalSchema,
    erros: [400, 401, 403, 503],
  })
  @Put('perfil')
  async perfil(
    @Body(new ZodPipe(perfilDoPortalSchema)) dados: PerfilDoPortalEntrada,
    @Req() req: Request,
  ): Promise<SessaoDoPortal> {
    const p = this.ctx.portal
    await this.ctx.db().execute(sql`
      UPDATE contatos SET nome = ${dados.nome}, atualizado_em = now() WHERE id = ${p.contatoId}`)
    if (dados.cargo !== undefined) {
      // O gatilho do banco garante que, pela sessão do portal, só o cargo muda nesta linha
      await this.ctx.db().execute(sql`
        UPDATE empresa_contatos SET cargo = ${dados.cargo || null}, atualizado_em = now()
        WHERE contato_id = ${p.contatoId} AND empresa_id = ${p.empresaId}`)
    }
    await auditarAtoDoPortal(this.ctx.db(), {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'contato',
      entidadeId: p.contatoId,
      acao: 'nome_corrigido_pelo_cliente',
      alteracoes: { antes: p.nome, depois: dados.nome, cargo: dados.cargo },
      ip: req.ip,
    })
    return sessaoDoPortalDe({ ...p, nome: dados.nome })
  }
}
