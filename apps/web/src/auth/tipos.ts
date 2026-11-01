import type {
  EnvioDeImagem,
  ItemDeFormulario,
  MidiaDaPublicacao,
  AcessoDoPortal,
  ConfiguracaoDoPortal,
  IndicadoresDoHub,
  Documento,
  Evento,
  EnvioDeDocumento,
  ListaDeEventos,
  ListaDeParticipantes,
  CheckinDoEvento,
  ListaDeEventosDaEmpresa,
  ResultadoDoPedidoDeAvaliacao,
  ListaDeBaixasDeDocumento,
  ListaDeComentariosParaModeracao,
  ListaDeDocumentos,
  ListaDePublicacoes,
  Publicacao,
  ListaDeAcessosDoPortal,
  ListaDePedidosDeAcesso,
  ListaDeTarefasDoChamado,
  Atividade,
  Dashboard,
  BuscaRecente,
  ResultadoDaBuscaGlobal,
  KanbanDeOportunidades,
  ListaDeOportunidades,
  Oportunidade,
  OportunidadeDetalhada,
  ResultadoDoMovimento,
  AndamentoDaImportacao,
  CnaesConferidos,
  ConfiguracaoDaCarteira,
  ConfiguracaoDeVisitas,
  DistanciaDoCheckin,
  ItemDeVisita,
  PacoteOffline,
  RelatorioDeVisita,
  ModeloDeVisita,
  ResultadoDeVisita,
  VersaoDoModeloDeVisita,
  Contato,
  ConsultaDaReceitaDaEmpresa,
  ConsultaReceita,
  ContagensDaLista,
  ConviteAceito,
  ConviteConsulta,
  ConviteCriado,
  ConviteResumo,
  EmpresaCarteira,
  EmpresaCriada,
  CoberturaDoMapa,
  FilaConfirmarEndereco,
  LegendaDoMapa,
  OpcoesDoMapa,
  PontosDoMapa,
  SelecaoDoMapaResposta,
  ListaDeLotesGeo,
  LoteGeo,
  PosicaoDaEmpresa,
  PreviaDoLoteGeo,
  RegiaoGeo,
  ResumoDaGeolocalizacao,
  HistoricoDaEmpresa,
  ContatoDaEmpresa,
  ListaDeAtividades,
  ListaDeContatos,
  LinhasDaImportacao,
  ListaDeEmpresas,
  ListaDeLotesDeImportacao,
  LoteDeImportacao,
  ValoresDoTipoDaImportacao,
  Me,
  MembroDaEquipe,
  MembroDoPerfil,
  PerfilDeAcesso,
  PerfilDoMembro,
  OpcoesDaLista,
  OpcoesDaListaDeContatos,
  PapelDecisao,
  PerfilDeImportacao,
  PreviaDaImportacao,
  Preferencias,
  PreferenciasPatch,
  ResultadoDaTagEmMassa,
  Funil,
  Motivo,
  Origem,
  Seguranca,
  Solucao,
  TagGrupo,
  TipoAtividade,
  Vertical,
  AreaDeAtendimento,
  AtendenteDoChamado,
  ConfiguracaoDeTriagem,
  Expediente,
  Feriado,
  MetricasDeChamados,
  ResultadosDoDashboard,
  AssociadosDoDashboard,
  MapaDoDashboard,
  ContornosDaUf,
  OpcoesDeConfiguracaoDeChamados,
  Chamado,
  ConfiguracaoDeRotas,
  DownloadDeAnexo,
  EnvioDeAnexo,
  AnexoDoChamado,
  ListaDeChamados,
  ListaDeNotificacoes,
  ListaDeRotas,
  MarcadasComoLidas,
  OrdemOtimizada,
  ParadasAdicionadas,
  PontoDePartida,
  Rota,
  RotaDaEmpresa,
  Aviso,
  ListaDeAvisos,
  AlterarChaveDeApi,
  AlterarWebhook,
  ChaveDeApi,
  ChaveDeApiCriada,
  CriarChaveDeApi,
  CriarWebhook,
  EntregaDeWebhook,
  ListaDeChavesDeApi,
  ListaDeEntregasDeWebhook,
  ListaDeWebhooks,
  ReenvioDeEntregas,
  Webhook,
  WebhookCriado,
} from '@leadtogo/api-client'
import type {
  AbrirChamadoEntrada,
  Formulario,
  RespostaDeFormulario,
  SalvarFormularioEntrada,
  AlterarChamadoEntrada,
  AlterarPontoDePartidaEntrada,
  AlterarAreaEntrada,
  AlterarTriagemEntrada,
  AtribuirChamadoEntrada,
  ConsultaDeChamados,
  ConsultaDeMetricas,
  ConsultaDeResultadosEntrada,
  ConsultaDeAssociadosEntrada,
  ConsultaDoMapaDoDashboardEntrada,
  CriarAreaEntrada,
  CriarFeriadoEntrada,
  DefinirExpedienteEntrada,
  DefinirMembrosDaAreaEntrada,
  ConsultaDeNotificacoes,
  ConsultaDeRotas,
  CriarNotaInternaEntrada,
  EnviarMensagemEntrada,
  PedirEnvioDeAnexoEntrada,
  StatusDoChamado,
  TriarChamadoEntrada,
  CriarPontoDePartidaEntrada,
  OtimizarRotaEntrada,
  SalvarRotaEntrada,
  AjustarPosicao,
  AlterarEntradaDaLegenda,
  ConsultaDePontos,
  ConsultaDeProximas,
  SelecaoDoMapa,
  ConfirmarEndereco,
  CriarLoteGeo,
  EscopoDoLote,
  SalvarRegiao,
  TipoDeImportacao,
  AlterarAtividadeEntrada,
  ConsultaDoDashboardEntrada,
  TipoDaBuscaGlobal,
  AlterarOportunidadeEntrada,
  ConsultaDeOportunidadesEntrada,
  ConsultaDoKanbanEntrada,
  CriarOportunidadeEntrada,
  FecharOportunidadeEntrada,
  ConcluirAtividadeEntrada,
  ConsultaDeAtividadesEntrada,
  CriarAtividadeEntrada,
  AlterarContatoEntrada,
  AlterarVinculoEntrada,
  VincularContatoEntrada,
  AlterarEmpresaCarteiraEntrada,
  AlterarFaseEntrada,
  AlterarFunilEntrada,
  AlterarLoteEntrada,
  AlterarMembroEntrada,
  AlterarMotivoEntrada,
  AlterarOrigemEntrada,
  AlterarPapelDecisaoEntrada,
  AlterarSolucaoEntrada,
  AlterarTagEntrada,
  AlterarTagGrupoEntrada,
  AlterarTipoAtividadeEntrada,
  AlterarModeloDeVisitaEntrada,
  AlterarResultadoDeVisitaEntrada,
  CriarModeloDeVisitaEntrada,
  CriarResultadoDeVisitaEntrada,
  PosicaoDoAparelho,
  SalvarVisitaEntrada,
  AlterarVerticalEntrada,
  CriarConviteEntrada,
  CriarEmpresaEntrada,
  CriarFaseEntrada,
  CriarFunilEntrada,
  CriarMotivoEntrada,
  CriarOrigemEntrada,
  CriarPapelDecisaoEntrada,
  CriarSolucaoEntrada,
  CriarTagEntrada,
  CriarTagGrupoEntrada,
  CriarTipoAtividadeEntrada,
  ConsultaDaListaEntrada,
  ConsultaDeContatosEntrada,
  CriarContatoEntrada,
  CriarEmpresaCarteiraEntrada,
  ConfiguracaoDaCarteiraPatch,
  CriarVerticalEntrada,
  CriarPerfilDeImportacaoEntrada,
  AlterarPerfilDeImportacaoEntrada,
  PrimeiroAcessoEntrada,
  PrimeiroAcessoResultado,
  Tag,
  ModerarComentarioEntrada,
  SalvarPublicacaoEntrada,
  CriarDocumentoEntrada,
  EditarDocumentoEntrada,
  CancelarEventoEntrada,
  SalvarEventoEntrada,
  FinalidadeDeFormulario,
  IncluirParticipanteEntrada,
  CriarAvisoEntrada,
  CampoComValores,
  ConverterSocioEntrada,
} from '@leadtogo/shared'

