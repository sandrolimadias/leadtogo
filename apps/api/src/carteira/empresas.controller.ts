import {
  type Contato,
  contatoSchema,
  type ContatoDaEmpresa,
  contatoDaEmpresaSchema,
  type AlterarEmpresaCarteira,
  alterarEmpresaCarteiraSchema,
  type AplicarDaReceita,
  aplicarDaReceitaSchema,
  type AplicarTagEmMassa,
  aplicarTagEmMassaSchema,
  type ConsultaDaLista,
  type ConverterSocio,
  converterSocioSchema,
  type ConsultaDaReceitaDaEmpresa,
  consultaDaReceitaDaEmpresaSchema,
  type ConsultaDoHistorico,
  consultaDoHistoricoSchema,
  consultaDaListaSchema,
  consultaDeContagensSchema,
  type ContagensDaLista,
  contagensDaListaSchema,
  type CriarEmpresaCarteira,
  criarEmpresaCarteiraSchema,
  type DefinirTagsDaEmpresa,
  definirTagsDaEmpresaSchema,
  type EmpresaCarteira,
  empresaCarteiraSchema,
  type HistoricoDaEmpresa,
  historicoDaEmpresaSchema,
  type ListaDeEmpresas,
  listaDeEmpresasSchema,
  type OpcoesDaLista,
  opcoesDaListaSchema,
  type ResultadoDaTagEmMassa,
  resultadoDaTagEmMassaSchema,
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
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { TransacaoSobDemanda } from '../acesso/acesso.decorators.js'
import { AtualizarPelaReceitaService } from './atualizar-receita.service.js'
import { ConverterSocioService } from './converter-socio.service.js'
import { EmpresasDaCarteiraService } from './empresas.service.js'
import { HistoricoDaEmpresaService } from './historico.service.js'
import { ListaDeEmpresasService } from './lista.service.js'
import { VinculosDoContatoService } from './vinculos-do-contato.service.js'

const CARTEIRA =
  'Regra de carteira: admin e gestor veem e editam tudo; o vendedor vê a própria carteira (ou todas, se a empresa ligou "Vendedores podem ver todas as empresas") e edita só a própria. Empresa que o usuário não vê responde 404.'

/** Empresas da carteira (clientes, prospects e leads) da empresa ativa. */
@ApiTags('Carteira: empresas')
@Controller('carteira/empresas')
export class EmpresasDaCarteiraController {
  constructor(
    private readonly servico: EmpresasDaCarteiraService,
    private readonly lista: ListaDeEmpresasService,
    private readonly historico: HistoricoDaEmpresaService,
    private readonly atualizacaoDaReceita: AtualizarPelaReceitaService,
    private readonly vinculos: VinculosDoContatoService,
    private readonly converterSocio: ConverterSocioService,
  ) {}

  @Documenta({
    resumo: 'Lista de empresas da carteira',
    descricao: `${CARTEIRA} Busca sem acento (nome, razão social, CNPJ/CPF com ou sem máscara, cidade), filtros (\`tags\`: a empresa precisa ter todas; vendedor, cidade, última visita), chips fixos e paginação. Os chips "sem visita há 90 dias", "nunca visitadas" e "sem próxima atividade" consideram só Status Cliente e Prospect, salvo \`incluirLeads=true\`. Cada item traz todas as tags, o telefone principal (Ligar/WhatsApp) e o endereço para a rota.`,
    consulta: consultaDaListaSchema,
    resposta: listaDeEmpresasSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('empresas.ver')
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
  @Permissao('empresas.ver')
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
  @Permissao('empresas.ver', 'empresas.criar')
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
  @Permissao('empresas.criar')
  @Post()
  @TransacaoSobDemanda()
  @Limite({ nome: 'carteira-empresas-criar', max: 60, janelaS: 60 })
  criar(
    @Body(new ZodPipe(criarEmpresaCarteiraSchema)) dados: CriarEmpresaCarteira,
  ): Promise<EmpresaCarteira> {
    return this.servico.cadastrar(dados)
  }

  @Documenta({
    resumo: 'Aplicar uma tag a várias empresas',
    descricao: `${CARTEIRA} Aplica UMA tag a até 200 empresas de uma vez. Tag de grupo de seleção única (Status) substitui a que a empresa já tinha no grupo. Só mexe nas empresas que o usuário pode editar (o vendedor, só nas dele): as outras ficam como estavam e entram em \`ignoradas\`. Tag de grupo automático (Visitação) é 400 \`tag_automatica\`; inativa, 400 \`tag_inativa\`. Cada empresa muda no histórico de tags e na auditoria.`,
    corpo: aplicarTagEmMassaSchema,
    resposta: resultadoDaTagEmMassaSchema,
    status: 200,
    erros: [400, 401, 403, 409, 429],
  })
  @Permissao('empresas.editar')
  @Post('tags-em-massa')
  @HttpCode(200)
  @Limite({ nome: 'carteira-tags-em-massa', max: 30, janelaS: 60 })
  aplicarTagEmMassa(
    @Body(new ZodPipe(aplicarTagEmMassaSchema)) dados: AplicarTagEmMassa,
  ): Promise<ResultadoDaTagEmMassa> {
    return this.servico.aplicarTagEmMassa(dados)
  }

  @Documenta({
    resumo: 'Ficha da empresa',
    descricao: `${CARTEIRA} Traz dados cadastrais, telefones, CNAEs, sócios, tags, matriz e filiais visíveis, a situação da última consulta à Receita e o que o usuário pode fazer (\`permissoes\`).`,
    resposta: empresaCarteiraSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('empresas.ver')
  @Get(':id')
  detalhar(@Param('id', new ParseUUIDPipe()) id: string): Promise<EmpresaCarteira> {
    return this.servico.detalhar(id)
  }

  @Documenta({
    resumo: 'Histórico da empresa',
    descricao: `${CARTEIRA} A aba Histórico da ficha: a auditoria da empresa em português (quem, quando, o que mudou, com nomes no lugar de ids) e as tags que o sistema aplicou ou tirou sozinho (\`por.nome\` = "Sistema"). Do mais recente para o mais antigo, paginado.`,
    consulta: consultaDoHistoricoSchema,
    resposta: historicoDaEmpresaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('empresas.ver')
  @Get(':id/historico')
  historicoDaEmpresa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(consultaDoHistoricoSchema)) consulta: ConsultaDoHistorico,
  ): Promise<HistoricoDaEmpresa> {
    return this.historico.listar(id, consulta)
  }

  @Documenta({
    resumo: 'Contatos da empresa',
    descricao: `${CARTEIRA} A aba Contatos da ficha: todos os vínculos da empresa (os ativos primeiro, o principal antes), com cargo, papel na decisão, telefone e e-mail principais e o selo "Não quer contato". Contato excluído não aparece.`,
    resposta: z.array(contatoDaEmpresaSchema),
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('empresas.ver')
  @Get(':id/contatos')
  contatosDaEmpresa(@Param('id', new ParseUUIDPipe()) id: string): Promise<ContatoDaEmpresa[]> {
    return this.vinculos.daEmpresa(id)
  }

  @Documenta({
    resumo: 'Converter sócio em contato',
    corpo: converterSocioSchema,
    descricao: `${CARTEIRA} Cria o contato com o nome do sócio e o vínculo com a empresa (cargo = qualificação do sócio) e, se vierem no corpo, o telefone e o e-mail (opcionais; em branco o contato nasce sem eles; telefone inválido dá 400 e nada é criado) e marca o sócio como "Contato". O vínculo sobrevive ao "Atualizar pela Receita". Sócio já convertido: 409 \`socio_ja_convertido\`. Exige editar a empresa (o vendedor, só a própria carteira). Registra na auditoria. Devolve o contato.`,
    resposta: contatoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429],
  })
  @Permissao('contatos.criar')
  @Post(':id/socios/:socioId/converter')
  @Limite({ nome: 'carteira-socios-converter', max: 60, janelaS: 60 })
  converterSocioEmContato(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('socioId', new ParseUUIDPipe()) socioId: string,
    @Body(new ZodPipe(converterSocioSchema.optional())) dados: ConverterSocio | undefined,
  ): Promise<Contato> {
    return this.converterSocio.converter(id, socioId, dados ?? {})
  }

  @Documenta({
    resumo: 'Editar empresa',
    descricao: `${CARTEIRA} Só o que vier muda; o documento e o Status não se alteram aqui. \`endereco\`, \`telefones\` e \`cnaes\`, se vierem, substituem o conjunto todo. Passar a carteira para outro vendedor (\`vendedorId\`) é só de gestor e administrador. Registra na auditoria o que mudou.`,
    corpo: alterarEmpresaCarteiraSchema,
    resposta: empresaCarteiraSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('empresas.editar')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarEmpresaCarteiraSchema)) dados: AlterarEmpresaCarteira,
  ): Promise<EmpresaCarteira> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Definir as tags da empresa',
    descricao: `${CARTEIRA} Substitui as tags dos grupos manuais (Status, Interesse...): grupo de seleção única aceita uma tag (400 \`grupo_selecao_unica\`), grupo obrigatório exige uma (400 \`grupo_obrigatorio\`), tag inativa não se aplica de novo (400 \`tag_inativa\`). As tags de grupo automático (Visitação) são do sistema (400 \`tag_automatica\` se pedidas à mão) e continuam como estão. Cada tag que entra ou sai vai para o histórico de tags (base da conversão Lead → Cliente) e para a auditoria.`,
    corpo: definirTagsDaEmpresaSchema,
    resposta: empresaCarteiraSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('empresas.editar')
  @Put(':id/tags')
  definirTags(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(definirTagsDaEmpresaSchema)) dados: DefinirTagsDaEmpresa,
  ): Promise<EmpresaCarteira> {
    return this.servico.definirTags(id, dados.tagIds)
  }

  @Documenta({
    resumo: 'Atualizar pela Receita: consultar',
    descricao: `${CARTEIRA} Só empresa com CNPJ (409 \`sem_cnpj\`) e só quem pode editá-la. Reconsulta a Receita ignorando o cache, grava a data da consulta (e tira o selo "situação não verificada") e devolve a situação atual e o que difere do cadastro (\`mudancas\`, atual × Receita). Nada do cadastro muda ainda: é o passo 2 (\`aplicar\`) que aplica. Empresa que deixou de ser ativa continua na carteira. As duas fontes fora do ar: 503 \`receita_indisponivel\`. Registra na auditoria.`,
    resposta: consultaDaReceitaDaEmpresaSchema,
    status: 200,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Permissao('empresas.editar')
  @Post(':id/receita/consultar')
  @TransacaoSobDemanda()
  @HttpCode(200)
  @Limite({ nome: 'carteira-empresa-receita', max: 20, janelaS: 60 })
  consultarReceita(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConsultaDaReceitaDaEmpresa> {
    return this.atualizacaoDaReceita.consultar(id)
  }

  @Documenta({
    resumo: 'Atualizar pela Receita: aplicar alterações',
    descricao: `${CARTEIRA} Aplica ao cadastro o que a última consulta apontou: tudo, ou só os \`campos\` pedidos. Telefones da Receita só se somam aos da equipe; sócios vêm sempre da Receita. "Manter como está" é não chamar esta rota. Registra na auditoria o antes e o depois.`,
    corpo: aplicarDaReceitaSchema,
    resposta: empresaCarteiraSchema,
    status: 200,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Permissao('empresas.editar')
  @Post(':id/receita/aplicar')
  @TransacaoSobDemanda()
  @HttpCode(200)
  @Limite({ nome: 'carteira-empresa-receita', max: 20, janelaS: 60 })
  aplicarReceita(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(aplicarDaReceitaSchema)) dados: AplicarDaReceita,
  ): Promise<EmpresaCarteira> {
    return this.atualizacaoDaReceita.aplicar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir empresa',
    descricao: `${CARTEIRA} Exclusão lógica (sem lixeira no MVP), só de gestor e administrador; o documento pode ser cadastrado de novo. As filiais deixam de apontar para a matriz excluída. Registra na auditoria.`,
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('empresas.excluir')
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
