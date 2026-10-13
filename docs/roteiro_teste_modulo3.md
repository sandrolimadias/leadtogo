# Roteiro de teste: Módulo 3 (Contatos)

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Cada tela tem os passos e o que deve acontecer. O que não bater, anote a tela, o passo e o que apareceu.
> Use a sua empresa de teste e **dados inventados** (nomes, telefones e e-mails que não sejam de gente real).

## Resumo dos roteiros
1. Papéis na decisão (Configurações)
2. Novo contato
3. Aviso de contato duplicado
4. Editar contato
5. Lista de contatos (busca e filtros)
6. Ficha do contato e consentimento
7. Vínculos: vincular, cargo, principal e inativar
8. Aba Contatos da empresa
9. Converter sócio em contato
10. Histórico do contato
11. Regra de carteira (vendedor)
12. Celular
13. Excluir contato

## Antes de começar
- Entre com o administrador. Tenha **2 ou 3 empresas** já cadastradas (Módulo 2), uma delas com **sócios** (cadastrada por CNPJ de verdade, que vem da Receita).
- Para o roteiro 11, convide um **vendedor** (Configurações → Usuários e equipe) e entre com ele em outro navegador. Deixe uma empresa na carteira dele e outra na do administrador.
- Em **Configurações → Carteira**, "Vendedores podem ver todas as empresas" começa **desligado**.

## 1. Papéis na decisão (Configurações → Papéis na decisão)
1. Aparecem os cinco padrões: **Decisor, Influenciador, Usuário, Financeiro, Técnico**.
2. Crie um papel novo (ex.: "Jurídico"), renomeie e inative. Um papel inativo some das escolhas novas.
3. Um papel **que já foi usado em algum contato** não se exclui (só se inativa); um que **nunca foi usado** se exclui.
4. O vendedor e o gestor **não editam** os papéis (só o administrador).

## 2. Novo contato (`/contatos/novo`)
1. Preencha nome, papel na decisão, aniversário (dia e mês), LinkedIn e observações. **29/02** vale; **31/02** é recusado. Um endereço que não seja do LinkedIn é recusado.
2. Adicione dois telefones (um deles marcado como WhatsApp) e dois e-mails, cada lista com **um principal**.
3. Escolha uma empresa e o cargo dela, e marque "contato principal". Salve: aviso de sucesso e a tela abre a **ficha** do contato.
4. Como administrador, crie outro contato **sem empresa**: deve salvar (gestor e administrador podem; o vendedor, não: a empresa é obrigatória para ele).
5. Ligue a chave **"Pediu para não receber contato"** num terceiro contato: ele salva, com o selo **Não quer contato**.

## 3. Aviso de contato duplicado
1. Crie um contato com **o mesmo e-mail** de um existente (com letras maiúsculas diferentes). Deve aparecer o aviso de duplicado com **Abrir contato**.
2. Repita com **o mesmo telefone** (com ou sem máscara).
3. **Abrir contato** leva para a ficha do existente. Reenviar mesmo assim cria o novo (o sistema só avisa; **não mescla**).

## 4. Editar contato
1. Na ficha, **Editar**: mude o nome, o papel, um telefone e um e-mail. Salve: volta para a ficha com os dados novos.
2. Ao incluir um e-mail ou telefone **que já era do próprio contato**, não aparece aviso de duplicado.

## 5. Lista de contatos (`/contatos`)
1. Colunas: **Contato** (nome, papel, selo), **Empresas** (estrela no principal; vínculo inativo riscado com "(inativo)"), **Cargo**, **Telefone** (com o ícone de WhatsApp quando há) e **E-mail**. Não há "Última interação" nem "Importar planilha" (vêm em outros módulos).
2. Busca por **nome** (sem acento nem maiúscula), por **pedaço do e-mail** e por **pedaço do telefone**, com ou sem máscara.
3. Filtros **Empresa, Cargo, Papel na decisão e Tag da empresa**. O de **Empresa** é um campo com busca: abra, digite parte do nome ou do CNPJ e escolha (o X limpa); eles ficam na URL (recarregue a página e continuam). Empresa, cargo e tag valem **para o mesmo vínculo ativo**: "Diretor na Empresa X" não traz quem é Diretor só na Y.
4. Um contato com vínculo **inativo** continua na lista, mas não aparece nos filtros de empresa, cargo e tag.
5. Sem resultado: mensagem de "nenhum contato com esses filtros". Mais de 25 contatos: pagina de 25 em 25.

