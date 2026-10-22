# Roteiro de teste: G3a — Configurações → Visitas (construtor e check-in)

> Para o Ale testar em produção, depois do push do G3a (migração 0028 + API + telas). Regras em `funcionalidades.md` (seção 3C); tabelas em `modelagem_banco.md` (seção "Visitas"); plano em `plano_geolocalizacao.md` (seção 9).
> **O que muda para quem já usa:** nada no dia a dia. O G3a só cria a configuração. O check-in e o relatório chegam no G3b.
> Teste **como Administrador**, e no fim **como Vendedor** (seção 6), com duas janelas (uma anônima).

## 0. Verificação no servidor (terminal da VPS)
Conecte ao banco como no `runbook_e13.md`, seção 4.6:
```bash
docker exec -it $(docker ps -q -f name=orq8miun4hoaqnvwbntlxzwt | head -n 1) sh -c 'psql -U "$POSTGRES_USER" -d leadtogo'
```
```sql
-- 1) Empresas sem o modelo padrão ou sem os 6 resultados (esperado: 0 linhas)
SELECT t.id, t.razao_social, c.visitas_padroes_criados_em,
  (SELECT count(*) FROM visita_modelos m WHERE m.tenant_id = t.id AND m.padrao AND m.excluido_em IS NULL) AS padrao,
  (SELECT count(*) FROM visita_resultados r WHERE r.tenant_id = t.id AND r.excluido_em IS NULL) AS resultados
FROM tenants t LEFT JOIN tenant_configuracoes c ON c.tenant_id = t.id
WHERE c.visitas_padroes_criados_em IS NULL
   OR (SELECT count(*) FROM visita_modelos m WHERE m.tenant_id = t.id AND m.padrao AND m.excluido_em IS NULL) <> 1
   OR (SELECT count(*) FROM visita_resultados r WHERE r.tenant_id = t.id AND r.excluido_em IS NULL) <> 6;

-- 2) Configuração do check-in (esperado: avisar, 300, 17:30 em todas)
SELECT checkin_modo, checkin_limite_m, lembrete_relatorios_hora, count(*)
FROM tenant_configuracoes GROUP BY 1, 2, 3;
```

## 1. Menu e abas
1. **Configurações**: aparece **Visitas** (ícone de prancheta), entre "Tipos de atividade" e "Funis e fases".
2. A tela tem as abas **Resultados**, **Modelos** e **Check-in**.

## 2. Resultados
1. A lista traz, nesta ordem: **Visita realizada**, **Retornar depois**, **Sem interesse**, **Responsável ausente**, **Não localizada** e **Empresa encerrada**, todos com o modelo **Relatório de visita**.
2. **Não localizada** e **Empresa encerrada** têm a etiqueta **Sistema**, uma nota explicando o efeito e **não têm** o botão de excluir. Edite "Não localizada": dá para **renomear** e **trocar o modelo**, mas o interruptor de inativar não aparece.
3. **Novo resultado** "Proposta entregue", com o modelo padrão: entra no fim da lista. Mova-o para cima e para baixo pelas setas.
4. Exclua "Proposta entregue" (ainda sem relatório: pode).
5. Tente criar outro resultado chamado "visita realizada" (minúsculas): **"Já existe um item com esse nome."**

## 3. Modelos (construtor)
1. A lista mostra **Relatório de visita** com **Padrão**, "7 campos · versão 1 · usado por 6 resultados".
2. **Editar**: os 7 campos do modelo de fábrica (Contato, Número de funcionários, Interesse, Demandas, Ações feitas, Próximo passo, Resumo). Confira a **prévia** à direita: o **Resultado da visita** fixo no topo e cada campo como o vendedor vai ver. Cancele.
3. **Novo modelo** "Visita técnica":
   - **Adicionar campo** "Quantos turnos?" tipo **Número**, obrigatório. A prévia mostra o campo com o asterisco.
   - **Adicionar campo** tipo **Escolha única** "Porte da manutenção" com as opções "Própria" e "Terceirizada"; teste **Adicionar opção** e remover (com 2 opções o X fica desligado).
   - **Adicionar campo** tipo **Tag**: a lista só traz tags de grupos que **não** são automáticos (não aparecem Visitada, Contactada nem Endereço a confirmar). Escolha uma.
   - **Adicionar campo** tipo **Dados da empresa**: as opções são Nome fantasia, Site, Vertical e Número de funcionários (nunca CNPJ nem razão social).
   - O tipo **Contato** e o **Próximo passo** só aparecem uma vez por modelo (depois de usados, somem da lista de tipos dos outros campos).
   - Ordene os campos pelas setas e confira a prévia acompanhando.
   - **Salvar modelo**: "Modelo criado"; a lista mostra "versão 1 · nenhum resultado usa".
4. Salvar com um campo sem pergunta: aparece **"Campo N: informe o rótulo"** e nada é enviado.
5. **Tornar padrão** (estrela) a "Visita técnica": ela ganha **Padrão** e o de fábrica perde.
6. Tente **inativar** ou **excluir** o "Relatório de visita": **"Não dá para… o modelo é usado pelos resultados …"** (os seis ainda apontam para ele).
7. Em **Resultados**, troque o modelo de "Retornar depois" para "Visita técnica". Volte a **Modelos**: as contagens mudam (5 e 1).
8. Um modelo sem uso: inative pela edição (some dos modelos oferecidos em Resultados) e depois exclua.
9. **Versão nova:** só se vê no G3b (quando houver relatório). Até lá, editar os campos mantém a versão 1.

## 4. Check-in
1. A aba mostra **Avisar** marcado, **300** m e **17:30**.
2. Escolha **Bloquear**, limite **5**, **Salvar**: "use ao menos 10 m". Limite **150**, horário **18:00**, **Salvar**: "Check-in atualizado". Recarregue a página: os valores ficaram.
3. Volte para **Avisar**, **300** e **17:30** (ou deixe o que preferir para o G3b).

## 5. Auditoria (no banco, ainda sem tela)
```sql
SELECT entidade, acao, alteracoes, criado_em FROM auditoria
WHERE entidade IN ('resultado_visita', 'modelo_visita', 'configuracao_de_visitas')
ORDER BY criado_em DESC LIMIT 20;
```

## 6. Como Vendedor
1. **Configurações** não mostra **Visitas**; abrir `/configuracoes/visitas` direto volta para o início.
2. (O vendedor **lê** resultados, modelos e check-in pela API; é o que o relatório do G3b usa.)

## O que ficou de fora e por quê
| Item | Motivo |
|---|---|
| Check-in, relatório, pendentes, lembrete e offline | G3b (migração 0029), depois do teste do G3a |
| "Já tem relatório" e a versão N+1 na prática | Os relatórios chegam no G3b; o código já publica a N+1 quando houver |
| Arrastar para ordenar campos | A ordem é pelas setas, como nos demais cadastros (funciona no celular e no teclado) |
| Campos condicionais e fotos | Fora do G3 (plano aprovado) |
| Número de funcionários na ficha da empresa | A coluna existe desde a 0028; a ficha passa a mostrá-la no G3b, junto com o efeito do campo "dados da empresa" |
