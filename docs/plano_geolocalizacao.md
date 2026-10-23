# Plano — Geolocalização e rotas (G1 e G2)

> Módulo pós-MVP. Base: `docs/geo_g0_relatorio.md` (medições do G0, aprovado pelo Ale em 16/10/2026) e o plano mestre "Leadtogo — Plano de implementação: Geolocalização e rotas". Plano do G1+G2 **aprovado pelo Ale em 16/10/2026**. Plano do **G3 (check-in e relatório de visita) aprovado em 22/10/2026**, na seção 9. G4 (rotas) fica para depois.
> Tela de referência do mapa: `docs/referencias/geo/mapa_referencia.png` (não faz parte do protótipo congelado; o editor de rota à direita é do G4 e é ignorado no G2).

## 1. Decisões do G0 (valem para o G1)

| Tema | Decisão |
|---|---|
| Fontes | **IBGE CNEFE 2022** (principal) + **Nominatim local só do ES** (complemento). Photon e Google fora. Google: os termos proíbem usar o resultado com mapa que não seja do Google e guardar a coordenada além de 30 dias. |
| Camadas | Para na primeira que acerta: 1) CNEFE número exato → 2) Nominatim com número → 3) CNEFE interpolado → 4) Nominatim rua → 5) CNEFE centro da rua → 6) CEP/cidade. Depois: ajuste manual do pin e check-in (G3). |
| Precisão | **Exata** = número casado sem ambiguidade de rua (raio 100 m). Todo o resto é **aproximada**, guardando o tipo: interpolada ~300 m, rua ~1 km, CEP/cidade ~5 km. Rua de nome repetido em outro bairro = aproximada, mesmo com número casado. |
| Normalização | Obrigatória antes de consultar (tipo de logradouro, "- ES", acentos, abreviações). Completar rua e bairro pelo CEP antes, quando o CEP não for único do município. |
| Preparo pesado | Importação do Nominatim, `osrm-extract`, PMTiles e índice do CNEFE rodam **no ambiente do Ale, nunca na VPS**. Na VPS e no Garage só sobem os arquivos prontos. Atualização sob demanda: `docs/geo_atualizacao.md`. O CNEFE só muda a cada Censo. |
| VPS | 4 CPUs ARM já perto de 50%. Geocodificação em lote com concorrência baixa e configurável, no worker, nunca na requisição da tela. Limite de memória nos containers novos (Nominatim: 1,5 GiB). |
| A verificar no G1 | Licença de uso do CNEFE (**resolvido**, ver "Atribuições e licenças"); tempo de consulta real na VPS (ARM); se o limite de 512 MiB do Garage aguenta a leitura por faixas (Range) do PMTiles. Resultados no relatório do módulo. |
| Portas para o G4 | Máximo de 150 paradas por pedido ao VROOM; ponto de partida padrão = posição atual do celular (pontos cadastrados como alternativa); otimização só pela ordem mais curta, sem janela de horário nem almoço. |

## 2. Decisões do plano (Ale, 16/10/2026)

- **CNEFE no Postgres**, em tabela de referência **sem RLS**, num schema próprio (`referencia_geo`), **dentro do backup** do Coolify (decisão do Ale em 16/10/2026, caminho A): a restauração já traz o CNEFE e o script de carga só atualiza (novo Censo) ou recarrega se o schema estiver vazio. Na primeira carga em produção, medir e registrar o tamanho do schema, do dump antes e depois e o tempo de restauração; se o dump compactado crescer mais de 150 MB, parar e reavaliar (banco separado sem backup). A carga em produção só com o "pode carregar" do Ale, fora do horário de uso.
- **Migração única 0026**, só de expansão, com um único Backup Now.
- **Nominatim só em produção**; o ambiente de desenvolvimento usa só CNEFE e CEP. Os testes usam um provedor falso, com endereços fictícios.
- **Tiles:** endpoint da API com suporte a `Range`, atrás de sessão, lendo o PMTiles do Garage (bucket privado).
- **Worker:** `GEO_CONCORRENCIA` padrão 1.
- **"Visita tentada":** o estado existe na legenda e só é alimentado pelo check-in do G3. O formulário de atividade não muda. Até o G3, "visitada" vem das atividades de visita realizadas.
- Scripts de preparo ficam em `scripts/geo/`.

