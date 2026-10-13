# Roteiro de teste: Módulo 2 (Empresas)

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Cada tela tem os passos e o que deve acontecer. O que não bater, anote a tela, o passo e o que apareceu.
> Os dados de teste ficam na sua empresa de teste; **não use CNPJ de cliente real que você não queira ver no CRM**. A Receita consultada é a de verdade.

## Antes de começar
- Entre com o administrador. Em **Configurações → Tags**, confira que existem os grupos **Status** (Lead, Prospect, Cliente, Inativo) e **Visitação**; crie um grupo **Interesse** (seleção múltipla) com duas tags (ex.: Retrofit e Monitoramento) para testar tags em massa.
- Em **Configurações → Verticais e soluções**, crie uma vertical (ex.: Metalmecânica).
- Em **Configurações → Carteira**: o bloqueio de empresa não ativa deve estar **ligado** e "Vendedores podem ver todas as empresas" **desligado**.
- Para testar a regra de carteira, convide um **vendedor** (Configurações → Usuários e equipe) e entre com ele num segundo navegador.

## 1. Lista de empresas (`/empresas`)
1. Lista vazia: aparece "Sua carteira está vazia" e o botão **Nova empresa**.
2. Depois de cadastrar 3 ou 4 empresas (roteiros 2 a 5): confira as colunas **Empresa (nome + CNPJ), Tags, Cidade, Última visita, Último contato, Próxima atividade**. **Não** deve haver coluna Vendedor nem "Em aberto". Todas as tags da empresa aparecem, sem "+N".
3. Chips com contagem: **Todas, Minha carteira, Sem visita há 90 dias, Nunca visitadas, Sem próxima atividade**. Lead não entra nas contagens dos três últimos; marque **Incluir leads** e os números mudam.
4. Com **um membro só** na empresa: o filtro **Vendedor** e o chip **Minha carteira** não aparecem. Com mais gente, aparecem.
5. Busca: digite parte do nome (sem acento), parte do CNPJ (com ou sem pontos) e a cidade. Os filtros **Status, Visitação, Vendedor, Cidade, Última visita** somam; **Limpar filtros** zera. Copie o endereço da barra, abra em outra aba: os filtros continuam.
6. Filtro sem resultado: "Nenhuma empresa com esses filtros".
7. **Celular** (ou janela estreita): cartões com **Ligar, WhatsApp e Rota**; "Filtros · N" abre os filtros. Sem telefone ou endereço, o botão fica apagado.

## 2. Nova empresa com CNPJ real ativo (`/empresas/nova`)
1. Escolha **CNPJ**, digite um CNPJ de empresa **ativa** (ex.: Banco do Brasil, 00.000.000/0001-91) e clique **Consultar** (ou Enter).
2. Deve aparecer "Dados preenchidos pela Receita" com a situação **Ativa**, e os passos **Conferir dados** (razão social, fantasia, regime, início, porte, endereço, telefones, sócios, CNAEs com o principal marcado) e **Carteira**. Não há faixa de funcionários nem de faturamento.
3. Edite o nome fantasia, desmarque um telefone, marque "Também é WhatsApp" num celular, acrescente um telefone seu.
4. Carteira: o **Status** vem em **Lead**; escolha uma **Vertical**; preencha website e observações. (O campo **Vendedor** só aparece com mais de um membro e para administrador e gestor.)
5. **Salvar empresa**: aviso "Empresa cadastrada" e volta para a lista, com a empresa nela.
6. Repita o mesmo CNPJ: deve aparecer **"Esta empresa já está no CRM"** com **Abrir ficha**.

## 3. CNPJ de empresa baixada (deve bloquear)
1. Tente cadastrar um CNPJ de empresa **baixada, inapta ou suspensa**.
2. Deve aparecer **"Empresa não ativa na Receita"** com a situação e o motivo, e o botão **Salvar empresa** desligado.
3. Em **Configurações → Carteira**, desligue o bloqueio e repita: agora a tela avisa, mas deixa salvar. Religue o bloqueio no fim.
4. CPF e "Sem documento" não passam por essa regra: cadastre um de cada e confira que salvam.

## 4. CNPJ inválido
1. Digite poucos caracteres e consulte: "Informe os 14 caracteres do CNPJ…".
2. Digite 14 caracteres com dígito errado: "CNPJ inválido. Confira os dígitos.".
3. Digite um CNPJ válido que a Receita não conhece: a mensagem aparece no campo, com a opção **Preencher à mão**.
4. (Se conseguir simular a Receita fora do ar) aparece "A Receita não respondeu" e **Preencher à mão** salva a empresa com o selo **"Situação não verificada"** na ficha.

## 5. Filial ligada à matriz
1. Cadastre uma **filial** (mesma raiz do CNPJ de uma matriz, final 0002 ou outro) **antes** da matriz: ela entra como Filial, sem matriz ligada.
2. Cadastre a **matriz**: na ficha da matriz, em Dados cadastrais, aparece **"Filial cadastrada"** com o link. Na ficha da filial, **"Filial de [nome da matriz]"**.
3. Cadastre outra filial **depois** da matriz: já entra ligada.

