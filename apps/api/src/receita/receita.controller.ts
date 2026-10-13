import { sql } from '@leadtogo/db'
import { type ConsultaReceita, consultaReceitaSchema } from '@leadtogo/shared'
import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { ReceitaService } from './receita.service.js'

const consultaSchema = z.object({ forcar: z.enum(['true', 'false']).default('false') }).strict()

/** Consulta de CNPJ na Receita (Minha Receita, com a BrasilAPI como segunda tentativa e cache de 30 dias). */
@ApiTags('Receita')
@Controller('receita')
export class ReceitaController {
  constructor(
    private readonly servico: ReceitaService,
    private readonly ctx: ContextoTenantService,
  ) {}

  @Documenta({
    resumo: 'Consultar um CNPJ na Receita',
    descricao:
      'Qualquer membro da empresa ativa. Devolve os dados da Receita já no formato do sistema (sem o CPF dos sócios) e a situação cadastral. Vale o cache de 30 dias; `forcar=true` ignora o cache. Se a Minha Receita falhar (rede, tempo esgotado, 429 ou 5xx), tenta a BrasilAPI (que repassa a Minha Receita: cobre falha de rede ou hospedagem, não da base). Com as duas fora do ar, usa o cache vencido (`expirada: true`) ou responde 503 `receita_indisponivel`. `cnpj_invalido` (400) e `cnpj_nao_encontrado` (404) são definitivos. `cadastroBloqueado` indica que o bloqueio de empresa não ativa (Configurações) vai recusar o cadastro.',
    consulta: consultaSchema,
    resposta: consultaReceitaSchema,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Get('cnpj/:cnpj')
  @Limite({ nome: 'receita-consulta', max: 20, janelaS: 60 })
  async consultar(
    @Param('cnpj') cnpj: string,
    @Query(new ZodPipe(consultaSchema)) consulta: z.infer<typeof consultaSchema>,
  ): Promise<ConsultaReceita> {
    const r = await this.servico.consultar(cnpj, { forcar: consulta.forcar === 'true' })
    const [config] = await this.ctx
      .db()
      .execute<{ bloquear: boolean }>(
        sql`SELECT bloquear_empresa_nao_ativa AS bloquear FROM tenant_configuracoes WHERE tenant_id = ${this.ctx.tenantId}`,
      )
    return {
      dados: r.dados,
      fonte: r.fonte,
      consultadoEm: r.consultadoEm.toISOString(),
      doCache: r.doCache,
      expirada: r.expirada,
      cadastroBloqueado: (config?.bloquear ?? true) && !r.dados.situacao.ativa,
    }
  }
}
