# Roteiro de teste: Portal do Cliente, Fase 3D (agenda e eventos)

> Para o Ale testar depois do push da Fase 3D (e das fases 3A a 3C). Regras em `funcionalidades.md` (seção 9F); tabelas e funções em `modelagem_banco.md` ("Portal do Cliente, Fase 3D"); catálogo de permissões em `packages/shared/src/permissoes.ts` (versão 8).
> **Antes de tudo:** **Backup Now** do banco. A migração **0036 só acrescenta** (3 tabelas e 6 funções novas); nada existente some. Ela roda sozinha na subida da API.
> **O que muda para quem já usa:** nada. Só o **Administrador** recebe `portal.agenda`; os demais perfis ganham se você marcar em Configurações → Perfis de acesso. **Nada novo para configurar no Coolify**: o lembrete de 24 horas e a promoção da lista de espera usam o worker e o envio de e-mail que já existem (o e-mail do cliente depende de `PORTAL_URL` e do SMTP, como os avisos de chamado).
> Para as seções 4 a 7 você precisa de **dois ou três clientes de empresas-clientes diferentes** (e-mails seus), com acesso ao portal.

## 1. Verificação no servidor (terminal da VPS)
```sql
-- 1) As 3 tabelas com RLS habilitado e forçado (esperado: 3 linhas, as duas colunas true)
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('eventos','evento_empresas','evento_confirmacoes');

-- 2) As funções existem (esperado: 7)
SELECT count(*) FROM pg_proc WHERE proname IN ('app_evento_promover','app_evento_confirmar',
  'app_evento_cancelar_confirmacao','app_evento_cancelar_presenca','app_evento_remover_participante',
  'app_evento_reprocessar_vagas','app_eventos_a_lembrar');
```

## 2. Criar e publicar (CRM → Portal do Cliente → Agenda)
1. Aba **Agenda** → **Novo evento**. Preencha **Título**, **Início** e **Fim**, e (opcional) descrição, local, link online, **Vagas totais**, **Vagas por empresa**, **Confirmar até** e **Para quem**. Para o teste da fila, use **Vagas totais = 2**.
2. **Criar evento**: ele nasce como **Rascunho** (a tela leva à aba Rascunhos) e o cliente **não** o vê.
3. **Publicar**: o evento vai para **Próximos** e aparece na **Agenda** e no painel **Próximos eventos** do Início do portal. Publicar com o início no passado é recusado.
4. Erros que a tela mostra: fim antes do início, prazo depois do início, link que não começa com `http`.

## 3. Confirmar presença (cliente)
1. **Cliente A** → Agenda: o cartão mostra a data, o horário, o local, "2 vagas restantes" e **Confirme presença**. **Confirmar presença**: vira **Você vai** e as vagas caem para 1. Abrir de novo é inofensivo.
2. **Adicionar à agenda**: baixa um arquivo `.ics`; abra no Google Agenda/Outlook/Apple: o evento aparece com título, horário, local e link.
3. O painel do Início mostra os próximos 3 eventos com "Você vai", "Confirme presença" ou "Lotado · lista de espera".

## 4. Lotado, lista de espera e promoção
1. **Cliente B** confirma: pega a segunda vaga ("Sem vagas"). **Cliente C** vê **Lotado · lista de espera** e **Entrar na lista de espera**: passa a **Na lista de espera**.
2. **Cliente A cancela** a presença (**Cancelar presença**). O **cliente C é promovido sozinho** para **Você vai** e recebe **sino e e-mail** "Vaga confirmada".
3. A equipe vê em **Confirmados** e **Lista de espera** (com a posição e o e-mail de cada um). **Tirar** um confirmado promove o primeiro da fila que couber; **Tirar** quem está na fila só o retira.
4. **Vagas por empresa:** edite o evento com "Vagas por empresa = 1". Um segundo colega da mesma empresa entra na **lista de espera** mesmo sobrando vaga no total, e a promoção **pula** quem está com a empresa no limite e promove o próximo que cabe.
5. **Aumentar as vagas** (Editar → Vagas totais) promove na hora, na ordem da fila, quem passou a caber (com aviso).
6. **Nunca passa do limite**, nem se vários clientes clicarem ao mesmo tempo (a trava está no banco; há testes automáticos de concorrência).

## 5. Prazo, início e cancelamento do cliente
1. **Confirmar até:** com o prazo vencido, o cliente vê **Prazo encerrado** e não confirma; quem já tinha presença ainda pode cancelar até o início do evento.
2. Evento que **já começou** mostra **Encerrado** (sem confirmar nem cancelar) e vai para **Passados**.
3. O cliente só vê **quantas vagas restam** e as vagas da própria empresa ("Vagas da sua empresa: 1 de 2"). **Nunca** vê o nome de outro participante.

## 6. Cancelar o evento (equipe)
1. Num evento publicado, **Cancelar evento** (exige o motivo). Quem estava **confirmado ou na lista de espera** recebe **sino e e-mail** "Evento cancelado" com o motivo. O cliente continua vendo o evento com o selo **Cancelado** e não confirma mais.
2. Evento cancelado não se edita. **Excluir** só vale para rascunho ou evento cancelado (o publicado precisa ser cancelado antes, para os participantes serem avisados).

## 7. Lembrete de 24 horas
1. Publique um evento que comece **daqui a menos de 24 horas** (ou edite um) e confirme um cliente. Em até **5 minutos** (o worker confere de 5 em 5 minutos) esse cliente recebe **sino e e-mail** "Lembrete: ...". Quem está só na lista de espera **não** recebe.
2. O lembrete sai **uma vez só** por evento.

## 8. Permissões e isolamento
1. Perfil só com **`portal.ver`**: vê a Agenda, os participantes e as vagas, mas **não** tem Novo evento, Editar, Publicar, Cancelar, Excluir nem Tirar.
2. Perfil só com **`portal.agenda`**: vê a aba Agenda e escreve; não vê Chamados nem Acessos.
3. **Alcance por empresas:** só os clientes das empresas escolhidas veem e confirmam; os demais recebem "evento não encontrado".
4. Outra empresa da equipe nunca vê nem altera estes eventos.

## 9. Se algo falhar
| Sintoma | Causa provável |
|---|---|
| O cliente não vê o evento | Está em rascunho, fora do alcance ou o portal está desligado |
| "Não consigo confirmar" | Prazo vencido, evento cancelado ou já iniciado (a mensagem diz qual) |
| Promovido mas sem e-mail | `PORTAL_URL`/SMTP não configurados (o sino funciona sem eles) |
| Lembrete não chegou | O worker está parado; o evento começa em mais de 24 h; ou a pessoa está só na lista de espera |
