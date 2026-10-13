import {
  type AlterarContato,
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
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { ContatosService } from './contatos.service.js'

const CARTEIRA =
  'Regra de carteira: admin e gestor veem e editam todos os contatos; o vendedor vê o contato ligado a empresa que ele vê (a própria carteira, ou todas, se a empresa ligou "Vendedores podem ver todas as empresas") e edita o ligado a empresa dele. Contato que o usuário não vê responde 404.'

/** Contatos (pessoas) da carteira da empresa ativa. */
@ApiTags('Carteira: contatos')
@Controller('carteira/contatos')
export class ContatosController {
  constructor(private readonly servico: ContatosService) {}

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
