import {
  type AlterarOportunidade,
  alterarOportunidadeSchema,
  type ConsultaDeOportunidades,
  consultaDeOportunidadesSchema,
  type ConsultaDoKanban,
  consultaDoKanbanSchema,
  type CriarOportunidade,
  criarOportunidadeSchema,
  type DefinirTagsDaOportunidade,
  definirTagsDaOportunidadeSchema,
  type FecharOportunidade,
  fecharOportunidadeSchema,
  type KanbanDeOportunidades,
  kanbanSchema,
  type ListaDeOportunidades,
  listaDeOportunidadesSchema,
  type MoverOportunidade,
  moverOportunidadeSchema,
  type Oportunidade,
  type OportunidadeDetalhada,
  oportunidadeDetalhadaSchema,
  oportunidadeSchema,
  type ResultadoDoMovimento,
  resultadoDoMovimentoSchema,
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

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { ListaDeOportunidadesService } from './lista-oportunidades.service.js'
import { OportunidadesService } from './oportunidades.service.js'

const CARTEIRA =
  'Regra de carteira: admin e gestor veem e alteram todas as oportunidades; o vendedor vê as das empresas que vê (a própria carteira, ou todas, se a empresa ligou "Vendedores podem ver todas as empresas") e cria, edita, move, fecha e reabre só as das empresas dele. Oportunidade que o usuário não vê responde 404.'

const VALORES =
  'Valores: o usuário digita `valorUnico`, `valorMensal` e `meses`; `valorTotal` (único + mensal × meses) e `valorPonderado` (total × probabilidade) são calculados pelo banco e nunca digitados.'

/** Oportunidades de venda da carteira da empresa ativa. */
@ApiTags('Carteira: oportunidades')
@Controller('carteira/oportunidades')
export class OportunidadesController {
  constructor(
    private readonly servico: OportunidadesService,
    private readonly lista: ListaDeOportunidadesService,
  ) {}

  @Documenta({
    resumo: 'Kanban de um funil',
    descricao: `${CARTEIRA} Só as oportunidades Ativas, nas colunas das fases ativas do funil (sem \`funilId\`, o funil padrão), com a contagem e a soma de cada coluna, o resumo (ativas, total, mensal, ponderado) e quantas Suspensas o funil tem. Cada coluna traz até 100 oportunidades; \`semMostrar\` diz quantas ficaram de fora. ${VALORES}`,
    consulta: consultaDoKanbanSchema,
    resposta: kanbanSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('oportunidades.ver')
  @Get('kanban')
  kanban(
    @Query(new ZodPipe(consultaDoKanbanSchema)) consulta: ConsultaDoKanban,
  ): Promise<KanbanDeOportunidades> {
    return this.lista.kanban(consulta)
  }

  @Documenta({
    resumo: 'Lista de oportunidades',
    descricao: `${CARTEIRA} Lista simples de qualquer status, com filtros (status, funil, fase, empresa, responsável, busca por título ou empresa), ordenação, paginação e as somas do que o filtro pegou. ${VALORES}`,
    consulta: consultaDeOportunidadesSchema,
    resposta: listaDeOportunidadesSchema,
    erros: [400, 401, 403],
  })
  @Permissao('oportunidades.ver')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeOportunidadesSchema)) consulta: ConsultaDeOportunidades,
  ): Promise<ListaDeOportunidades> {
    return this.lista.listar(consulta)
  }

  @Documenta({
    resumo: 'Cadastrar oportunidade',
    descricao: `${CARTEIRA} Sem funil, vale o funil padrão; sem fase, a primeira fase ativa dele; sem responsável, o vendedor da empresa (o vendedor só atribui a si). Sem \`probabilidade\`, vale a da fase; uma probabilidade diferente da fase fica marcada como editada à mão. Com valor mensal e sem \`meses\`, valem 12. O contato precisa ser da empresa (400 \`contato_invalido\`). A data prevista é opcional. ${VALORES} Registra na auditoria e no histórico da oportunidade.`,
    corpo: criarOportunidadeSchema,
    resposta: oportunidadeSchema,
    status: 201,
    erros: [400, 401, 403, 404, 429],
  })
  @Permissao('oportunidades.criar')
  @Post()
  @Limite({ nome: 'carteira-oportunidades-criar', max: 120, janelaS: 60 })
  criar(
    @Body(new ZodPipe(criarOportunidadeSchema)) dados: CriarOportunidade,
  ): Promise<Oportunidade> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Ficha da oportunidade',
    descricao: `${CARTEIRA} Traz os dados, o alerta de parada (\`diasParada\`, \`parada\`), a próxima atividade e o histórico de fases e de status.`,
    resposta: oportunidadeDetalhadaSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('oportunidades.ver')
  @Get(':id')
  detalhar(@Param('id', new ParseUUIDPipe()) id: string): Promise<OportunidadeDetalhada> {
    return this.servico.detalhar(id)
  }

  @Documenta({
    resumo: 'Editar oportunidade',
    descricao: `${CARTEIRA} Só o que vier muda. Fase e status mudam por \`mover\` e \`fechar\`. Informar a \`probabilidade\` igual à da fase volta a acompanhar a fase; diferente, marca como editada à mão. ${VALORES} \`criadaEm\` (dia AAAA-MM-DD no fuso da empresa) muda a data de criação: exige \`oportunidades.data_criacao\` (403 \`acesso_negado\`), nunca no futuro (400 \`criacao_no_futuro\`) nem depois do dia do fechamento (400 \`criacao_depois_do_fechamento\`). Registra na auditoria o antes e o depois.`,
    corpo: alterarOportunidadeSchema,
    resposta: oportunidadeSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('oportunidades.editar')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarOportunidadeSchema)) dados: AlterarOportunidade,
  ): Promise<Oportunidade> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Definir as tags da oportunidade',
    descricao: `${CARTEIRA} Substitui as tags da oportunidade pelas de \`tagIds\` (vale também para a fechada). Só tags ativas de grupos de tags de oportunidade (400 \`tag_invalida\` / \`tag_inativa\`); grupo de seleção única aceita uma só (400 \`grupo_selecao_unica\`). Registra \`alterar_tags\` na auditoria.`,
    corpo: definirTagsDaOportunidadeSchema,
    resposta: oportunidadeSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('oportunidades.editar')
  @Put(':id/tags')
  definirTags(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(definirTagsDaOportunidadeSchema)) dados: DefinirTagsDaOportunidade,
  ): Promise<Oportunidade> {
    return this.servico.definirTags(id, dados.tagIds)
  }

  @Documenta({
    resumo: 'Mover de fase',
    descricao: `${CARTEIRA} Só oportunidade Ativa, para uma fase ativa do mesmo funil (409 \`oportunidade_nao_ativa\`; 400 \`fase_invalida\`). A probabilidade assume a da nova fase, a menos que tenha sido editada à mão: então fica a dela e \`avisoDeProbabilidade\` traz a sugestão da nova fase. Registra no histórico de fases.`,
    corpo: moverOportunidadeSchema,
    resposta: resultadoDoMovimentoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('oportunidades.editar')
  @Post(':id/mover')
  @HttpCode(200)
  mover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(moverOportunidadeSchema)) dados: MoverOportunidade,
  ): Promise<ResultadoDoMovimento> {
    return this.servico.mover(id, dados.faseId)
  }

  @Documenta({
    resumo: 'Fechar oportunidade',
    descricao: `${CARTEIRA} Conquistado, Perdido, Cancelado ou Suspenso (só de uma Ativa; 409 \`oportunidade_nao_ativa\`). Perdido, Cancelado e Suspenso exigem o \`motivoId\` (da lista do status; 400 \`motivo_invalido\`); Suspenso exige \`retomarEm\` e cria a atividade de retomada (Tarefa de dia inteiro nessa data, com a mesma empresa e o mesmo responsável). Guarda a fase em que parou e a data de fechamento. Conquistado muda a empresa para Cliente (a tag \`chave_sistema = cliente\`, seja qual for o nome dela) se \`empresaViraCliente\` for verdadeiro (sem o campo, vale a configuração da empresa). \`dataFechamento\` (dia AAAA-MM-DD no fuso da empresa; sem ele, vale o momento) exige \`oportunidades.data_fechamento\` (403 \`acesso_negado\`), nunca no futuro (400 \`fechamento_no_futuro\`) nem antes do dia da criação (400 \`fechamento_antes_da_criacao\`); dia passado grava o meio-dia desse dia.`,
    corpo: fecharOportunidadeSchema,
    resposta: oportunidadeSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('oportunidades.editar')
  @Post(':id/fechar')
  @HttpCode(200)
  fechar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(fecharOportunidadeSchema)) dados: FecharOportunidade,
  ): Promise<Oportunidade> {
    return this.servico.fechar(id, dados)
  }

  @Documenta({
    resumo: 'Reabrir oportunidade',
    descricao: `${CARTEIRA} Volta a Ativa (409 \`oportunidade_ja_ativa\`), na mesma fase (ou na primeira ativa do funil, se a fase foi inativada). Não desfaz o "empresa vira Cliente": fica só o registro no histórico. Cancela a atividade de retomada que ainda esteja aberta.`,
    resposta: oportunidadeSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('oportunidades.editar')
  @Post(':id/reabrir')
  @HttpCode(200)
  reabrir(@Param('id', new ParseUUIDPipe()) id: string): Promise<Oportunidade> {
    return this.servico.reabrir(id)
  }

  @Documenta({
    resumo: 'Excluir oportunidade',
    descricao: `${CARTEIRA} Exclusão lógica (sem lixeira no MVP), só de gestor e administrador. Registra na auditoria.`,
    status: 204,
    erros: [400, 401, 403, 404],
  })
  @Permissao('oportunidades.excluir')
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
