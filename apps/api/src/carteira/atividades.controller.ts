import {
  type AlterarAtividade,
  alterarAtividadeSchema,
  type Atividade,
  atividadeSchema,
  type ConcluirAtividade,
  concluirAtividadeSchema,
  type ConsultaDeAtividades,
  consultaDeAtividadesSchema,
  type CriarAtividade,
  criarAtividadeSchema,
  type ListaDeAtividades,
  listaDeAtividadesSchema,
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
import { AtividadesService } from './atividades.service.js'
import { ListaDeAtividadesService } from './lista-atividades.service.js'

const CARTEIRA =
  'Regra de carteira: admin e gestor veem e editam todas as atividades; o vendedor vê a atividade da empresa que ele vê (a própria carteira, ou todas, se a empresa ligou "Vendedores podem ver todas as empresas") e edita a da empresa dele; a Tarefa sem empresa só o responsável (e admin e gestor) vê. Atividade que o usuário não vê responde 404.'

const EFEITO =
  'Toda mudança recalcula na empresa a última visita, o último contato (a visita também conta como contato), a próxima atividade e as tags Visitada e Contactada; a tag só sai quando não resta nenhuma atividade realizada daquele tipo.'

/** Atividades (e tarefas) da carteira da empresa ativa. */
@ApiTags('Carteira: atividades')
@Controller('carteira/atividades')
export class AtividadesController {
  constructor(
    private readonly servico: AtividadesService,
    private readonly lista: ListaDeAtividadesService,
  ) {}

  @Documenta({
    resumo: 'Lista de atividades',
    descricao: `${CARTEIRA} Abas \`agendadas\` (abertas que ainda não passaram), \`atrasadas\` (abertas com a data passada; a de dia inteiro só atrasa depois do dia, no fuso da empresa) e \`realizadas\`; sem aba, a linha do tempo (as abertas primeiro, depois o histórico, com as canceladas). Filtros por empresa, contato, tipo, responsável, \`minhas\` e busca (título, empresa ou contato). Traz a contagem de cada aba com os mesmos filtros.`,
    consulta: consultaDeAtividadesSchema,
    resposta: listaDeAtividadesSchema,
    erros: [400, 401, 403],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeAtividadesSchema)) consulta: ConsultaDeAtividades,
  ): Promise<ListaDeAtividades> {
    return this.lista.listar(consulta)
  }

  @Documenta({
    resumo: 'Registrar atividade',
    descricao: `${CARTEIRA} Situação \`realizada\` (padrão: já aconteceu, \`resultado\` obrigatório e \`dataInicio\` é quando aconteceu, sem passar de 5 minutos no futuro: 400 \`atividade_no_futuro\`) ou \`pendente\` (agendar). A empresa é obrigatória, exceto no tipo Tarefa (400 \`empresa_obrigatoria\`); o contato precisa ser da empresa (400 \`contato_invalido\`); sem \`responsavelId\`, é o próprio usuário, e o vendedor só atribui a si (403). \`diaInteiro\` vale a meia-noite do dia no fuso da empresa. ${EFEITO} Registra na auditoria.`,
    corpo: criarAtividadeSchema,
    resposta: atividadeSchema,
    status: 201,
    erros: [400, 401, 403, 404, 429],
  })
  @Post()
  @Limite({ nome: 'carteira-atividades-criar', max: 120, janelaS: 60 })
  criar(@Body(new ZodPipe(criarAtividadeSchema)) dados: CriarAtividade): Promise<Atividade> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Atividade',
    descricao: CARTEIRA,
    resposta: atividadeSchema,
    erros: [400, 401, 403, 404],
  })
  @Get(':id')
  detalhar(@Param('id', new ParseUUIDPipe()) id: string): Promise<Atividade> {
    return this.servico.detalhar(id)
  }

  @Documenta({
    resumo: 'Editar atividade',
    descricao: `${CARTEIRA} Só o que vier muda. Numa realizada, \`dataInicio\` é a data em que aconteceu (não passa de 5 minutos no futuro) e o resultado não pode ficar vazio; atividade cancelada não se edita (409 \`atividade_cancelada\`). Trocar de empresa sem informar o contato tira o contato. ${EFEITO} Registra na auditoria o antes e o depois.`,
    corpo: alterarAtividadeSchema,
    resposta: atividadeSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarAtividadeSchema)) dados: AlterarAtividade,
  ): Promise<Atividade> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Concluir atividade',
    descricao: `${CARTEIRA} Só atividade aberta (409 \`atividade_nao_aberta\`). \`resultado\` obrigatório; \`realizadaEm\` é opcional (padrão: agora) e não passa de 5 minutos no futuro. ${EFEITO}`,
    corpo: concluirAtividadeSchema,
    resposta: atividadeSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Post(':id/concluir')
  @HttpCode(200)
  concluir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(concluirAtividadeSchema)) dados: ConcluirAtividade,
  ): Promise<Atividade> {
    return this.servico.concluir(id, dados)
  }

  @Documenta({
    resumo: 'Cancelar atividade',
    descricao: `${CARTEIRA} Vale para aberta e para realizada (a realizada deixa de contar como visita ou contato; o resultado fica guardado). Já cancelada: 409. ${EFEITO}`,
    resposta: atividadeSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id', new ParseUUIDPipe()) id: string): Promise<Atividade> {
    return this.servico.cancelar(id)
  }

  @Documenta({
    resumo: 'Excluir atividade',
    descricao: `${CARTEIRA} Exclusão lógica, sem lixeira. ${EFEITO}`,
    status: 204,
    erros: [400, 401, 403, 404],
  })
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.servico.excluir(id)
  }
}
