import {
  type AlterarContatoPublico,
  alterarContatoPublicoSchema,
  type AlterarEmpresaPublica,
  alterarEmpresaPublicaSchema,
  type AlterarOportunidadePublica,
  alterarOportunidadePublicaSchema,
  atividadePublicaSchema,
  type ConcluirAtividadePublica,
  concluirAtividadePublicaSchema,
  type ConsultaDeAtividadesPublica,
  consultaDeAtividadesPublicaSchema,
  type ConsultaDeContatosPublica,
  consultaDeContatosPublicaSchema,
  type ConsultaDeEmpresasPublica,
  consultaDeEmpresasPublicaSchema,
  type ConsultaDeOportunidadesPublica,
  consultaDeOportunidadesPublicaSchema,
  contatoPublicoSchema,
  type CriarAtividadePublica,
  criarAtividadePublicaSchema,
  type CriarContatoPublico,
  criarContatoPublicoSchema,
  type CriarEmpresaPublica,
  criarEmpresaPublicaSchema,
  type CriarOportunidadePublica,
  criarOportunidadePublicaSchema,
  empresaPublicaSchema,
  euPublicoSchema,
  listaDeAtividadesPublicaSchema,
  listaDeCadastrosPublicaSchema,
  listaDeContatosPublicaSchema,
  listaDeEmpresasPublicaSchema,
  listaDeFunisPublicaSchema,
  listaDeMembrosPublicaSchema,
  listaDeOportunidadesPublicaSchema,
  listaDeTagsPublicaSchema,
  loteDeEmpresasPublicaSchema,
  oportunidadePublicaSchema,
  resultadoDoLotePublicoSchema,
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
  Put,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import type { z } from 'zod'

import { Permissao, TodoMembro } from '../../acesso/acesso.decorators.js'
import { Documenta } from '../../documentacao/documenta.js'
import { ZodPipe } from '../../http/zod.pipe.js'
import { ApiPublica } from '../chave.decorators.js'
import { IdempotenciaInterceptor } from './idempotencia.interceptor.js'
import { PublicaService } from './publica.service.js'

const ERROS_DA_LEITURA = [400, 401, 403, 404, 429]
const ERROS_DA_ESCRITA = [400, 401, 403, 404, 409, 422, 429]
const IDEMPOTENCIA =
  ' Aceita o cabeçalho `Idempotency-Key` (até 100 caracteres): repetir a chave com o mesmo corpo devolve a mesma resposta por 24 h; com outro corpo, 409 `idempotencia_conflito`.'

@ApiTags('API pública')
@ApiPublica()
@Controller('publica')
export class PublicaController {
  constructor(private readonly servico: PublicaService) {}

  @Documenta({
    resumo: 'Quem é esta chave',
    descricao:
      'Qualquer chave válida. A empresa, o nome da chave, as permissões dela e os limites.',
    resposta: euPublicoSchema,
    erros: [401, 403, 429],
  })
  @TodoMembro()
  @Get('eu')
  eu(): Promise<z.infer<typeof euPublicoSchema>> {
    return this.servico.eu()
  }

  @Documenta({
    resumo: 'Tags (com o grupo)',
    descricao:
      'Exige `empresas.ver`. Use `chave_sistema` (ou o `id`) para aplicar e filtrar: o nome a empresa pode trocar.',
    resposta: listaDeTagsPublicaSchema,
    erros: [401, 403, 429],
  })
  @Permissao('empresas.ver')
  @Get('tags')
  tags() {
    return this.servico.tags()
  }

  @Documenta({
    resumo: 'Tipos de atividade',
    descricao: 'Exige `empresas.ver`.',
    resposta: listaDeCadastrosPublicaSchema,
    erros: [401, 403, 429],
  })
  @Permissao('empresas.ver')
  @Get('tipos-atividade')
  tiposDeAtividade() {
    return this.servico.cadastro('tipos_atividade')
  }

  @Documenta({
    resumo: 'Origens',
    descricao: 'Exige `empresas.ver`.',
    resposta: listaDeCadastrosPublicaSchema,
    erros: [401, 403, 429],
  })
  @Permissao('empresas.ver')
  @Get('origens')
  origens() {
    return this.servico.cadastro('origens')
  }

  @Documenta({
    resumo: 'Funis e fases',
    descricao: 'Exige `empresas.ver`.',
    resposta: listaDeFunisPublicaSchema,
    erros: [401, 403, 429],
  })
  @Permissao('empresas.ver')
  @Get('funis')
  funis() {
    return this.servico.funis()
  }

  @Documenta({
    resumo: 'Membros da equipe',
    descricao:
      'Exige `empresas.ver`. Id, nome e e-mail de quem pode ser responsável (os membros de integração não aparecem).',
    resposta: listaDeMembrosPublicaSchema,
    erros: [401, 403, 429],
  })
  @Permissao('empresas.ver')
  @Get('membros')
  membros() {
    return this.servico.membros()
  }
}

@ApiTags('API pública: empresas')
@ApiPublica()
@UseInterceptors(IdempotenciaInterceptor)
@Controller('publica/empresas')
export class PublicaEmpresasController {
  constructor(private readonly servico: PublicaService) {}

  @Documenta({
    resumo: 'Listar empresas',
    descricao:
      'Exige `empresas.ver`. Filtros: `cnpj`, `status` (chave do sistema: `lead`, `prospect`, `cliente`, `inativo`, ou o id da tag), `tag`, `responsavel_id` e `atualizado_desde`. Paginação por cursor: `limite` (1 a 200, padrão 50) e `cursor` (o `proximo_cursor` da página anterior).',
    consulta: consultaDeEmpresasPublicaSchema,
    resposta: listaDeEmpresasPublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('empresas.ver')
  @Get()
  listar(@Query(new ZodPipe(consultaDeEmpresasPublicaSchema)) consulta: ConsultaDeEmpresasPublica) {
    return this.servico.listarEmpresas(consulta)
  }

  @Documenta({
    resumo: 'Empresa pelo CNPJ (ou CPF)',
    descricao: 'Exige `empresas.ver`. Com ou sem máscara. 404 `empresa_nao_encontrada`.',
    resposta: empresaPublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('empresas.ver')
  @Get('cnpj/:documento')
  porDocumento(@Param('documento') documento: string) {
    return this.servico.obterEmpresaPorDocumento(documento)
  }

  @Documenta({
    resumo: 'Empresa',
    descricao: 'Exige `empresas.ver`. 404 `empresa_nao_encontrada`.',
    resposta: empresaPublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('empresas.ver')
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.servico.obterEmpresa(id)
  }

  @Documenta({
    resumo: 'Cadastrar empresa',
    descricao:
      'Exige `empresas.criar`. Responsável por `responsavel_id` ou `responsavel_email`; sem eles, o responsável padrão da chave (422 `responsavel_obrigatorio`). Com CNPJ e `consultar_receita` (padrão), a consulta à Receita vai para a fila do worker: a resposta volta na hora com `receita.situacao_nao_verificada = true` e o vendedor é avisado se a empresa não estiver ativa. 409 `documento_ja_cadastrado`; 422 `tag_invalida`.' +
      IDEMPOTENCIA,
    corpo: criarEmpresaPublicaSchema,
    resposta: empresaPublicaSchema,
    status: 201,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('empresas.criar')
  @Post()
  criar(@Body(new ZodPipe(criarEmpresaPublicaSchema)) dados: CriarEmpresaPublica) {
    return this.servico.criarEmpresa(dados)
  }

  @Documenta({
    resumo: 'Cadastrar ou atualizar empresas em lote',
    descricao:
      'Exige `empresas.criar` e `empresas.editar`. Até 500 itens no formato de "Cadastrar empresa": o documento (CNPJ ou CPF) decide se cria ou atualiza (na atualização, `status`, `tags` e `consultar_receita` não se aplicam). Cada item é independente: um item ruim não derruba o lote, e o resultado diz o que aconteceu com cada um.' +
      IDEMPOTENCIA,
    corpo: loteDeEmpresasPublicaSchema,
    resposta: resultadoDoLotePublicoSchema,
    erros: [400, 401, 403, 413, 429],
  })
  @Permissao('empresas.criar')
  @Post('lote')
  @HttpCode(200)
  lote(@Body(new ZodPipe(loteDeEmpresasPublicaSchema)) dados: { empresas: unknown[] }) {
    return this.servico.loteDeEmpresas(dados.empresas)
  }

  @Documenta({
    resumo: 'Alterar empresa',
    descricao:
      'Exige `empresas.editar`; trocar o responsável exige também `empresas.transferir`. Só o que vier muda; `telefones` e `endereco` substituem os atuais.',
    corpo: alterarEmpresaPublicaSchema,
    resposta: empresaPublicaSchema,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('empresas.editar')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarEmpresaPublicaSchema)) dados: AlterarEmpresaPublica,
  ) {
    return this.servico.alterarEmpresa(id, dados)
  }

  @Documenta({
    resumo: 'Aplicar uma tag',
    descricao:
      'Exige `empresas.editar`. A tag pela chave do sistema ou pelo id. Grupo de seleção única (Status) substitui a tag do grupo; grupo automático (Visitação) não aceita (400). Aplicar a tag que a empresa já tem não muda nada.',
    resposta: empresaPublicaSchema,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('empresas.editar')
  @Put(':id/tags/:tag')
  aplicarTag(@Param('id', new ParseUUIDPipe()) id: string, @Param('tag') tag: string) {
    return this.servico.aplicarTag(id, tag)
  }

  @Documenta({
    resumo: 'Retirar uma tag',
    descricao:
      'Exige `empresas.editar`. A tag de grupo obrigatório (Status) não sai sozinha: aplique outra do grupo (422).',
    resposta: empresaPublicaSchema,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('empresas.editar')
  @Delete(':id/tags/:tag')
  removerTag(@Param('id', new ParseUUIDPipe()) id: string, @Param('tag') tag: string) {
    return this.servico.removerTag(id, tag)
  }
}

@ApiTags('API pública: contatos')
@ApiPublica()
@UseInterceptors(IdempotenciaInterceptor)
@Controller('publica/contatos')
export class PublicaContatosController {
  constructor(private readonly servico: PublicaService) {}

  @Documenta({
    resumo: 'Listar contatos',
    descricao:
      'Exige `contatos.ver`. Filtros: `email`, `telefone` (E.164 ou como digitado), `empresa_id` e `atualizado_desde`; paginação por cursor.',
    consulta: consultaDeContatosPublicaSchema,
    resposta: listaDeContatosPublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('contatos.ver')
  @Get()
  listar(@Query(new ZodPipe(consultaDeContatosPublicaSchema)) consulta: ConsultaDeContatosPublica) {
    return this.servico.listarContatos(consulta)
  }

  @Documenta({
    resumo: 'Contato',
    descricao: 'Exige `contatos.ver`.',
    resposta: contatoPublicoSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('contatos.ver')
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.servico.obterContato(id)
  }

  @Documenta({
    resumo: 'Cadastrar contato',
    descricao:
      'Exige `contatos.criar` e a empresa (`empresa_id` ou `empresa_cnpj`). Mesmo e-mail ou telefone de outro contato: 409 `contato_duplicado`, salvo `ignorar_duplicado`.' +
      IDEMPOTENCIA,
    corpo: criarContatoPublicoSchema,
    resposta: contatoPublicoSchema,
    status: 201,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('contatos.criar')
  @Post()
  criar(@Body(new ZodPipe(criarContatoPublicoSchema)) dados: CriarContatoPublico) {
    return this.servico.criarContato(dados)
  }

  @Documenta({
    resumo: 'Alterar contato',
    descricao:
      'Exige `contatos.editar`. Só o que vier muda; `emails` e `telefones` substituem os atuais.',
    corpo: alterarContatoPublicoSchema,
    resposta: contatoPublicoSchema,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('contatos.editar')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarContatoPublicoSchema)) dados: AlterarContatoPublico,
  ) {
    return this.servico.alterarContato(id, dados)
  }
}

@ApiTags('API pública: atividades')
@ApiPublica()
@UseInterceptors(IdempotenciaInterceptor)
@Controller('publica/atividades')
export class PublicaAtividadesController {
  constructor(private readonly servico: PublicaService) {}

  @Documenta({
    resumo: 'Listar atividades',
    descricao:
      'Exige `atividades.ver`. Filtros: `empresa_id`, `responsavel_id`, `situacao`, `id_externo` e `atualizado_desde`; paginação por cursor.',
    consulta: consultaDeAtividadesPublicaSchema,
    resposta: listaDeAtividadesPublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('atividades.ver')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeAtividadesPublicaSchema)) consulta: ConsultaDeAtividadesPublica,
  ) {
    return this.servico.listarAtividades(consulta)
  }

  @Documenta({
    resumo: 'Atividade',
    descricao: 'Exige `atividades.ver`.',
    resposta: atividadePublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('atividades.ver')
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.servico.obterAtividade(id)
  }

  @Documenta({
    resumo: 'Registrar atividade',
    descricao:
      'Exige `atividades.criar`. O tipo pela chave do sistema (`ligacao`, `whatsapp`, `email`, `visita`, `reuniao`, `tarefa`) ou pelo id. Sem responsável: o padrão da chave ou o vendedor da empresa. `origem = api`. Com `id_externo` já registrado, devolve a atividade existente com **200** (não cria outra). A atividade realizada atualiza a última visita, o último contato e as tags da empresa como no app.' +
      IDEMPOTENCIA,
    corpo: criarAtividadePublicaSchema,
    resposta: atividadePublicaSchema,
    status: 201,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('atividades.criar')
  @Post()
  async criar(
    @Body(new ZodPipe(criarAtividadePublicaSchema)) dados: CriarAtividadePublica,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { atividade, criada } = await this.servico.criarAtividade(dados)
    if (!criada) res.status(200)
    return atividade
  }

  @Documenta({
    resumo: 'Concluir atividade',
    descricao: 'Exige `atividades.editar`. Resultado obrigatório; `realizada_em` padrão agora.',
    corpo: concluirAtividadePublicaSchema,
    resposta: atividadePublicaSchema,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('atividades.editar')
  @Post(':id/concluir')
  @HttpCode(200)
  concluir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(concluirAtividadePublicaSchema)) dados: ConcluirAtividadePublica,
  ) {
    return this.servico.concluirAtividade(id, dados)
  }
}

@ApiTags('API pública: oportunidades')
@ApiPublica()
@UseInterceptors(IdempotenciaInterceptor)
@Controller('publica/oportunidades')
export class PublicaOportunidadesController {
  constructor(private readonly servico: PublicaService) {}

  @Documenta({
    resumo: 'Listar oportunidades',
    descricao:
      'Exige `oportunidades.ver`. Filtros: `empresa_id`, `funil_id`, `fase_id`, `status`, `responsavel_id` e `atualizado_desde`; paginação por cursor. Valores em string decimal ("350.00").',
    consulta: consultaDeOportunidadesPublicaSchema,
    resposta: listaDeOportunidadesPublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('oportunidades.ver')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeOportunidadesPublicaSchema))
    consulta: ConsultaDeOportunidadesPublica,
  ) {
    return this.servico.listarOportunidades(consulta)
  }

  @Documenta({
    resumo: 'Oportunidade',
    descricao: 'Exige `oportunidades.ver`.',
    resposta: oportunidadePublicaSchema,
    erros: ERROS_DA_LEITURA,
  })
  @Permissao('oportunidades.ver')
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.servico.obterOportunidade(id)
  }

  @Documenta({
    resumo: 'Criar oportunidade',
    descricao:
      'Exige `oportunidades.criar`. Sem funil, o padrão; sem fase, a primeira ativa; sem responsável, o vendedor da empresa.' +
      IDEMPOTENCIA,
    corpo: criarOportunidadePublicaSchema,
    resposta: oportunidadePublicaSchema,
    status: 201,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('oportunidades.criar')
  @Post()
  criar(@Body(new ZodPipe(criarOportunidadePublicaSchema)) dados: CriarOportunidadePublica) {
    return this.servico.criarOportunidade(dados)
  }

  @Documenta({
    resumo: 'Alterar oportunidade',
    descricao:
      'Exige `oportunidades.editar`. Título, valores, previsão, responsável e fase (`fase_id`, do mesmo funil). Fechar (conquistar, perder) fica no app.',
    corpo: alterarOportunidadePublicaSchema,
    resposta: oportunidadePublicaSchema,
    erros: ERROS_DA_ESCRITA,
  })
  @Permissao('oportunidades.editar')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarOportunidadePublicaSchema)) dados: AlterarOportunidadePublica,
  ) {
    return this.servico.alterarOportunidade(id, dados)
  }
}
