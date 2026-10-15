import {
  aplicarPatch,
  lerPreferencias,
  type Preferencias,
  type PreferenciasPatch,
} from '@leadtogo/shared'
import { sql } from '@leadtogo/db'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'

/**
 * Preferências de interface do membro na empresa ativa (`membros.preferencias`). São do PRÓPRIO
 * membro: não há id na rota, então ninguém altera as de outro; e, por vir da transação do tenant,
 * o RLS garante que só a empresa ativa é tocada.
 */
@Injectable()
export class PreferenciasService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async obter(): Promise<Preferencias> {
    const [linha] = await this.ctx
      .db()
      .execute<{ preferencias: unknown }>(
        sql`SELECT preferencias FROM membros WHERE id = ${this.ctx.membro.id}`,
      )
    return lerPreferencias(linha?.preferencias)
  }

  /** Aplica o patch (mescla, `null` desfaz) e devolve o resultado completo. Guarda só o que foge do padrão. */
  async alterar(patch: PreferenciasPatch): Promise<Preferencias> {
    const membroId = this.ctx.membro.id
    // FOR UPDATE: dois PATCH simultâneos não perdem a alteração um do outro
    const [linha] = await this.ctx
      .db()
      .execute<{ preferencias: unknown }>(
        sql`SELECT preferencias FROM membros WHERE id = ${membroId} FOR UPDATE`,
      )
    const atuais = lerPreferencias(linha?.preferencias)
    const guardadas = aplicarPatch(somenteForaDoPadrao(atuais), patch)
    await this.ctx.db().execute(sql`
      UPDATE membros
      SET preferencias = ${JSON.stringify(guardadas)}::jsonb, atualizado_em = now(), atualizado_por = ${membroId}
      WHERE id = ${membroId}`)
    return lerPreferencias(guardadas)
  }
}

/** O que está guardado, sem os valores que são iguais ao padrão. */
function somenteForaDoPadrao(prefs: Preferencias): Partial<Preferencias> {
  const saida: Partial<Preferencias> = {}
  if (prefs.tema !== 'sistema') saida.tema = prefs.tema
  if (prefs.menuRecolhido) saida.menuRecolhido = true
  if (prefs.visaoDashboard !== 'minha') saida.visaoDashboard = prefs.visaoDashboard
  if (Object.keys(prefs.filtroPadrao).length > 0) saida.filtroPadrao = prefs.filtroPadrao
  if (Object.keys(prefs.porPagina).length > 0) saida.porPagina = prefs.porPagina
  return saida
}
