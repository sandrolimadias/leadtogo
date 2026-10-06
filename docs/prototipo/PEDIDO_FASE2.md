# Pedido ao Claude Design — 2ª rodada de telas

Cole o texto abaixo no **mesmo projeto do Claude Design** em que as 7 telas foram feitas, para manter o shell, os componentes e os dados de exemplo.

---

> Continue o protótipo do **Leadtogo** com o mesmo shell (menu lateral recolhível, barra superior, seletor de empresa, temas claro/escuro, versões desktop 1440px e celular 390px), o mesmo design system e os mesmos dados de exemplo. Siga `funcionalidades.md` e `modelagem_banco.md`. Crie as telas abaixo e, no fim, atualize o pacote de passagem para o Claude Code, com o README descrevendo cada tela nova no mesmo nível de detalhe das anteriores.
>
> **1. Contatos — lista e ficha**
> - Lista: busca (nome, telefone, e-mail), filtros (empresa, cargo, papel na decisão, tags da empresa), colunas Contato · Empresas (um contato pode estar em várias) · Cargo · Telefone/WhatsApp · E-mail · Última interação. No celular, cards com Ligar, WhatsApp e E-mail.
> - Ficha: dados da pessoa (telefones e e-mails múltiplos, papel na decisão, aniversário, LinkedIn, consentimento LGPD com data e origem), **empresas vinculadas** (cargo por empresa, principal, ativo/inativo), atividades e oportunidades em que participa. Ações: Vincular a outra empresa, Nova atividade.
>
> **2. Registrar atividade — bloco "Mais opções"**
> - Na tela existente, acrescente um bloco recolhido "Mais opções" com: **Oportunidade** (só as ativas da empresa escolhida), **Lembrete** (um ou mais: "1 dia antes", "1 hora antes", "na hora", personalizado; canal app/push/e-mail) e **Repetir** (não repete, diária, semanal com dias, mensal, personalizada; até data ou nº de vezes).
>
> **3. Importar planilha (empresas e contatos)**
> - Passos: enviar arquivo (Excel/CSV) → mapear colunas → prévia com erros e **duplicados** (CNPJ, nome parecido, telefone) e escolha de ação (pular, atualizar, criar) → definir vendedor, vertical e Status → importar → relatório final.
>
> **4. Prospecção (Minha Receita)**
> - Busca por CNAE (principal ou secundário, com busca por descrição), UF, município e natureza jurídica, com "Somente ativas" ligado. Lista de resultados com "**Já está no CRM**" (link para a ficha), seleção em massa, e importação como Lead (vendedor, vertical, tag). Buscas salvas e "Repetir busca" mostrando só as novas. A busca roda em segundo plano, com progresso.
>
> **5. Configurações** (menu próprio, por papel)
> - **Empresa (tenant):** dados da empresa usuária (com Consultar CNPJ) e logo.
> - **Usuários e equipe:** lista de membros (papel admin/gestor/vendedor, gestor, ativo, com/sem acesso), convite por e-mail, **transferência de carteira**.
> - **Tags:** grupos (seleção única/múltipla, obrigatório) e tags com o seletor das 10 cores.
> - **Funis e fases:** funis, fases arrastáveis, cor, probabilidade padrão, dias para alerta de parada.
> - **Tipos de atividade:** ícone, cor, "conta como" visita/contato/nenhum.
> - **Listas:** origens, motivos (por status), soluções, verticais, papéis na decisão, faixas de funcionários e faturamento.
> - **Produtos e serviços:** catálogo com cobrança padrão (única/mensal/anual) e meses.
> - **Campos personalizados:** por entidade, tipo, obrigatório, filtrável.
> - **Quadro de tarefas modelo.**
> - **Preferências:** vendedores veem todas as empresas, dias para "sem contato", validade das tags de visitação, "ao conquistar, empresa vira Cliente".
>
> **6. Acesso e criação de conta**
> - Login (e-mail e senha, "Entrar com Google"), 2FA, recuperação de senha, aceite de convite.
> - Primeiro acesso: criar a conta e a primeira empresa (Consultar CNPJ preenche os dados), com os cadastros padrão já criados.
>
> **7. Painel consolidado** (administradores da conta)
> - Mesmo layout do Dashboard somando todas as empresas da conta, com filtro por empresa e uma tabela comparativa por empresa (pipeline, previsão, MRR, conversão, atividades da equipe). Somente leitura: clicar abre a empresa correspondente.

---

**Depois:** salve o novo pacote em `docs/prototipo/`, substituindo o anterior, e me avise para a revisão.
