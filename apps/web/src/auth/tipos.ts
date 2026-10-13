import type {
  ConfiguracaoDaCarteira,
  ConsultaDaReceitaDaEmpresa,
  ConsultaReceita,
  ContagensDaLista,
  ConviteAceito,
  ConviteConsulta,
  ConviteCriado,
  ConviteResumo,
  EmpresaCarteira,
  EmpresaCriada,
  HistoricoDaEmpresa,
  ListaDeEmpresas,
  Me,
  MembroDaEquipe,
  OpcoesDaLista,
  PapelDecisao,
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
} from '@leadtogo/api-client'
import type {
  AlterarEmpresaCarteiraEntrada,
  AlterarFaseEntrada,
  AlterarFunilEntrada,
  AlterarMembroEntrada,
  AlterarMotivoEntrada,
  AlterarOrigemEntrada,
  AlterarPapelDecisaoEntrada,
  AlterarSolucaoEntrada,
  AlterarTagEntrada,
  AlterarTagGrupoEntrada,
  AlterarTipoAtividadeEntrada,
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
  CriarEmpresaCarteiraEntrada,
  ConfiguracaoDaCarteiraPatch,
  CriarVerticalEntrada,
  PoliticaDoisFatores,
  PrimeiroAcessoEntrada,
  PrimeiroAcessoResultado,
  Tag,
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
  /** Grupos com as tags, inclusive as inativas (a tela as mostra com a palavra "Inativa") */
  listar: () => Promise<Resultado<TagGrupo[]>>
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
  seguranca: () => Promise<Resultado<Seguranca>>
  alterarPoliticaDeDoisFatores: (politica: PoliticaDoisFatores) => Promise<Resultado<Seguranca>>

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
}
