# Roteiro de teste: G4 — Rotas

> Para o Ale testar em produção, depois dos pushes do G4 (migração 0030 + API + telas). Regras em `funcionalidades.md` (seção 3D); tabelas em `modelagem_banco.md` (seção "Rotas"); LGPD em `lgpd.md` (3.3); plano em `plano_geolocalizacao.md` (seção 10).
> Use o **computador** como Administrador (ou Gestor) e o **celular** como Vendedor. Libere a **localização** para o Leadtogo quando o navegador pedir.
> As partes 1 a 6 valem **antes** de ligar o OSRM/VROOM (otimização desligada). A parte 7 é depois de ligar (`roteiro_rotas_producao.md`, parte B).

## 0. Verificação no servidor
```sql
-- 1) Migração 0030 aplicada (esperado: 3 tabelas, todas com RLS forçado)
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
WHERE relname IN ('rotas', 'rota_paradas', 'rota_pontos_partida');

-- 2) Catálogo v3: perfis de sistema com as permissões de rotas (esperado: admin e gestor com as 3; vendedor com ver e editar)
SELECT p.chave_sistema, pp.permissao, pp.alcance FROM perfil_permissoes pp JOIN perfis_acesso p ON p.id = pp.perfil_id
WHERE pp.permissao LIKE 'rotas.%' AND p.chave_sistema IS NOT NULL ORDER BY 1, 2;

-- 3) Nenhuma empresa ficou para trás na versão do catálogo (esperado: 0 linhas)
SELECT tenant_id FROM tenant_configuracoes WHERE perfis_criados_em IS NOT NULL AND coalesce(catalogo_perfis_versao, 1) < 3;
```

## 1. Permissões e menu
1. **Configurações → Perfis de acesso**: aparece o módulo **Rotas** com "Ver rotas" e "Montar, alterar, executar e cancelar rotas" (com alcance) e "Montar ou passar a rota para outro vendedor". Administrador e Gestor com tudo em **Todas**; Vendedor com ver e editar em **Só a própria carteira** e sem "passar para outro".
2. O menu **Carteira** mostra **Rotas** (sem o selo "Fase 3"). **Configurações** mostra a seção **Rotas**.

## 2. Configurações → Rotas (Administrador)
1. **Minutos por visita**: mude para 30 e salve; volte para 40.
2. **Novo ponto**: "Sede", endereço livre, arraste o pin (ou toque no mapa) até a sede, marque **Ponto padrão** e salve. Crie um segundo ("Filial") sem padrão; marque a Filial como padrão: a Sede perde o selo.
3. Como Vendedor, a seção não aparece (e a API recusa: 403).

## 3. Montar uma rota no mapa (computador)
1. **Rotas → Nova rota**: o Mapa abre com o **editor à direita**: "Nova rota", data de hoje, ponto de partida = **Minha posição atual** (com a dica "Usada só no cálculo; não é gravada"), "Voltar ao ponto de partida" ligado, 40 min por visita.
2. O aviso **"Otimização de rotas ainda não configurada"** aparece e **Otimizar ordem** está desligado.
3. Toque numa empresa no mapa → **Adicionar à rota**: o botão vira **"Na rota · parada 1"** e a empresa entra na lista com o número 1; no mapa, o círculo **1** e a linha tracejada.
4. **Empresas próximas** (5 km) → **Adicionar todas à rota**: entram as que cabem; o aviso diz quantas já estavam e quantas passaram de 30.
5. O botão de **rota** nas ferramentas do mapa (abaixo da cobertura) acrescenta as empresas **visíveis com os filtros** (teste com o filtro de uma cidade).
6. Arraste uma parada pela alça (ou foco na alça + setas ↑/↓): a ordem e os números mudam. Tire uma parada no **X**.
7. Os totais mostram km e tempo "com 40 min por visita" e a nota **"Estimativa em linha reta"**. Uma empresa de posição **aproximada** mostra "Posição aproximada: confira antes de ir".
8. Troque o ponto de partida para **Sede** e **Criar rota**: aparece "Rota criada", o título vira **"Editando R-0001"** (o código da sua empresa).
9. **Google Maps**: com mais de 9 paradas (computador) a rota vem em trechos ("Trecho 1 (paradas 1–10)", "Trecho 2 (… e volta)"). Abra um trecho: o Google Maps mostra as paradas na ordem.
10. Com um Gestor: crie uma rota escolhendo outro **Vendedor**; uma empresa da carteira de outro vendedor é recusada ("fora da carteira do responsável").

