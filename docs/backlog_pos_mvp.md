# Backlog único de pós-MVP

> Criado em 16/10/2026, no fim do Módulo 7, a pedido do Ale. **É o único lugar** onde mora o que ficou de fora do MVP. Reúne a seção 3 de `escopo_mvp.md` (que agora só aponta para cá), as tabelas "o que ficou de fora" dos roteiros de teste (`roteiro_teste_modulo2.md` a `roteiro_teste_modulo7.md`), os itens menores que só estavam nas decisões de cada módulo e as pendências técnicas.
> **Sem prioridade e sem estimativa de propósito:** o Ale revisa depois. Cada linha diz o item, **por que ficou de fora** e **de onde veio** (módulo ou documento). Quando um item for feito, mova-o para a seção "Feito" no fim, com a data e o commit.
> O desenho técnico dos itens que têm tabela continua em `modelagem_banco.md` ("o MVP só não cria as tabelas de que não precisa; cada uma entra, por migração, quando o item for implementado").

## Carteira e Empresas
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Lixeira e restauração de empresas | Hoje excluir é exclusão lógica sem volta pela tela (pendência declarada) | Módulo 2 (`escopo_mvp.md`, `roteiro_teste_modulo2.md`) |
| Trocar o vendedor de várias empresas de uma vez (ação em massa) | Fora do que foi aprovado; a troca é empresa a empresa, em Editar | Módulo 2 (`roteiro_teste_modulo2.md`) |
| Exportar a lista de Empresas | Fora do MVP; a exportação de dados por empresa (LGPD) é item à parte | Módulo 2 / seção 3 |
| Faixas de funcionários e de faturamento (cadastros e campos na empresa) | Decidido em 12/10/2026: a empresa não tem esses campos no MVP (`faixas_*` ficam só na modelagem) | Módulo 1 / seção 3 |
| Campos personalizados (empresa, contato e oportunidade) | Sem necessidade comprovada; os campos fixos cobrem o uso inicial | Seção 3 |
| Filtros salvos personalizados (por usuário) | Os chips fixos da lista de Empresas bastam; decidido de novo para oportunidades no Módulo 6 | Seção 3 / Módulo 6 |
| Cidade editável em empresa sem consulta à Receita (CPF, sem documento, Receita fora do ar) | O campo é só leitura, como no protótipo; só a Receita preenche | Módulo 2 (`roteiro_teste_modulo2.md`) |
| Mudar o documento de uma empresa já cadastrada | Decisão de projeto: o documento não muda; cadastra-se de novo | Módulo 2 |
| Sócios editados à mão | Os sócios vêm sempre da Receita (sem CPF, por LGPD) | Módulo 2 |
| Atualização campo a campo pela Receita e rotina mensal de reconsulta | A consulta inicial e o enriquecimento da importação cobrem o MVP | Seção 3 |
| Detecção de duplicados por similaridade (nome, telefone) | O MVP deduplica só por CNPJ | Seção 3 / Módulo 4 |
| Filtro da lista de Empresas por lote de importação e "aplicar tag" nas empresas de um lote | A coluna `empresas.importacao_id` existe; o filtro e a ação em massa não foram pedidos | Módulo 4 (`roteiro_teste_modulo4.md`) |
| "Próxima atividade" em vermelho (atrasada) nas listas de Empresas e nas fichas | A API informa a data; só a tela Atividades destaca a atrasada | Módulo 5 |
| Visão Equipe e transferência de carteira | Só há um usuário no MVP | Seção 3 |
| Painel consolidado (várias empresas do grupo) | Só há uma empresa em uso | Seção 3 |
| Copiar configurações entre empresas do grupo | Só há uma empresa em uso | Seção 3 |
| Busca global (empresas, contatos, oportunidades) | Transversal ainda não entregue: a caixa da barra do topo avisa "em breve" | Transversal (`escopo_mvp.md`) |
| Auditoria nas fichas além do que existe (Histórico de contato e empresa) | Transversal; hoje o Histórico mostra o essencial de empresa e contato | Transversal |
| Mapa e rotas (roteirização, "Rota" além do link para o mapa) | Fases 2 e 3 de `funcionalidades.md` | Seção 3 |
| Prospecção (busca por CNAE e município na base completa) | **Fase própria logo após o MVP**; exige a base completa de CNPJs e instância própria da Minha Receita | Seção 3 |
| BrasilAPI como alternativa independente à Minha Receita | Ela repassa a própria Minha Receita; só vale a instância própria (`configuracao_tecnologia.md`) | Módulo 2 |
| Offline (leitura e fila de registros sem internet) | Complexidade alta; o PWA exige conexão no MVP | Seção 3 |

