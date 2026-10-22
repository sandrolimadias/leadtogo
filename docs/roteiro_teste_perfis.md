# Roteiro de teste: Perfis de acesso (Fase 1)

> Para o Ale testar em produção, depois do push único da Fase 1. Regras em `funcionalidades.md` ("Perfis de acesso" e "Segurança e acesso"); tabelas em `modelagem_banco.md` (3.4A); catálogo em `packages/shared/src/permissoes.ts`.
> **Antes de tudo:** rode a verificação no servidor (seção 0). Depois teste **primeiro como Administrador** (seções 1 a 9) e **depois como Vendedor** (seções 10 a 13). Use duas janelas (uma anônima) ou dois navegadores, com dois usuários seus: o Administrador (você) e um vendedor de teste.
> **O que muda para quem já usa:** nada, se ninguém mexer nos perfis. Os três perfis de sistema reproduzem os papéis antigos (inclusive o "Vendedores podem ver todas as empresas" e a política de 2FA, convertidos na migração).

## 0. Verificação no servidor (terminal da VPS)
Conecte ao banco como no `runbook_e13.md`, seção 4.6:
```bash
docker exec -it $(docker ps -q -f name=orq8miun4hoaqnvwbntlxzwt | head -n 1) sh -c 'psql -U "$POSTGRES_USER" -d leadtogo'
```
```sql
-- 1) Empresas SEM exatamente 3 perfis de sistema (esperado: 0 linhas)
SELECT t.id, t.razao_social,
       count(p.id) FILTER (WHERE p.sistema AND p.excluido_em IS NULL) AS perfis_sistema,
       c.perfis_criados_em
FROM tenants t
LEFT JOIN tenant_configuracoes c ON c.tenant_id = t.id
LEFT JOIN perfis_acesso p ON p.tenant_id = t.id
GROUP BY t.id, t.razao_social, c.perfis_criados_em
HAVING count(p.id) FILTER (WHERE p.sistema AND p.excluido_em IS NULL) <> 3;

-- 2) Membros ativos sem perfil (esperado: 0 linhas)
SELECT tenant_id, count(*) AS sem_perfil
FROM membros WHERE ativo AND excluido_em IS NULL AND perfil_id IS NULL
GROUP BY tenant_id;

-- 3) Perfil diferente do papel antigo, ou de outra empresa (esperado: 0 linhas antes de alguém trocar perfis)
SELECT m.tenant_id, m.id, m.papel, p.chave_sistema, p.tenant_id AS tenant_do_perfil
FROM membros m JOIN perfis_acesso p ON p.id = m.perfil_id
WHERE m.excluido_em IS NULL
  AND (p.chave_sistema::text IS DISTINCT FROM m.papel::text OR p.tenant_id <> m.tenant_id);

-- 4) Convites pendentes sem perfil (esperado: 0 linhas)
SELECT tenant_id, count(*) FROM convites
WHERE aceito_em IS NULL AND revogado_em IS NULL AND perfil_id IS NULL
GROUP BY tenant_id;

-- 5) Resumo: empresas, quantas com a marca e quantos Vendedores com "ver todas"
SELECT (SELECT count(*) FROM tenants) AS empresas,
       (SELECT count(*) FROM tenant_configuracoes WHERE perfis_criados_em IS NOT NULL) AS com_marca,
       (SELECT count(*) FROM perfil_permissoes pp JOIN perfis_acesso p ON p.id = pp.perfil_id
         WHERE p.chave_sistema = 'vendedor' AND pp.permissao = 'empresas.ver' AND pp.alcance = 'todas') AS vendedores_ver_todas;
```
- O último número deve bater com as empresas que tinham "Vendedores podem ver todas as empresas" ligado.
- No log da API (Coolify), **nenhum** "Aviso: padrões não criados para a empresa".
- Empresa **sem linha em `tenant_configuracoes`** não recebe os perfis (a consulta 1 a mostraria com `perfis_criados_em` vazio): se aparecer, me avise.

## Parte A: como Administrador

### 1. Cabeçalho, seletor e menu
1. O cabeçalho (e o seletor de empresa, no menu do perfil no celular) mostra **Administrador** ao lado da empresa: agora é o **nome do perfil**.
2. O menu lateral continua igual: Dashboard, Empresas, Contatos, Oportunidades, Atividades, Mapa, Prospecção, Geolocalização, Configurações.