## 6. Ficha do contato e consentimento
1. Cabeçalho: nome, papel, selo, "cargo · empresa" do vínculo principal, e as ações **Ligar, WhatsApp, E-mail e Editar**. Sem telefone ou e-mail, o botão correspondente fica apagado.
2. Abas **Resumo** e **Histórico** (Atividades e Oportunidades chegam nos Módulos 5 e 6).
3. Cartão **Consentimento**: base legal "Legítimo interesse". A chave **"Pediu para não receber contato"** grava na hora; depois aparecem **data e origem ("Registrado manualmente")**. O selo "Não quer contato" aparece no cabeçalho e **Ligar e WhatsApp continuam ativos** (só avisa).
4. Contato inexistente (mude o final do endereço): "Contato não encontrado".

## 7. Vínculos
1. Na ficha, **Vincular a outra empresa**: escolha a empresa, o cargo e se é o principal. Aviso "Contato vinculado".
2. O cargo é **de cada vínculo**: o mesmo contato pode ser "Sócio" numa empresa e "Contador" em outra.
3. Menu **Ações do vínculo**: mude o cargo; marque como **principal** (o selo sai do principal anterior da mesma empresa); **Inativar vínculo** (pede confirmação, guarda a data de saída e tira o selo de principal).
4. **Reativar vínculo** limpa a data de saída e **não** devolve o selo de principal.
5. Tente vincular de novo a uma empresa com vínculo ativo: erro "já está vinculado". Com vínculo **inativo**: ele é reativado (não cria um segundo).
6. Não existe "excluir vínculo", só inativar.

## 8. Aba Contatos da empresa
1. Na ficha de uma empresa, a aba **Contatos (N)** mostra os ativos: cartões com cargo, **Principal**, papel, "Não quer contato", telefone, e-mail e **Ligar, WhatsApp e E-mail**. Os inativos ficam no fim, apagados.
2. **Novo contato** abre o cadastro **já com a empresa** escolhida; **Vincular contato** busca um contato que já existe.
3. Quem só vê a empresa (não edita) não tem esses dois botões.
4. Excluir uma empresa **inativa todos os vínculos dela** (o contato continua existindo para administrador e gestor).

## 9. Converter sócio em contato
1. Na aba **Resumo** da empresa (cadastrada por CNPJ), no cartão **Sócios**, clique **Converter em contato** num sócio.
2. Aviso "Sócio convertido em contato". O botão vira o selo verde **Contato** (que abre a ficha).
3. O novo contato tem o **nome do sócio**, o vínculo com a empresa com **cargo = qualificação** (ex.: Sócio-Administrador), **sem telefone nem e-mail**, e aparece na aba Contatos da empresa.
4. O mesmo sócio **não converte duas vezes**.
5. Use **Atualizar pela Receita** (menu da empresa) e aplique as mudanças: o sócio convertido **continua marcado como Contato** e o vínculo continua na ficha do contato. Sócios novos da Receita entram; os que a Receita não traz mais e que **não** foram convertidos saem.

## 10. Histórico do contato
1. Na ficha, aba **Histórico**: do mais recente para o mais antigo, com quem fez e quando.
2. Depois dos roteiros anteriores aparecem entradas como **Contato cadastrado**, **Dados alterados** (de → para, com nomes e telefones formatados), **Consentimento alterado** (Aceita WhatsApp: Sim → Não), **Vinculado a** *empresa*, **Vínculo com** *empresa* **alterado / inativado / reativado**, **Criado a partir de sócio**.
3. Muitas entradas: **Carregar mais**. Sem nenhuma: "Nada no histórico ainda".

## 11. Regra de carteira (entre com o vendedor)
1. O vendedor vê **só os contatos ligados a empresas da carteira dele**. Um contato só de empresa de outro vendedor responde "Contato não encontrado".
2. Ao criar contato, o vendedor **precisa escolher uma empresa dele**.
3. Contato com vínculo para uma empresa dele **e** outra de outro vendedor: ele vê só o vínculo dele na ficha, e o **Histórico não mostra** as linhas que citam a outra empresa.
4. O filtro de Empresa da lista só traz as empresas dele.
5. Ligue "Vendedores podem ver todas as empresas": ele passa a **ver** os contatos das outras, mas só **edita** os da carteira dele (sem o botão Editar nos demais).
6. Se ele inativar o **último vínculo ativo** de um contato, a tela avisa antes ("o contato sai da sua carteira") e depois volta para a lista.
7. **Excluir contato** não aparece para o vendedor.

## 12. Celular (ou janela estreita)
1. Lista em **cartões** com Ligar, WhatsApp e E-mail; os filtros ficam atrás de **Filtros · N**.
2. Ficha com três botões grandes (Ligar, WhatsApp, E-mail) e as abas rolando na horizontal.

## 13. Excluir contato (administrador ou gestor)
1. Na ficha, **Mais ações → Excluir contato**: o diálogo lembra que não há lixeira e que, se a pessoa só saiu da empresa, o caminho é **inativar o vínculo**.
2. Confirme: o contato some da lista e a ficha responde "Contato não encontrado".
