# Plano da busca global

*Proposta de 29/10/2026, **aprovada pelo Ale em 29/10/2026** (as decisões da seção 3 como recomendado, com o histórico de buscas recentes guardado no servidor). Entrega o item "Busca global" do `escopo_mvp.md` (transversal) e do `backlog_pos_mvp.md`. Regras em `funcionalidades.md` (seção 12) e protótipo em `docs/prototipo/README.md` (Topbar).*

## 1. Objetivo

A caixa da barra do topo ("Buscar empresas, contatos e oportunidades") hoje só avisa "em breve". Ela passa a encontrar, de qualquer tela, **empresas, contatos e oportunidades** da carteira que a pessoa alcança, sem diferença de acento ou maiúsculas, e a lembrar as **10 últimas buscas** de cada pessoa.

## 2. O que se reaproveita

| Peça | Onde está | Uso aqui |
|---|---|---|
| Busca da lista de empresas (fantasia, razão social, cidade, CNPJ com ou sem máscara) | `apps/api/src/carteira/lista.service.ts` (`busca`) | Extraída para `busca-texto.ts` e usada pelas duas |
| Busca da lista de contatos (nome, e-mail, telefone) | `lista-contatos.service.ts` (`busca`) | Idem |
| Busca da lista de oportunidades (título, nome da empresa) | `lista-oportunidades.service.ts` (`buscaSql`) | Idem |
| `semAcento` e `literalParaLike` (hoje copiados nos três arquivos) | as três listas | Um só lugar, em `busca-texto.ts` |
| Regra de carteira | `escopoDaCarteira`, `condicaoDeVisibilidadeDoContato`, `condicaoDeVisibilidadeDaOportunidade` e a condição de empresas | Cada tipo com a **sua** visibilidade |
| Busca global do Portal do Cliente (agrupada por tipo, mínimo de 2 letras, até 5 por tipo, tela `/busca`) | `apps/api/src/portal/portal-busca.service.ts`, `apps/portal` | Mesmo formato de resposta e de tela |
| Índices trigram em `lower(f_unaccent(...))` | migrações 0017 (empresas) e 0018 (contatos) | Já atendem empresas e contatos |
| Limite de requisições | `apps/api/src/rate-limit` | Aplicado à rota nova |

## 3. Decisões (aprovadas pelo Ale em 29/10/2026)

1. **Tipos:** empresas, contatos e oportunidades. **Tarefas ficam para uma fase seguinte**; `funcionalidades.md` (seção 12) é ajustado para dizer isso.
2. **Interface:** no desktop e no tablet, **sugestões enquanto digita** (lista abaixo da caixa, agrupada por tipo, até 5 por tipo); **Enter** ou "Ver todos os resultados" abre a tela **`/busca?q=`**. No celular, a lupa abre direto a tela `/busca`.
3. **Mínimo de 2 letras**; até 5 resultados por tipo nas sugestões e na tela. Para ver mais, cada seção tem "Ver todos em Empresas/Contatos/Oportunidades", que abre a lista do tipo já filtrada (`?busca=`). A busca global não pagina.
4. **Ordem dentro de cada tipo:** quem **começa** com o termo, depois quem só o contém, depois o atualizado mais recentemente.
5. **Buscas recentes:** as **10 últimas buscas** de cada pessoa, guardadas **no servidor**, na tabela `buscas_recentes` (acompanham a pessoa entre o desktop e o celular e ficam separadas por empresa, porque o membro é por tenant). Guarda só o **termo**; guardar também o registro aberto fica para depois (seção 9).
6. **O que entra no histórico:** só a busca **concluída** (escolheu um resultado ou apertou Enter), nunca as letras soltas da digitação. Termo repetido não cria linha nova: volta para o topo (comparação sem acento e sem maiúsculas). Passou de 10, o mais antigo sai.
7. **Ninguém vê o histórico de outra pessoa**, nem o gestor nem o admin. A própria pessoa apaga um termo ou todos.

## 4. Comportamento na tela

- **Caixa vazia e focada** (clique, `Ctrl+K` ou `/`): lista **"Buscas recentes"**, a mais recente primeiro, ícone `clock`, um **x** em cada linha para apagar só aquele termo e o rodapé **"Limpar histórico"**. Clicar num termo repete a busca. Sem histórico, a lista não abre.
- **Digitando** (2 letras ou mais, 250 ms depois da última tecla): as recentes dão lugar às sugestões, em seções **Empresas**, **Contatos** e **Oportunidades** (seção vazia não aparece). Estados: "Buscando…", "Nada encontrado para 'x'" e erro com "Tentar de novo". Com 1 letra: "Digite ao menos 2 letras".
- **Cada item:**
  - Empresa: nome fantasia (ou razão social); abaixo, "Cidade/UF · vendedor" e a Tag de status.
  - Contato: nome; abaixo, a empresa principal e o cargo.
  - Oportunidade: título; abaixo, a empresa, a fase e o valor total.
