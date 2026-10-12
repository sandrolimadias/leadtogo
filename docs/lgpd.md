# LGPD: documento interno de trabalho

> **Rascunho técnico. Revisar com advogado antes de publicar qualquer política ou contrato.**

Este documento organiza o que o Leadtogo faz com dados pessoais, para embasar a política de privacidade pública, o contrato de tratamento de dados (DPA) e as respostas aos titulares. **Não é** a política pública. Referências: `modelagem_banco.md`, `configuracao_tecnologia.md` (seção 13, observabilidade), `runbook_backup.md`, `runbook_observabilidade.md` e `funcionalidades.md`.

Itens marcados com **(confirmar)** são suposições a validar; `<…>` são lacunas para o Ale preencher.

## 1. Papéis (arts. 5º, VI a VII, e 39)

| Dados | Papel do Leadtogo | Quem decide a finalidade |
|---|---|---|
| **Contas de usuário**: nome, e-mail, senha (hash), 2FA, sessões e logs de acesso | **Controlador** | o Leadtogo |
| **Dados que cada empresa cliente (tenant) cadastra** sobre as suas empresas-alvo, contatos, atividades e oportunidades | **Operador** | a **empresa cliente**, que é a controladora |

Consequências práticas:

- No tratamento como operador, o Leadtogo age só conforme as instruções da empresa cliente (o que o contrato e o uso do sistema configuram) e precisa de um **DPA** com cada uma (seção 9).
- Pedidos de titulares sobre os dados dos contatos de uma empresa cliente são **encaminhados a ela** (seção 6).
- Os membros da equipe de uma empresa cliente são, ao mesmo tempo, titulares de conta (controlador: Leadtogo) e pessoas cujos atos aparecem nos dados do tenant (por exemplo, autor de atividades e da auditoria).

## 2. Inventário dos dados tratados

Legenda: **PD** = dado pessoal; **PD (PJ)** = dado de pessoa jurídica que pode identificar pessoa natural (sócio, empresário individual, telefone direto).

| Grupo | Tabelas | Dados | Pessoal? |
|---|---|---|---|
| **Usuários** (schema `auth`) | `user`, `session`, `account`, `verification`, `two_factor` | nome, e-mail, senha em hash (scrypt), segredo e códigos do 2FA, sessões (IP e navegador **(confirmar)**), empresa ativa | **PD** |
| **Membros** | `membros`, `convites` | nome, cargo, telefone, e-mail, foto, papel, gestor, preferências de interface; e-mail do convidado | **PD** |
| **Contas e empresas clientes** | `contas`, `conta_administradores`, `tenants`, `tenant_configuracoes` | dados cadastrais da empresa cliente (CNPJ, endereço, contatos de cobrança), administradores da conta | PD (PJ) |
| **Empresas-alvo** (carteira) | `empresas`, `empresa_telefones`, `empresa_cnaes`, `empresa_tags`, `empresa_socios` | CNPJ, razão social, endereço, telefones, nomes de sócios e qualificação (vindos da Receita ou digitados). O CPF mascarado do sócio **não é gravado** | PD (PJ) |
| **Contatos** | `contatos`, `empresa_contatos`, `contato_telefones`, `contato_emails` | nome, cargo/papel de decisão, telefones, e-mails, LinkedIn, aniversário (**só dia e mês**), observações, consentimento (`aceita_whatsapp`, `aceita_email`, `consentimento_em`, `consentimento_origem`) | **PD** |
| **Atividades** | `atividades` e complementares, `comentarios`, `arquivos` | descrição de visitas, ligações e tarefas, comentários e anexos (texto livre pode conter dados pessoais), participantes | **PD** (texto livre) |
| **Oportunidades** | `oportunidades`, `oportunidade_itens`, `oportunidade_contatos`, `oportunidade_historico` | valores, fases, motivos, contatos envolvidos | PD indireto (via contatos) |
| **Prospecção** | `prospeccoes`, `prospeccao_resultados`, `receita_consultas` | resultados de busca na base pública da Receita; o cache de consultas é compartilhado e público | PD (PJ) |
| **Auditoria** | `auditoria` (particionada por mês) | quem alterou o quê (antes/depois em `jsonb`), `membro_id`, **IP**, origem, data | **PD** (e pode copiar dados pessoais dos registros alterados) |
| **Outbox** | `eventos_outbox` | eventos para notificações e webhooks, com `payload` em `jsonb` | **PD** possível, conforme o evento |
| **Notificações e filtros** | `notificacoes`, `preferencias_notificacao`, `filtros_salvos`, `importacoes` | mensagens internas, preferências; planilhas importadas (arquivos em `arquivos`) | PD possível |
| **Cadastros auxiliares** | tags, funis, origens, produtos etc. | sem dado pessoal | não |

**Dados sensíveis (art. 11):** o sistema **não prevê** coletar dados sensíveis (origem racial ou étnica, saúde, convicção religiosa, opinião política, filiação sindical, vida sexual, genéticos, biométricos). Campos de texto livre (observações, comentários, anexos) podem receber esse tipo de informação por decisão do usuário; a orientação à empresa cliente é **não registrá-los**, e isso deve constar no DPA e nos termos de uso.

