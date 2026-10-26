import { createHash, randomBytes } from 'node:crypto'

import { novoId, sql } from '@leadtogo/db'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { chavesDe, cifrar, decifrar } from '../seguranca/cifra.js'
import { LimitePorChave } from './limite-por-chave.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'
import { novoSegredoBase32, passoDoCodigo, uriOtpauth } from './totp.js'

const QTD_CODIGOS_DE_RECUPERACAO = 8
const hashDoCodigo = (c: string) =>
  createHash('sha256').update(c.trim().toLowerCase()).digest('hex')

/** Um código de recuperação legível: dez letras e números em dois grupos (`k3f9a-x72mq`). */
const novoCodigoDeRecuperacao = () => {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(10)
  const texto = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('')
  return `${texto.slice(0, 5)}-${texto.slice(5)}`
}

/** 2FA do cliente por aplicativo autenticador (TOTP), com códigos de recuperação de uso único. */
@Injectable()
export class PortalSegundoFatorService {
  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    private readonly ctx: ContextoTenantService,
    private readonly limites: LimitePorChave,
  ) {}

  private async linha() {
    const [l] = await this.ctx.db().execute<{
      id: string
      segredo_cifrado: string
      confirmado_em: string | Date | null
      codigos: string[]
    }>(sql`
      SELECT id, segredo_cifrado, confirmado_em, codigos_recuperacao AS codigos
      FROM portal_segundo_fator WHERE acesso_id = ${this.ctx.portal.acessoId}`)
    return l
  }

  /** Começa a ligar o 2FA: gera um segredo novo (ainda não vale até confirmar com um código). */
  async iniciar(): Promise<{ segredo: string; uri: string }> {
    const p = this.ctx.portal
    const atual = await this.linha()
    if (atual?.confirmado_em) {
      throw new ErroApi(
        'segundo_fator_ja_ativo',
        'A verificação em duas etapas já está ligada.',
        409,
      )
    }
    const segredo = novoSegredoBase32()
    const cifrado = cifrar(segredo, chavesDe(this.config))
    if (atual) {
      await this.ctx.db().execute(sql`
        UPDATE portal_segundo_fator SET segredo_cifrado = ${cifrado}, atualizado_em = now() WHERE id = ${atual.id}`)
    } else {
      await this.ctx.db().execute(sql`
        INSERT INTO portal_segundo_fator (id, tenant_id, acesso_id, segredo_cifrado)
        VALUES (${novoId()}, ${p.tenantId}, ${p.acessoId}, ${cifrado})`)
    }
    return { segredo, uri: uriOtpauth(segredo, p.email, p.nomeDoPortal) }
  }

  private async conferirTotp(segredo: string, codigo: string): Promise<boolean> {
    const passo = passoDoCodigo(segredo, codigo)
    if (passo === null) return false
    // O mesmo código não vale duas vezes (repetição de quem viu o código por cima do ombro)
    return this.limites.marcarUso(`totp:${this.ctx.portal.acessoId}:${passo}`, 120)
  }

  private async limitarTentativas(): Promise<void> {
    if (!(await this.limites.permitir('2fa', this.ctx.portal.acessoId, 8, 900))) {
      throw new ErroApi('muitas_tentativas', 'Muitas tentativas. Aguarde alguns minutos.', 429)
    }
  }

  /** Confirma o primeiro código: liga o 2FA, marca esta sessão como conferida e devolve os códigos de recuperação. */
  async confirmar(codigo: string): Promise<string[]> {
    const p = this.ctx.portal
    await this.limitarTentativas()
    const l = await this.linha()
    if (!l) throw new ErroApi('segundo_fator_nao_iniciado', 'Comece pela ativação do 2FA.', 409)
    if (l.confirmado_em) {
      throw new ErroApi(
        'segundo_fator_ja_ativo',
        'A verificação em duas etapas já está ligada.',
        409,
      )
    }
    if (!(await this.conferirTotp(decifrar(l.segredo_cifrado, chavesDe(this.config)), codigo))) {
      throw new ErroApi(
        'codigo_invalido',
        'Código inválido. Confira o aplicativo e tente de novo.',
        422,
      )
    }
    const codigos = Array.from({ length: QTD_CODIGOS_DE_RECUPERACAO }, novoCodigoDeRecuperacao)
    await this.ctx.db().execute(sql`
      UPDATE portal_segundo_fator
      SET confirmado_em = now(), atualizado_em = now(), codigos_recuperacao = ${JSON.stringify(codigos.map(hashDoCodigo))}::jsonb
      WHERE id = ${l.id}`)
    await this.marcarSessao()
    await auditarAtoDoPortal(this.ctx.db(), {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'portal_acesso',
      entidadeId: p.acessoId,
      acao: 'segundo_fator_ligado',
      ip: this.ctx.ip,
    })
    return codigos
  }

  private async marcarSessao(): Promise<void> {
    await this.ctx.db().execute(sql`
      UPDATE portal_sessoes SET segundo_fator_em = now(), atualizado_em = now()
      WHERE id = ${this.ctx.portal.sessaoId}`)
  }

  /** Confere o código do aplicativo ou um código de recuperação (que se gasta) e libera a sessão. */
  async conferir(codigo: string): Promise<void> {
    const p = this.ctx.portal
    await this.limitarTentativas()
    const l = await this.linha()
    if (!l?.confirmado_em) {
      throw new ErroApi(
        'segundo_fator_inativo',
        'A verificação em duas etapas não está ligada.',
        409,
      )
    }
    let usouRecuperacao = false
    let ok = await this.conferirTotp(decifrar(l.segredo_cifrado, chavesDe(this.config)), codigo)
    if (!ok) {
      const hash = hashDoCodigo(codigo)
      if (l.codigos.includes(hash)) {
        // Gasta o código; a condição no UPDATE evita gastar duas vezes em pedidos simultâneos
        const r = await this.ctx.db().execute(sql`
          UPDATE portal_segundo_fator
          SET codigos_recuperacao = codigos_recuperacao - ${hash}, atualizado_em = now()
          WHERE id = ${l.id} AND codigos_recuperacao @> to_jsonb(${hash}::text) RETURNING id`)
        ok = r.length > 0
        usouRecuperacao = ok
      }
    }
    if (!ok) throw new ErroApi('codigo_invalido', 'Código inválido. Confira e tente de novo.', 422)
    await this.marcarSessao()
    await auditarAtoDoPortal(this.ctx.db(), {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'portal_acesso',
      entidadeId: p.acessoId,
      acao: usouRecuperacao ? 'segundo_fator_codigo_de_recuperacao' : 'segundo_fator_conferido',
      ip: this.ctx.ip,
    })
  }

  /** Desliga o 2FA (pede um código válido). O Responsável de uma empresa que o exige não pode desligar. */
  async desativar(codigo: string): Promise<void> {
    const p = this.ctx.portal
    if (p.papel === 'responsavel') {
      const [c] = await this.ctx.db().execute<{ exige: boolean | null }>(sql`
        SELECT portal_exige_dois_fatores_responsavel AS exige FROM tenant_configuracoes`)
      if (c?.exige === true) {
        throw new ErroApi(
          'segundo_fator_obrigatorio',
          'Sua empresa exige a verificação em duas etapas do Responsável.',
          409,
        )
      }
    }
    await this.limitarTentativas()
    const l = await this.linha()
    if (!l?.confirmado_em) {
      throw new ErroApi(
        'segundo_fator_inativo',
        'A verificação em duas etapas não está ligada.',
        409,
      )
    }
    const hash = hashDoCodigo(codigo)
    const ok =
      (await this.conferirTotp(decifrar(l.segredo_cifrado, chavesDe(this.config)), codigo)) ||
      l.codigos.includes(hash)
    if (!ok) throw new ErroApi('codigo_invalido', 'Código inválido. Confira e tente de novo.', 422)
    await this.ctx.db().execute(sql`DELETE FROM portal_segundo_fator WHERE id = ${l.id}`)
    await auditarAtoDoPortal(this.ctx.db(), {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'portal_acesso',
      entidadeId: p.acessoId,
      acao: 'segundo_fator_desligado',
      ip: this.ctx.ip,
    })
  }
}