## 3. G1 — Geocodificação

- **Colunas novas em `empresas`** (não existiam; só estavam descritas na modelagem): `localizacao`, `geo_precisao`, `geo_origem`, `geo_atualizado_em`, `geo_endereco_consultado`, `geo_aproximacao` (tipo da aproximação), `geo_ajuste_manual`. Origens: `cnefe`, `nominatim`, `cep`, `manual`, `checkin`.
- **Endereço incompleto** (sem rua, número, bairro ou cidade; "S/N" conta como número): completa pelo CEP; se continuar incompleto, aplica a tag de sistema **Endereço a confirmar** (grupo de sistema **Cadastro**, sempre por `chave_sistema`) e a empresa vai para a fila. A tag sai sozinha quando o endereço fica completo e geocodificado, ou quando o usuário confirma a posição. Nenhuma empresa incompleta vira pin.
- **Automático, uma por vez:** empresa nova ou endereço alterado. Endereço alterado invalida a coordenada; o ajuste manual é preservado até o usuário confirmar a troca.
- **Lote sob demanda** por cidade ou região (admin e gestor): mostra antes o total e quantas já têm coordenada; worker em blocos curtos, idempotência por empresa, retomada e progresso na tela (mesmo desenho da importação).
- **Regiões:** microrregiões oficiais do ES (dado público, só leitura) + regiões criadas pelo admin em Configurações (nome e municípios por código IBGE).
- **Auditoria:** cada consulta é registrada (provedor, texto, resultado, precisão, quem acionou), o que também evita repetir consulta.
- **Telas:** selo de precisão na ficha (exata, aproximada, sem coordenada, a confirmar) com a origem; "Ajustar posição" num mapa pequeno, com confirmação; Configurações → Geolocalização (lotes, contagens, progresso, relatório, regiões); fila "Confirmar endereço" com o que falta e atalhos.
- Nada fixo para o ES no código: o estado e os extratos vêm de configuração.

## 4. G2 — Mapa

- **Tela Mapa** com MapLibre e PMTiles do ES, ocupando a área central inteira (exceção à regra de layout, registrada em `design_system.md`).
- **Legenda:** cada tag de Status que aparece no mapa é uma entrada; um visto marca "visitada alguma vez". Estados fixos a mais: **visita tentada** (volta ao grupo das nunca visitadas) e **sem visita há 60+ dias** (só carteira; vermelho por padrão; prevalece sobre a cor da tag).
- **Cores e nomes** configuráveis pelo **admin**, por tenant, com prévia: paleta de ~12 cores dos tokens (contraste garantido no claro e no escuro), nome livre; a regra de cada estado não muda. Cores padrão prontas e "Restaurar padrão" (tabela `mapa_legenda`).
- **Quem aparece:** flags na tag de Status, "aparece no mapa" (ligada, exceto Inativo) e "visível ao abrir" (ligada, exceto Prospect). Os chips são gerados das tags e acompanham renomeações.
- **Carga** por área visível + filtros (consulta por caixa no PostGIS), com agrupamento nos zooms afastados. Carteira sempre; leads por lote de importação, até 500 por vez, com contador.
- **Filtros:** busca (empresa, bairro, cidade), status, visitada (alguma vez, em 90 dias, por período), vendedor, sem visita há N dias, cidade, região e precisão.
- **Painel da empresa:** tags, selo de precisão, carteira, próxima atividade, oportunidades, abas Atividades/Oportunidades/Contatos, ações Ligar, WhatsApp e Abrir ficha. "Na rota" e "Check-in" só quando G3/G4 existirem.
- **Empresas próximas** (2, 5, 10 e 25 km), seleção por retângulo e por raio; por padrão exclui as já visitadas, com opção de incluir. No G2 a seleção serve para listar, abrir ou aplicar tag.
- **Cobertura por município:** visitadas e quantas faltam (ponto no centro do município, com os números).
- **Celular:** mapa em tela cheia, painel como folha que sobe de baixo, filtros numa gaveta.
- **Permissões:** o vendedor vê no mapa só o que já vê na carteira; admin e gestor veem tudo.