### 2. Configurações → Perfis de acesso (tela nova)
1. **Configurações** abre em **Usuários e equipe**; o menu interno tem a seção nova **Perfis de acesso** (logo depois de Usuários).
2. A lista mostra **Administrador, Gestor e Vendedor** (selo "Sistema") com quantos usuários cada um tem.
3. Abra o **Administrador**: as caixas **Convidar, desativar e ver o acesso dos membros** e **Gerir perfis de acesso** estão marcadas e **travadas**; não há botão **Excluir** (perfil de sistema).
4. Clique em **Quem pode o quê**: a tabela mostra cada permissão (linhas, agrupadas por módulo) por perfil (colunas), com o alcance ("Todas", "Só a própria carteira"...). **Voltar aos perfis**.
5. No **Vendedor**, confira: ver e editar empresas, contatos, oportunidades e atividades com **Só a própria carteira** (ou **Todas** no "ver", se a sua empresa tinha "Vendedores podem ver todas" ligado); nada de excluir, transferir, importar, atribuir responsável.

### 3. Criar, editar, duplicar e excluir um perfil
1. **Novo perfil** → nome "Supervisor" → **Criar perfil**: ele aparece com o selo "Da empresa", sem permissões.
2. Marque **Ver empresas** e escolha o alcance **A própria e a da equipe**; marque **Editar empresas** (Só a própria carteira) e **Registrar atividades**. **Salvar perfil**: sem usuários, salva direto ("Perfil salvo"). O botão Salvar fica desligado até haver mudança.
3. Tente criar outro com o mesmo nome em minúsculas ("supervisor"): **"Já existe um perfil com este nome."**
4. **Duplicar** o Gestor como "Gestor regional": o novo perfil nasce com as mesmas permissões e já abre.
5. **Excluir** o "Gestor regional" (sem usuários): some da lista. O Supervisor fica para os próximos testes.
6. No Administrador, tente **desligar** "Exige verificação em duas etapas" e salvar: **"O perfil Administrador sempre exige a verificação em duas etapas."**

### 4. Usuários e equipe: perfil no lugar do papel
1. A coluna do meio agora é **Perfil** (um seletor com os perfis ativos). O seu fica **desligado** (ninguém troca o próprio perfil).
2. Troque o vendedor de teste para **Supervisor**: "… agora tem o perfil Supervisor". Na aba **Usuários do perfil** do Supervisor (em Perfis de acesso), ele aparece; o contador de usuários sobe.
3. Volte o vendedor para **Vendedor**.
4. Se houver outro administrador (não o dono da conta): trocar o perfil dele para Vendedor pede **confirmação** ("Hoje gere os perfis de acesso; … perde essa gestão").
5. **Dono da conta:** outro administrador não troca o perfil do dono (mensagem clara).

### 5. Convites com perfil
1. **Convidar pessoa**: o campo agora é **Perfil de acesso** (padrão: Vendedor). Convide um e-mail seu com **Supervisor**.
2. A lista mostra o convite com o perfil **Supervisor**. O e-mail diz **"…com o perfil Supervisor"** e a página do convite mostra "Convite para entrar com o perfil Supervisor".
3. Aceite (janela anônima): a pessoa entra já com o perfil Supervisor.
4. **Um perfil só com "Convidar, desativar e ver o acesso dos membros" não convida**: crie um perfil "Recrutador" só com essa permissão, dê a alguém, entre como essa pessoa: ela vê a equipe e desativa/reativa, mas **não** vê o botão **Convidar pessoa** nem troca perfis (convidar é atribuir um perfil e exige também **Gerir perfis de acesso**).
5. Com perfil de membros ou convites pendentes, **Excluir** e **inativar** o perfil são recusados ("…com membros ou convites pendentes. Troque o perfil deles antes").

### 6. Segurança: 2FA por perfil
1. **Configurações → Segurança** agora lista os **perfis**, cada um com o interruptor **Exige a verificação**. O do **Administrador** fica ligado e travado.
2. Ligue no **Vendedor** e **Salvar**. Entre como o vendedor de teste (sem 2FA): na próxima ação ele é levado à **ativação** da verificação em duas etapas. Em **Meu perfil → Segurança** dele, o motivo diz "…exige a verificação em duas etapas de quem tem o perfil Vendedor nela".
3. Desligue de novo no Vendedor: ele volta a usar normalmente.

### 7. Carteira e o antigo "ver todas"
1. **Configurações → Carteira**: sobrou só **Bloquear o cadastro de empresa não ativa na Receita**. O interruptor **"Vendedores podem ver todas as empresas" saiu**: agora é o alcance de **Ver …** no perfil Vendedor.
2. Em **Perfis de acesso → Vendedor**, mude **Ver empresas** para **Todas** e salve (o aviso diz quantos usuários serão afetados). O vendedor de teste passa a ver todas as empresas na lista e no mapa, mas **continua editando só as dele** (Editar empresas = Só a própria carteira).
3. Volte **Ver empresas** do Vendedor ao valor original da sua empresa.

