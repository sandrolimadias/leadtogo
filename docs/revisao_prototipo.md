# Revisão do protótipo (Claude Design)

> Data: 06/10/2026 · Pacote: `docs/prototipo/` · Revisado contra `funcionalidades.md` (v1.4) e `modelagem_banco.md` (v1.0)

## 1. Resultado geral

O protótipo cobre **7 fluxos** (Dashboard, Empresas, Ficha da empresa, Nova empresa, Oportunidades, Tarefas, Registrar atividade) em desktop (1440px) e celular (390px), nos temas claro e escuro, com menu lateral recolhível e seletor de empresa. Ele segue o design system (os tokens, componentes e fontes são idênticos aos de `docs/design-system/`) e respeita as regras de negócio dos documentos.

- As cópias de `funcionalidades.md` e `modelagem_banco.md` dentro do pacote são **idênticas** às da pasta `docs/`.
- O README do pacote é uma especificação detalhada de cada tela: o Claude Code deve lê-lo antes de implementar.

## 2. O que confere com os documentos

| Tema | Situação |
|---|---|
| Multiempresa (seletor, notificações por empresa, painel consolidado no menu) | ✅ |
| Tags com grupos (Status de seleção única substitui; cores padrão) | ✅ |
| Visitada/Contactada automáticas ao concluir atividade | ✅ |
| Consulta CNPJ (alfanumérico), duplicado, falha, comparação "Atualizar pela Receita" | ✅ |
| Sócios sem CPF e "Converter em contato" | ✅ |
| Contato com vários vínculos, cargo por empresa, papel na decisão | ✅ |
| Atividades unificadas com tarefas (tipo Tarefa sem empresa) | ✅ |
| Status da oportunidade separado da fase, motivo por status, fase em que parou, "Retomar em" | ✅ |
| Valor total + MRR | ✅ |
| Kanban de tarefas customizável (limite, coluna de conclusão, quadros) | ✅ |
| Celular sem depender de arrastar | ✅ |

## 3. Ajustes incorporados aos documentos

| # | O protótipo trouxe | Onde foi registrado |
|---|---|---|
| 1 | Menu recolhível com preferência salva por usuário; navegação do celular (barra inferior + "+") | `funcionalidades.md` (Navegação e layout); `modelagem_banco.md` (`membros.preferencias`) |
| 2 | Filtros salvos padrão, incluindo **"Sem próxima atividade"**, e colunas Próxima atividade / Em aberto na lista | `funcionalidades.md` (Tela Empresas); `modelagem_banco.md` (`empresas.proxima_atividade_*`) |
| 3 | Badge "Ativa na Receita" na ficha | Lida da última consulta (`receita_consultas`), já que a situação cadastral não é campo da empresa |
| 4 | "Parada há N dias nesta fase" e "Sem próxima atividade" nos cards | `modelagem_banco.md` (`oportunidades.fase_desde`, `ultima_atividade_em`, `proxima_atividade_*`) |
| 5 | Interruptor "empresa vira Cliente" no diálogo de conquista | `funcionalidades.md` (padrão vem da configuração do tenant, ajustável por fechamento) |
| 6 | Registrar atividade: situação padrão Realizada, resultado obrigatório ao realizar | `funcionalidades.md` (Formulário "Registrar atividade") |
| 7 | Indicadores do Dashboard (Previsão, MRR, Conversão, Sem contato) | `funcionalidades.md` (Indicadores do Dashboard) |

## 4. Lacunas e como foram resolvidas

| Lacuna | Decisão |
|---|---|
| Registrar atividade sem **Oportunidade**, **Notificar em** e **Recorrência** | O Claude Code implementa um bloco recolhido **"Mais opções"** com os três campos, seguindo o documento |
| Telas não prototipadas: **Contatos**, **Configurações**, **Prospecção**, **Login/criação da empresa** e **Painel consolidado** | **Prototipar agora** no Claude Design, com o pedido em `docs/prototipo/PEDIDO_FASE2.md` |

## 5. Observações para a implementação

- O botão "Importar planilha" aparece na lista de empresas, mas o fluxo de importação (mapeamento de colunas, prévia, erros) não foi desenhado. Foi incluído no pedido da segunda rodada.
- "Rotas (Fase 3)" aparece no menu como item futuro, com badge. No MVP, esconder ou manter desativado. **(23/10/2026: Rotas entrou no menu Carteira com o G4, sem o selo.)**
- `support.js` e a barra Tema/Dispositivo do protótipo **não** fazem parte do produto.

## 6. Divergências da tela Usuários e equipe (E16a, 12/10/2026)

Onde o protótipo (`Configuracoes.dc.html`) e `funcionalidades.md` divergem, **vale o documento**:

| Protótipo | Documento | Decisão |
|---|---|---|
| "Convidar pessoa" tem o campo **Gestor** (hierarquia) | o convite leva só e-mail e papel | **Fica para o MVP**, com o módulo de carteira |
| Botão **Transferir carteira** em Usuários | a transferência é do gestor ou admin e depende da carteira (seção 10) | **Fica para o MVP**, com o módulo de Empresas |
| Vendedor **"Sem acesso"** criado na própria tela | vendedor = membro que pode existir sem login (decisão 25) | só **exibe** quem já existe assim; criar fica para o MVP |
| Seção visível para "Admin" | gestor não acessa configurações | igual: só o administrador da empresa |
| Sem tela de **Segurança** nem de **criar empresa** do grupo | política de 2FA por empresa e criação de empresas pelo administrador da conta | telas novas, pelo design system |
| Sem "último acesso" | não definido | mostra a data aproximada da sessão mais recente |
| Convite expirado, cancelado e já usado em telas diferentes (pedido) | a API responde o mesmo 404 de propósito | uma só tela "Convite inválido" |