## 5. Dados e infraestrutura

| Item | Onde | Observação |
|---|---|---|
| CNEFE do ES (2,22 milhões de endereços) | schema `referencia_geo` do Postgres | sem RLS, dentro do backup, índice `pg_trgm`; recarga por `scripts/geo/` |
| Nominatim (só ES) | serviço novo no Coolify | 1,5 GiB de RAM no máximo; só produção |
| PMTiles do ES (~227 MB, zoom até 14) | bucket privado do Garage | servido por endpoint da API com `Range`, atrás de sessão |
| Tabelas novas (com `tenant_id`, RLS forçado e teste de isolamento) | Postgres | `geo_consultas`, `geo_lotes`, `geo_regioes`, `geo_regiao_municipios`, `mapa_legenda` |
| Microrregiões oficiais | tabela de referência | só leitura |
| Variáveis novas (`.env.example`, sem valor) | Coolify | `NOMINATIM_URL`, `GEO_CONCORRENCIA`, `GEO_LIMITE_POR_MINUTO`, `GEO_UF` |

## 6. Sequência

1. Documentação (este plano, funcionalidades, modelagem, design system, LGPD, backup) e a imagem de referência.
2. Migração 0026 + schema Drizzle + testes de isolamento. **Pausa para o Backup Now antes do push.**
3. Normalização e camadas de geocodificação; carregador do CNEFE; Nominatim e CEP.
4. Geocodificação automática, invalidação e a tag "Endereço a confirmar".
5. Lote por cidade/região, regiões e microrregiões.
6. Telas do G1.
7. Backend do G2 (caixa, filtros, clusters, tiles, legenda, flags).
8. Telas do G2.
9. Documentação final, `docs/roteiro_teste_geo_g1g2.md` e relatório do módulo.

Pushes: (1) commits 1–2; (2) commits 3–5; (3) commits 6–7; (4) commits 8–9.

## 7. Fora deste plano (G3+)

Check-in com GPS (G3, plano na seção 9), "Na rota" no painel, rotas e otimização (OSRM/VROOM), janela de horário e almoço (G4).

## 8. Decisões

| Data | Decisão | Quem |
|---|---|---|
| 16/10/2026 | Fontes, camadas, precisão e normalização do G0 | Ale |
| 16/10/2026 | CNEFE no Postgres, dentro do backup (caminho A); migração única 0026; "visita tentada" só pelo check-in (G3) | Ale |
| 16/10/2026 | Nominatim só em produção; tiles por endpoint com Range atrás de sessão; `GEO_CONCORRENCIA` = 1; 1,5 GiB no Nominatim; pushes em 4 etapas | Ale (proposta do Claude) |
| 17/10/2026 | "Sem visita há 60+ dias" vale só para o Status **Cliente** (como na tela de referência); "visitada" = `ultima_visita_em` preenchida (as atividades de visita realizadas) | Claude (Ale revisa no teste) |
| 17/10/2026 | Seleção por retângulo em dois toques (funciona igual no celular); a posição do aparelho NÃO é usada no mapa (só no check-in do G3, LGPD) | Claude |
| 22/10/2026 | Teste do G1+G2 em produção concluído: **aprovado** | Ale |
| 17/10/2026 | Leads no mapa só por lote de importação (até 500, com contador); chip de leads sem lote escolhido mostra aviso | Plano do Ale |

## Atribuições e licenças (Ale, 17/10/2026)

- **OpenStreetMap (ODbL):** o mapa base (PMTiles da Protomaps, derivado do OSM) e o Nominatim exigem a citação **"© OpenStreetMap contributors"**, com link para `openstreetmap.org/copyright`. Ela fica **sempre visível** no canto do mapa (controle de atribuição do MapLibre, sem recolher), em toda tela que mostra o mapa.
- **CNEFE 2022 (IBGE):** os metadados do IBGE **não trazem um campo explícito de licença** para o CNEFE. Adotamos a **citação da fonte**: **"Fonte: IBGE – CNEFE 2022"**, exibida no mapa quando algum pin visível tem coordenada vinda do CNEFE (`geo_origem = cnefe`). Se o IBGE publicar uma licença formal, revisar aqui.

