import {
  type ConsultaDeContatos,
  type ConsultaDoHistorico,
  consultaDoHistoricoSchema,
  type HistoricoDaEmpresa,
  historicoDaEmpresaSchema,
  consultaDeContatosSchema,
  type ListaDeContatos,
  listaDeContatosSchema,
  type OpcoesDaListaDeContatos,
  opcoesDaListaDeContatosSchema,
  type AlterarContato,
  type AlterarVinculo,
  alterarVinculoSchema,
  type VincularContato,
  vincularContatoSchema,
  alterarContatoSchema,
  type Contato,
  contatoSchema,
  type CriarContato,
  criarContatoSchema,
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
import { ContatosService } from './contatos.service.js'
import { HistoricoDoContatoService } from './historico-contato.service.js'
import { ListaDeContatosService } from './lista-contatos.service.js'
import { VinculosDoContatoService } from './vinculos-do-contato.service.js'

const CARTEIRA =
  'Regra de carteira: admin e gestor veem e editam todos os contatos; o vendedor vê o contato ligado a empresa que ele vê (a própria carteira, ou todas, se a empresa ligou "Vendedores podem ver todas as empresas") e edita o ligado a empresa dele. Contato que o usuário não vê responde 404.'

/** Contatos (pessoas) da carteira da empresa ativa. */
@ApiTags('Carteira: contatos')
@Controller('carteira/contatos')
export class ContatosController {
  constructor(
    private readonly servico: ContatosService,
    private readonly lista: ListaDeContatosService,
    private readonly vinculos: VinculosDoContatoService,
    private readonly historico: HistoricoDoContatoService,
  ) {}

  @Documenta({
    resumo: 'Lista de contatos',
    descricao: `${CARTEIRA} Busca por nome (sem acento), e-mail ou telefone (pedaço, com ou sem máscara). Os filtros \`empresaId\`, \`cargo\` e \`tagId\` (tag da empresa) valem juntos para o mesmo vínculo ativo; \`papelDecisaoId\` filtra a pessoa. Cada item traz só as empresas que o usuário vê, o telefone principal (E.164), o e-mail principal e se pediu para não ser contatado. Ordem por nome (padrão) ou data de cadastro, paginada.`,
    consulta: consultaDeContatosSchema,
    resposta: listaDeContatosSchema,
    erros: [400, 401, 403],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeContatosSchema)) consulta: ConsultaDeContatos,
  ): Promise<ListaDeContatos> {
    return this.lista.listar(consulta)
  }

  @Documenta({
    resumo: 'Opções dos filtros da lista de contatos',
    descricao: `${CARTEIRA} Os cargos que existem nos vínculos ativos que o usuário vê.`,
    resposta: opcoesDaListaDeContatosSchema,
    erros: [401, 403],
  })
  @Get('opcoes')
  opcoes(): Promise<OpcoesDaListaDeContatos> {
    return this.lista.opcoes()
  }

  @Documenta({
    resumo: 'Cadastrar contato',
    descricao: `${CARTEIRA} O vendedor informa a empresa (\`vinculo\`, só empresa da carteira dele; 400 \`empresa_obrigatoria\`); gestor e admin podem criar sem empresa. Telefones viram E.164 e e-mails ficam em minúsculas, cada lista com um principal. Já existe contato com o mesmo e-mail ou telefone: 409 \`contato_duplicado\` com \`dados.existentes\` (id e nome só dos que o usuário vê), e a pessoa escolhe abrir o existente ou reenviar com \`ignorarDuplicado: true\`. Falso em \`aceitaWhatsapp\` ou \`aceitaEmail\` registra o consentimento (data e origem "manual"). Registra na auditoria.`,
    corpo: criarContatoSchema,
    resposta: contatoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429],
  })
  @Post()
  @Limite({ nome: 'carteira-contatos-criar', max: 60, janelaS: 60 })
  criar(@Body(new ZodPipe(criarContatoSchema)) dados: CriarContato): Promise<Contato> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Ficha do contato',
    descricao: `${CARTEIRA} Traz a pessoa, telefones, e-mails, o consentimento e os vínculos com as empresas que o usuário vê (os outros não aparecem).`,
    resposta: contatoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Get(':id')
  detalhar(@Param('id', new ParseUUIDPipe()) id: string): Promise<Contato> {
    return this.servico.detalhar(id)
  }

  @Documenta({
    resumo: 'Editar contato',
    descricao: `${CARTEIRA} Só o que vier muda; \`telefones\` e \`emails\`, se vierem, substituem a lista toda. Mudar \`aceitaWhatsapp\` ou \`aceitaEmail\` atualiza a data e a origem do consentimento. Telefone ou e-mail novo que já é de outro contato: 409 \`contato_duplicado\` (reenvie com \`ignorarDuplicado\`). Os vínculos com empresas têm rotas próprias. Registra na auditoria o antes e o depois.`,
    corpo: alterarContatoSchema,
    resposta: contatoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarContatoSchema)) dados: AlterarContato,
  ): Promise<Contato> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Vincular o contato a uma empresa',
    descricao: `${CARTEIRA} Liga o contato a outra empresa **da carteira do usuário** (o vendedor só vincula a empresa dele; 403 nas demais) com o cargo daquela empresa. Vínculo inativo com a mesma empresa é reativado. \`principal: true\` tira o selo do contato principal anterior. Já vinculado e ativo: 409 \`vinculo_ja_existe\`. Registra na auditoria. Devolve o contato.`,
    corpo: vincularContatoSchema,
    resposta: contatoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429],
  })
  @Post(':id/vinculos')
  @Limite({ nome: 'carteira-contatos-vincular', max: 60, janelaS: 60 })
  vincular(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(vincularContatoSchema)) dados: VincularContato,
  ): Promise<Contato> {
    return this.vinculos.vincular(id, dados)
  }

  @Documenta({
    resumo: 'Alterar o vínculo do contato com uma empresa',
    descricao: `${CARTEIRA} Muda o cargo, o contato principal da empresa (um só: marcar este tira o selo do anterior) e a situação do vínculo. \`ativo: false\` é o caminho comum quando a pessoa sai da empresa: o histórico fica, o selo de principal sai e o vínculo deixa de contar nos filtros da lista. Só vínculo ativo pode ser o principal (400 \`vinculo_inativo\`). Exige editar a empresa do vínculo (o vendedor, só a própria carteira). Vínculo com empresa que o usuário não vê é 404. Devolve o contato (quem inativou o último vínculo ainda o recebe, mas deixa de vê-lo na lista).`,
    corpo: alterarVinculoSchema,
    resposta: contatoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id/vinculos/:empresaId')
  alterarVinculo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('empresaId', new ParseUUIDPipe()) empresaId: string,
    @Body(new ZodPipe(alterarVinculoSchema)) dados: AlterarVinculo,
  ): Promise<Contato> {
    return this.vinculos.alterar(id, empresaId, dados)
  }

  @Documenta({
    resumo: 'Histórico do contato',
    descricao: `${CARTEIRA} A aba Histórico da ficha: a auditoria do contato em português (quem, quando, o que mudou, com nomes no lugar de ids): cadastro, dados e consentimento alterados, vínculos criados, alterados, inativados e reativados. Linhas que citam empresa que o usuário não vê ficam de fora. Mesmo formato do histórico da empresa; do mais recente para o mais antigo, paginado.`,
    consulta: consultaDoHistoricoSchema,
    resposta: historicoDaEmpresaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Get(':id/historico')
  historicoDoContato(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(consultaDoHistoricoSchema)) consulta: ConsultaDoHistorico,
  ): Promise<HistoricoDaEmpresa> {
    return this.historico.listar(id, consulta)
  }

  @Documenta({
    resumo: 'Excluir contato',
    descricao: `${CARTEIRA} Exclusão lógica (sem lixeira no MVP), só de gestor e administrador. O caminho comum para quem saiu da empresa é inativar o vínculo. Registra na auditoria.`,
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
