# Roteiro de teste: filtros de Contatos e tags de contato

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Use **dados inventados** (nunca de clientes reais). Antes, tenha na carteira algumas empresas com contatos (um deles ligado a uma empresa com o Status Cliente). Para o item 5, um usuário **vendedor** com carteira própria. Plano e regras em `plano_contatos_filtros_e_tags.md`. Anote a tela, o passo e o que apareceu em qualquer diferença.

## Resumo dos roteiros
1. Filtros recolhíveis
2. Configurar grupos de tags de contato
3. Aplicar tags no contato
4. Lista: coluna e filtro
5. Regra de carteira e permissões
6. Nada de tag de contato nas empresas
7. Excluir e inativar

## 1. Filtros recolhíveis (desktop, tablet e celular)
1. Abra **Contatos**: só a busca e o botão **"Filtros"** aparecem na barra; os filtros estão recolhidos.
2. Clique em **"Filtros"**: abaixo da busca aparecem, **um abaixo do outro**, Empresa, Cargo, Papel na decisão, Tag do contato (só se houver grupo de tags de contato) e Tag da empresa, cada um com o nome acima.
3. Escolha um cargo: a lista filtra, a seção continua aberta e o botão vira **"Filtros · 1"**.
4. Clique em **"Fechar filtros"** (ou no próprio botão): a seção some e o filtro continua valendo (a lista e o endereço da página não mudam).
5. **"Limpar filtros"** funciona com a seção fechada.
6. Recarregue a página com um filtro: a seção abre fechada, o botão mostra "Filtros · 1" e a lista vem filtrada.
7. Repita no celular (390 px) e no tablet: mesmo comportamento; no celular os filtros ocupam a largura toda.

## 2. Configurar grupos de tags de contato (administrador)
1. **Configurações → Tags** tem as abas **Empresas** e **Contatos**, com o número de grupos de cada uma. A aba Empresas mostra Status, Visitação e os seus grupos de sempre.
2. Na aba **Contatos** vazia: "Nenhum grupo de tags de contato" e "Novo grupo".
3. Crie o grupo **Perfil** (seleção múltipla): a janela diz "Novo grupo de tags de contato" e **não tem** "Obrigatório". Crie as tags **Técnico** e **Comprador** com cores diferentes.
4. Crie o grupo **Relacionamento** (seleção **única**) com **Promotor** e **Detrator**.
5. Tente criar um grupo de contato com o mesmo nome de um grupo de empresa (por exemplo "Status"): "Já existe um item com esse nome".
6. **Subir** e **Descer** trocam a ordem dentro da aba Contatos; a aba Empresas não muda.
7. A aba Empresas **não** mostra Perfil nem Relacionamento.

## 3. Aplicar tags no contato
1. **Novo contato**: a seção **Tags** aparece com Perfil (caixas de marcar) e Relacionamento (escolha uma ou "Nenhuma"). Marque Técnico e Promotor e salve: a ficha mostra as duas tags no cabeçalho.
2. Na ficha, **"Editar tags"**: troque Promotor por Detrator (só uma do grupo de seleção única) e marque Comprador. Salve: "Tags salvas" e as tags mudam na hora.
3. **Editar** o contato: a seção Tags vem com o que ele tem; desmarque Comprador e salve.
4. Aba **Histórico** do contato: "Contato cadastrado" com as tags iniciais e **"Tags alteradas"** com as adicionadas e as removidas.

## 4. Lista: coluna e filtro
1. A tabela de Contatos tem a coluna **Tags** logo depois de "Contato", com todas as tags do contato, na ordem dos grupos.
2. No celular, as tags aparecem no cartão, abaixo do nome.
3. Em **Filtros**, escolha **"Tag do contato: Perfil: Técnico"**: só os contatos com Técnico aparecem. Junto com "Tag da empresa", os dois filtros valem ao mesmo tempo.

## 5. Regra de carteira e permissões
1. Entre como **vendedor**: ele vê e muda as tags dos contatos ligados às empresas dele (botão "Editar tags" na ficha).
2. Num contato que ele só vê (empresa de outro vendedor, com "ver todas" ligado), as tags aparecem, mas **sem** "Editar tags".
3. O vendedor e o gestor **não** acessam *Configurações → Tags*.

## 6. Nada de tag de contato nas empresas
1. Na ficha de uma empresa, **"Editar tags"** não lista Perfil nem Relacionamento.
2. Na lista de Empresas (filtros e "Aplicar tag" em massa), no **mapa**, na **importação** (tag de Status) e no **construtor de visita** (campo "Tag"): nenhuma tag de contato aparece.
3. No filtro "Tag do contato" da lista de Contatos, nenhuma tag de empresa aparece (e vice-versa no filtro "Tag da empresa").

## 7. Excluir e inativar
1. Tente **excluir** a tag Técnico (usada por um contato): "já foi usada por empresas ou contatos… só inativar". O mesmo para o grupo Perfil.
2. **Inative** Técnico: ela some das opções de Novo contato e do filtro, mas continua no contato que já a tinha (aparece como "(inativa)" em "Editar tags", e dá para tirar).
3. Uma tag de contato nunca usada pode ser excluída.
