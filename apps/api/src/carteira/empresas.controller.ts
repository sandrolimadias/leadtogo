import {
  type AlterarEmpresaCarteira,
  alterarEmpresaCarteiraSchema,
  type ConsultaDaLista,
  consultaDaListaSchema,
  consultaDeContagensSchema,
  type ContagensDaLista,
  contagensDaListaSchema,
  type CriarEmpresaCarteira,
  criarEmpresaCarteiraSchema,
  type EmpresaCarteira,
  empresaCarteiraSchema,
  type ListaDeEmpresas,
  listaDeEmpresasSchema,
  type OpcoesDaLista,
  opcoesDaListaSchema,
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

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { EmpresasDaCarteiraService } from './empresas.service.js'
import { ListaDeEmpresasService } from './lista.service.js'

const CARTEIRA =
  'Regra de carteira: admin e gestor veem e editam tudo; o vendedor vê a própria carteira (ou todas, se a empresa ligou "Vendedores podem ver todas as empresas") e edita só a própria. Empresa que o usuário não vê responde 404.'

/** Empresas da carteira (clientes, prospects e leads) da empresa ativa. */
@ApiTags('Carteira: empresas')
@Controller('carteira/empresas')
export class EmpresasDaCarteiraController {
  constructor(
    private readonly servico: EmpresasDaCarteiraService,
    private readonly lista: ListaDeEmpresasService,
  ) {}

  @Documenta({
    resumo: 'Lista de empresas da carteira',
    descricao: `${CARTEIRA} Busca sem acento (nome, razão social, CNPJ/CPF com ou sem máscara, cidade), filtros (\`tags\`: a empresa precisa ter todas; vendedor, cidade, última visita), chips fixos e paginação. Os chips "sem visita há 90 dias", "nunca visitadas" e "sem próxima atividade" consideram só Status Cliente e Prospect, salvo \`incluirLeads=true\`. Cada item traz todas as tags, o telefone principal (Ligar/WhatsApp) e o endereço para a rota.`,
    consulta: consultaDaListaSchema,
    resposta: listaDeEmpresasSchema,
    erros: [400, 401, 403, 409],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaDaListaSchema)) consulta: ConsultaDaLista,
  ): Promise<ListaDeEmpresas> {
    return this.lista.listar(consulta)
  }

  @Documenta({
    resumo: 'Contagem dos chips da lista',
    descricao: `${CARTEIRA} Quantas empresas cada chip mostra, só entre as que o usuário vê.`,
    consulta: consultaDeContagensSchema,
    resposta: contagensDaListaSchema,
    erros: [400, 401, 403, 409],
  })
  @Get('contagens')
  contagens(
    @Query(new ZodPipe(consultaDeContagensSchema)) consulta: { incluirLeads: 'true' | 'false' },
  ): Promise<ContagensDaLista> {
    return this.lista.contagens(consulta.incluirLeads === 'true')
  }

  @Documenta({
    resumo: 'Opções dos filtros da lista',
    descricao: `${CARTEIRA} Equipe ativa, cidades das empresas visíveis e se há um único membro (o front esconde o filtro Vendedor e o chip "Minha carteira"). Traz também os dias sem contato que a empresa configurou para o alerta.`,
    resposta: opcoesDaListaSchema,
    erros: [401, 403, 409],
  })
  @Get('opcoes')
  opcoes(): Promise<OpcoesDaLista> {
    return this.lista.opcoes()
  }

  @Documenta({
    resumo: 'Cadastrar empresa na carteira',
    descricao: `${CARTEIRA} Cadastro por CNPJ, CPF ou sem documento. Para CNPJ a API consulta a Receita (cache de 30 dias): empresa baixada, inapta, suspensa ou nula é recusada com 409 \`empresa_nao_ativa\` quando o bloqueio da empresa está ligado (padrão). Com a Receita fora do ar, salva com \`situacaoNaoVerificada\` e o sistema reconsulta depois, avisando o vendedor se a empresa não estiver ativa. Documento repetido: 409 \`empresa_ja_cadastrada\` com \`dados.existente\` (id e nome só se o usuário vê aquela empresa). O vendedor cadastra só na própria carteira; o Status inicial é Lead. Sócios e a situação vêm da Receita, nunca do cliente. Registra na auditoria.`,
    corpo: criarEmpresaCarteiraSchema,
    resposta: empresaCarteiraSchema,
    status: 201,
    erros: [400, 401, 403, 409, 429, 503],
  })
  @Post()
  @Limite({ nome: 'carteira-empresas-criar', max: 60, janelaS: 60 })
  criar(
    @Body(new ZodPipe(criarEmpresaCarteiraSchema)) dados: CriarEmpresaCarteira,
  ): Promise<EmpresaCarteira> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Ficha da empresa',
    descricao: `${CARTEIRA} Traz dados cadastrais, telefones, CNAEs, sócios, tags, matriz e filiais visíveis, a situação da última consulta à Receita e o que o usuário pode fazer (\`permissoes\`).`,
    resposta: empresaCarteiraSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Get(':id')
  detalhar(@Param('id', new ParseUUIDPipe()) id: string): Promise<EmpresaCarteira> {
    return this.servico.detalhar(id)
  }

  @Documenta({
    resumo: 'Editar empresa',
    descricao: `${CARTEIRA} Só o que vier muda; o documento e o Status não se alteram aqui. \`endereco\`, \`telefones\` e \`cnaes\`, se vierem, substituem o conjunto todo. Passar a carteira para outro vendedor (\`vendedorId\`) é só de gestor e administrador. Registra na auditoria o que mudou.`,
    corpo: alterarEmpresaCarteiraSchema,
    resposta: empresaCarteiraSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarEmpresaCarteiraSchema)) dados: AlterarEmpresaCarteira,
  ): Promise<EmpresaCarteira> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir empresa',
    descricao: `${CARTEIRA} Exclusão lógica (sem lixeira no MVP), só de gestor e administrador; o documento pode ser cadastrado de novo. As filiais deixam de apontar para a matriz excluída. Registra na auditoria.`,
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
