# Roteiro de teste: Kanban, data de fechamento e tags de oportunidade

*31/10/2026. Plano em `plano_oportunidades_kanban_e_tags.md`. Use uma empresa de teste com pelo menos um administrador, um gestor e um vendedor, e algumas oportunidades em fases diferentes.*

## 1. Card do Kanban

1. Abra **Oportunidades** (Kanban).
2. Confira em cada card: na 1ª linha o **NOME DA EMPRESA**, em maiúsculas e negrito; na linha de baixo o **nome da oportunidade**.
3. Clique no nome da oportunidade: abre a ficha.
4. Empresa com nome longo: o nome quebra em no máximo 2 linhas (passe o mouse para ver o nome inteiro).

## 2. Zonas de fechamento

1. No computador, arraste um card pela alça (ícone de seis pontos).
2. As quatro zonas (Conquistada, Perdida, Cancelada, Suspensa) aparecem no topo e **as colunas descem**: nome, quantidade e soma de cada fase continuam visíveis.
3. Solte numa fase: o card muda de fase e as colunas sobem de volta.
4. Arraste de novo e solte numa zona: abre "Fechar oportunidade".
5. Repita no tablet e no celular (no celular, toque e segure a alça).
6. Pelo teclado: foco na alça, Espaço, seta para cima (zonas), seta para baixo (fases), Espaço solta, Esc cancela.

## 3. Data de fechamento (admin e gestor)

1. Entre como **gestor**. Feche uma oportunidade como Conquistada: a janela mostra **"Data de fechamento"** com a data de hoje.
2. Tente uma data no futuro: o campo não aceita (e, se forçar, aparece "A data não pode ser no futuro.").
3. Tente uma data anterior à criação da oportunidade: aparece "A data não pode ser antes da criação da oportunidade.".
4. Escolha uma data válida no passado (ex.: 3 dias atrás) e confirme. Na ficha, "Fechada em" mostra o dia escolhido; na lista, o filtro de período e o Dashboard contam no dia/mês certo.
5. Entre como **vendedor** e feche uma oportunidade da sua carteira: o campo de data **não aparece** e vale a data de hoje.
6. Reabra a oportunidade: a data de fechamento some.

## 4. Data de criação (só o administrador)

1. Como **administrador**, abra **Editar** numa oportunidade: aparece **"Criada em"**.
2. Mude para um dia passado e salve: a ficha mostra o novo "Criada em".
3. Tente um dia no futuro: não aceita.
4. Numa oportunidade fechada, tente uma data de criação depois da data de fechamento: aparece "A data não pode ser depois da data de fechamento.".
5. Como **gestor**, o campo "Criada em" **não aparece**.

## 5. Tags de oportunidade

1. Como administrador, abra *Configurações → Tags*: há as abas **Empresas**, **Contatos** e **Oportunidades**.
2. Na aba Oportunidades (vazia), crie o grupo **"Tipo de negócio"** (seleção múltipla) com as tags **Novo**, **Renovação** e **Upsell**. A janela não oferece "Obrigatório".
3. Crie também **"Concorrente"** (seleção única) com **Concorrente A** e **Concorrente B**.
4. **Nova oportunidade:** a seção **Tags** mostra os dois grupos; marque Novo e Upsell e escolha Concorrente A; salve. O card do Kanban mostra as tags.
5. **Ficha:** as tags aparecem no cabeçalho; **"Editar tags"** troca as tags (no grupo de seleção única, só uma).
6. **Editar oportunidade:** mude as tags pelo formulário e salve.
7. **Duplicar:** a cópia já vem com as tags da original.
8. **Lista:** a coluna **Tags** mostra todas, quebrando linha.
9. **Filtro "Tag da oportunidade"** (Kanban e lista): escolha "Tipo de negócio: Novo"; só as oportunidades com a tag aparecem. "Limpar filtros" tira o filtro.
10. **Fechada:** feche uma oportunidade e mude as tags dela pela ficha (funciona).
11. **Isolamento:** confira que os grupos de oportunidade **não aparecem** na ficha da empresa, em "Editar tags" da empresa, no mapa, nas tags do contato nem nos filtros de Empresas e Contatos.
12. **Exclusão em uso:** tente excluir a tag "Novo" (em uso): só é possível inativar. Uma tag nunca usada se exclui.
13. **Vendedor:** aplica e tira tags só nas oportunidades das empresas da carteira dele; não vê a aba de configuração.