/** Erro de uma chamada de acesso, já em pt-BR e com o código estável para o front decidir o que fazer. */
export interface ErroDeAcesso {
  codigo: string
  mensagem: string
  status: number
  /** Dados extras que a API manda em alguns erros (ex.: a empresa que já existe, no 409 de duplicado) */
  dados?: Record<string, unknown>
}

export type Resultado<T = void> = { ok: true; dados: T } | { ok: false; erro: ErroDeAcesso }

export interface ConfiguracaoDoDoisFatores {
  /** otpauth://totp/... para o QR code */
  totpUri: string
  /** Chave para digitar à mão, extraída do URI */
  chave: string
  codigosDeBackup: string[]
}

/** Funis e fases (Configurações → Funis e fases). Só o administrador escreve. */
export interface ServicosDeFunis {
  /** Funis com as fases, inclusive os inativos */
  listar: () => Promise<Resultado<Funil[]>>
  criar: (dados: CriarFunilEntrada) => Promise<Resultado<Funil>>
  alterar: (id: string, dados: AlterarFunilEntrada) => Promise<Resultado<Funil>>
  excluir: (id: string) => Promise<Resultado>
  /** Os ids de TODOS os funis, na ordem nova */
  reordenar: (ids: string[]) => Promise<Resultado<Funil[]>>
  // As operações de fase devolvem o funil completo
  criarFase: (funilId: string, dados: CriarFaseEntrada) => Promise<Resultado<Funil>>
  alterarFase: (faseId: string, dados: AlterarFaseEntrada) => Promise<Resultado<Funil>>
  excluirFase: (faseId: string) => Promise<Resultado<Funil>>
  /** Os ids de TODAS as fases do funil, na ordem nova */
  reordenarFases: (funilId: string, ids: string[]) => Promise<Resultado<Funil>>
}

/** Cadastro de grupos de tags e tags (Configurações → Tags). Só o administrador escreve. */
export interface ServicosDeTags {
  /**
   * Grupos com as tags, inclusive as inativas (a tela as mostra com a palavra "Inativa"). Sem `aplicaA`,
   * só os grupos de empresa (as telas de empresa nunca veem tags de contato nem de oportunidade); `todos`
   * é a configuração.
   */
  listar: (
    aplicaA?: 'empresa' | 'contato' | 'oportunidade' | 'todos',
  ) => Promise<Resultado<TagGrupo[]>>
  criarGrupo: (dados: CriarTagGrupoEntrada) => Promise<Resultado<TagGrupo>>
  alterarGrupo: (id: string, dados: AlterarTagGrupoEntrada) => Promise<Resultado<TagGrupo>>
  excluirGrupo: (id: string) => Promise<Resultado>
  /** Os ids de TODOS os grupos, na ordem nova */
  reordenarGrupos: (ids: string[]) => Promise<Resultado<TagGrupo[]>>
  criarTag: (dados: CriarTagEntrada) => Promise<Resultado<Tag>>
  alterarTag: (id: string, dados: AlterarTagEntrada) => Promise<Resultado<Tag>>
  excluirTag: (id: string) => Promise<Resultado>
  /** Os ids de TODAS as tags do grupo, na ordem nova */
  reordenarTags: (grupoId: string, ids: string[]) => Promise<Resultado<TagGrupo>>
}

/** Carteira de empresas (Módulo 2): lista, cadastro, ficha. Segue a regra de carteira da API. */
export interface ServicosDaCarteira {
  /** A página da lista, já com busca, chip e filtros aplicados */
  listar: (consulta: ConsultaDaListaEntrada) => Promise<Resultado<ListaDeEmpresas>>
  /** Contagem de cada chip; `incluirLeads` vale para os três últimos */
  contagens: (incluirLeads: boolean) => Promise<Resultado<ContagensDaLista>>
  /** Equipe, cidades e dias de alerta, para os filtros */
  opcoes: () => Promise<Resultado<OpcoesDaLista>>
  /** Consulta o CNPJ na Receita (cache de 30 dias). 404 `cnpj_nao_encontrado`, 503 `receita_indisponivel` */
  consultarCnpj: (cnpj: string) => Promise<Resultado<ConsultaReceita>>
  /** Cadastra a empresa. 409 `empresa_nao_ativa` / `empresa_ja_cadastrada` (com `dados.existente`) */
  criar: (dados: CriarEmpresaCarteiraEntrada) => Promise<Resultado<EmpresaCarteira>>
  /** A ficha. 404 `empresa_nao_encontrada` (inexistente, excluída ou de outro vendedor) */
  detalhar: (id: string) => Promise<Resultado<EmpresaCarteira>>
  /** Aba Histórico: auditoria legível, do mais recente ao mais antigo */
  historico: (id: string, pagina: number) => Promise<Resultado<HistoricoDaEmpresa>>
  /** "Atualizar pela Receita", passo 1: reconsulta sem cache e devolve o que difere */
  consultarReceitaDaEmpresa: (id: string) => Promise<Resultado<ConsultaDaReceitaDaEmpresa>>
  /** Passo 2: aplica as diferenças (todas, ou só os campos pedidos) */
  aplicarReceitaDaEmpresa: (id: string) => Promise<Resultado<EmpresaCarteira>>
  /** Troca as tags dos grupos manuais (Status, Interesse...) */
  definirTags: (id: string, tagIds: string[]) => Promise<Resultado<EmpresaCarteira>>
  /** Edita a empresa: só o que vier muda (o documento e o Status não se alteram aqui) */
  alterar: (id: string, dados: AlterarEmpresaCarteiraEntrada) => Promise<Resultado<EmpresaCarteira>>
  /** Exclusão lógica (só administrador e gestor), sem lixeira por enquanto */
  excluir: (id: string) => Promise<Resultado>
  /** Aplica UMA tag a várias empresas; Status substitui o atual. Só mexe no que a pessoa edita */
  aplicarTagEmMassa: (
    empresaIds: string[],
    tagId: string,
  ) => Promise<Resultado<ResultadoDaTagEmMassa>>
}

