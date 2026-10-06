# Leadtogo — Design System

> Status: **v1.0** · Data: 05/10/2026
> Fonte oficial (navegável, com componentes ao vivo): artifact **"Leadtogo"** no claude.ai: https://claude.ai/artifact/SWeEbQZXuBUjT32Cb8uYHQ
> Este arquivo é só o resumo das decisões. Os valores exatos ficam no artifact (`tokens.json`).

## Identidade
- **Nome do produto:** Leadtogo (o nome "CRM Alessandro" era provisório). Verificar a marca no INPI e o domínio.
- **Personalidade:** profissional e sóbria (referências: Linear, Attio), com foco em densidade de informação e leitura rápida.
- **Marca gráfica:** quadrado azul-petróleo com um ponto (o lead) e uma seta (o próximo passo). O nome vai escrito em Instrument Sans 700.
- **Mote:** "O próximo passo de cada cliente, no escritório e em campo."

## Fundamentos
| Item | Decisão |
|---|---|
| Cor de acento | Azul-petróleo: `#0b5f70` (claro) / `#5ec2d6` (escuro) |
| Neutros | Frios, levemente puxados para o petróleo |
| Temas | Claro e Escuro desde o início, com os mesmos nomes de token |
| Estados | success, warning, danger, info (+ versões `-soft`), sempre com ícone ou palavra |
| Paleta de tags | 10 cores (cinza, vermelho, laranja, âmbar, verde, petróleo, azul, índigo, roxo, rosa) com par fundo/texto legível nos dois temas |
| Tipografia | Instrument Sans (interface) + IBM Plex Mono (CNPJ, CPF, CEP, códigos) |
| Base de texto | 14px no desktop, 16px no celular |
| Espaçamento | Grade de 4px |
| Cantos | 4 / 6 / 8 / 12 px e pílula |
| Densidade | Compacta 28px · Padrão 36px · Toque 44px (`data-density`) |
| Ícones | Lucide (licença ISC), traço 1.75 |
| Contraste | Todo texto ≥ 4.5:1; bordas de controle e foco ≥ 3:1, nos dois temas |

## Cores padrão do domínio
- **Status da empresa:** Lead = petróleo · Prospect = âmbar · Cliente = verde · Inativo = cinza
- **Visitação:** Visitada = laranja · Contactada = azul
- **Tipos de atividade:** Ligação = azul · WhatsApp = verde · E-mail = índigo · Visita = laranja · Reunião = roxo · Tarefa = cinza
- **Status da oportunidade:** Ativo = acento · Conquistado = success · Perdido = danger · Suspenso = warning · Cancelado = neutro

## Componentes (30 + 1 tela de exemplo)
- **Ações:** Button, IconButton (inclui o botão flutuante "+"), SegmentedControl
- **Formulários:** TextField, Select, Checkbox, Switch
- **Exibição:** Badge, Tag, Avatar, StatTile, StatusPill, Tooltip
- **Atividades:** ActivityIcon, PriorityMarks (Importante/Urgente), ActivityTimeline, TaskCard
- **Funil:** DealCard (valor total + MRR, alerta de parada, "sem próxima atividade"), KanbanColumn
- **Dados:** DataTable, Tabs
- **Navegação:** AppNav, TenantSwitcher (multiempresa), Menu
- **Feedback:** Alert, Toast, EmptyState, Skeleton, Dialog
- **Exemplo:** TelaFunil (Kanban de oportunidades completo)

> Os componentes do artifact são a **referência visual e de comportamento**. Na implementação, eles serão recriados em React + Tailwind + shadcn/ui usando os mesmos tokens.

## Próximos passos
1. Revisar o design system no artifact e pedir ajustes (cores, fonte, cantos, densidade).
2. Prototipar as telas principais (Dashboard, Empresas, Ficha da empresa, Oportunidades, Tarefas, versões para celular) sobre este sistema.
3. Definir o escopo do MVP.