- Clicar num item abre a ficha (`/empresas/$id`, `/contatos/$id`, `/oportunidades/$id`) e grava o termo no histórico.
- **Teclado e acessibilidade:** ↑↓ percorre os itens, Enter abre o item marcado (ou a tela `/busca` se nenhum estiver marcado), Esc fecha. `role="combobox"` com `aria-expanded`, `aria-controls` e `aria-activedescendant`; a lista é `role="listbox"` com grupos rotulados.
- **Tela `/busca`:** campo no topo com o termo da URL, as três seções e, com o campo vazio, as buscas recentes (é o que o celular mostra ao abrir).
- Componentes do `@leadtogo/ui` (o pacote do design system: `TextField`, `Button`, `IconButton`, `Tag`, `Alert`, `EmptyState`), como a busca de empresa do "Registrar atividade"; a lista é própria (não há Popover/Command no pacote). Ícones Lucide (`search`, `clock`, `x`, `arrow-right`, `building-2`, `users`, `handshake`).

## 5. Modelo de dados (migração 0042, **só expansão**)

**Índice novo:** `oportunidades_titulo_trgm_idx`, GIN em `lower(f_unaccent(titulo)) gin_trgm_ops` (as oportunidades ainda não têm índice de busca). Avaliar com `EXPLAIN` também um índice trigram em `contato_emails.email`.

**Conferência (feita):** os índices trigram das migrações 0017 e 0018 não estão no schema do Drizzle nem nos snapshots, então o `db:generate` não os enxerga e não tenta apagá-los. O índice novo segue o mesmo padrão (SQL na migração).

**Tabela nova `buscas_recentes`:**

| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid v7 PK | |
| tenant_id | uuid FK NOT NULL | RLS |
| membro_id | uuid FK NOT NULL → `membros` | dono do histórico |
| termo | varchar(100) NOT NULL | como a pessoa digitou (aparado) |
| termo_comparavel | varchar(100) NOT NULL | sem acento, minúsculo, espaços normalizados: chave de "mesmo termo" |
| buscado_em | timestamptz NOT NULL | ordena a lista; atualizado quando o termo se repete |
| colunas padrão | | `criado_em`, `atualizado_em`, `criado_por`, `atualizado_por` (sem `excluido_em`: apagar o termo é apagar de fato, ver LGPD) |

- **Única** em `(tenant_id, membro_id, termo_comparavel)`; índice em `(tenant_id, membro_id, buscado_em DESC)`.
- **RLS habilitado e forçado**, como as demais tabelas; teste de isolamento entre tenants.
- A política de leitura e escrita é do tenant; a restrição **ao próprio membro** fica na API (toda consulta filtra `membro_id = membro atual`), com teste.
- O membro não é excluído, é desativado: **desativar apaga o histórico dele** (na API); `ON DELETE CASCADE` cobre uma exclusão física.
- `modelagem_banco.md` ganha a tabela e o índice.

## 6. Back-end (`apps/api`)

### 6.1 `packages/shared`

- `consultaDaBuscaGlobal`: `q` (2 a 100 caracteres, aparado), `tipos` (opcional: `empresas`, `contatos`, `oportunidades`; padrão os três), `limite` (1 a 20, padrão 5).
- `resultadoDaBuscaGlobal`: `{ empresas: ItemDaBusca[], contatos: ItemDaBusca[], oportunidades: ItemDaBusca[] }`, com `ItemDaBusca = { id, titulo, subtitulo, destino, status? }`.
- `buscaRecente` (`id`, `termo`, `buscadoEm`) e `novaBuscaRecente` (`termo` de 2 a 100 caracteres).
- Função pura `termoComparavel(texto)` (usada na API e testada à parte).

### 6.2 Busca: `GET /v1/busca`

- `BuscaGlobalService` em `apps/api/src/carteira/`: três consultas em sequência (dividem a transação do tenant ativo, que não aceita comandos em paralelo), cada uma com a sua condição de busca (de `busca-texto.ts`), a sua visibilidade e `excluido_em IS NULL`.
- Só lê: **nunca grava no histórico** (as sugestões chamam a rota a cada pausa da digitação).
- Sem a permissão de ver um tipo, a seção volta vazia (não dá erro).
- Limite de requisições pelo módulo `rate-limit`.

### 6.3 Buscas recentes

- `GET /v1/busca/recentes`: até 10, o mais recente primeiro.
- `POST /v1/busca/recentes` `{ termo }`: `INSERT ... ON CONFLICT (tenant_id, membro_id, termo_comparavel) DO UPDATE SET termo, buscado_em = now()`, e, na mesma transação, apaga o que passar dos 10 mais recentes do membro.
- `DELETE /v1/busca/recentes/:id`: apaga um termo (só do próprio membro; de outro, 404).
- `DELETE /v1/busca/recentes`: apaga todos os do membro.
- Regenerar o OpenAPI e o `packages/api-client`.