/** Contatos (Módulo 3): as pessoas, ligadas às empresas da carteira. Segue a regra de carteira da API. */
export interface ServicosDeContatos {
  /** Cadastra o contato. 409 `contato_duplicado` (com `dados.existentes`): reenvie com `ignorarDuplicado` */
  criar: (dados: CriarContatoEntrada) => Promise<Resultado<Contato>>
  /** A lista da carteira, com busca, filtros e paginação */
  listar: (consulta: ConsultaDeContatosEntrada) => Promise<Resultado<ListaDeContatos>>
  /** Os cargos que existem nos vínculos que o usuário vê (filtro da lista) */
  opcoes: () => Promise<Resultado<OpcoesDaListaDeContatos>>
  /** A ficha. 404 `contato_nao_encontrado` (inexistente, excluído ou fora da carteira) */
  detalhar: (id: string) => Promise<Resultado<Contato>>
  /** Edita a pessoa (os vínculos com empresas têm operações próprias) */
  alterar: (id: string, dados: AlterarContatoEntrada) => Promise<Resultado<Contato>>
  /** Troca as tags do contato (só de grupos de tags de contato) */
  definirTags: (id: string, tagIds: string[]) => Promise<Resultado<Contato>>
  /** Exclusão lógica, só de gestor e administrador (o vendedor recebe 403) */
  excluir: (id: string) => Promise<Resultado>
  /** Liga o contato a outra empresa da carteira (reativa o vínculo inativo). 409 `vinculo_ja_existe` */
  vincular: (id: string, dados: VincularContatoEntrada) => Promise<Resultado<Contato>>
  /** Cargo, contato principal e inativar/reativar o vínculo com uma empresa */
  alterarVinculo: (
    id: string,
    empresaId: string,
    dados: AlterarVinculoEntrada,
  ) => Promise<Resultado<Contato>>
  /** Converte o sócio da empresa em contato (vínculo com cargo = qualificação). 409 `socio_ja_convertido` */
  /** Telefone e e-mail opcionais: em branco, o contato nasce sem eles */
  converterSocio: (
    empresaId: string,
    socioId: string,
    dados?: ConverterSocioEntrada,
  ) => Promise<Resultado<Contato>>
  /** Aba Histórico do contato: auditoria legível, do mais recente ao mais antigo */
  historico: (id: string, pagina: number) => Promise<Resultado<HistoricoDaEmpresa>>
  /** Os contatos de uma empresa (aba Contatos da ficha): ativos primeiro, depois os inativos */
  daEmpresa: (empresaId: string) => Promise<Resultado<ContatoDaEmpresa[]>>
}

/** Atividades (Módulo 5): agenda e histórico da carteira. Segue a regra de carteira da API. */
export interface ServicosDeAtividades {
  /** Registra (Realizada, com resultado, ou Pendente). 400 `atividade_no_futuro`, `empresa_obrigatoria`, `contato_invalido` */
  criar: (dados: CriarAtividadeEntrada) => Promise<Resultado<Atividade>>
  /** A lista, com as abas Agendadas, Atrasadas e Realizadas (sem aba: a linha do tempo) e suas contagens */
  listar: (consulta: ConsultaDeAtividadesEntrada) => Promise<Resultado<ListaDeAtividades>>
  detalhar: (id: string) => Promise<Resultado<Atividade>>
  /** Só o que vier muda. 409 `atividade_cancelada` */
  alterar: (id: string, dados: AlterarAtividadeEntrada) => Promise<Resultado<Atividade>>
  /** Conclui uma atividade aberta (resultado obrigatório). 409 `atividade_nao_aberta` */
  concluir: (id: string, dados: ConcluirAtividadeEntrada) => Promise<Resultado<Atividade>>
  cancelar: (id: string) => Promise<Resultado<Atividade>>
  /** Exclusão lógica */
  excluir: (id: string) => Promise<Resultado>
}

/** Dashboard (Módulo 7), visão "Minha". */
export interface ServicosDoDashboard {
  /** Aba Minhas atividades: o membro e as contagens das janelas de atividades */
  carregar: (consulta: ConsultaDoDashboardEntrada) => Promise<Resultado<Dashboard>>
  /** Aba Resultados: os indicadores do período, na visão escolhida (sem `funilId`, o funil padrão) */
  resultados: (consulta: ConsultaDeResultadosEntrada) => Promise<Resultado<ResultadosDoDashboard>>
  /** Novos associados ou desassociados do período, paginado */
  associados: (consulta: ConsultaDeAssociadosEntrada) => Promise<Resultado<AssociadosDoDashboard>>
  /** Associados e empresas por município da UF da empresa */
  mapa: (consulta: ConsultaDoMapaDoDashboardEntrada) => Promise<Resultado<MapaDoDashboard>>
  /** Contornos dos municípios da UF (referência; fica em cache) */
  contornos: (uf: string) => Promise<Resultado<ContornosDaUf>>
}

/** Busca global da barra do topo (docs/plano_busca_global.md) e as buscas recentes de quem está logado. */
export interface ServicosDaBusca {
  /** Empresas, contatos e oportunidades que a pessoa vê; até `limite` por tipo (padrão 5) */
  buscar: (consulta: {
    q: string
    tipos?: TipoDaBuscaGlobal[]
    limite?: number
  }) => Promise<Resultado<ResultadoDaBuscaGlobal>>
  /** As até 10 últimas buscas concluídas, a mais recente primeiro */
  recentes: () => Promise<Resultado<BuscaRecente[]>>
  /** Grava a busca concluída (repetida volta ao topo); devolve a lista atualizada */
  registrar: (termo: string) => Promise<Resultado<BuscaRecente[]>>
  apagar: (id: string) => Promise<Resultado>
  limpar: () => Promise<Resultado>
}

/** Oportunidades (Módulo 6): o funil de vendas. Segue a regra de carteira da API. */
export interface ServicosDeOportunidades {
  /** O Kanban de um funil (sem `funilId`, o padrão): só as Ativas, nas fases ativas */
  kanban: (consulta: ConsultaDoKanbanEntrada) => Promise<Resultado<KanbanDeOportunidades>>
  /** A lista simples, de qualquer status, com filtros e paginação */
  listar: (consulta: ConsultaDeOportunidadesEntrada) => Promise<Resultado<ListaDeOportunidades>>
  criar: (dados: CriarOportunidadeEntrada) => Promise<Resultado<Oportunidade>>
  /** A ficha, com o histórico de fases e de status. 404 `oportunidade_nao_encontrada` */
  detalhar: (id: string) => Promise<Resultado<OportunidadeDetalhada>>
  alterar: (id: string, dados: AlterarOportunidadeEntrada) => Promise<Resultado<Oportunidade>>
  /** Muda de fase; devolve o aviso quando a probabilidade foi editada à mão. 409 `oportunidade_nao_ativa` */
  mover: (id: string, faseId: string) => Promise<Resultado<ResultadoDoMovimento>>
  /** Conquistado, Perdido, Cancelado ou Suspenso (motivo e "retomar em" conforme o status) */
  fechar: (id: string, dados: FecharOportunidadeEntrada) => Promise<Resultado<Oportunidade>>
  reabrir: (id: string) => Promise<Resultado<Oportunidade>>
  /** As tags que a oportunidade passa a ter (só de grupos de oportunidade; vale também para a fechada) */
  definirTags: (id: string, tagIds: string[]) => Promise<Resultado<Oportunidade>>
  /** Exclusão lógica, só de gestor e administrador */
  excluir: (id: string) => Promise<Resultado>
}