## 3. Base legal por grupo (art. 7º)

| Grupo | Base legal | Observação |
|---|---|---|
| Contas de usuário, membros, sessões, 2FA | **Execução de contrato** (art. 7º, V) | sem a conta o serviço não funciona |
| Logs de acesso, IP, auditoria da plataforma | **Obrigação legal** (art. 15 do Marco Civil, guarda de registros de acesso a aplicações **(confirmar com advogado)**) e **legítimo interesse** (segurança e prevenção a fraude) | |
| Cobrança e gestão da conta cliente | **Execução de contrato** e **obrigação legal** (fiscal) | |
| Dados que o tenant cadastra (empresas-alvo, contatos, atividades, oportunidades) | **Definida pela empresa cliente**, como controladora. Tipicamente **legítimo interesse** em prospecção e relacionamento B2B (art. 7º, IX), com teste de balanceamento e respeito ao opt-out | O Leadtogo oferece os campos de consentimento e opt-out, mas **não escolhe** a base |
| Dados públicos da Receita (empresas, sócios) | **Dado tornado manifestamente público** (art. 7º, § 4º), respeitada a finalidade | consulta pela Minha Receita |

## 4. Suboperadores e localização dos dados

| Suboperador | Para quê | Dados | Localização |
|---|---|---|---|
| **Oracle Cloud** (VPS) | hospedagem de tudo: aplicação, PostgreSQL, Valkey e Garage (arquivos) | todos os dados | `<região>` (preencher) |
| **Cloudflare R2** | backups do banco e espelho dos arquivos do Garage | cópias de todos os dados do banco e dos anexos | `<jurisdição/região do bucket>` (preencher) |
| **Resend** | envio de e-mails transacionais (convites, recuperação de senha, verificação) e e-mails de alerta do Uptime Kuma | e-mail e nome do destinatário, conteúdo do e-mail | `<região>` (confirmar; provável transferência internacional) |
| **GlitchTip** (self-hosted na mesma VPS) | erros da aplicação | **sem dados pessoais**: todo evento passa por `limparEvento` (`packages/shared/src/limpeza-erros.ts`), que remove cookies, `Authorization`, corpos, e-mails, CPF/CNPJ e telefones; só `tenant_id`, `user_id` e `request_id` (uuids) saem como tags | mesma VPS |
| **GitHub** | código-fonte, CI/CD e imagens | **só código**, nenhum dado de cliente | EUA |

Transferência internacional (art. 33): Cloudflare, Resend e GitHub podem tratar dados fora do Brasil. Definir o mecanismo (cláusulas-padrão, adequação) com o advogado.

## 5. Retenção e exclusão

| Dado | Regra atual | A definir |
|---|---|---|
| Registros de negócio | **Soft delete**: `excluido_em` preenchido, o registro some das telas, mas **continua no banco** | **Prazo de expurgo definitivo** (por exemplo, N dias após a exclusão) e a rotina que o executa |
| Usuários e sessões | permanecem enquanto a conta existir; sessões expiram | prazo após o encerramento da conta |
| Backups do banco (R2) | diários, às 3h, **30 cópias** (política do Coolify) | |
| Arquivos (Garage) e espelho no R2 | espelho diário; versões antigas, alteradas ou apagadas ficam em `garage-alterados/<data>/` por **90 dias** (regra de ciclo de vida do R2) | |
| Auditoria | partições mensais, com criação e manutenção por job mensal | **prazo de retenção** e descarte das partições antigas |
| Outbox | eventos processados ficam na tabela | prazo de limpeza dos processados |
| Filas no Valkey | jobs concluídos por 24 h, falhos por 14 dias | |
| Eventos do GlitchTip | **prazo padrão da instalação** `<dias>` (conferir) | |
| Logs da aplicação (Pino, no Coolify) | `<prazo>` (conferir a rotação do Docker) | |

> **Um dado excluído só some dos backups quando o backup expira.** Excluir um registro hoje (soft delete) não remove o dado do banco nem dos backups; o expurgo definitivo remove do banco, e as cópias antigas no R2 desaparecem em até 30 dias (banco) e 90 dias (versões de arquivos). Isso deve constar na política pública e no DPA. Nunca restaurar um backup antigo sem reaplicar as exclusões feitas depois dele.

## 6. Direitos dos titulares (art. 18)

Canal de atendimento: `<e-mail do encarregado/atendimento>` (definir). Prazo de resposta: conforme a regulamentação vigente (**confirmar** com o advogado). Confirmar a identidade do solicitante antes de entregar ou apagar dados.

