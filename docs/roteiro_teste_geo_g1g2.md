# Roteiro de teste: Geolocalização e mapa (G1 e G2)

> Para o Ale testar em produção. Decisões em `plano_geolocalizacao.md`; passo a passo dos dados em `geo_atualizacao.md`.
> **Antes de começar:** o CNEFE, o Nominatim e o mapa base (PMTiles) são arquivos que **você** sobe (seções 1 a 3 do `geo_atualizacao.md`). Sem eles o sistema funciona, mas só com o CEP (e o mapa abre sobre um fundo liso). Os testes 1 a 3 abaixo servem para os dois casos.

## 0. Ponto de partida (sem nada carregado)
1. Abra **Geolocalização** (menu Carteira). Em *Resumo e lotes* aparecem os avisos "A base de endereços do IBGE ainda não foi carregada" e "O Nominatim não está configurado".
2. Abra **Mapa**: o aviso "O mapa base ainda não foi instalado" aparece à direita e as empresas com coordenada aparecem como pins sobre o fundo liso.
3. Em **Configurações → Tags → Status → editar uma tag** (Lead, Prospect...): aparecem os interruptores **Aparece no mapa** e **Já vem ligada ao abrir o mapa** (Inativo vem desligado nos dois; Prospect só o segundo).
4. Em **Configurações → Tags** existe o grupo de sistema **Cadastro** com a tag **Endereço a confirmar** (não dá para excluir nem aplicar à mão).

## 1. Geocodificação automática
1. **Empresas → Nova empresa** com endereço completo (rua, número, bairro, cidade e CEP). Salve. Em alguns segundos a ficha mostra o cartão **Localização**. Sem o CNEFE nem o Nominatim: "A posição é aproximada ... só pelo CEP ou pela cidade" (centro do CEP ou do município). Com eles: exata, quando o número bate.
2. Cadastre outra empresa **sem o número** (deixe em branco): ela fica **sem pin**, ganha a tag **Endereço a confirmar** e aparece em **Geolocalização → Confirmar endereço**, com "Falta o número".
3. Cadastre uma terceira com **"S/N"** no número: **não** é incompleta, é posicionada pela rua.
4. Edite o endereço da primeira (mude a rua): a posição antiga some e é procurada de novo.

## 2. Ajustar a posição
1. Na ficha, **Ajustar posição**: arraste o pin (ou toque no mapa) e **Confirmar posição**. O selo vira **Posição exata**, origem "Ajustada à mão".
2. Mude o endereço dessa empresa: a posição **continua** e aparece o aviso "O endereço mudou depois do ajuste" com **Manter a posição** e **Procurar o endereço novo**.
3. Na empresa "Endereço a confirmar" (teste 1.2), marque o ponto à mão: a tag **sai sozinha** e ela entra no mapa.

## 3. Lote por cidade ou região (administrador e gestor)
1. **Geolocalização → Resumo e lotes**: escolha **Cidade** (ou **Região**), **Ver quantas são**: aparece o total e quantas já têm coordenada.
2. **Iniciar o lote**: a lista de lotes mostra o progresso (atualiza sozinha) e, ao final, o relatório por resultado (exata, aproximada, a confirmar...). **Cancelar** para no meio; **Retomar** continua de onde parou. Só um lote anda por vez.
3. Marque **Refazer também as que já têm coordenada**: a posição ajustada à mão nunca muda.
4. **Regiões** (administrador): crie uma região com cidades; as microrregiões do IBGE aparecem prontas, só para leitura. O gestor vê mas não edita.

## 4. Mapa (todos os papéis)
1. **Mapa** ocupa a área central inteira, sem rolagem da página. Chips de Status no topo com a contagem (Prospect desligado ao abrir). Ligue o chip e os pins aparecem.
2. Cada pin tem a cor do Status; **vermelho = Cliente sem visita há 60+ dias**; o **visto** = já visitada alguma vez. A **legenda** (embaixo) explica; "Visto no pin" também.
3. Toque num pin: o **painel da empresa** abre (tags, selo de precisão, carteira, última visita, próxima atividade, Ligar, WhatsApp, Abrir ficha e as abas Atividades, Oportunidades e Contatos).
4. **Filtros**: busca (empresa, bairro, cidade), visitada (alguma vez, 90 dias, período, nunca), vendedor, cidade, região, precisão, "Clientes sem visita 60+ dias".
5. **Leads**: ligue o chip de Leads e escolha um **lote de importação** nos Filtros: aparecem até 500, com o contador "leads: N de M".
6. Com muitas empresas na tela, o mapa mostra **bolhas** com o total; toque numa bolha para aproximar.
7. **Empresas próximas** (no painel): barra com **2, 5, 10 e 25 km**; por padrão **sem as já visitadas** ("Incluir já visitadas" as traz). Lista em ordem de distância.
8. **Selecionar por retângulo** (dois toques nos cantos) e **por raio** (toque no centro): lista as empresas, abre cada uma e **aplica uma tag a todas**.
9. **Cobertura por município** (botão de camadas): bolha em cada cidade com quantas **faltam** visitar, e a lista "N de M visitadas".
10. **Vendedor**: só aparecem as empresas da carteira dele (a menos que a empresa libere "vendedores veem todas").
11. **Celular**: mapa em tela cheia; o painel sobe de baixo; os filtros ficam numa gaveta.