## 9. G3 — Check-in e relatório de visita (plano aprovado pelo Ale em 22/10/2026)

Duas entregas, com o teste do Ale entre elas: **G3a** (construtor e configurações, migração 0028) e **G3b** (campo: check-in, relatório e offline, migração 0029). Cada migração para antes do push para o Backup Now; push só com autorização do Ale. Ao fim de cada entrega: roteiro, o que ficou de fora, decisões e hashes.

### 9.1 G3a — Construtor e configurações (migração 0028)

**Tabelas novas** (todas com `tenant_id`, RLS forçado, colunas padrão e teste de isolamento; detalhe em `modelagem_banco.md`):
- `visita_resultados`: nome, `chave_sistema` (nula, `nao_localizada` ou `encerrada`), `modelo_id`, ordem, ativo. Os dois de sistema só se renomeiam (e trocam de modelo). Os demais só se **inativam** quando já usados; sem uso, se **excluem** (lógico), como os demais cadastros.
- `visita_modelos`: nome, `padrao` (um por empresa), ativo, `versao_atual_id`.
- `visita_modelo_versoes`: modelo, número e `campos` (jsonb). **Versão publicada nunca é alterada.**
- `tenant_configuracoes`: + `checkin_modo` (`avisar` | `bloquear` | `so_gravar`, padrão `avisar`), `checkin_limite_m` (padrão 300), `lembrete_relatorios_hora` (padrão 17:30) e a marca `visitas_padroes_criados_em`.
- `empresas`: + `numero_funcionarios` (int, opcional; já previsto na modelagem como "entra depois, por expansão"), para o campo "dados da empresa" do modelo padrão.

**Campos do modelo (jsonb):** cada campo com **id estável**, rótulo, tipo, obrigatório, ordem e opções; um schema Zod compartilhado valida por tipo. Tipos: texto curto, texto longo, número, data, sim/não, escolha única, múltipla escolha, nota 1 a 5, e os de CRM: **contato** (confirma ou cria e vincula), **próximo passo** (cria atividade ou retorno), **tag** (o admin fixa a tag no construtor; o vendedor marca sim/não; sim aplica) e **dados da empresa** (o admin escolhe um campo da ficha numa lista fixa de colunas editáveis: nome fantasia, site, vertical e número de funcionários; nunca CNPJ nem razão social). Fora: campos condicionais e fotos.

**Versionamento:** editar um modelo que já tem relatório cria a versão N+1; modelo sem uso é editado no lugar (a mesma versão).

**Resultado** é campo de sistema, fora do modelo: o resultado escolhido define o modelo do formulário, e o construtor mostra o resultado fixo no topo.

**Padrões e backfill:** o modelo padrão e os seis resultados são criados para as empresas novas junto com os tipos de atividade; para as que já existem, pelo backfill na partida da API com a marca `visitas_padroes_criados_em` e a função `app_tenants_sem_padroes_visita()` (mesmo padrão das 0016, 0026 e 0027: o RLS forçado impede o dono de listar as empresas, por isso não é um INSERT … SELECT dentro da migração). Idempotente e só expansão.
- **Modelo padrão de fábrica** ("Relatório de visita"): contato (CRM), número de funcionários (dados da empresa), interesse (escolha única: Alto, Médio, Baixo, Nenhum), demandas (texto longo), ações feitas (múltipla: WhatsApp, e-mail, material), próximo passo (CRM) e resumo (texto longo).
- **Seis resultados**, todos apontando para ele: Visita realizada, Retornar depois, Sem interesse, Responsável ausente, **Não localizada** (sistema) e **Empresa encerrada** (sistema).

**Telas:** Configurações → **Visitas**, com as abas **Resultados**, **Modelos** (construtor ordenável com prévia) e **Check-in** (modo, limite e horário do lembrete). Quem configura: permissão `cadastros.gerir` (por padrão só o Administrador; decisão do Ale, 22/10/2026).

