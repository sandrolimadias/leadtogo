import {
  type AlterarDadosDaEmpresa,
  alterarDadosDaEmpresaSchema,
  type ConsultaDeMunicipios,
  consultaDeMunicipiosSchema,
  type DadosDaEmpresa,
  dadosDaEmpresaSchema,
  type MunicipiosDaUf,
  municipiosDaUfSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, Header, Patch, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao, TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { DadosDaEmpresaService } from './dados-da-empresa.service.js'

/** Configurações → Empresa: os dados e o endereço da empresa ativa. */
@ApiTags('Configurações')
@Controller('configuracoes/empresa')
export class DadosDaEmpresaController {
  constructor(private readonly servico: DadosDaEmpresaService) {}

  @Documenta({
    resumo: 'Dados da empresa ativa',
    descricao:
      'Razão social, nome fantasia, CNPJ (só leitura), contatos e endereço da empresa que usa o CRM. A cidade do endereço diz o estado dos mapas do Dashboard. Todo membro lê.',
    resposta: dadosDaEmpresaSchema,
    erros: [401, 404, 409],
  })
  @TodoMembro()
  @Get()
  obter(): Promise<DadosDaEmpresa> {
    return this.servico.obter()
  }

  @Documenta({
    resumo: 'Alterar os dados da empresa ativa',
    descricao:
      'Exige `empresa.configurar`. Só os campos enviados mudam; texto vazio apaga. `endereco.municipioCodigo` é o código IBGE da cidade (400 `municipio_invalido` se não existir). O CNPJ não muda por aqui. Registra na auditoria o antes e o depois.',
    corpo: alterarDadosDaEmpresaSchema,
    resposta: dadosDaEmpresaSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('empresa.configurar')
  @Patch()
  alterar(
    @Body(new ZodPipe(alterarDadosDaEmpresaSchema)) dados: AlterarDadosDaEmpresa,
  ): Promise<DadosDaEmpresa> {
    return this.servico.alterar(dados)
  }

  @Documenta({
    resumo: 'Municípios de uma UF',
    descricao:
      'Os municípios da UF (código IBGE e nome), em ordem alfabética, para escolher a cidade do endereço. Referência igual para toda empresa: pode ficar em cache.',
    consulta: consultaDeMunicipiosSchema,
    resposta: municipiosDaUfSchema,
    erros: [400, 401],
  })
  @TodoMembro()
  @Header('Cache-Control', 'private, max-age=86400')
  @Get('municipios')
  municipios(
    @Query(new ZodPipe(consultaDeMunicipiosSchema)) consulta: ConsultaDeMunicipios,
  ): Promise<MunicipiosDaUf> {
    return this.servico.municipios(consulta.uf)
  }
}
