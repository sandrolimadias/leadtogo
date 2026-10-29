# Roteiro de teste: busca global

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Use **dados inventados** (nunca de clientes reais). Antes, tenha na carteira algumas empresas (uma com CNPJ e acento no nome, por exemplo "Usinagem São João"), um contato com e-mail e telefone e uma oportunidade. Para o item 5, um usuário **vendedor** com carteira própria. Plano e regras em `plano_busca_global.md`. Anote a tela, o passo e o que apareceu em qualquer diferença.

## Resumo dos roteiros
1. Sugestões enquanto digita
2. Teclado e atalhos
3. Buscas recentes
4. Tela Busca e "Ver todos"
5. Regra de carteira
6. Celular

## 1. Sugestões enquanto digita (desktop)
1. Na barra do topo, digite **"sao joao"** (sem acento): aparece a seção **Empresas** com a empresa, "Cidade/UF · vendedor" e a Tag de Status.
2. Digite parte do **CNPJ**, com e sem pontuação (por exemplo "11.222.333" e "11222333"): acha a mesma empresa.
3. Digite o **e-mail** ou o **telefone** do contato: aparece em **Contatos**, com a empresa e o cargo.
4. Digite parte do **título da oportunidade**: aparece em **Oportunidades**, com a empresa, a fase e o valor. O nome da empresa também acha a oportunidade.
5. Com **1 letra**, a lista diz "Digite ao menos 2 letras". Com um termo que não existe: "Nada encontrado para …".
6. Quem **começa** com o termo vem antes de quem só o contém. Cada seção traz no máximo 5.
7. Clique num item: abre a ficha.

## 2. Teclado e atalhos
1. Em qualquer tela, **Ctrl+K** (⌘K no Mac) leva o foco à busca. Fora de um campo de texto, **/** também.
2. Digite um termo, use **↓** e **↑** para marcar um item e **Enter** para abrir a ficha.
3. **Enter** sem item marcado abre a tela **Busca** com o termo. **Esc** fecha a lista.

## 3. Buscas recentes
1. Depois de abrir uma ficha pela busca (ou apertar Enter), clique na caixa vazia: o termo aparece em **Buscas recentes**, o mais recente primeiro.
2. Busque de novo o mesmo termo com acento ou maiúsculas diferentes ("São João" e "sao joao"): **não duplica**, só volta ao topo.
3. Faça mais de 10 buscas: ficam só as **10** últimas.
4. Clique num termo recente: ele volta para a caixa e as sugestões aparecem.
5. O **x** apaga um termo; **"Limpar histórico"** apaga todos.
6. Letras digitadas e apagadas sem concluir a busca **não** entram no histórico.
7. Entre com outro usuário da mesma empresa: ele **não vê** as suas buscas (nem o administrador).
8. Troque de empresa (seletor): o histórico é outro, o daquela empresa.

## 4. Tela Busca e "Ver todos"
1. Enter na barra (ou "Ver todos os resultados") abre **Busca** com o termo na URL (`/busca?q=…`). Recarregar a página mantém o termo e os resultados.
2. Cada seção tem **"Ver todos em Empresas/Contatos/Oportunidades"**, que abre a lista do tipo já filtrada pelo termo (Oportunidades abre na visão de lista).
3. Com o campo vazio, a tela mostra as **buscas recentes**.

## 5. Regra de carteira
1. Entre como **vendedor** (carteira própria): busque o nome de uma empresa de **outro** vendedor. Não aparece nem a empresa, nem os contatos dela, nem as oportunidades dela.
2. Como **administrador**, a mesma busca acha tudo.
3. Empresa, contato ou oportunidade **excluídos** não aparecem.

## 6. Celular
1. No celular, a **lupa** do cabeçalho abre a tela **Busca** com as buscas recentes (as mesmas do desktop).
2. Digite e toque num resultado: abre a ficha.