**Sequência:** (a) docs; (b) migração 0028, schema e testes de isolamento: **PARA antes do push para o Backup Now**; (c) API (resultados, modelos, versões, configuração); (d) telas; (e) roteiro (`roteiro_teste_geo_g3a.md`) e relatório. Pushes: um com (a)+(b) depois do Backup Now; outro com (c)–(e).

### 9.2 G3b — Campo (migração 0029)

**Tabelas e colunas:**
- `relatorios_visita`: empresa, atividade, responsável, `sem_checkin`, `checkin_em`, `checkin_local`, `distancia_m`, `fora_do_limite`, situação (`rascunho` | `concluido`), resultado, `modelo_versao_id`, `respostas` jsonb (`{campo_id, rótulo da época, valor}`) e o id gerado no aparelho.
- `empresas`: + `visita_tentada_em`.
- `atividades`: + `conta_visita` boolean default true.
- Catálogo de permissões v2: + `visitas.ver_localizacao` (Administrador e Gestor), com a sincronização dos perfis de sistema das empresas existentes (marca por empresa e função de listagem do owner).

**Fluxo online:**
- **Check-in** na ficha e no painel do mapa: lê o GPS, calcula no PostGIS a distância até `empresas.localizacao` e aplica o modo configurado. Cria a atividade Visita **em execução** com relatório pendente. Longe do endereço, oferece "atualizar a posição da empresa" (`geo_origem = checkin`).
- **Visita sem check-in:** "registrar depois", marcada `sem_checkin`, sem posição, com selo visível a quem vê os relatórios da equipe.
- **Relatório:** formulário montado pelo modelo do resultado escolhido, rascunho salvo a cada alteração. Ao concluir, a atividade vira **Realizada** e o recálculo do Módulo 5 roda.

**Efeitos:**
- **Não localizada (decisão do Ale):** a atividade fica Realizada e **conta como atividade em tudo que mede esforço** (Dashboard, indicadores e lista de atividades do vendedor, histórico): houve deslocamento e tentativa, explicados no relatório. Ela **não marca a empresa como visitada**: `conta_visita = false` vale só para o efeito na empresa (última visita, tag Visitada, estado do mapa), **nunca** para tirar a atividade das contagens. Grava `visita_tentada_em` e aplica **Endereço a confirmar**. No mapa vira "visita tentada" e só volta ao grupo das nunca visitadas se a empresa nunca teve visita real.
- **Empresa encerrada:** confirmação "mudar para Inativo?".
- **Demais:** visitada e última visita, pela regra do Módulo 5.
- Os campos de CRM aplicam seus efeitos na mesma transação do "concluir".

**Permissões:** o relatório segue o alcance de `atividades.ver` (o vendedor vê os dele; gestor e admin, todos). `checkin_local` e a distância só aparecem para quem tem `visitas.ver_localizacao`; o vendedor só vê o aviso de distância na hora do check-in.

**Relatórios pendentes:** lista no celular e card no Dashboard.

**Offline (PWA):**
- IndexedDB com as empresas abertas recentemente + **"Levar para offline"** de uma seleção do mapa ou da lista, **até 300 empresas por vez**, validade de **7 dias**.
- Cache mínimo: nome, endereço, coordenada, telefone, tags, contatos ativos, modelos, resultados e configuração. Sem CNPJ, observações nem histórico.
- Check-in, rascunho e relatório numa fila de operações com id gerado no aparelho (uuid v7).
- **Sync:** `PUT /visitas/:id` idempotente (upsert no id do cliente; reenviar não duplica), disparado no evento `online` e ao abrir o app, sem depender de Background Sync.
- Check-in offline no modo "bloquear": o aparelho aplica a regra com a coordenada em cache; o servidor recalcula e marca `fora_do_limite`.
- **Proteção do aparelho:** (a) dados mínimos; (b) validade de 7 dias; (c) limpeza total ao sair da conta; (d) limpeza no login de outro usuário; (e) contatos e posição cifrados com AES-GCM, chave não extraível do WebCrypto. O limite da cifra está documentado com franqueza no `lgpd.md`, seção 3.2 (protege contra leitura casual, não contra navegador desbloqueado). Fora desta fase: apagar remotamente um aparelho perdido (só revogar a sessão e limpar no próximo contato).
- **Lembrete** dos relatórios pendentes às 17:30 (horário configurável pelo admin na aba Check-in): com o app aberto, notificação local se permitida; senão, aviso ao abrir o app depois do horário. Sem Web Push nesta fase (backlog, junto com a central de notificações).
- `lgpd.md`, seção 3.2: posição gravada só no check-in, base legal, quem vê, retenção e a proteção dos dados no aparelho (já registrado no G3a).