## Contatos
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Mesclar contatos duplicados | O MVP só avisa do duplicado (e-mail ou telefone igual), com "Abrir contato" | Módulo 3 (`escopo_mvp.md`) |
| Foto do contato | Fora do Módulo 3 | Módulo 3 |
| Alerta de aniversário | O aniversário (dia e mês) é guardado, sem aviso | Módulo 3 |
| Campos personalizados do contato | Veja "Campos personalizados" | Módulo 3 |
| Bloqueio efetivo de envio por consentimento | Hoje "Não quer contato" só avisa; nada envia (não há integração ainda) | Módulo 3 |
| Identificar contato pelo WhatsApp (caixa de não identificados) | Depende da integração com o WhatsApp | Módulo 3 / Fase 4 |
| Lixeira e restauração de contatos | Exclusão lógica sem volta pela tela; o caminho comum é inativar o vínculo | Módulo 3 |
| Coluna "Última interação" na lista de Contatos | Prevista para depois das atividades; a ficha mostra a aba Atividades, mas a coluna da lista não foi feita | Módulo 3 / Módulo 5 |
| Aba Oportunidades na ficha do contato | O Módulo 6 entregou a aba na empresa e a oportunidade guarda só o contato principal | Módulo 3 / Módulo 6 |

## Importação
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Atualizar a empresa que já está na carteira, e duplicado por nome ou telefone | Decidido em 12/10/2026: deduplica só por CNPJ e pula a linha repetida | Módulo 4 |
| Relatório completo da importação em Excel | O CSV do que não entrou cobre a correção; o relatório inteiro está na tela, filtrável | Módulo 4 |
| Notificação de "importação concluída" | A central de notificações está fora do MVP | Módulo 4 |
| Importação por CPF ou sem documento | A importação é por CNPJ; CPF, texto e notação científica viram "sem CNPJ válido" | Módulo 4 |
| Editar o perfil de um lote já iniciado | O lote guarda uma cópia das regras usadas | Módulo 4 |
| Retomar o mesmo lote depois de desfeito | Desfeito é definitivo; envia-se a planilha de novo | Módulo 4 |
| Desfazer depois de 7 dias, ou desfazer o que alguém já alterou | Decidido em 15/10/2026: a empresa alterada (ou com contato ou atividade) fica na carteira | Módulo 4 |
| Tela de lotes no celular com ações (cancelar, desfazer na lista) | As ações ficam no relatório do lote | Módulo 4 |
| Exportação de dados da carteira | A empresa tem a planilha de origem; sai com a exportação por empresa (LGPD) | Seção 3 |

## Importação de contatos e de atividades (o que ficou de fora)
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Atualizar contato ou atividade que já existe (hoje o contato duplicado só é vinculado e a atividade idêntica é pulada) | Decidido em 16/10/2026: nunca sobrescrever | Importação de contatos e de atividades |
| Vincular a empresa pelo nome, e não só pelo CNPJ | Decidido em 16/10/2026 | Idem |
| Mais de um e-mail e dois telefones por contato; contato da atividade por nome ou telefone | O modelo tem uma coluna de e-mail, uma de telefone e uma de celular; o contato da atividade é só pelo e-mail | Idem |
| Recálculo da carteira em lote (uma consulta para todas as empresas do bloco) | Medido em 16/10/2026 com 10.000 linhas e 1.000 empresas: o recálculo por empresa soma 80 s dos 270 s do lote; só vale se um dia pesar | Idem |

## Atividades
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Vários contatos por atividade (`atividade_contatos`) | Decisão do Ale (15/10/2026): um contato por atividade | Módulo 5 |
| Lembretes ("Notificar em") e recorrência ("Repetir") | Dependem da central de notificações e de rotinas no worker; o bloco "Mais opções" só tem Oportunidade e Responsável | Módulo 5 / seção 3 |
| Checklist, etiquetas coloridas e anexos | Servem ao Kanban de Tarefas e ao WhatsApp | Módulo 5 |
| `id_externo`, check-in com GPS da visita | Adiados pelo Ale (integrações e visita com localização); `origem` já existe | Módulo 5 |
| Situação "Em execução" na tela | Existe no banco e na API; a tela usa Realizada, Pendente e Cancelada | Módulo 5 |
| Reabrir atividade cancelada ou realizada | Não pedido; refaz-se registrando outra | Módulo 5 |
| Validade da tag de visita (`dias_validade_tag_visita`) | Opcional na regra, sem tela; a tag só sai quando não resta atividade realizada do tipo | Módulo 5 |
| Fuso da empresa editável pela tela | O fuso é America/Sao_Paulo (`tenant_configuracoes.fuso_horario`); sem tela de escolha | Módulo 5 |
| Datas das telas no fuso da empresa (hoje: fuso do aparelho) | Só "hoje" e "atrasada" são do servidor, no fuso da empresa | Módulo 5 |
| Ações em massa na tela Atividades (concluir, cancelar, transferir) | Não pedido | Módulo 5 |
| Atividades no Histórico da empresa | Cada atividade tem a própria linha do tempo na aba Atividades | Módulo 5 |
| Kanban de Tarefas (quadros pessoais e de equipe, colunas customizáveis) | Com um usuário só, "Minhas atividades" do Dashboard cobre o dia a dia | Seção 3 |
| Central de notificações e push (atividade atrasada, prazo, tarefa atribuída) | Um usuário só; o Dashboard mostra o que está atrasado | Seção 3 |
| Agenda Google e Microsoft (sincronização das atividades) | Fases de integração | Seção 3 |