/**
 * Cadastro simples da empresa ativa (verticais, soluções, origens, motivos, tipos de atividade): a
 * mesma forma de API para os cinco. Só o administrador escreve.
 */
export interface ServicosDeCadastro<Item, Criar, Alterar> {
  /** Todos, inclusive os inativos (a tela os mostra com a palavra "Inativo") */
  listar: () => Promise<Resultado<Item[]>>
  criar: (dados: Criar) => Promise<Resultado<Item>>
  alterar: (id: string, dados: Alterar) => Promise<Resultado<Item>>
  excluir: (id: string) => Promise<Resultado>
  /** Os ids de TODOS os itens, na ordem nova */
  reordenar: (ids: string[]) => Promise<Resultado<Item[]>>
}

/** Importação de planilha (Módulo 4). Os perfis de regras são da empresa; só o administrador escreve. */
/** Geolocalização (G1): posição das empresas, lotes por cidade ou região, regiões e a fila "Confirmar endereço". */
export interface ServicosDeGeolocalizacao {
  resumo: () => Promise<Resultado<ResumoDaGeolocalizacao>>
  fila: (pagina?: number, porPagina?: number) => Promise<Resultado<FilaConfirmarEndereco>>
  regioes: {
    /** As microrregiões oficiais da UF e as regiões do administrador */
    listar: (uf?: string) => Promise<Resultado<RegiaoGeo[]>>
    criar: (dados: SalvarRegiao) => Promise<Resultado<RegiaoGeo>>
    alterar: (id: string, dados: SalvarRegiao) => Promise<Resultado<RegiaoGeo>>
    excluir: (id: string) => Promise<Resultado>
  }
  lotes: {
    previa: (escopo: EscopoDoLote) => Promise<Resultado<PreviaDoLoteGeo>>
    criar: (dados: CriarLoteGeo) => Promise<Resultado<LoteGeo>>
    listar: (pagina?: number, porPagina?: number) => Promise<Resultado<ListaDeLotesGeo>>
    detalhar: (id: string) => Promise<Resultado<LoteGeo>>
    cancelar: (id: string) => Promise<Resultado<LoteGeo>>
    retomar: (id: string) => Promise<Resultado<LoteGeo>>
  }
  posicao: {
    ler: (empresaId: string) => Promise<Resultado<PosicaoDaEmpresa>>
    ajustar: (empresaId: string, dados: AjustarPosicao) => Promise<Resultado<PosicaoDaEmpresa>>
    confirmarEndereco: (
      empresaId: string,
      dados: ConfirmarEndereco,
    ) => Promise<Resultado<PosicaoDaEmpresa>>
    geocodificarDeNovo: (empresaId: string) => Promise<Resultado<PosicaoDaEmpresa>>
  }
}

/** Mapa (G2): opções e legenda, pontos da área visível, próximas, seleção e cobertura por município. */
export interface ServicosDoMapa {
  opcoes: () => Promise<Resultado<OpcoesDoMapa>>
  legenda: {
    ler: () => Promise<Resultado<LegendaDoMapa>>
    /** Só o administrador; nome vazio volta ao padrão */
    alterar: (chave: string, dados: AlterarEntradaDaLegenda) => Promise<Resultado<LegendaDoMapa>>
    restaurar: () => Promise<Resultado<LegendaDoMapa>>
  }
  /** As empresas da área visível, com os filtros; acima de 400, vêm como bolhas */
  /** `signal` cancela o pedido anterior quando o mapa mexe de novo (a API para de trabalhar nele) */
  pontos: (consulta: ConsultaDePontos, signal?: AbortSignal) => Promise<Resultado<PontosDoMapa>>
  proximas: (consulta: ConsultaDeProximas) => Promise<Resultado<SelecaoDoMapaResposta>>
  selecao: (dados: SelecaoDoMapa) => Promise<Resultado<SelecaoDoMapaResposta>>
  cobertura: () => Promise<Resultado<CoberturaDoMapa>>
}

export interface ServicosDeImportacao {
  perfis: {
    /** Todos, inclusive os inativos (a tela os mostra com a palavra "Inativo") */
    listar: () => Promise<Resultado<PerfilDeImportacao[]>>
    /** Só o nome é obrigatório: o que falta recebe o padrão (situação ativa, matriz e filiais, qualquer CNAE...) */
    criar: (
      dados: Pick<CriarPerfilDeImportacaoEntrada, 'nome'> & Partial<CriarPerfilDeImportacaoEntrada>,
    ) => Promise<Resultado<PerfilDeImportacao>>
    alterar: (
      id: string,
      dados: AlterarPerfilDeImportacaoEntrada,
    ) => Promise<Resultado<PerfilDeImportacao>>
    /** 409 `perfil_em_uso`: perfil de algum lote só se inativa */
    excluir: (id: string) => Promise<Resultado>
    /** Confere a lista colada na tabela de CNAEs, sem gravar nada */
    conferirCnaes: (texto: string) => Promise<Resultado<CnaesConferidos>>
  }
  /** Os lotes (uma planilha enviada, do envio ao relatório). Só administrador e gestor. */
  lotes: {
    /** Do mais novo para o mais antigo */
    listar: (
      pagina?: number,
      porPagina?: number,
      tipo?: TipoDeImportacao,
    ) => Promise<Resultado<ListaDeLotesDeImportacao>>
    /** Envia o arquivo (.xlsx ou CSV) e cria o lote em rascunho; o tipo (empresas, contatos ou atividades) fica fixo */
    enviar: (
      arquivo: File,
      nome?: string,
      tipo?: TipoDeImportacao,
    ) => Promise<Resultado<LoteDeImportacao>>
    /** Atividades: cada valor da coluna Tipo e o tipo que valerá; oportunidades: o mesmo para o `campo`
     * (fase, motivo, origem ou solução) */
    valoresDoTipo: (
      id: string,
      coluna?: string,
      campo?: CampoComValores,
    ) => Promise<Resultado<ValoresDoTipoDaImportacao>>
    detalhar: (id: string) => Promise<Resultado<LoteDeImportacao>>
    alterar: (id: string, dados: AlterarLoteEntrada) => Promise<Resultado<LoteDeImportacao>>
    previa: (id: string) => Promise<Resultado<PreviaDaImportacao>>
    /** Inicia (ou retoma) a execução no worker */
    iniciar: (id: string) => Promise<Resultado<LoteDeImportacao>>
    cancelar: (id: string) => Promise<Resultado<LoteDeImportacao>>
    andamento: (id: string) => Promise<Resultado<AndamentoDaImportacao>>
    linhas: (
      id: string,
      consulta?: { resultado?: string; pagina?: number; porPagina?: number },
    ) => Promise<Resultado<LinhasDaImportacao>>
    /** Tira da carteira as empresas que o lote criou (concluído, até 24 h depois) */
    desfazer: (id: string) => Promise<Resultado<LoteDeImportacao>>
    /** "Importar mesmo assim": sem `linhaIds`, todas as linhas fora do perfil */
    importarForaDoPerfil: (id: string, linhaIds?: string[]) => Promise<Resultado<LoteDeImportacao>>
  }
}

