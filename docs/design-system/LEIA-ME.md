# Leadtogo — pacote do design system para o Claude Design

Esta pasta tem tudo o que o Claude Design precisa para criar as telas do Leadtogo com a identidade já definida.

## O que tem aqui

| Arquivo / pasta | Para que serve |
|---|---|
| `README.md` | Manual da marca: princípios, voz, uso de cores, tipografia, espaçamento, ícones e logo |
| `componentes.md` | Guia de cada componente (quando usar, o que recebe, regras) |
| `catalogo.html` | Todos os componentes funcionando, com troca de tema (claro/escuro) e densidade. Abra no navegador |
| `tokens.json` | Tokens em formato de dados (cores dos dois temas, tipografia, espaços, cantos, sombras, tamanhos) |
| `tokens.css` | Os mesmos tokens como variáveis CSS (`--bg`, `--ink`, `--accent`…), com as fontes |
| `tailwind-theme.css` | Tema para Tailwind CSS v4, já compatível com shadcn/ui (usado depois no código) |
| `components/` | Componentes React de referência (`bundle.js`), estilos (`bundle.css`) e props (`index.d.ts`) |
| `fonts/` | Instrument Sans (interface) e IBM Plex Mono (CNPJ, CEP, códigos) |
| `assets/logos/` | Marca Leadtogo para o tema claro e o escuro |
| `assets/icons/` | 24 ícones Lucide usados no produto |

## Como usar no Claude Design

1. Acesse **claude.com/product/design** (planos Pro, Max, Team ou Enterprise).
2. Na configuração do design system, envie **esta pasta inteira** (ou, no mínimo: `README.md`, `componentes.md`, `tokens.css`, `tokens.json`, `components/bundle.css`, `catalogo.html`, `fonts/` e `assets/logos/`).
3. Envie também os documentos do projeto que estão na pasta acima desta:
   - `funcionalidades.md`: o que cada tela faz
   - `modelagem_banco.md`: os campos de cada cadastro
   - `design_system.md`: o resumo das decisões visuais
4. Comece um projeto de telas com o pedido abaixo.

## Pedido inicial sugerido (copie e cole)

> Use o design system Leadtogo (tokens, componentes e manual enviados) para criar o protótipo clicável de um CRM de gestão de carteira, em português do Brasil. Siga `funcionalidades.md` e `modelagem_banco.md` para os campos e as regras.
>
> Telas, nesta ordem, em desktop (1440px) e celular (390px):
> 1. **Dashboard**: minhas atividades (hoje, atrasadas, próximos 7 dias), funil e previsão do mês (com MRR), carteira (empresas por status, sem contato há 60 dias).
> 2. **Empresas (lista)**: busca, filtros por tag, vendedor, cidade e última visita, com ações em massa. No celular, a lista vira cards com botões de ligar, WhatsApp e rota.
> 3. **Ficha da empresa**: cabeçalho com tags e ações rápidas; abas Resumo (dados da Receita, CNAEs, sócios), Contatos, Atividades (linha do tempo), Oportunidades e Histórico.
> 4. **Nova empresa**: digitar o CNPJ, clicar em "Consultar" e conferir os dados preenchidos pela Receita antes de salvar.
> 5. **Oportunidades**: Kanban por funil, com alternância para lista, e o diálogo de fechar como Conquistado, Perdido, Cancelado ou Suspenso (com motivo).
> 6. **Tarefas**: Kanban pessoal customizável, com cards de tarefa e atividade, Importante/Urgente e checklist.
> 7. **Registrar atividade** (celular): o botão "+" abre uma folha com tipo, empresa, contato, data, situação e resultado.
>
> Regras: azul-petróleo só para ação principal e seleção; estados sempre com palavra ou ícone; textos curtos, caixa de frase e sem emoji; dados de exemplo realistas de empresas do Espírito Santo; navegação lateral com seletor de empresa (multiempresa).

## Depois do protótipo

Quando as telas estiverem aprovadas, o Claude Design gera um pacote de passagem para o **Claude Code**. Os tokens deste pacote (`tokens.css` + `tailwind-theme.css`) entram direto no projeto React + Tailwind + shadcn/ui.

A fonte oficial do design system continua sendo o artifact **Leadtogo** no claude.ai. Se algo mudar lá, este pacote é gerado de novo.