## Oportunidades
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Itens da oportunidade e catálogo de produtos e serviços (`oportunidade_itens`, `produtos`) | Decisão do Ale (16/10/2026): o MVP usa valores digitados (único, mensal e meses) | Módulo 6 / seção 3 |
| Mudar uma oportunidade de funil | Só se move de fase dentro do mesmo funil | Módulo 6 |
| Mais de um contato na oportunidade (`oportunidade_contatos`) | Só o contato principal | Módulo 6 |
| Exportação da lista de oportunidades | Fora do MVP | Módulo 6 |
| E-mail e WhatsApp na oportunidade; comentários | Fases de integração | Módulo 6 |
| Notificação de oportunidade parada ou com previsão vencida | Central de notificações fora do MVP | Módulo 6 |
| Mais de 100 cards por coluna do Kanban | O quadro traz 100 por fase e avisa "e mais N"; a busca e a lista alcançam o resto | Módulo 6 |
| Probabilidade 100% ao conquistar | Não pedido; a conquistada guarda a probabilidade que tinha | Módulo 6 |
| Reabrir uma oportunidade cuja fase foi inativada volta à fase original | Hoje volta para a primeira fase ativa do funil | Módulo 6 |
| Recorrência de produtos e de contrato | Depende dos itens e do catálogo | Módulo 6 / modelagem |

## Dashboard
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Visão Equipe e por usuário específico (gestor e admin) | Só a visão "Minha" no MVP (um usuário) | Módulo 7 / `escopo_mvp.md` |
| Período personalizado (datas escolhidas) | Só Mês atual, Mês anterior e Trimestre | Módulo 7 |
| Resumo do quadro de Tarefas no rodapé de "Minhas atividades" | O Kanban de Tarefas está fora do MVP; entrou o atalho "Ver todas as atividades" | Módulo 7 |
| "Novos leads" por origem (quantos vieram da Prospecção) | A Prospecção não está no MVP; o bloco mostra só as empresas novas no período | Módulo 7 |
| Comparativos além da variação do MRR sobre o período anterior | Não pedido | Módulo 7 |
| Previsão que inclui as oportunidades sem data prevista | As sem data aparecem como "N sem previsão" e ficam fora da soma | Módulo 7 |
| Exportar ou imprimir o Dashboard | Fora do MVP | Módulo 7 |
| Tempo médio por fase e conversão por fase | O histórico de fases já guarda os dados; não há tela | Módulo 6 / Módulo 7 |

## Integrações
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| WhatsApp (Evolution API: conversas viram atividades, número por vendedor, caixa de não identificados) | Fases 4 a 7 de `funcionalidades.md` | Seção 3 |
| E-mail (Gmail e Microsoft: registro, envio, rastreamento, thread como atividade) | Idem | Seção 3 |
| Agendas Google e Microsoft | Idem | Seção 3 |
| n8n e API pública / webhooks (formulário do site cria empresa + oportunidade + atividade) | Idem | Seção 3 |
| Link público de agendamento (estilo Calendly) | Idem | `funcionalidades.md` |
| **Integração com ERP, Omie primeiro.** A regra de situação financeira fica no CRM, alimentada por conectores nativos (liga/desliga por empresa, só leitura) e pela API aberta. Grupo de tags de sistema **Financeiro**: Adimplente; Inadimplente até 30, 31–60, 61–90 e +90 dias; Sem cadastro no ERP. Só mensalidades, sem tolerância; a consulta é pelo CNPJ e só para empresas com a tag de sistema "cliente". **Ordem:** chaves de API e API aberta, depois o recurso financeiro, depois o conector Omie. **Em aberto:** como identificar a mensalidade na Omie | Fase de integrações; depende da API aberta | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |

