import {
  CAMPOS_DA_EMPRESA_NA_IMPORTACAO,
  type ConsultaDoEnvio,
  consultaDoEnvioSchema,
  type LoteDeImportacao,
  loteDeImportacaoSchema,
} from '@leadtogo/shared'
import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import ExcelJS from 'exceljs'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { Documenta } from '../documentacao/documenta.js'
import { ErroApi } from '../http/erro-api.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { LotesDeImportacaoService } from './lotes.service.js'

/** Quem importa: administrador e gestor (ver `LotesDeImportacaoService`). */
const QUEM = 'Só administradores e gestores da empresa ativa (403 `acesso_negado` para o vendedor).'

@ApiTags('Importação: lotes')
@Controller('importacao')
export class LotesDeImportacaoController {
  constructor(
    private readonly servico: LotesDeImportacaoService,
    private readonly ctx: ContextoTenantService,
  ) {}

  @Documenta({
    resumo: 'Enviar a planilha de uma importação',
    descricao:
      QUEM +
      ' O arquivo (.xlsx ou CSV, até 10 MB e 10.000 linhas) vai nos bytes do corpo, com `Content-Type: application/octet-stream`; o nome do arquivo vai em `arquivo` na consulta. Lê os títulos e as linhas, guarda o original e cria o lote em rascunho. Erros de leitura: 400 `arquivo_vazio`, `sem_cabecalho`, `colunas_repetidas`, `arquivo_invalido`; 413 `limite_de_linhas` e `arquivo_grande_demais`; 415 `formato_nao_suportado`.',
    consulta: consultaDoEnvioSchema,
    resposta: loteDeImportacaoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @Post('lotes')
  criar(
    @Query(new ZodPipe(consultaDoEnvioSchema)) consulta: ConsultaDoEnvio,
    @Req() req: Request,
  ): Promise<LoteDeImportacao> {
    return this.servico.criar(consulta, req.body)
  }

  @Documenta({
    resumo: 'Ver um lote de importação',
    descricao: QUEM + ' Lote de outra empresa: 404 `importacao_nao_encontrada`.',
    resposta: loteDeImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Get('lotes/:id')
  detalhar(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoteDeImportacao> {
    return this.servico.detalhar(id)
  }

  @Documenta({
    resumo: 'Baixar a planilha modelo',
    descricao:
      QUEM +
      ' Um .xlsx só com os títulos das colunas que a importação de empresas reconhece, e uma aba com as instruções.',
    erros: [401, 403, 409],
  })
  @Get('modelo')
  @HttpCode(200)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="modelo-importacao-empresas.xlsx"')
  async modelo(): Promise<StreamableFile> {
    if (this.ctx.membro.papel !== 'admin' && this.ctx.membro.papel !== 'gestor') {
      throw new ErroApi('acesso_negado', 'Só administradores e gestores importam planilhas.', 403)
    }
    const livro = new ExcelJS.Workbook()
    const folha = livro.addWorksheet('Empresas')
    folha.addRow(CAMPOS_DA_EMPRESA_NA_IMPORTACAO.map((c) => c.rotulo))
    folha.getRow(1).font = { bold: true }
    folha.columns.forEach((coluna) => (coluna.width = 22))
    const ajuda = livro.addWorksheet('Como preencher')
    for (const linha of [
      'A primeira linha da aba "Empresas" traz os títulos; preencha uma empresa por linha abaixo dela.',
      'Só o CNPJ é obrigatório quando os dados vêm da Receita. Os demais campos são opcionais.',
      'Pode escrever o CNPJ com ou sem pontuação. Linha sem CNPJ válido é pulada e aparece no relatório.',
      'Até 10.000 linhas e 10 MB por arquivo. Também é possível enviar CSV (separado por ; , ou tabulação).',
      'Os títulos podem ter outros nomes: você liga cada coluna ao campo certo na próxima etapa.',
    ]) {
      ajuda.addRow([linha])
    }
    ajuda.getColumn(1).width = 110
    return new StreamableFile(Buffer.from(await livro.xlsx.writeBuffer()))
  }
}