**Testes:** API (idempotência, permissões, efeitos, isolamento); componente do formulário; E2E com `context.setOffline(true)` → check-in → relatório depois → volta o sinal → aparece uma vez só na ficha, com carteira e tags certas; reenvio duplicado.

**Sequência:** (a) docs; (b) migração 0029 e isolamento: **PARA antes do push para o Backup Now**; (c) API; (d) check-in e relatório online; (e) offline e sync; (f) pendentes e lembrete; (g) E2E, roteiro e relatório.

**Para o futuro (não agora):** as respostas em jsonb devem permitir relatórios por campo (ex.: interesse por região). O id de campo estável já resolve; índice GIN só quando houver o relatório.

### 9.3 Decisões do G3

| Data | Decisão | Quem |
|---|---|---|
| 22/10/2026 | "Não localizada" conta como atividade (esforço) e não marca a empresa como visitada; `conta_visita` só para o efeito na empresa | Ale |
| 22/10/2026 | Campo "tag": o admin fixa a tag, o vendedor marca sim/não | Ale |
| 22/10/2026 | Lembrete às 17:30, configurável; sem Web Push nesta fase | Ale |
| 22/10/2026 | "Levar para offline": até 300 empresas, validade de 7 dias; proteção do aparelho (a–e) | Ale |
| 22/10/2026 | Permissões: G3a usa `cadastros.gerir`; o relatório segue `atividades.ver`; G3b cria `visitas.ver_localizacao` (catálogo v2) | Ale (proposta do Claude) |
| 22/10/2026 | Migrações 0028 (G3a) e 0029 (G3b): a 0027 ficou com os perfis de acesso | Claude |
| 22/10/2026 | Backfill dos padrões de visita na partida da API (marca + função do owner), não INSERT … SELECT na migração, por causa do RLS forçado | Claude |
| 22/10/2026 | Nomes dos quatro resultados livres (Visita realizada, Retornar depois, Sem interesse, Responsável ausente), opções do "interesse" e a lista fixa de "dados da empresa" (nome fantasia, site, vertical, número de funcionários; `empresas.numero_funcionarios` entra na 0028) | Claude (Ale revisa no teste) |
| 22/10/2026 | "Não localizada" também não atualiza o **último contato** (ninguém foi contatado); continua contando como atividade realizada em tudo que mede esforço | Claude (Ale revisa no teste) |
| 22/10/2026 | "Visita tentada" no mapa: vale enquanto a última "não localizada" for mais nova que a última visita real; sai ao confirmar o endereço | Claude |
| 22/10/2026 | Enquanto o relatório está em rascunho, a atividade da visita não se edita nem se conclui por fora dele | Claude |
| 22/10/2026 | Sem sinal, a ficha não abre: o check-in offline começa em "Relatórios de visita → Empresas no aparelho"; abrir a ficha com sinal guarda a empresa (as "abertas recentemente") | Claude |
| 22/10/2026 | Sem rede, as guardas usam a última sessão conferida (cifrada no aparelho, 7 dias, apagada ao sair), para o app abrir e navegar sem sinal; com sinal a sessão é sempre conferida no servidor | Claude |
| 22/10/2026 | Modelo "em uso" = a versão ATUAL tem relatório (rascunho ou concluído); excluir o modelo ou o resultado com qualquer relatório só se inativa | Claude |