## 7. Telas (`apps/web`)

- `apps/web/src/casca/partes.tsx`: a caixa do topo vira o componente `BuscaGlobal` (sugestões e buscas recentes); a lupa do celular navega para `/busca`.
- `apps/web/src/telas/busca/`: componente da caixa, hooks do TanStack Query (`useBuscaGlobal` com espera de 250 ms e cancelamento da busca anterior; `useBuscasRecentes` com gravação e remoção otimistas) e a tela.
- Rota nova `apps/web/src/routes/_autenticado.busca.tsx`, com `q` validado na URL.
- Atalho `Ctrl+K` ou `/` (este só quando o foco não estiver num campo de texto).

## 8. Testes

- **API (Vitest com banco):**
  - Ignora acento e maiúsculas; acha o CNPJ com e sem máscara, o contato pelo e-mail e pelo telefone, a oportunidade pelo título e pelo nome da empresa.
  - `%` e `_` valem como texto; menos de 2 letras dá 400.
  - **Isolamento entre tenants:** o tenant A não acha nada do B (busca e histórico).
  - **Regra de carteira:** com alcance "própria", o vendedor não acha empresa, contato nem oportunidade da carteira de outro; com "equipe", acha os da equipe; sem `oportunidades.ver`, a seção vem vazia.
  - Excluídos (soft delete) não aparecem.
  - **Histórico:** termo repetido (até com acento diferente) não duplica e volta ao topo; o 11º apaga o mais antigo; ninguém lê nem apaga o histórico de outro membro, nem o admin.
  - Teste de isolamento por RLS da tabela `buscas_recentes` (`packages/db`).
- **Web (Vitest + Testing Library):** recentes com a caixa vazia, troca para sugestões ao digitar, teclado (↑↓, Enter, Esc), estados vazio e de erro, apagar um termo e limpar o histórico.
- **E2E (Playwright):** digitar, ver as sugestões, abrir a ficha; voltar e ver o termo nas recentes.

## 9. Fora deste plano (backlog)

- **Tarefas** na busca global (decisão 1).
- Guardar o **registro aberto** junto com o termo ("Usidantec · empresa"), levando direto à ficha.
- Busca por similaridade (erros de digitação) com `similarity()` do `pg_trgm`.

## 10. Riscos e cuidados

- **Desempenho:** `LIKE '%termo%'` só usa o índice trigram com 3 letras ou mais; com 2 letras a consulta varre a carteira do tenant (aceitável com limite 5 e as carteiras atuais). Medir com `EXPLAIN ANALYZE` no seed; se pesar, subir o mínimo para 3.
- **Segurança:** a busca é a forma mais fácil de descobrir a carteira de outra pessoa; por isso os testes de regra de carteira da seção 8 são obrigatórios. O contato segue `condicaoDeVisibilidadeDoContato` (ligado a uma empresa visível ou cadastrado sem empresa).
- **LGPD:** o termo pode conter nome, telefone ou CPF. Guardamos só 10 por pessoa, a pessoa apaga quando quiser (apagar é definitivo), o histórico some quando o membro é desativado e o tratamento entra em `lgpd.md`.
- **Sem variáveis de ambiente novas** (nada muda no `.env.example` nem no Coolify).

## 11. Execução

| Fase | Entrega |
|---|---|
| **B1** | Migração 0042 (índice das oportunidades, tabela `buscas_recentes` com RLS), schema do Drizzle, testes de isolamento, `modelagem_banco.md` |
| **B2** | `packages/shared`, `busca-texto.ts` (extraído das listas), `GET /v1/busca`, rotas das buscas recentes, testes, OpenAPI e `api-client` |
| **B3** | Caixa de busca do topo: sugestões, buscas recentes, teclado, atalhos |
| **B4** | Tela `/busca` (desktop e celular) e E2E |
| **B5** | `funcionalidades.md` (seção 12), `lgpd.md`, `backlog_pos_mvp.md`, `plano_implantacao.md` e `roteiro_teste_busca_global.md` |

**Entregue em 29/10/2026 (B1 a B5).** Ajustes feitos na execução:
- As três consultas da busca rodam **em sequência**, não em paralelo: dividem a transação do tenant ativo.
- O membro não é excluído, é desativado: **desativar apaga o histórico** de buscas dele.
- A busca da **lista de Oportunidades** passou a ignorar também o acento do termo digitado (antes, "manutenção" não achava "manutencao" e vice-versa), por usar a mesma condição da busca global (`busca-texto.ts`).
- A lista de Oportunidades aceita o termo pela URL (`?busca=`), para o "Ver todos em Oportunidades".
- O `TextField` do `@leadtogo/ui` aceita `ref` (o atalho Ctrl+K leva o foco ao campo).
