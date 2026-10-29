import {
  type BuscasRecentes,
  buscasRecentesSchema,
  type ConsultaDaBuscaGlobal,
  consultaDaBuscaGlobalSchema,
  type NovaBuscaRecente,
  novaBuscaRecenteSchema,
  type ResultadoDaBuscaGlobal,
  resultadoDaBuscaGlobalSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { BuscaGlobalService } from './busca-global.service.js'

const SO_DA_PESSOA =
  'Só as buscas de quem pede: ninguém (nem o administrador) lê ou apaga o histórico de outra pessoa.'

/** A busca da barra do topo (docs/plano_busca_global.md) e as buscas recentes de cada pessoa. */
@ApiTags('Busca global')
@Controller('busca')
export class BuscaGlobalController {
  constructor(private readonly servico: BuscaGlobalService) {}

  @Documenta({
    resumo: 'Busca global',
    descricao:
      'Empresas (fantasia, razão social, cidade e CNPJ com ou sem máscara), contatos (nome, e-mail e telefone) e oportunidades (título e nome da empresa), sem acento e sem diferenciar maiúsculas. Cada tipo segue a sua regra de carteira (`empresas.ver`, `contatos.ver`, `oportunidades.ver`): sem a permissão, a lista do tipo volta vazia. Até `limite` por tipo (padrão 5, máximo 20); quem começa com o termo vem antes de quem só o contém, depois o atualizado mais recentemente. Mínimo de 2 letras. Só lê: o histórico é gravado por `POST /v1/busca/recentes`.',
    consulta: consultaDaBuscaGlobalSchema,
    resposta: resultadoDaBuscaGlobalSchema,
    erros: [400, 401, 403, 429],
  })
  @TodoMembro()
  @Get()
  @Limite({ nome: 'busca-global', max: 1200, janelaS: 3600 })
  buscar(
    @Query(new ZodPipe(consultaDaBuscaGlobalSchema)) consulta: ConsultaDaBuscaGlobal,
  ): Promise<ResultadoDaBuscaGlobal> {
    return this.servico.buscar(consulta)
  }

  @Documenta({
    resumo: 'Buscas recentes',
    descricao: `As até 10 últimas buscas concluídas, a mais recente primeiro. ${SO_DA_PESSOA}`,
    resposta: buscasRecentesSchema,
    erros: [401, 403],
  })
  @TodoMembro()
  @Get('recentes')
  async recentes(): Promise<BuscasRecentes> {
    return { itens: await this.servico.recentes() }
  }

  @Documenta({
    resumo: 'Registrar uma busca recente',
    descricao: `Chamada quando a busca termina (a pessoa escolheu um resultado ou apertou Enter), nunca a cada letra. O mesmo termo (sem acento e sem maiúsculas) não duplica: volta ao topo. Passou de 10, a mais antiga sai. Devolve a lista atualizada. ${SO_DA_PESSOA}`,
    corpo: novaBuscaRecenteSchema,
    resposta: buscasRecentesSchema,
    erros: [400, 401, 403, 429],
  })
  @TodoMembro()
  @Post('recentes')
  @HttpCode(200)
  @Limite({ nome: 'busca-recente', max: 600, janelaS: 3600 })
  async registrar(
    @Body(new ZodPipe(novaBuscaRecenteSchema)) dados: NovaBuscaRecente,
  ): Promise<BuscasRecentes> {
    return { itens: await this.servico.registrar(dados.termo) }
  }

  @Documenta({
    resumo: 'Apagar uma busca recente',
    descricao: `Apaga de fato (sem lixeira). ${SO_DA_PESSOA} A de outra pessoa responde 404.`,
    status: 204,
    erros: [400, 401, 403, 404],
  })
  @TodoMembro()
  @Delete('recentes/:id')
  @HttpCode(204)
  apagar(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.apagar(id)
  }

  @Documenta({
    resumo: 'Limpar as buscas recentes',
    descricao: `Apaga todo o histórico de quem pede. ${SO_DA_PESSOA}`,
    status: 204,
    erros: [401, 403],
  })
  @TodoMembro()
  @Delete('recentes')
  @HttpCode(204)
  limpar(): Promise<void> {
    return this.servico.limpar()
  }
}