export interface ServicosDeCadastros {
  verticais: ServicosDeCadastro<Vertical, CriarVerticalEntrada, AlterarVerticalEntrada>
  solucoes: ServicosDeCadastro<Solucao, CriarSolucaoEntrada, AlterarSolucaoEntrada>
  origens: ServicosDeCadastro<Origem, CriarOrigemEntrada, AlterarOrigemEntrada>
  papeisDecisao: ServicosDeCadastro<
    PapelDecisao,
    CriarPapelDecisaoEntrada,
    AlterarPapelDecisaoEntrada
  >
  motivos: ServicosDeCadastro<Motivo, CriarMotivoEntrada, AlterarMotivoEntrada>
  tiposAtividade: ServicosDeCadastro<
    TipoAtividade,
    CriarTipoAtividadeEntrada,
    AlterarTipoAtividadeEntrada
  >
}

/**
 * Tudo o que as telas de acesso pedem ao servidor (Better Auth em /v1/auth + a API). As telas só
 * conhecem esta interface: o app usa a implementação real (`servicos.ts`) e os testes uma de mentira.
 */
/** Visitas (G3a): resultados, modelos do relatório e check-in. Ler é de todos; escrever, `cadastros.gerir`. */
export interface ServicosDeVisitas {
  resultados: ServicosDeCadastro<
    ResultadoDeVisita,
    CriarResultadoDeVisitaEntrada,
    AlterarResultadoDeVisitaEntrada
  >
  modelos: {
    /** Todos, inclusive os inativos */
    listar: () => Promise<Resultado<ModeloDeVisita[]>>
    versoes: (id: string) => Promise<Resultado<VersaoDoModeloDeVisita[]>>
    criar: (dados: CriarModeloDeVisitaEntrada) => Promise<Resultado<ModeloDeVisita>>
    alterar: (id: string, dados: AlterarModeloDeVisitaEntrada) => Promise<Resultado<ModeloDeVisita>>
    excluir: (id: string) => Promise<Resultado>
    reordenar: (ids: string[]) => Promise<Resultado<ModeloDeVisita[]>>
  }
  configuracao: () => Promise<Resultado<ConfiguracaoDeVisitas>>
  alterarConfiguracao: (dados: ConfiguracaoDeVisitas) => Promise<Resultado<ConfiguracaoDeVisitas>>
  /** O campo (G3b): check-in, relatório (PUT idempotente pelo id do aparelho), pendentes e offline */
  campo: {
    distancia: (
      empresaId: string,
      posicao: PosicaoDoAparelho,
    ) => Promise<Resultado<DistanciaDoCheckin>>
    salvar: (id: string, dados: SalvarVisitaEntrada) => Promise<Resultado<RelatorioDeVisita>>
    obter: (id: string) => Promise<Resultado<RelatorioDeVisita>>
    listar: (filtro: { empresaId?: string; so?: 'pendentes' }) => Promise<Resultado<ItemDeVisita[]>>
    offline: (empresaIds: string[]) => Promise<Resultado<PacoteOffline>>
  }
}

/** Rotas (G4): montar, otimizar, executar e as configurações (pontos de partida, minutos por visita). */
export interface ServicosDeRotas {
  configuracao: () => Promise<Resultado<ConfiguracaoDeRotas>>
  alterarConfiguracao: (minutosPorVisita: number) => Promise<Resultado<ConfiguracaoDeRotas>>
  pontos: {
    /** Inclui os inativos; o padrão primeiro */
    listar: () => Promise<Resultado<PontoDePartida[]>>
    criar: (dados: CriarPontoDePartidaEntrada) => Promise<Resultado<PontoDePartida>>
    alterar: (id: string, dados: AlterarPontoDePartidaEntrada) => Promise<Resultado<PontoDePartida>>
    /** 409 `ponto_em_uso`: usado em rota só se inativa */
    excluir: (id: string) => Promise<Resultado>
  }
  listar: (consulta: Partial<ConsultaDeRotas>) => Promise<Resultado<ListaDeRotas>>
  obter: (id: string) => Promise<Resultado<Rota>>
  /** A rota do dia da própria pessoa */
  hoje: () => Promise<Resultado<Rota[]>>
  /** As rotas em aberto em que a empresa é parada ("Na rota · parada N") */
  daEmpresa: (empresaId: string) => Promise<Resultado<RotaDaEmpresa[]>>
  criar: (dados: SalvarRotaEntrada) => Promise<Resultado<Rota>>
  salvar: (id: string, dados: SalvarRotaEntrada) => Promise<Resultado<Rota>>
  /** 409 `rotas_nao_configuradas` sem VROOM/OSRM */
  otimizar: (dados: OtimizarRotaEntrada) => Promise<Resultado<OrdemOtimizada>>
  adicionar: (id: string, empresaIds: string[]) => Promise<Resultado<ParadasAdicionadas>>
  pular: (id: string, paradaId: string, motivo: string) => Promise<Resultado<Rota>>
  encerrar: (id: string) => Promise<Resultado<Rota>>
  cancelar: (id: string) => Promise<Resultado<Rota>>
}