## 5. Legenda do mapa (administrador)
**Geolocalização → Legenda do mapa**: troque a **cor** (12 cores da paleta) e o **nome** de cada estado, com prévia; "Restaurar padrão" volta tudo. Gestor e vendedor veem a legenda do mapa mas não a alteram.

## O que ficou de fora e por quê
| Item | Motivo |
|---|---|
| Check-in da visita, "visita tentada" alimentada, posição do vendedor | É o G3; a posição do aparelho só será gravada no check-in (LGPD) |
| "Na rota", montar e otimizar rotas, link do Google Maps/Waze | É o G4 |
| Subir o Nominatim e o PMTiles em produção | Dependem de arquivos preparados fora da VPS; o Nominatim fica para depois do seu teste. (O CNEFE foi carregado em 18/10/2026, ver "Cargas em produção".) |
| Lote por região com microrregiões de **outros estados** na tela | A tela mostra a UF de `GEO_UF` (padrão ES); outra UF é só trocar a variável e recarregar o CNEFE |
| Varredura automática de lote parado (como na importação) | O botão Cancelar/Retomar cobre; reavaliar se algum lote travar |
| Teste real em ARM e leitura do PMTiles pelo Garage de 512 MiB em produção | Só dá para medir depois do arquivo no Garage; medição pedida no relatório |
| Legenda com "visita tentada" funcionando | Depende do G3 |

## Decisões
- **Do Ale (plano aprovado):** fontes, camadas, precisão, normalização, preparo fora da VPS, CNEFE no banco principal e dentro do backup, migração única 0026, Nominatim só em produção, tiles pela API com `Range`, concorrência 1, pushes em 4 etapas, "visita tentada" só pelo G3.
- **Do Claude (revise no teste):** "sem visita há 60+ dias" só para o Status Cliente (como na tela de referência); "visitada" = última visita preenchida; seleção por retângulo em dois toques (serve igual no celular); chips do mapa gerados das tags de Status (as tags "Cadastro" e as automáticas não viram chip); lote de geocodificação por empresa com tabela própria (retomada e progresso); `GEO_AUTOMATICA` desliga a geocodificação automática (testes); consultas externas (Nominatim e CEP) guardadas por 90 dias; MapLibre 6 (a 5 tinha aviso crítico).

## Cargas em produção
- **CNEFE (18/10/2026, madrugada):** carregado pelo roteiro de dump via Garage (`roteiro_carga_geo_producao.md`). **2.221.348 endereços, 47.644 ruas, 78 municípios**; schema `referencia_geo` com **529 MB** (com índices); arquivo `cnefe-es.sql.gz` com **28.908.400 bytes**; conferências do arquivo (0 DDL, 2 `COPY`, 1 `TRUNCATE`) ok; **27 migrações e o mesmo hash do schema** nos dois bancos.
- **Desvios do roteiro:** (1) o `aws-cli` falha no terminal do servidor atrás do Traefik (`GetObject`/`DeleteObject`: `signed header content-length is not present`; `HeadObject` só com as variáveis `*_CHECKSUM_*=when_required`); o download foi por link pré-assinado (gerado no WSL, 15 min) + `curl`, e a exclusão pelo WSL. (2) O antes/depois do `pg_dumpall` **não foi medido na hora**.
- **Pendente:** medir o crescimento do dump pelo backup noturno do Coolify (comparar o último arquivo antes da carga com o primeiro depois, no R2; comando em `roteiro_carga_geo_producao.md`). **Limite: +150 MB**; se passar, avisar o Ale. Também falta registrar o tempo de restauração (teste do `runbook_backup.md`, seção 2).
- **Mapa (worker, 18/10/2026):** o mapa abria cinza porque o worker do MapLibre 6 não era publicado no build (404); corrigido e coberto por teste nas imagens de produção (`esteira_deploy.md`). O PMTiles real ainda precisa estar no Garage para o mapa ter ruas.