## SaaS (vários clientes)
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Instância própria da Minha Receita (base completa de CNPJs) | Permite escalar a importação e a Prospecção com vários clientes e tira a dependência da API pública | Seção 3 (decisão de 12/10/2026) |
| Cobrança, planos e limites por empresa | Fora do MVP; hoje só o Ale usa | `plano_implantacao.md` |
| Onboarding de empresa cliente (convite, dados iniciais) além do primeiro acesso | Só o Ale usa no MVP | Trilha antes do primeiro cliente externo |
| Revisão jurídica dos termos e da política de privacidade | Antes do primeiro cliente externo | `lgpd.md` |
| Painel administrativo do SaaS | Fora do MVP; hoje só o Ale usa | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |
| Plano de capacidade (quantos clientes por VPS, custo por cliente) | Só faz sentido com clientes externos | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |
| Contratos: termos de uso, DPA, SLA e política de privacidade | Antes do primeiro cliente externo (a revisão jurídica está em Segurança e LGPD) | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |
| Limites de plano aplicados pelo `PlanoService` | Junto de cobrança e planos | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 (`configuracao_tecnologia.md`, seção 17) |
| Empacotamento **on-premise** e imagens **amd64** nas versões numeradas | Modelo de distribuição descrito na seção 17; não é necessário para o MVP | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 (`configuracao_tecnologia.md`, seção 17) |

## Infraestrutura e esteira
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| Voltar os testes completos e o E2E para a esteira (runner próprio no homelab) | Modo temporário por falta de minutos do GitHub Actions: o gate completo roda no pre-push, na máquina de quem envia | `esteira_deploy.md`, seção 5.4 |
| Dependabot de volta a semanal | Mensal enquanto a cota está curta | `esteira_deploy.md`, seção 5.4 |
| Helper único de erros (as telas e a API repetem o tratamento) e, depois dele, atualizar o `nodemailer` para a 10.1.0 | Pendência técnica combinada com o Ale; a atualização espera o helper | Pendência técnica (16/10/2026) |
| `better-call` preso na versão que o Better Auth exige (1.4.0) | Só sobe junto com o Better Auth | Pendência técnica (16/10/2026) |
| Aviso "Nova versão disponível" no PWA | Transversal ainda não entregue | Transversal (`escopo_mvp.md`) |
| Exportação de dados por empresa (LGPD) | Pendência de produto antes do primeiro cliente externo | `lgpd.md` |
| Migrar o ambiente de desenvolvimento para o homelab (VM Ubuntu 24.04 com Tailscale e VS Code Remote-SSH) | Previsto para depois do MVP; hoje o desenvolvimento é no WSL2 | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |
| Runner próprio do GitHub Actions nessa VM | Depende da VM; resolve a falta de minutos (ver a primeira linha desta tabela) | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |

## Segurança e LGPD
| Item | Motivo de ter ficado fora | Origem |
|---|---|---|
| `acessos_log` com retenção de 6 meses (partição mensal descartada pelo job) | Decidido, **ainda não implementado** | Trilha antes do primeiro cliente externo / `lgpd.md` 5.1 |
| Limpeza de sessões expiradas | Trilha técnica | Trilha antes do primeiro cliente externo |
| Retenção da auditoria (prazo e descarte das partições antigas) | Hoje o job só cria partições e nunca descarta: retenção ilimitada | `lgpd.md`, seção 5 |
| Ensaio completo da restauração em produção (banco novo, papéis, aplicação apontando para ele) | O procedimento ainda não foi testado de ponta a ponta | `runbook_backup.md`, seção 3 |
| Teste real de restauração dos arquivos (Garage) | Pendente até existirem arquivos no bucket | `runbook_backup.md`, seção 4.6 |
| Revisão jurídica (base legal dos registros de acesso, termos, política de privacidade) | "Aplicação a confirmar com advogado" | `lgpd.md` |
| Vulnerabilidades moderadas abertas (`esbuild` via `drizzle-kit`; `uuid` via `exceljs`) | Sem versão corrigida e sem risco alcançável; reavaliar a cada atualização | `seguranca_dependencias.md` |
| Opcionais de segurança: **fail2ban**, **SSH só pelo Tailscale** e o cabeçalho **Cross-Origin-Opener-Policy** | Endurecimento opcional, fora do MVP | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |
| Opcionais de observabilidade: **Zabbix + Grafana** e alertas por **Telegram ou WhatsApp** | Opcionais; hoje valem o Uptime Kuma e o GlitchTip | Decisão do Ale fora do repositório (chat de planejamento), 13/10/2026 |

## Feito
| Item | Feito em | Onde |
|---|---|---|
| Regra "só se exclui o que nunca foi usado" para tipos de atividade, motivos, origens e soluções (a verificação que ficou pendente nos Módulos 5 e 6) | 16/10/2026 | commit `fix: cadastros usados só se inativam` (Módulo 7) |

| **Importação de contatos por planilha** (e, junto, **de atividades**), com a alternância Empresas / Contatos / Atividades no assistente | 16/10/2026 | `979bb5f` (API de contatos), `5142fe9` (API de atividades), `cc851a8` (telas) e a migração 0025 em `68caf55`/`1a7f861`; roteiro em `roteiro_teste_importacao_contatos_atividades.md` |

_(mova para cá o que for entregue, com a data e o commit)_