/** Central de chamados (Fase 2): a equipe abre, tria, atende e conversa. */
export interface ServicosDeChamados {
  listar: (consulta: Partial<ConsultaDeChamados>) => Promise<Resultado<ListaDeChamados>>
  obter: (id: string) => Promise<Resultado<Chamado>>
  abrir: (dados: AbrirChamadoEntrada) => Promise<Resultado<Chamado>>
  /** Só em "Aguardando triagem", por quem tria */
  triar: (id: string, dados: TriarChamadoEntrada) => Promise<Resultado<Chamado>>
  atribuir: (id: string, dados: AtribuirChamadoEntrada) => Promise<Resultado<Chamado>>
  assumir: (id: string) => Promise<Resultado<Chamado>>
  alterarStatus: (id: string, status: StatusDoChamado) => Promise<Resultado<Chamado>>
  /** Prioridade e/ou área */
  alterar: (id: string, dados: AlterarChamadoEntrada) => Promise<Resultado<Chamado>>
  reabrir: (id: string) => Promise<Resultado<Chamado>>
  mensagem: (id: string, dados: EnviarMensagemEntrada) => Promise<Resultado<Chamado>>
  /** Nota interna: só da equipe */
  nota: (id: string, dados: CriarNotaInternaEntrada) => Promise<Resultado<Chamado>>
  /** Quem pode receber os chamados da área (para escolher o responsável) */
  atendentes: (areaId: string) => Promise<Resultado<AtendenteDoChamado[]>>
  anexos: {
    /** URL pré-assinada para o PUT direto ao armazenamento (503 `anexos_indisponiveis` sem antivírus) */
    pedir: (id: string, dados: PedirEnvioDeAnexoEntrada) => Promise<Resultado<EnvioDeAnexo>>
    /** O PUT em si (o navegador envia o arquivo ao Garage) */
    enviar: (url: string, arquivo: Blob) => Promise<Resultado>
    confirmar: (id: string, anexoId: string) => Promise<Resultado<AnexoDoChamado>>
    /** 409 `anexo_em_verificacao` / `anexo_bloqueado` */
    baixar: (id: string, anexoId: string) => Promise<Resultado<DownloadDeAnexo>>
  }
  areas: {
    /** Quem gere as áreas vê as inativas e os membros */
    listar: (incluirInativas?: boolean) => Promise<Resultado<AreaDeAtendimento[]>>
    /** Só `chamados.gerir_areas` */
    criar: (dados: CriarAreaEntrada) => Promise<Resultado<AreaDeAtendimento>>
    alterar: (id: string, dados: AlterarAreaEntrada) => Promise<Resultado<AreaDeAtendimento>>
    membros: (
      id: string,
      dados: DefinirMembrosDaAreaEntrada,
    ) => Promise<Resultado<AreaDeAtendimento>>
    /** 409 `area_em_uso` se já teve chamado */
    excluir: (id: string) => Promise<Resultado>
  }
  /** Pessoas e perfis para escolher quem atende e quem tria */
  opcoesDeConfiguracao: () => Promise<Resultado<OpcoesDeConfiguracaoDeChamados>>
  triagem: {
    ver: () => Promise<Resultado<ConfiguracaoDeTriagem>>
    alterar: (dados: AlterarTriagemEntrada) => Promise<Resultado<ConfiguracaoDeTriagem>>
  }
  expediente: {
    ver: () => Promise<Resultado<Expediente>>
    definir: (dados: DefinirExpedienteEntrada) => Promise<Resultado<Expediente>>
    criarFeriado: (dados: CriarFeriadoEntrada) => Promise<Resultado<Feriado>>
    gerarFeriados: (ano: number) => Promise<Resultado<{ criados: number }>>
    excluirFeriado: (id: string) => Promise<Resultado>
  }
  /** "Aguardar resposta do cliente": escreve ao cliente do portal e muda o estado numa ação só */
  aguardarCliente: (id: string, dados: EnviarMensagemEntrada) => Promise<Resultado<Chamado>>
  /** Tarefas (Atividades) criadas a partir do chamado */
  tarefas: {
    listar: (id: string) => Promise<Resultado<ListaDeTarefasDoChamado>>
    criar: (
      id: string,
      dados: { titulo: string; responsavelId?: string; prazo?: string },
    ) => Promise<Resultado<ListaDeTarefasDoChamado>>
  }
  /** Só `chamados.ver_metricas` */
  metricas: (consulta: ConsultaDeMetricas) => Promise<Resultado<MetricasDeChamados>>
}