| Direito | Dados da **conta** (Leadtogo controlador) | Dados dos **contatos do tenant** (empresa cliente controladora) |
|---|---|---|
| **Confirmação e acesso** | o Leadtogo localiza o usuário e entrega cópia (consulta ao banco por `auth.user` e `membros`) | encaminhar à empresa cliente; o Leadtogo apoia com a exportação (pendência da seção 9) |
| **Correção** | o próprio usuário edita no perfil; se não puder, o Leadtogo corrige | a empresa cliente corrige no sistema |
| **Exclusão / anonimização** | desativar o membro e anonimizar ou apagar o usuário (hoje depende de procedimento manual; ver seção 9) | a empresa cliente exclui o contato; o expurgo definitivo depende da rotina da seção 9 |
| **Portabilidade** | exportação em formato estruturado (JSON/CSV) | a empresa cliente exporta; o Leadtogo oferece a exportação por tenant |
| **Informação sobre compartilhamento** | lista de suboperadores (seção 4) | idem, via empresa cliente |
| **Revogação de consentimento / oposição** | n/a (base contratual) | o contato é marcado com `aceita_email=false` e `aceita_whatsapp=false`; a empresa cliente deixa de contatar |

Quando um titular escrever ao Leadtogo sobre dados de um tenant, o Leadtogo **repassa à empresa cliente** em prazo curto e avisa o titular de que fez isso.

## 7. Segurança (art. 46)

| Medida | Como está |
|---|---|
| Isolamento entre empresas | **RLS habilitado e forçado** em toda tabela de negócio, com teste de isolamento (o tenant A não lê nem grava dados do B) |
| Autenticação | senha em hash scrypt; **2FA obrigatório** para administradores (`dois_fatores_exigido`); segredos do 2FA tratados pelo Better Auth (**confirmar** que ficam cifrados em repouso) |
| Criptografia em trânsito | HTTPS com **HSTS** (1 ano, `includeSubDomains`) no web e na API; cookies de sessão HttpOnly, Secure e SameSite |
| Tokens de integrações | os tokens das contas conectadas (Google, Microsoft, WhatsApp; fases futuras) serão gravados **criptografados** |
| Backups | diários e **externos à VPS** (R2), com restauração testada em 09/10/2026 |
| Mínimo privilégio | usuário do banco da aplicação sem DDL; `auditoria` só com INSERT e SELECT; chave do Garage para backup **só de leitura**; papéis admin, gestor e vendedor e regra de carteira |
| Contra abuso | **rate limit** no login (3 tentativas por 10 s), no 2FA e nos e-mails; limite geral da API |
| Rastreabilidade | logs estruturados com `request_id`, `tenant_id` e `user_id`; auditoria de alterações |
| Observabilidade sem dados pessoais | `limparEvento` no GlitchTip (seção 4) |
| Infraestrutura | só as portas 22, 80 e 443 abertas; banco, Valkey e Garage sem porta pública; SSH só por chave; cabeçalhos de segurança (CSP, `X-Frame-Options`) |
| Entrega | CI com testes, `pnpm audit` sem alto/crítico, migrações aditivas |

## 8. Incidentes de segurança (art. 48)

**Procedimento interno (rascunho):**

1. **Detectar e conter**: alerta do Uptime Kuma, GlitchTip, aviso de usuário ou de provedor. Isolar o que for necessário (revogar chaves e sessões, tirar o serviço do ar se preciso).
2. **Registrar** em arquivo de incidente: data e hora, quem detectou, sistemas e tenants afetados, tipos de dados, quantidade aproximada de titulares, causa provável e medidas.
3. **Avaliar o risco ou dano relevante** aos titulares (dados envolvidos, volume, possibilidade de uso indevido).
4. **Comunicar**: se houver risco ou dano relevante, comunicar a **ANPD** e os **titulares** no prazo da regulamentação vigente `<referência: Resolução CD/ANPD nº 15/2024, prazo de 3 dias úteis — o Ale confirma a norma e o prazo atuais>`. Quando o dado for de tenant (o Leadtogo é operador), **avisar a empresa cliente sem demora**, para que ela cumpra as suas obrigações como controladora.
5. **Corrigir e aprender**: corrigir a causa, restaurar se necessário (`runbook_backup.md`) e registrar as lições.

## 9. Pendências para o MVP

- [ ] **Rotina de expurgo** dos registros com `excluido_em` (prazo a definir) e das partições antigas da auditoria.
- [ ] **Exportação de dados por tenant** (atende portabilidade, acesso e saída do cliente).
- [ ] **Anonimização/exclusão de usuário** (procedimento ou rotina), preservando a integridade da auditoria.
- [ ] **DPA** (termo de tratamento de dados) com as empresas clientes.
- [ ] **Política de privacidade pública** e termos de uso (com a orientação de não registrar dados sensíveis).
- [ ] **Nomeação do encarregado (DPO)** e canal de contato público.
- [ ] Preencher as lacunas `<…>` deste documento (regiões, prazos do GlitchTip e dos logs) e confirmar os itens marcados.
- [ ] Definir o mecanismo de **transferência internacional** (Cloudflare, Resend, GitHub).
- [ ] Prazo de limpeza do **outbox** processado e retenção da **auditoria**.