## 6. Ficha (`/empresas/:id`)
1. Cabeçalho: nome, selo **Matriz/Filial**, **Ativa na Receita**, razão social, CNPJ, tags, **Editar tags**, **Ligar** e **WhatsApp** (apagados sem telefone), **Mais ações**.
2. Faixa: Vendedor (some com um membro só), Vertical, Última visita e Último contato ("Nunca"), Próxima atividade ("—").
3. Abas: só **Resumo** e **Histórico**. Não deve haver Contatos, Atividades, Oportunidades, "Nova atividade" nem "Nova oportunidade".
4. Resumo: **Dados cadastrais**, **CNAEs** (principal marcado), **Sócios** (nome e qualificação, sem CPF e sem "Converter em contato") e **Observações**.
5. **Editar tags**: o Status aceita uma tag só; Interesse aceita várias; Visitação não aparece. Salve e confira o cabeçalho.
6. **Histórico**: aparecem "Empresa cadastrada", as mudanças em português (com nomes, não códigos) e quem fez. Trocar de Status aparece como "Tags alteradas".
7. Celular: botões grandes **Ligar, WhatsApp e Rota**.

## 7. Atualizar pela Receita
1. Na ficha de uma empresa com CNPJ, clique **Atualizar pela Receita** (ao lado de "Receita em dd/mm/aaaa").
2. Aparece "Consultando Receita…" e depois o diálogo: a **situação** e, se houver, **o que mudou (No CRM × Na Receita)**. Para provocar uma diferença, edite antes a razão social da empresa (roteiro 8).
3. **Manter como está** fecha sem alterar o cadastro (a data "Receita em…" e a situação já foram atualizadas). **Aplicar alterações** grava e avisa "Dados atualizados pela Receita".
4. No Histórico: "Consulta à Receita" e "Atualizado pela Receita", com o antes e o depois.
5. CPF e sem documento **não** têm o botão.

## 8. Editar
1. Ficha → **Mais ações → Editar**. É a mesma tela do cadastro, **sem consulta à Receita**, com o documento só para leitura e **sem Status** (que muda em Editar tags).
2. Mude razão social, telefones e vertical; limpe as observações; **Salvar empresa**: volta para a ficha com as mudanças, e o Histórico mostra "Dados alterados".
3. Com mais de um membro, o **Vendedor** pode ser trocado ("Carteira transferida" no Histórico). O vendedor comum **não** troca a carteira.

## 9. Excluir
1. Ficha → **Mais ações → Excluir**: pede confirmação e avisa que **não há lixeira**. **Voltar** não exclui; **Excluir empresa** exclui e volta para a lista.
2. A empresa some da lista; o mesmo CNPJ pode ser cadastrado de novo.
3. Com o vendedor: ele **não** vê "Excluir" (só administrador e gestor).

## 10. Tags em massa (lista)
1. Marque 3 empresas: aparece a barra **"3 selecionadas · Aplicar tag · Limpar seleção"** (no celular não há seleção).
2. **Aplicar tag → Status → Cliente**: as 3 viram Cliente (o Lead sai). Confira os chips e as contagens.
3. **Aplicar tag → Interesse → Retrofit** soma a tag, sem tirar o Status. Repita com as mesmas: o aviso diz quantas "já tinham a tag".
4. Mudar um filtro ou de página desmarca tudo. Com o vendedor, só as empresas dele podem ser marcadas.

## 11. Configuração do bloqueio e da regra de carteira (Configurações → Carteira)
1. Duas chaves, cada uma vale na hora: **Bloquear o cadastro de empresa não ativa na Receita** (ligada) e **Vendedores podem ver todas as empresas** (desligada).
2. Com a segunda **desligada**, o vendedor vê só as empresas dele (a lista e a busca). **Ligada**: ele vê todas, mas só edita as dele (Editar tags, Atualizar pela Receita e Excluir somem nas dos outros).
3. Gestor e vendedor **não** veem o menu Configurações.

## O que ficou de fora e por quê
| Item | Por quê |
|---|---|
| Abas **Contatos, Atividades e Oportunidades**, botões "Nova atividade" e "Nova oportunidade", "Converter em contato" | São dos Módulos 3, 5 e 6 |
| **Última visita, último contato e próxima atividade** com valores | Dependem das atividades (Módulo 5): hoje aparecem "Nunca" e "—" |
| Coluna **Em aberto** da lista | Depende das oportunidades (Módulo 6) |
| **Importar planilha** | Módulo 4 (o bloqueio de empresa não ativa também valerá lá) |
| **Lixeira e restauração** de empresas | Pendência pós-MVP; hoje excluir é definitivo para o usuário |
| **Trocar vendedor em massa** e **Exportar** na lista | Fora do que foi aprovado para esta fase; a troca de vendedor é feita empresa a empresa, em Editar |
| **Faixas de funcionários e de faturamento**, **campos personalizados** | Fora do MVP |
| **Cidade** em empresa sem consulta à Receita (CPF, sem documento, Receita fora do ar) | O campo é só leitura, como no protótipo; só a Receita preenche a cidade |
| **Mudar o documento** de uma empresa já cadastrada (ex.: "sem documento" que ganhou CNPJ) | Decisão de projeto: o documento não muda; cadastre de novo se precisar |
| BrasilAPI como alternativa **independente** | Ela repassa a própria Minha Receita; só vale a instância própria (registrado em `configuracao_tecnologia.md`) |
| Sócios editados à mão | Os sócios vêm sempre da Receita (sem CPF, por LGPD) |