/** Gestão do portal do cliente pela equipe (Fase 3A): hub, acessos, pedidos dos colegas e configuração. */
export interface ServicosDoPortalNoCrm {
  /**
   * Indicadores do hub (`portal.ver`); `dias` é a janela de 1ª resposta e nota (padrão 30), ou o intervalo
   * `{ de, ate }` (o Dashboard)
   */
  indicadores: (
    janela?: number | { de: string; ate: string },
  ) => Promise<Resultado<IndicadoresDoHub>>
  configuracao: {
    obter: () => Promise<Resultado<ConfiguracaoDoPortal>>
    atualizar: (dados: {
      ativo?: boolean
      nome?: string | null
      exigeDoisFatoresDoResponsavel?: boolean
      comentariosAtivos?: boolean
      avisosLimiteSemanal?: number
      formularioSatisfacaoId?: string | null
      eventosCrmAtivo?: boolean
      eventosCrmResponsavelId?: string | null
      avaliacaoPorEmail?: boolean
      slug?: string | null
      paginaEventosAtiva?: boolean
      formularioAssociacaoId?: string | null
    }) => Promise<Resultado<ConfiguracaoDoPortal>>
  }
  /** Publicações do portal (Fase 3B): `portal.ver`/`publicar`/`moderar` para ver, `publicar` para escrever, `moderar` nos comentários */
  publicacoes: {
    listar: (consulta?: {
      aba?: 'todas' | 'publicadas' | 'agendadas' | 'rascunhos'
      pagina?: number
      porPagina?: number
    }) => Promise<Resultado<ListaDePublicacoes>>
    obter: (id: string) => Promise<Resultado<Publicacao>>
    criar: (dados: SalvarPublicacaoEntrada) => Promise<Resultado<Publicacao>>
    editar: (id: string, dados: SalvarPublicacaoEntrada) => Promise<Resultado<Publicacao>>
    excluir: (id: string) => Promise<Resultado>
    fixar: (id: string, fixada: boolean) => Promise<Resultado<Publicacao>>
    /** Cópia em rascunho ("Cópia de …"), com o mesmo corpo e alcance */
    duplicar: (id: string) => Promise<Resultado<Publicacao>>
    /** Imagens e vídeo (Fase 4D) */
    adicionarVideo: (
      id: string,
      dados: { url: string; legenda?: string | null },
    ) => Promise<Resultado<MidiaDaPublicacao>>
    adicionarImagem: (
      id: string,
      dados: {
        textoAlternativo: string
        legenda?: string | null
        arquivo: { nome: string; mime: string; tamanho: number }
      },
    ) => Promise<Resultado<EnvioDeImagem>>
    /** O arquivo vai direto ao armazenamento (URL pré-assinada), com os cabeçalhos combinados */
    enviarImagem: (
      url: string,
      arquivo: Blob,
      cabecalhos: Record<string, string>,
    ) => Promise<Resultado>
    confirmarImagem: (id: string, midiaId: string) => Promise<Resultado<MidiaDaPublicacao>>
    removerMidia: (id: string, midiaId: string) => Promise<Resultado>
    bloquearComentarios: (id: string, bloqueados: boolean) => Promise<Resultado<Publicacao>>
    comentarios: (id: string) => Promise<Resultado<ListaDeComentariosParaModeracao>>
    moderar: (
      id: string,
      comentarioId: string,
      dados: ModerarComentarioEntrada,
    ) => Promise<Resultado<ListaDeComentariosParaModeracao>>
  }
  /** Formulários do portal (Fase 4E): `portal.ver`/`formularios` para ver, `formularios` para editar */
  formularios: {
    listar: (consulta?: {
      situacao?: 'rascunho' | 'publicado' | 'arquivado'
      finalidade?: FinalidadeDeFormulario
      pagina?: number
      porPagina?: number
    }) => Promise<Resultado<{ itens: ItemDeFormulario[]; total: number }>>
    obter: (id: string) => Promise<Resultado<Formulario>>
    criar: (dados: SalvarFormularioEntrada) => Promise<Resultado<Formulario>>
    salvar: (id: string, dados: SalvarFormularioEntrada) => Promise<Resultado<Formulario>>
    publicar: (id: string) => Promise<Resultado<Formulario>>
    arquivar: (id: string, arquivado: boolean) => Promise<Resultado<Formulario>>
    duplicar: (id: string) => Promise<Resultado<Formulario>>
    excluir: (id: string) => Promise<Resultado>
    segredo: (id: string) => Promise<Resultado<{ segredo: string }>>
    respostas: (
      id: string,
      consulta?: { pagina?: number; porPagina?: number },
    ) => Promise<
      Resultado<{
        itens: RespostaDeFormulario[]
        total: number
        campos: { id: string; rotulo: string; tipo: string }[]
      }>
    >
    /** O CSV das respostas (texto), para baixar */
    exportar: (id: string) => Promise<Resultado<{ nome: string; conteudo: Blob }>>
  }
  /** Avisos do portal (Fase 3E): `portal.ver`/`avisos` para ver, `avisos` para enviar, agendar e cancelar */
  avisos: {
    listar: (consulta?: {
      pagina?: number
      porPagina?: number
    }) => Promise<Resultado<ListaDeAvisos>>
    /** 409 `limite_semanal` / `portal_desligado`; 422 `horario_no_passado` / `empresa_invalida` */
    criar: (dados: CriarAvisoEntrada) => Promise<Resultado<Aviso>>
    /** 409 `aviso_ja_enviado` */
    cancelar: (id: string) => Promise<Resultado<Aviso>>
  }
  /** Agenda do portal (Fase 3D): `portal.ver`/`agenda` para ver, `agenda` para escrever e gerir os participantes */
  eventos: {
    listar: (consulta?: {
      aba?: 'proximos' | 'passados' | 'rascunhos'
      pagina?: number
      porPagina?: number
    }) => Promise<Resultado<ListaDeEventos>>
    obter: (id: string) => Promise<Resultado<Evento>>
    criar: (dados: SalvarEventoEntrada) => Promise<Resultado<Evento>>
    editar: (id: string, dados: SalvarEventoEntrada) => Promise<Resultado<Evento>>
    /** 422 `inicio_no_passado` */
    publicar: (id: string) => Promise<Resultado<Evento>>
    cancelar: (id: string, dados: CancelarEventoEntrada) => Promise<Resultado<Evento>>
    /** 409 `cancele_antes_de_excluir` */
    excluir: (id: string) => Promise<Resultado>
    participantes: (id: string) => Promise<Resultado<ListaDeParticipantes>>
    removerParticipante: (
      id: string,
      confirmacaoId: string,
    ) => Promise<Resultado<ListaDeParticipantes>>
    /** Fase 4G: `portal.eventos_presenca` ou `portal.agenda` */
    registrarPresenca: (
      id: string,
      participacaoId: string,
      presente: boolean,
    ) => Promise<Resultado<ListaDeParticipantes>>
    /** Fase 4G: quem veio sem se inscrever entra já presente */
    incluirParticipante: (
      id: string,
      dados: IncluirParticipanteEntrada,
    ) => Promise<Resultado<ListaDeParticipantes>>
    /** 409 `evento_nao_comecou` / `evento_ja_encerrado` */
    encerrar: (id: string) => Promise<Resultado<ResultadoDoPedidoDeAvaliacao>>
    /** 409 `evento_nao_encerrado` */
    reenviarAvaliacao: (
      id: string,
      participacaoIds?: string[],
    ) => Promise<Resultado<ResultadoDoPedidoDeAvaliacao>>
    /** Gera (ou troca) o QR de check-in: o endereço só aparece agora */
    gerarCheckin: (id: string) => Promise<Resultado<CheckinDoEvento>>
    /** `portal.eventos_relatorios` ou `portal.agenda` */
    exportarInscritos: (
      id: string,
      formato: 'csv' | 'xlsx' | 'html',
    ) => Promise<Resultado<{ nome: string; conteudo: Blob }>>
    /** Aba Eventos da ficha da empresa (regra de carteira) */
    daEmpresa: (empresaId: string) => Promise<Resultado<ListaDeEventosDaEmpresa>>
  }
  /** Documentos do portal (Fase 3C): `portal.ver`/`documentos` para ver, `documentos` para escrever */
  documentos: {
    listar: (consulta?: {
      busca?: string
      pagina?: number
      porPagina?: number
    }) => Promise<Resultado<ListaDeDocumentos>>
    obter: (id: string) => Promise<Resultado<Documento>>
    /** Passo 1: cadastra e reserva o arquivo (503 `anexos_indisponiveis` sem antivírus) */
    criar: (dados: CriarDocumentoEntrada) => Promise<Resultado<EnvioDeDocumento>>
    /** O PUT em si (o navegador envia o arquivo ao Garage) */
    enviar: (url: string, arquivo: Blob) => Promise<Resultado>
    /** Passo 2: confere o arquivo e manda o antivírus varrer */
    confirmar: (id: string) => Promise<Resultado<Documento>>
    editar: (id: string, dados: EditarDocumentoEntrada) => Promise<Resultado<Documento>>
    excluir: (id: string) => Promise<Resultado>
    /** 409 `anexo_em_verificacao` / `anexo_bloqueado` */
    baixar: (id: string) => Promise<Resultado<{ url: string; expiraEm: string }>>
    baixas: (id: string) => Promise<Resultado<ListaDeBaixasDeDocumento>>
  }
  acessos: {
    listar: (consulta?: {
      empresaClienteId?: string
      contatoId?: string
      situacao?: AcessoDoPortal['situacao']
      busca?: string
      pagina?: number
    }) => Promise<Resultado<ListaDeAcessosDoPortal>>
    /** 409 `portal_desligado`, `acesso_ja_existe`, `email_em_uso`; 422 `contato_fora_da_empresa`, `email_obrigatorio` */
    dar: (dados: {
      contatoId: string
      empresaClienteId: string
      email?: string
      papel: 'responsavel' | 'colega'
    }) => Promise<Resultado<AcessoDoPortal>>
    reenviar: (id: string) => Promise<Resultado<AcessoDoPortal>>
    alterar: (
      id: string,
      dados: { papel?: 'responsavel' | 'colega'; situacao?: 'ativo' | 'suspenso' },
    ) => Promise<Resultado<AcessoDoPortal>>
    revogar: (id: string) => Promise<Resultado>
  }
  pedidos: {
    listar: (
      situacao?: 'pendente' | 'aprovado' | 'recusado',
    ) => Promise<Resultado<ListaDePedidosDeAcesso>>
    tratar: (
      id: string,
      dados: { decisao: 'aprovar' | 'recusar'; motivo?: string },
    ) => Promise<Resultado>
  }
}

/** O sino do CRM: as notificações do próprio membro. */
export interface ServicosDeNotificacoes {
  listar: (consulta?: Partial<ConsultaDeNotificacoes>) => Promise<Resultado<ListaDeNotificacoes>>
  marcarLida: (id: string) => Promise<Resultado<MarcadasComoLidas>>
  marcarTodas: () => Promise<Resultado<MarcadasComoLidas>>
}

/** Configurações → Integrações (API aberta): chaves de API e webhooks. Só `integracoes.gerir`. */
export interface ServicosDeIntegracoes {
  chaves: {
    listar: () => Promise<Resultado<ListaDeChavesDeApi>>
    /** Devolve o token uma vez; 403 `2fa_obrigatorio` */
    criar: (dados: CriarChaveDeApi) => Promise<Resultado<ChaveDeApiCriada>>
    alterar: (id: string, dados: AlterarChaveDeApi) => Promise<Resultado<ChaveDeApi>>
    /** A antiga vale por mais `prazoDias` (0 a 7; 0 revoga agora) */
    rotacionar: (id: string, prazoDias: number) => Promise<Resultado<ChaveDeApiCriada>>
    revogar: (id: string) => Promise<Resultado<ChaveDeApi>>
  }
  webhooks: {
    listar: () => Promise<Resultado<ListaDeWebhooks>>
    /** Devolve o segredo uma vez; 403 `2fa_obrigatorio`; 422 `url_invalida` */
    criar: (dados: CriarWebhook) => Promise<Resultado<WebhookCriado>>
    alterar: (id: string, dados: AlterarWebhook) => Promise<Resultado<Webhook>>
    /** 409 `webhook_com_entregas` */
    excluir: (id: string) => Promise<Resultado>
    rotacionarSegredo: (id: string) => Promise<Resultado<WebhookCriado>>
    testar: (id: string) => Promise<Resultado<EntregaDeWebhook>>
    entregas: (
      id: string,
      consulta?: {
        situacao?: 'pendente' | 'sucesso' | 'falhou'
        pagina?: number
        porPagina?: number
      },
    ) => Promise<Resultado<ListaDeEntregasDeWebhook>>
    reenviar: (id: string, entregaId: string) => Promise<Resultado<EntregaDeWebhook>>
    reenviarFalhas: (id: string) => Promise<Resultado<ReenvioDeEntregas>>
  }
}