## 4. Lista de Rotas
1. **Rotas**: a rota aparece com código, nome, data, responsável, "0 de N visitadas", distância "(linha reta)", tempo e **Planejada**. Filtre por data e situação; como Gestor, por vendedor.
2. **No mapa** abre o editor da rota salva. Como Vendedor, só as rotas dele aparecem.
3. **Lista de Empresas**: marque 3 empresas → **Adicionar à rota** → escolha uma rota aberta (ou "Nova rota"): o aviso diz quantas entraram e o editor abre no mapa.

## 5. Executar a rota (celular, como Vendedor; rota de hoje dele)
1. O **Dashboard** mostra **"Rota de hoje · R-000N …: 0 de N visitadas"**. Toque.
2. A tela da rota destaca a **próxima parada**, com **Navegar** (abre o Waze nela), **Ligar** (se houver telefone), **Check-in** e **Pular**.
3. **Check-in** na primeira parada → relatório → **Visita realizada** → concluir. Volte à rota: a parada mostra **Visitada** e a rota **Em andamento**.
4. Faça uma visita **pela ficha** de outra empresa da rota (sem passar pela rota): ela também se liga à parada.
5. **Pular** a próxima com o motivo "Fechada": mostra "Pulada: Fechada".
6. **Encerrar rota**: as pendentes viram "Pulada: Rota encerrada" e a rota fica **Concluída**; o editor no mapa não deixa mais mudar.
7. **Google Maps** na tela da rota: só as paradas pendentes, começando onde o aparelho está.

## 6. Offline (celular)
1. Numa rota de hoje com paradas pendentes: **Levar para offline** ("Rota guardada no aparelho").
2. Ative o modo avião e abra a rota (pelo histórico ou pelo Dashboard já aberto): aparece **"Sem sinal: esta é a rota guardada no aparelho"**, com as paradas.
3. **Check-in** sem sinal numa parada → relatório → concluir. Volte o sinal: o relatório sobe e, na rota, a parada fica **Visitada**.

## 7. Depois de ligar o OSRM e o VROOM (`roteiro_rotas_producao.md`, parte B)
1. O aviso "Otimização de rotas ainda não configurada" some de Rotas e do editor.
2. Monte uma rota com 8 a 15 empresas espalhadas → **Otimizar ordem**: a ordem muda; salve: os totais vêm **pelas ruas** (sem a nota de linha reta) e o mapa desenha o **trajeto pelas ruas**.
3. Partida pela **posição atual**: o navegador pede a localização; a ordem começa perto de você. Negue a localização: aparece "Sem a posição atual: a ordem começa na primeira parada".
4. Com 30 paradas, a otimização volta em menos de 1 s (medido na VPS: 0,11 s).

## Fica de fora (G4)
| Item | Motivo |
|---|---|
| Janela de horário, almoço, várias rotas ou vendedores numa otimização só | Decisão do G0: só a ordem mais curta, um veículo |
| Rotas recorrentes e "duplicar rota" | Sem pedido (backlog) |
| Territórios | Sem pedido (backlog) |
| Rastrear o vendedor durante a rota | LGPD: a posição só se grava no check-in |
| Navegação curva a curva dentro do app | O Google Maps e o Waze fazem; o app monta os links |
| Pular e encerrar sem sinal | Exigem sinal; o check-in e o relatório já vão pela fila offline (backlog) |
| Desligar a parada de uma visita cancelada | A parada fica com a visita ligada; o vendedor pula (backlog) |
