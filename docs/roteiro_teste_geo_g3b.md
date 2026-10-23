# Roteiro de teste: G3b — Check-in, relatório de visita e offline

> Para o Ale testar em produção, depois dos pushes do G3b (migração 0029 + API + telas). Regras em `funcionalidades.md` (seção 3C); tabelas em `modelagem_banco.md` (seção "Visitas: check-in e relatório"); proteção do aparelho em `lgpd.md` (3.2); plano em `plano_geolocalizacao.md` (9.2).
> Use **o celular** (Chrome no Android ou Safari no iPhone, de preferência com o app instalado) como Vendedor, e o computador como Administrador. Libere a **localização** para o Leadtogo quando o navegador pedir.

## 0. Verificação no servidor
```sql
-- 1) Perfis de sistema de toda empresa receberam a permissão nova (esperado: 0 linhas)
SELECT t.id, t.razao_social, c.catalogo_perfis_versao
FROM tenants t JOIN tenant_configuracoes c ON c.tenant_id = t.id
WHERE c.perfis_criados_em IS NOT NULL AND coalesce(c.catalogo_perfis_versao, 1) < 2;

-- 2) Administrador e Gestor de sistema com visitas.ver_localizacao; Vendedor sem (esperado: admin e gestor)
SELECT p.chave_sistema, count(*) FROM perfil_permissoes pp JOIN perfis_acesso p ON p.id = pp.perfil_id
WHERE pp.permissao = 'visitas.ver_localizacao' GROUP BY 1;
```

## 1. Permissões
1. **Configurações → Perfis de acesso → Administrador** e **Gestor**: aparece o módulo **Visitas** com **"Ver a localização e a distância dos check-ins"** ligado. No **Vendedor**, desligado.
2. Perfis criados pela empresa (ex.: "Supervisor") **não** ganharam a permissão sozinhos.

## 2. Check-in online (celular, como Vendedor)
1. Abra uma empresa da sua carteira que tenha posição no mapa. No topo aparece **Check-in**.
2. **Check-in**: o app lê a posição e mostra **"Você está na empresa"** (perto) ou **"Você está longe da empresa"** com a distância e o limite (modo Avisar). Longe, aparece **"Atualizar a posição da empresa com a minha"**.
3. **Fazer check-in**: abre o **relatório** da visita. Na ficha (aba **Atividades**) há uma **Visita em execução**.
4. Volte sem concluir: a **ficha** mostra o cartão **Relatórios de visita** com **Pendente**; o **Dashboard** mostra **"1 relatório de visita pendente"**; o menu **Relatórios de visita** lista o pendente.

## 3. Relatório
1. Abra o pendente. Escolha **Visita realizada**: aparecem os campos do modelo (Contato, Número de funcionários, Interesse, Demandas, Ações feitas, Próximo passo, Resumo).
2. Preencha: **Contato → "+ Cadastrar outro contato"** (nome e cargo), **Número de funcionários** 120, **Interesse** Alto, **Próximo passo** (Ligação, amanhã às 10h), **Resumo**. Saia e volte: o rascunho foi salvo ("Rascunho salvo às…").
3. **Concluir relatório**. Na ficha:
   - **Visitada** e última visita **Hoje**;
   - o contato novo na aba **Contatos**, com o cargo;
   - a **Ligação** de amanhã como próxima atividade;
   - o relatório em **Relatórios de visita**, sem o selo Pendente.
4. Tente concluir a **Visita em execução** pela aba Atividades (menu da atividade): "Esta visita tem um relatório em andamento: conclua pelo relatório" (só enquanto há rascunho).

## 4. Os resultados de sistema
1. **Não localizada** (outra empresa, nunca visitada): ao escolher, o aviso explica o efeito. Conclua. Na ficha:
   - a visita aparece em **Atividades** como **Realizada** e conta no Dashboard e na lista do vendedor;
   - a empresa **não** fica **Visitada**, a última visita continua **Nunca** e o último contato não muda;
   - recebe **Endereço a confirmar**;
   - no **mapa**, o pin fica na cor de **visita tentada**.
2. Ajuste a posição dessa empresa (Ajustar posição na ficha): a tag sai e o pin volta a **nunca visitada**.
3. **Empresa encerrada**: ao concluir, pergunta **"Mudar a empresa para Inativo?"**. "Sim" muda o Status para Inativo; "Não, só concluir" mantém.

## 5. Modo Bloquear e Só gravar (Administrador muda em Configurações → Visitas → Check-in)
1. **Bloquear**, limite 300 m. Longe da empresa, o check-in mostra **"Check-in bloqueado"** e o botão fica desligado; **Registrar sem check-in** continua disponível.
2. **Só gravar**: o check-in não mostra distância nenhuma.
3. Volte para **Avisar**.

## 6. Visita sem check-in
1. **Check-in → Registrar sem check-in**: o relatório abre; a visita fica com o selo **Sem check-in** (no relatório e no cartão da ficha), sem posição.

## 7. Offline (celular)
1. Com sinal, **Empresas**: marque algumas empresas e use **Levar para offline** (ou no **mapa**: selecione por raio/retângulo e use **Levar para offline** na lista). Aviso: "N empresas guardadas no aparelho. Valem por 7 dias."
2. Ligue o **modo avião**. Abra **Relatórios de visita**: a seção **Empresas no aparelho** lista as levadas (e as abertas recentemente). Use o **Check-in** de uma delas: aparece "Sem sinal: o check-in fica no aparelho…". Faça o check-in e o relatório; conclua: "Relatório concluído. Sem sinal: fica no aparelho…". Em **Relatórios de visita**, o item tem o selo **No aparelho**.
3. Desligue o modo avião (com o app aberto, ou abra o app de novo): o item some da lista em segundos, e a visita aparece **uma vez** na ficha, com a carteira e as tags certas.
4. **Como Gestor** (no computador): no relatório, aparecem a **distância**, o link **ver posição** e o selo **Feito sem sinal**; no modo Bloquear, o check-in offline longe vem com **Fora do limite**.

## 8. Lembrete
1. Administrador: **Configurações → Visitas → Check-in**, horário do lembrete para daqui a 2 minutos.
2. Vendedor com um relatório pendente e o app aberto: em **Relatórios de visita**, **Ativar notificações**. No horário, chega a notificação **"Você tem 1 relatório de visita pendente"**. Sem a permissão, aparece o aviso na tela ao abrir o app depois do horário. Uma vez por dia.

## 9. Proteção do aparelho
1. Com empresas levadas para offline, **Sair**. Entre de novo: **Empresas no aparelho** sumiu (os dados foram apagados).
2. Outra pessoa entra no mesmo navegador: nada da anterior fica.

## O que ficou de fora e por quê
| Item | Motivo |
|---|---|
| Web Push (notificação com o app fechado) | Backlog, junto com a central de notificações (decisão do Ale) |
| Apagar remotamente um aparelho perdido | Fora desta fase: revogar a sessão e o aparelho limpa no próximo contato (backlog) |
| Relatórios por campo (ex.: interesse por região) | Futuro: o id de campo estável já permite; índice GIN quando houver o relatório |
| Campos condicionais e fotos no relatório | Fora do G3 (plano aprovado) |
| Abrir sem sinal uma tela nunca aberta antes | O PWA guarda as telas já abertas; a primeira abertura de cada tela precisa de sinal |
