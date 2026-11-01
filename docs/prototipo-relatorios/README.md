# Telas do construtor de relatórios (protótipo, Claude Design)

Imagens enviadas pelo Ale em 01/11/2026. São **referência visual**, não código de produção (mesma regra de `docs/prototipo/`). O plano que as interpreta é `docs/plano_construtor_relatorios.md` (seção 8). Onde divergirem do plano ou de `docs/funcionalidades.md`, valem os documentos.

| Arquivo | Tela |
|---|---|
| `01-lista-relatorios.png` | `/relatorios`: abas Meus, Compartilhados e Prontos (com contagem), busca pelo nome, cartões de relatório (fonte, dono, última execução, selo de visibilidade, Abrir, Editar e Duplicar) e o bloco "Minhas exportações" (Pronto/Baixar, Gerando, Erro/Tentar de novo) |
| `02-construtor-vazio.png` | Construtor de um relatório novo, sem colunas: painel **Dados** (fonte principal, busca de campo, árvore com os selos principal, um e muitos), área central vazia ("Escolha os campos") e painel **Ajustes** (Filtros, Agrupar, Ordenar e Gráfico, este marcado R4) |

## Divergências conhecidas (vale o plano)

| No protótipo | No plano | Motivo |
|---|---|---|
| "Ficam disponíveis por 7 dias" e "disponível por mais 6 dias" | **24 horas** ("disponível por mais N horas") | Limite aprovado pelo Ale em 01/11/2026 (decisão 6 do plano) |
| Campo "Segmento" na fonte Empresas | **Vertical** | O grupo de tags "Segmento" foi substituído pela Vertical (`funcionalidades.md`, seção 2) |
| Campo "Potencial mensal" na fonte Empresas | Não existe | A empresa não tem esse campo; o valor mensal é da oportunidade ("Soma do valor mensal" pela ligação Oportunidades) |
| Barra "Simular: Normal · Carregando · Vazio · Erro · Tempo esgotado · Sem acesso" | Não vai para a produção | Ferramenta do protótipo para mostrar os estados |
| Rolagem das abas (setas à direita das abas) | Não vai para a produção | Artefato do protótipo |
