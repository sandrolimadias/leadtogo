import {
  type AlterarLoteEntrada,
  alterarLoteSchema,
  type AndamentoDaImportacao,
  andamentoDaImportacaoSchema,
  type ConsultaDasLinhas,
  consultaDasLinhasSchema,
  type ConsultaDosLotes,
  consultaDosLotesSchema,
  type ImportarForaDoPerfil,
  importarForaDoPerfilSchema,
  type ListaDeLinhas,
  listaDeLinhasSchema,
  type ListaDeLotes,
  listaDeLotesSchema,
  type ResultadoDaLinha,
  resultadoDaLinhaSchema,
  CAMPOS_DA_EMPRESA_NA_IMPORTACAO,
  type ConsultaDoEnvio,
  consultaDoEnvioSchema,
  type LoteDeImportacao,
  loteDeImportacaoSchema,
  type PreviaDaImportacao,
  previaDaImportacaoSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import type { Request } from 'express'
import ExcelJS from 'exceljs'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { Documenta } from '../documentacao/documenta.js'
import { ErroApi } from '../http/erro-api.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { ExecucaoDaImportacaoService } from './execucao.service.js'
import { LotesDeImportacaoService } from './lotes.service.js'
import { PreviaDaImportacaoService } from './previa.service.js'
import { RelatorioDaImportacaoService } from './relatorio.service.js'

/** Quem importa: administrador e gestor (ver `LotesDeImportacaoService`). */
const QUEM = 'Só administradores e gestores da empresa ativa (403 `acesso_negado` para o vendedor).'

@ApiTags('Importação: lotes')
@Controller('importacao')
export class LotesDeImportacaoController {
  constructor(
    private readonly servico: LotesDeImportacaoService,
    private readonly previa: PreviaDaImportacaoService,
    private readonly execucao: ExecucaoDaImportacaoService,
    private readonly relatorio: RelatorioDaImportacaoService,
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
    resumo: 'Alterar as escolhas de um lote',
    descricao:
      QUEM +
      ' Só os campos enviados mudam. `campos` troca o mapeamento inteiro (campo → título da coluna; 400 `mapeamento_invalido` se a coluna não existe ou serve a dois campos). `perfilId` nulo é "Sem regras"; o lote guarda uma cópia das regras do perfil. Vendedor, Status, origem e vertical precisam estar ativos (400 `escolha_invalida`). O lote vira `pronta` quando não falta nada (veja `pendencias`) e volta a `rascunho` se algo deixar de valer. Lote já iniciado: 409 `importacao_nao_editavel`.',
    corpo: alterarLoteSchema,
    resposta: loteDeImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch('lotes/:id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarLoteSchema)) dados: AlterarLoteEntrada,
  ): Promise<LoteDeImportacao> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Ver a prévia de um lote',
    descricao:
      QUEM +
      ' Mostra o que a importação vai fazer, sem consultar a Receita nem gravar nada: linhas sem CNPJ válido, CNPJs repetidos na planilha, CNPJs que já estão na carteira, quantas consultas à Receita serão de verdade (fora do cache de 30 dias) e o tempo estimado com o intervalo escolhido. Sem a coluna do CNPJ mapeada: 409 `mapeamento_incompleto`.',
    resposta: previaDaImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Get('lotes/:id/previa')
  verPrevia(@Param('id', new ParseUUIDPipe()) id: string): Promise<PreviaDaImportacao> {
    return this.previa.calcular(id)
  }

  @Documenta({
    resumo: 'Iniciar (ou retomar) a importação',
    descricao:
      QUEM +
      ' O lote precisa estar `pronta` (veja `pendencias`); também retoma um lote que `falhou` ou foi `cancelada`, fazendo só as linhas pendentes. A execução roda no worker, uma linha por vez, com o intervalo escolhido entre consultas à Receita. Lote incompleto: 409 `importacao_incompleta`; já em andamento: 409 `importacao_em_andamento`; encerrado: 409 `importacao_encerrada`.',
    resposta: loteDeImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Post('lotes/:id/iniciar')
  @HttpCode(200)
  iniciar(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoteDeImportacao> {
    return this.execucao.iniciar(id)
  }

  @Documenta({
    resumo: 'Cancelar a importação em andamento',
    descricao:
      QUEM +
      ' O worker para antes da próxima linha; o que já foi importado fica (use desfazer para tirar). Dá para retomar com `iniciar`. Fora de andamento: 409 `importacao_nao_cancelavel`.',
    resposta: loteDeImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Post('lotes/:id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoteDeImportacao> {
    return this.execucao.cancelar(id)
  }

  @Documenta({
    resumo: 'Desfazer a importação',
    descricao:
      QUEM +
      ' Só num lote `concluida` ou `cancelada`, até 7 dias depois de terminar (`desfazerAte`; o prazo é `DIAS_PARA_DESFAZER`). Saem da carteira (exclusão lógica, como a manual) as empresas que o lote criou e que ninguém alterou depois; ficam as que tiveram qualquer alteração (editar, tags, Receita) ou têm contato vinculado, e a contagem vem em `desfeito` (`removidas` e `mantidas`). As que já estavam na carteira antes não são tocadas, e o relatório continua. Fora de um lote concluído ou cancelado: 409 `importacao_nao_desfazivel`; depois do prazo: 409 `prazo_de_desfazer_vencido`.',
    resposta: loteDeImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Post('lotes/:id/desfazer')
  @HttpCode(200)
  desfazer(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoteDeImportacao> {
    return this.execucao.desfazer(id)
  }

  @Documenta({
    resumo: 'Acompanhar a importação',
    descricao:
      QUEM +
      ' Situação, quantas linhas já têm resultado e quantas há em cada resultado. Para a barra de progresso (consulta repetida a cada poucos segundos).',
    resposta: andamentoDaImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Get('lotes/:id/andamento')
  andamento(@Param('id', new ParseUUIDPipe()) id: string): Promise<AndamentoDaImportacao> {
    return this.execucao.andamento(id)
  }

  @Documenta({
    resumo: 'Listar as importações',
    descricao:
      QUEM + ' Do lote mais novo para o mais antigo, com a contagem por resultado de cada um.',
    consulta: consultaDosLotesSchema,
    resposta: listaDeLotesSchema,
    erros: [400, 401, 403, 409],
  })
  @Get('lotes')
  listar(
    @Query(new ZodPipe(consultaDosLotesSchema)) consulta: ConsultaDosLotes,
  ): Promise<ListaDeLotes> {
    return this.relatorio.listarLotes(consulta)
  }

  @Documenta({
    resumo: 'Ver as linhas de uma importação (relatório)',
    descricao:
      QUEM +
      ' Uma página de linhas com o resultado e o motivo de cada uma; `resultado` filtra (criada, fora_do_perfil, pulada_sem_cnpj, pulada_duplicada, pulada_nao_ativa, erro...).',
    consulta: consultaDasLinhasSchema,
    resposta: listaDeLinhasSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Get('lotes/:id/linhas')
  linhas(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(consultaDasLinhasSchema)) consulta: ConsultaDasLinhas,
  ): Promise<ListaDeLinhas> {
    return this.relatorio.linhas(id, consulta)
  }

  @Documenta({
    resumo: 'Baixar o que não entrou (CSV)',
    descricao:
      QUEM +
      ' Um CSV (`;`, UTF-8 com BOM) com linha, resultado, motivo e as colunas originais das linhas que não entraram na carteira, para corrigir a planilha e importar de novo. `resultado` restringe a um tipo.',
    consulta: z.object({ resultado: resultadoDaLinhaSchema.optional() }).strict(),
    erros: [400, 401, 403, 404, 409],
  })
  @Get('lotes/:id/problemas.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="importacao-problemas.csv"')
  async problemas(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(z.object({ resultado: resultadoDaLinhaSchema.optional() }).strict()))
    consulta: { resultado?: ResultadoDaLinha },
  ): Promise<StreamableFile> {
    return new StreamableFile(
      Buffer.from(await this.relatorio.csvDosProblemas(id, consulta.resultado)),
    )
  }

  @Documenta({
    resumo: 'Importar mesmo assim (as linhas fora do perfil)',
    descricao:
      QUEM +
      ' Só num lote concluído (409 `importacao_nao_concluida`). As linhas fora do perfil (todas, ou as de `linhaIds`) voltam a pendentes e o worker as cadastra com a tag "Fora do perfil". O bloqueio de empresa não ativa continua valendo. Sem linhas assim: 409 `sem_linhas_fora_do_perfil`.',
    corpo: importarForaDoPerfilSchema,
    resposta: loteDeImportacaoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Post('lotes/:id/importar-fora-do-perfil')
  @HttpCode(200)
  importarForaDoPerfil(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(importarForaDoPerfilSchema)) dados: ImportarForaDoPerfil,
  ): Promise<LoteDeImportacao> {
    return this.relatorio.importarForaDoPerfil(id, dados.linhaIds)
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