### 8. Alcance "equipe" (opcional: ainda não há tela para o gestor do membro)
O alcance **equipe** usa o gestor de cada membro (`membros.gestor_id`), que ainda **não tem tela** (a visão Equipe ficou fora desta fase). Os testes automáticos cobrem (subordinados diretos e indiretos, e ciclo no gestor). Para ver à mão:
1. No banco, defina o gestor do vendedor de teste: `UPDATE membros SET gestor_id = '<id do gestor>' WHERE id = '<id do vendedor>';` (com `SET app.tenant_id` da empresa, ou como `$POSTGRES_USER`).
2. Dê ao gestor o perfil **Supervisor** (Ver empresas = A própria e a da equipe) e entre como ele: vê as **empresas dele e as do vendedor**, e não as de outros vendedores.

### 9. Auditoria
No banco (tabela `auditoria`, ainda sem tela), confirme os registros: `criar_perfil`, `editar_perfil` (com as permissões **antes e depois**), `duplicar_perfil`, `excluir_perfil`, `trocar_perfil` (membro), `convidar` (com o perfil) e `alterar_2fa_dos_perfis`.

## Parte B: como Vendedor (o vendedor de teste, perfil Vendedor)

### 10. Menu e Configurações
1. O cabeçalho mostra **Vendedor**. O menu tem Dashboard, Empresas, Contatos, Oportunidades, Atividades, Mapa, Prospecção e Geolocalização; **não** tem Configurações.
2. Digitar `/configuracoes` (ou `/configuracoes/perfis`) volta para o início.

### 11. Carteira
1. **Empresas**: só as dele (ou todas, se a empresa tinha "ver todas"). Na ficha de uma empresa que não é dele (com "ver todas"), não há como editar; editar dá "Seu perfil de acesso não permite…".
2. **Nova empresa**: sem o campo **Vendedor** (escolher outro responsável é passar a carteira).
3. Não aparece **Excluir** empresa, contato nem oportunidade; não aparece **Importar planilha**.
4. **Novo contato**: a **empresa é obrigatória** (sem ela o vendedor não veria o contato).
5. **Registrar atividade** e **Nova oportunidade**: não há o campo **Responsável** (fica com ele).
6. Excluir a **própria atividade** continua funcionando (é parte de editá-la).

### 12. Mapa e geolocalização
1. **Mapa**: só as empresas da carteira dele; o filtro **Vendedor** não aparece.
2. **Geolocalização**: não há **lotes** nem a criação de **regiões**; a legenda do mapa não se altera.

### 13. Com o perfil Supervisor (troque o vendedor de teste para Supervisor)
1. O cabeçalho mostra **Supervisor**. O menu mostra só o que o perfil permite: com "Ver empresas" e sem "Ver contatos", **Contatos some do menu**.
2. A lista de empresas mostra as dele e as da equipe (alcance "equipe"); **Registrar atividade** funciona; **Nova oportunidade** não (sem "Criar oportunidades": a API responde 403 e a tela mostra a mensagem).
3. Volte o vendedor de teste para **Vendedor** no fim.

## O que ficou de fora e por quê
| Item | Motivo |
|---|---|
| **Contração** (remover `papel` e o enum `papel_membro`, `perfil_id NOT NULL`, remover `vendedor_ve_todas_empresas`, `dois_fatores_exigido` e a função `app_vinculos_com_politica`) | Migração destrutiva: depois de **duas semanas de uso real**, com aviso e commit `BREAKING-DB:` (`backlog_pos_mvp.md`). Até lá, o membro sem perfil usa o perfil de sistema do papel (e a política antiga de 2FA) |
| Sincronização do catálogo na partida | Na versão 1 não há o que sincronizar; entra na primeira fase que acrescentar permissão, com função SECURITY DEFINER para listar as empresas (decisão do Ale) |
| Permissões de chamados e do portal do cliente | Cada fase futura acrescenta as suas ao catálogo |
| Visão Equipe e tela para o gestor de cada membro | Fora do escopo; o alcance "equipe" já funciona pelo `gestor_id` |
| Permissões por campo e múltiplos perfis por usuário | Fora do escopo |
| `atividades.excluir` | Saiu do catálogo: excluir, concluir e cancelar a atividade são parte de `atividades.editar`, como antes (e o Vendedor gravado em produção não tinha a chave) |
| Tela de auditoria | Não existia antes; os registros estão no banco |