export interface ServicosDeAcesso {
  /** Sessão atual, ou null sem login */
  me: () => Promise<Me | null>
  opcoes: () => Promise<{ loginGoogle: boolean }>
  primeiroAcessoAberto: () => Promise<boolean>

  /** Preferências do membro na empresa ativa (tema, menu recolhido...); null sem empresa ativa */
  preferencias: () => Promise<Preferencias | null>
  alterarPreferencias: (patch: PreferenciasPatch) => Promise<Resultado<Preferencias>>
  /** Troca a empresa ativa DESTA sessão (e a API lembra a escolha para o próximo login) */
  trocarEmpresa: (empresaId: string) => Promise<Resultado>

  entrar: (email: string, senha: string) => Promise<Resultado<{ doisFatores: boolean }>>
  entrarComGoogle: () => Promise<void>
  verificarCodigo: (codigo: string, confiarNoAparelho: boolean) => Promise<Resultado>
  verificarCodigoDeRecuperacao: (codigo: string, confiarNoAparelho: boolean) => Promise<Resultado>
  sair: () => Promise<void>

  /** Pede o link de nova senha. Responde igual exista ou não a conta (não revela cadastro). */
  pedirNovaSenha: (email: string) => Promise<Resultado>
  redefinirSenha: (token: string, senha: string) => Promise<Resultado>
  reenviarVerificacao: (email: string) => Promise<Resultado>

  prepararDoisFatores: (senha: string) => Promise<Resultado<ConfiguracaoDoDoisFatores>>
  confirmarDoisFatores: (codigo: string) => Promise<Resultado>
  /** Desativa o 2FA: senha + código atual do app. A API recusa (403) se alguma regra o exige do usuário. */
  desativarDoisFatores: (senha: string, codigo: string) => Promise<Resultado>
  /** Gera novos códigos de recuperação (pede a senha); os antigos deixam de valer. */
  gerarNovosCodigos: (senha: string) => Promise<Resultado<string[]>>

  consultarConvite: (token: string) => Promise<Resultado<ConviteConsulta>>
  aceitarConvite: (dados: {
    token: string
    nome?: string
    senha?: string
  }) => Promise<Resultado<ConviteAceito>>
  criarPrimeiroAcesso: (dados: PrimeiroAcessoEntrada) => Promise<Resultado<PrimeiroAcessoResultado>>

  // Gestão multiempresa (E16a): só o administrador da empresa ativa (criar empresa: da conta)
  criarEmpresa: (dados: CriarEmpresaEntrada) => Promise<Resultado<EmpresaCriada>>
  equipe: () => Promise<Resultado<MembroDaEquipe[]>>
  convitesPendentes: () => Promise<Resultado<ConviteResumo[]>>
  convidar: (dados: CriarConviteEntrada) => Promise<Resultado<ConviteCriado>>
  cancelarConvite: (id: string) => Promise<Resultado>
  alterarMembro: (id: string, dados: AlterarMembroEntrada) => Promise<Resultado<MembroDaEquipe>>
  /** Troca o perfil de acesso de um membro (`perfis.gerir`) */
  atribuirPerfil: (membroId: string, perfilId: string) => Promise<Resultado<PerfilDoMembro>>
  // Perfis de acesso (Fase 1): `perfis.gerir`
  perfis: ServicosDePerfis
  seguranca: () => Promise<Resultado<Seguranca>>
  /** Liga e desliga o 2FA de cada perfil (`seguranca.gerir`): `{ [perfilId]: exige2fa }` */
  alterarDoisFatoresDosPerfis: (perfis: Record<string, boolean>) => Promise<Resultado<Seguranca>>

  // Regras da carteira (Configurações → Carteira): só o administrador altera
  configuracaoDaCarteira: () => Promise<Resultado<ConfiguracaoDaCarteira>>
  alterarConfiguracaoDaCarteira: (
    patch: ConfiguracaoDaCarteiraPatch,
  ) => Promise<Resultado<ConfiguracaoDaCarteira>>

  // Cadastros auxiliares (Módulo 1)
  tags: ServicosDeTags
  cadastros: ServicosDeCadastros
  funis: ServicosDeFunis

  // Carteira de empresas (Módulo 2)
  carteira: ServicosDaCarteira

  // Contatos (Módulo 3)
  contatos: ServicosDeContatos

  // Importação de planilha (Módulo 4)
  importacao: ServicosDeImportacao

  // Visitas (G3)
  visitas: ServicosDeVisitas

  // Geolocalização (G1) e mapa (G2)
  geolocalizacao: ServicosDeGeolocalizacao
  mapa: ServicosDoMapa
  rotas: ServicosDeRotas

  // Central de chamados (Fase 2) e o sino
  chamados: ServicosDeChamados
  // Portal do cliente (Fase 3): a gestão feita pela equipe
  portal: ServicosDoPortalNoCrm
  // API aberta: chaves de API e webhooks (Configurações → Integrações)
  integracoes: ServicosDeIntegracoes
  notificacoes: ServicosDeNotificacoes

  // Atividades (Módulo 5)
  atividades: ServicosDeAtividades

  // Oportunidades (Módulo 6)
  oportunidades: ServicosDeOportunidades

  // Dashboard (Módulo 7)
  dashboard: ServicosDoDashboard

  // Busca global (barra do topo)
  busca: ServicosDaBusca
}

/** Matriz de permissões de um perfil: `chave → alcance` ou `true` */
export type MatrizDePermissoes = PerfilDeAcesso['permissoes']

export interface ServicosDePerfis {
  listar: () => Promise<Resultado<PerfilDeAcesso[]>>
  membros: (id: string) => Promise<Resultado<MembroDoPerfil[]>>
  criar: (dados: {
    nome: string
    descricao?: string | null
    exige2fa?: boolean
    permissoes?: MatrizDePermissoes
  }) => Promise<Resultado<PerfilDeAcesso>>
  duplicar: (id: string, nome: string) => Promise<Resultado<PerfilDeAcesso>>
  editar: (
    id: string,
    dados: {
      nome?: string
      descricao?: string | null
      exige2fa?: boolean
      ativo?: boolean
      permissoes?: MatrizDePermissoes
    },
  ) => Promise<Resultado<PerfilDeAcesso>>
  excluir: (id: string) => Promise<Resultado>
}
