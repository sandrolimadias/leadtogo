import {
  type AbrirChamadoEntrada,
  abrirChamadoSchema,
  type AlterarChamadoEntrada,
  alterarChamadoSchema,
  type AlterarStatusDoChamadoEntrada,
  alterarStatusDoChamadoSchema,
  type AtribuirChamadoEntrada,
  atribuirChamadoSchema,
  type Chamado,
  chamadoSchema,
  type ConsultaDeChamados,
  consultaDeChamadosSchema,
  type ListaDeChamados,
  listaDeChamadosSchema,
  type TriarChamadoEntrada,
  triarChamadoSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { ChamadosService } from './chamados.service.js'

const VISIVEL =
  'Chamado que a pessoa não vê (outra empresa, fora do alcance de `chamados.ver`, ou na fila de triagem sem ser quem tria): 404 `chamado_nao_encontrado`.'
const NEGADO = 'Sem a ação permitida neste chamado: 403 `acesso_negado`.'

/** Chamados da equipe (Fase 2). A configuração (`/chamados/areas`...) vem antes, no outro controller. */
@ApiTags('Chamados')
@Controller('chamados')
export class ChamadosController {
  constructor(private readonly servico: ChamadosService) {}

  @Documenta({
    resumo: 'Listar chamados',
    descricao: `Exige \`chamados.ver\`. Abas: \`triagem\` (só para quem tria), \`pendentes\`, \`meus\` (abertos em que a pessoa é responsável ou solicitante) e \`todos\`. Vê o que o alcance de \`chamados.ver\` permite, o que abriu e tudo das áreas em que atua. As contagens das abas vêm junto. Cada item traz os prazos de resposta e de resolução em horas úteis (ausentes sem meta na área).`,
    consulta: consultaDeChamadosSchema,
    resposta: listaDeChamadosSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('chamados.ver')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeChamadosSchema)) consulta: ConsultaDeChamados,
  ): Promise<ListaDeChamados> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Abrir um chamado',
    descricao:
      'Exige `chamados.criar`. Sem `areaId` ("não sei a área") o chamado vai sempre para a triagem. Com a área: ligada a triagem, vai para a triagem, salvo se a área a pular; desligada, cai direto na área como Pendente. A empresa, se informada, precisa estar na carteira da pessoa (400 `empresa_invalida`). Número sequencial por empresa (CH-0001).',
    corpo: abrirChamadoSchema,
    resposta: chamadoSchema,
    status: 201,
    erros: [400, 401, 403, 409],
  })
  @Permissao('chamados.criar')
  @Post()
  abrir(@Body(new ZodPipe(abrirChamadoSchema)) dados: AbrirChamadoEntrada): Promise<Chamado> {
    return this.servico.abrir(dados)
  }

  @Documenta({
    resumo: 'Detalhar um chamado',
    descricao: `Exige \`chamados.ver\`. Conversa, anexos, linha do tempo e as ações possíveis para quem pede. As notas internas (e os eventos delas) só vêm para quem atende (\`chamados.atender\`). ${VISIVEL}`,
    resposta: chamadoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.ver')
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string): Promise<Chamado> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Triar um chamado',
    descricao: `Exige \`chamados.triar\` e ser quem tria (pessoa designada ou do perfil de triagem). Só em "Aguardando triagem" (409 \`fora_da_triagem\`): define a área, a prioridade e, se quiser, o responsável (que precisa atender a área, 400 \`responsavel_invalido\`) e o chamado vira Pendente. ${VISIVEL} ${NEGADO}`,
    corpo: triarChamadoSchema,
    resposta: chamadoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.triar')
  @Post(':id/triar')
  @HttpCode(200)
  triar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(triarChamadoSchema)) dados: TriarChamadoEntrada,
  ): Promise<Chamado> {
    return this.servico.triar(id, dados)
  }

  @Documenta({
    resumo: 'Atribuir o chamado a alguém',
    descricao: `Exige \`chamados.atribuir\` e ser quem tria, o gestor da área ou quem atende tudo. \`responsavelId: null\` tira o responsável. O responsável precisa atender a área (400 \`responsavel_invalido\`). ${VISIVEL} ${NEGADO}`,
    corpo: atribuirChamadoSchema,
    resposta: chamadoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.atribuir')
  @Post(':id/atribuir')
  @HttpCode(200)
  atribuir(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(atribuirChamadoSchema)) dados: AtribuirChamadoEntrada,
  ): Promise<Chamado> {
    return this.servico.atribuir(id, dados)
  }

  @Documenta({
    resumo: 'Assumir o chamado',
    descricao: `Exige \`chamados.atender\`. Só o chamado sem responsável (409 \`ja_atribuido\`), de uma área em que a pessoa atua. Pendente passa a Em atendimento. ${VISIVEL} ${NEGADO}`,
    resposta: chamadoSchema,
    erros: [401, 403, 404, 409],
  })
  @Permissao('chamados.atender')
  @Post(':id/assumir')
  @HttpCode(200)
  assumir(@Param('id', new ParseUUIDPipe()) id: string): Promise<Chamado> {
    return this.servico.assumir(id)
  }

  @Documenta({
    resumo: 'Mudar o estado do chamado',
    descricao: `Exige \`chamados.atender\` no alcance. Mudanças permitidas: Pendente, Em atendimento e Aguardando cliente (que pausa o prazo) entre si e para Resolvido; Resolvido só vai a Fechado (409 \`transicao_invalida\` nas demais). Para reabrir, use \`/reabrir\`. ${VISIVEL} ${NEGADO}`,
    corpo: alterarStatusDoChamadoSchema,
    resposta: chamadoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.atender')
  @Post(':id/status')
  @HttpCode(200)
  alterarStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarStatusDoChamadoSchema)) dados: AlterarStatusDoChamadoEntrada,
  ): Promise<Chamado> {
    return this.servico.alterarStatus(id, dados.status)
  }

  @Documenta({
    resumo: 'Mudar a prioridade ou a área',
    descricao: `Prioridade: quem atende o chamado ou quem tria. Área: quem tria, o gestor da área ou quem atribui; o responsável que não atende a área nova perde o chamado. ${VISIVEL} ${NEGADO}`,
    corpo: alterarChamadoSchema,
    resposta: chamadoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.atender', 'chamados.triar', 'chamados.atribuir')
  @Patch(':id')
  alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(alterarChamadoSchema)) dados: AlterarChamadoEntrada,
  ): Promise<Chamado> {
    return this.servico.alterar(id, dados)
  }

  @Documenta({
    resumo: 'Reabrir um chamado resolvido',
    descricao: `Exige \`chamados.ver\`. O solicitante ou quem atende, até 7 dias depois de Resolvido (409 \`prazo_de_reabertura_vencido\`; 409 \`nao_resolvido\` se não está resolvido). Volta a Em atendimento, com o mesmo responsável. ${VISIVEL} ${NEGADO}`,
    resposta: chamadoSchema,
    erros: [401, 403, 404, 409],
  })
  @Permissao('chamados.ver')
  @Post(':id/reabrir')
  @HttpCode(200)
  reabrir(@Param('id', new ParseUUIDPipe()) id: string): Promise<Chamado> {
    return this.servico.reabrir(id)
  }
}
