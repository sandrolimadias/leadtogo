import {
  type ConsultaDeDocumentos,
  consultaDeDocumentosSchema,
  type CriarDocumentoEntrada,
  criarDocumentoSchema,
  type Documento,
  documentoSchema,
  downloadDoDocumentoSchema,
  type DownloadDoDocumento,
  type EditarDocumentoEntrada,
  editarDocumentoSchema,
  type EnvioDeDocumento,
  envioDeDocumentoSchema,
  type ListaDeBaixas,
  listaDeBaixasSchema,
  type ListaDeDocumentos,
  listaDeDocumentosSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao, TransacaoSobDemanda } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { DocumentosService } from './documentos.service.js'

const uuid = () => new ParseUUIDPipe()

/** Documentos do portal pela EQUIPE (rotas do CRM, com o perfil de acesso do CRM). */
@ApiTags('Portal do cliente: documentos')
@Controller('portal-documentos')
export class DocumentosController {
  constructor(private readonly servico: DocumentosService) {}

  @Documenta({
    resumo: 'Documentos do portal',
    descricao:
      'Exige `portal.ver` ou `portal.documentos`. Todos os documentos (também os em verificação, bloqueados e ocultos do portal), com o total de downloads.',
    consulta: consultaDeDocumentosSchema,
    resposta: listaDeDocumentosSchema,
    erros: [400, 401, 403],
  })
  @Permissao('portal.ver', 'portal.documentos')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeDocumentosSchema)) consulta: ConsultaDeDocumentos,
  ): Promise<ListaDeDocumentos> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Cadastrar um documento e reservar o envio do arquivo',
    descricao:
      'Exige `portal.documentos`. Passo 1: cria o documento (arquivo ainda não enviado) e devolve a URL pré-assinada para o navegador enviar o arquivo (até 25 MB) direto ao armazenamento. Passo 2: `POST /portal-documentos/{id}/confirmar`. Sem o antivírus configurado: 503 `anexos_indisponiveis`.',
    corpo: criarDocumentoSchema,
    resposta: envioDeDocumentoSchema,
    status: 201,
    erros: [400, 401, 403, 422, 503],
  })
  @Permissao('portal.documentos')
  @Post()
  @Limite({ nome: 'portal-documentos', max: 120, janelaS: 3600 })
  criar(
    @Body(new ZodPipe(criarDocumentoSchema)) dados: CriarDocumentoEntrada,
  ): Promise<EnvioDeDocumento> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Ver um documento',
    descricao: 'Exige `portal.ver` ou `portal.documentos`.',
    resposta: documentoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.ver', 'portal.documentos')
  @Get(':id')
  obter(@Param('id', uuid()) id: string): Promise<Documento> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Confirmar o envio do arquivo',
    descricao:
      'Exige `portal.documentos`. Passo 2: confere o objeto no armazenamento (existe e tem o tamanho dito) e manda o antivírus varrer. Idempotente. Arquivo fora do combinado: 400 `anexo_invalido` e o documento é descartado; ainda não chegou: 409 `anexo_nao_enviado`.',
    resposta: documentoSchema,
    status: 200,
    erros: [400, 401, 403, 404, 409, 503],
  })
  @Permissao('portal.documentos')
  @TransacaoSobDemanda()
  @Post(':id/confirmar')
  @HttpCode(200)
  confirmar(@Param('id', uuid()) id: string): Promise<Documento> {
    return this.servico.confirmar(id)
  }

  @Documenta({
    resumo: 'Editar um documento',
    descricao:
      'Exige `portal.documentos`. Título, descrição, alcance (com a lista de empresas) e se aparece no portal. O arquivo não troca: publique outro documento.',
    corpo: editarDocumentoSchema,
    resposta: documentoSchema,
    erros: [400, 401, 403, 404, 422],
  })
  @Permissao('portal.documentos')
  @Patch(':id')
  editar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(editarDocumentoSchema)) dados: EditarDocumentoEntrada,
  ): Promise<Documento> {
    return this.servico.editar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir um documento',
    descricao: 'Exige `portal.documentos`. Exclusão lógica: some do portal e da lista.',
    status: 204,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.documentos')
  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', uuid()) id: string): Promise<void> {
    await this.servico.excluir(id)
  }

  @Documenta({
    resumo: 'Baixar o arquivo (equipe)',
    descricao:
      'Exige `portal.ver` ou `portal.documentos`. URL pré-assinada de 5 minutos, sempre como download. Só o "limpo": 409 `anexo_em_verificacao` ou `anexo_bloqueado`.',
    resposta: downloadDoDocumentoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.ver', 'portal.documentos')
  @Get(':id/download')
  baixar(@Param('id', uuid()) id: string): Promise<DownloadDoDocumento> {
    return this.servico.baixar(id)
  }

  @Documenta({
    resumo: 'Quem baixou',
    descricao:
      'Exige `portal.ver` ou `portal.documentos`. Os downloads mais recentes (até 200), com a pessoa, a empresa-cliente e a data.',
    resposta: listaDeBaixasSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.ver', 'portal.documentos')
  @Get(':id/baixas')
  baixas(@Param('id', uuid()) id: string): Promise<ListaDeBaixas> {
    return this.servico.baixas(id)
  }
}
