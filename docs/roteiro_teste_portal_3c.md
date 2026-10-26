# Roteiro de teste: Portal do Cliente, Fase 3C (documentos)

> Para o Ale testar depois do push da Fase 3C (e das fases 3A e 3B). Regras em `funcionalidades.md` (seção 9E); tabelas em `modelagem_banco.md` ("Portal do Cliente, Fase 3C"); catálogo de permissões em `packages/shared/src/permissoes.ts` (versão 7).
> **Antes de tudo:** **Backup Now** do banco. A migração **0035 só acrescenta** (3 tabelas novas); nada existente some. Ela roda sozinha na subida da API.
> **IMPORTANTE: documentos dependem dos anexos.** Enviar arquivo usa o mesmo caminho dos anexos dos chamados: **Garage com endereço público e CORS, e o ClamAV**. Esses itens ainda estão **pendentes de implantação em produção** (decisão do Ale de fazer depois). Sem eles, a aba Documentos abre, mas o envio responde "O envio de arquivos ainda não está configurado (antivírus)". Siga `roteiro_garage_anexos.md` e o item 0 do `roteiro_teste_chamados.md` **antes** de testar esta fase, e **inclua `https://portal.aledias.com.br` no CORS do bucket** (o download do cliente é direto do Garage).
> **O que muda para quem já usa:** nada. Só o **Administrador** recebe `portal.documentos`; os demais perfis ganham se você marcar em Configurações → Perfis de acesso.

## 1. Verificação no servidor (terminal da VPS)
```sql
-- 1) As 3 tabelas com RLS habilitado e forçado (esperado: 3 linhas, as duas colunas true)
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('documentos','documento_empresas','documento_acessos');

-- 2) O gatilho do total de downloads existe (esperado: 1)
SELECT count(*) FROM pg_trigger WHERE tgname = 'documento_acessos_total';
```

## 2. Publicar um documento (CRM → Portal do Cliente → Documentos)
1. Aba **Documentos** → **Novo documento**. Preencha **Título** e **Descrição** (opcional), escolha um **PDF** de teste (até 25 MB) e deixe **Para quem: Todos os clientes**. **Enviar documento**.
2. O arquivo sobe direto ao armazenamento. Na lista o documento aparece como **Em verificação** e, em alguns segundos, **Disponível** (o worker varre o arquivo no ClamAV). Se ficar em verificação por mais de 1 minuto, veja o log do worker e a saúde do ClamAV.
3. **Antivírus de verdade:** envie o arquivo de teste **EICAR** (`eicar.com`, inofensivo): o documento fica **Bloqueado pelo antivírus**, **não** tem o botão Baixar e o cliente **nunca** o vê.
4. **Baixar** (equipe): abre o arquivo (link de 5 minutos). Só funciona com o documento **Disponível**.

## 3. O cliente (janela anônima, cliente do portal)
1. No menu do portal, **Documentos**: o documento aparece com título, descrição, nome do arquivo, tamanho e a data de publicação. **Antes** de o antivírus liberar, ele **não** aparece.
2. **Baixar**: o arquivo é baixado (link de **60 segundos**, sempre como arquivo, nunca abre no navegador). **Buscar** pelo título, pela descrição ou sem acento ("preco" acha "preço").
3. De volta ao CRM: o contador do documento passa a **1 download**; clicar nele mostra **quem baixou** (pessoa, empresa-cliente e data/hora). Baixe de novo com outro cliente: 2 downloads.

## 4. Alcance, visibilidade e exclusão
1. **Empresas escolhidas:** Editar → Para quem: Empresas escolhidas → adicione uma empresa. Só os clientes dela veem e baixam; os demais, não (e o endereço do download responde "não encontrado"). Salvar com "Empresas escolhidas" e nenhuma empresa não deixa.
2. **Tirar do portal:** o botão some o documento do portal **sem excluir** (aparece "Fora do portal" na lista); **Mostrar no portal** devolve.
3. **Editar** muda título, descrição e alcance. **O arquivo não troca**: para outra versão, publique um novo documento e tire o antigo do portal.
4. **Excluir:** pede confirmação; o documento some do portal e da lista (os dados ficam guardados).

## 5. Permissões
1. Perfil só com **`portal.ver`**: vê a lista, baixa e vê quem baixou, mas **não** tem Novo documento, Editar, Tirar do portal nem Excluir.
2. Perfil só com **`portal.documentos`**: vê a aba Documentos e escreve; não vê as abas Chamados nem Acessos.
3. Sem nenhuma permissão do portal: o menu não mostra o Portal e a tela volta ao início.

## 6. Isolamento
1. Com o cliente A, tente abrir/baixar um documento do alcance só da empresa B: o portal responde "não encontrado".
2. O cliente nunca vê documento de outra empresa da equipe (cada empresa tem os seus).

## 7. Se algo falhar
| Sintoma | Causa provável |
|---|---|
| "O envio de arquivos ainda não está configurado (antivírus)" | Falta `CLAMAV_HOST` na API e no worker (itens de `roteiro_garage_anexos.md`) |
| O envio falha no navegador com erro de CORS | O bucket não tem o CORS do CRM **e** do portal (`https://portal.aledias.com.br`) |
| O documento fica em "Em verificação" | O worker está parado ou o ClamAV ainda baixa as assinaturas (a primeira subida demora alguns minutos) |
| O cliente baixa e dá erro | O endereço público do Garage (`S3_PUBLIC_ENDPOINT`) não é alcançável pelo navegador, ou falta o CORS do portal |
| "Documento não encontrado" para o cliente | Está fora do alcance, tirado do portal, excluído ou ainda não liberado pelo antivírus |
