# Runbook de backup e restauração

Referências: `plano_implantacao.md` (4.4 e E15) e `runbook_e13.md`. Restauração testada em **12/10/2026** (seção 2).

## 1. Backups em funcionamento

| Item | Valor |
|---|---|
| Quem faz | Coolify (backup agendado de cada banco) |
| Destino | Cloudflare R2, bucket `vps-backup`, storage `r2-backups` (cadastrado no Coolify) |
| Frequência | diária, às **3h** |
| Retenção | **30 cópias** no R2 |
| Abrangência | todos os bancos da VPS (`leadtogo`, n8n, Evolution etc.) |

Conferência rotineira: no Coolify, abrir o banco → *Backups* → ver a última execução com sucesso; no R2, ver se há arquivo novo no bucket `vps-backup`.

## 2. Teste de restauração (descartável, sem tocar na produção)

Feito **na VPS**, como `root`, com o `/root/backup-garage.env` (credenciais do R2 por `--env-file`; nada de arquivo de configuração do rclone). Testado em **12/10/2026**: restaurado em container limpo, resultado idêntico à produção (15 migrações, 2 tenants, 3 membros). O procedimento anterior (formato custom + `pg_restore`) estava **errado**.

### 2.0 O que é o arquivo do Coolify

- É um **`pg_dumpall` em SQL compactado** (`pg-dump-all-<epoch>-<id>.gz`), com **todos os bancos do servidor** (`postgres` e `leadtogo`) e os **papéis, com hash de senha**.
- **Não** é formato custom: `pg_restore` não lê. Restaura-se com `gunzip | psql`.
- Local no R2: `r2:vps-backup/data/coolify/backups/databases/root-team-0/postgresql-leadtogo-orq8miun4hoaqnvwbntlxzwt/`.
- O bucket tem backups de **outros bancos** (como o do GlitchTip): identifique o arquivo pelo **caminho do recurso + data**, nunca pelo último nome de uma lista ordenada.

### 2.1 Listar e baixar

```bash
# lsl já é recursivo: não usar -R
docker run --rm --env-file /root/backup-garage.env rclone/rclone:latest lsl r2:vps-backup/data \
  | grep orq8miun4hoaqnvwbntlxzwt | sort -k2,3 | tail -n 3

mkdir -p /root/restore-teste
docker run --rm --env-file /root/backup-garage.env -v /root/restore-teste:/dados rclone/rclone:latest \
  copyto "r2:vps-backup/data/coolify/backups/databases/root-team-0/postgresql-leadtogo-orq8miun4hoaqnvwbntlxzwt/<arquivo>.gz" \
  /dados/backup.sql.gz
```

`RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true` (já no `.env`) é obrigatória: sem ela o rclone tenta verificar/criar o bucket e uma chave sem permissão de administração falha com `403 AccessDenied`. Detalhes das credenciais: seção 4.4.

### 2.2 Restaurar num servidor LIMPO

**Não crie papéis nem banco antes:** o dump os cria. Mesma imagem da produção, para a versão e o PostGIS baterem:

```bash
docker run -d --name restore-teste -e POSTGRES_PASSWORD=teste \
  -v /root/restore-teste:/backup imresamu/postgis:17-3.5
# aguardar: docker exec restore-teste pg_isready -U postgres

docker exec restore-teste sh -c 'gunzip -c /backup/backup.sql.gz | psql -U postgres -q -d postgres'
```

Avisos `already exists` (papel `postgres`) são normais.

### 2.3 Conferir contra a produção

Rode a mesma consulta nos dois lados (restauração: `docker exec restore-teste psql -U postgres -d leadtogo -At -c ...`; produção: `runbook_e13.md`, seção 4.6) e compare:

```sql
SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations), (SELECT count(*) FROM tenants), (SELECT count(*) FROM membros);
```

Em 12/10/2026: **15 migrações, 2 tenants, 3 membros**, igual à produção. Se houve dados novos desde o backup, o esperado muda: compare com o que a produção tinha às 3h e registre o novo valor aqui ao refazer o teste.

### 2.4 Limpar (sempre)

```bash
docker rm -f restore-teste && rm -rf /root/restore-teste
```

O arquivo e o container contêm **dados pessoais e hashes de senha**: não deixe cópia em lugar nenhum.

### 2.5 Segurança do bucket

O `vps-backup` contém **hashes de senha dos papéis**: mantenha-o **privado** e use token do R2 com **escopo mínimo** (só o bucket; leitura quando só for restaurar).

## 3. Restauração em produção (emergência)

**Procedimento de emergência:** só com decisão do Ale, e avisando os usuários antes (o sistema fica fora do ar). Rode antes o teste da seção 2 com o mesmo arquivo: só siga se as contagens fizerem sentido.

1. **Antes de tudo, "Backup Now"** do estado atual no Coolify (*Backups → Execute now*), **mesmo corrompido**, para poder voltar atrás. Só depois mexa em qualquer coisa.
2. **Baixar o backup escolhido** (2.1) e **validá-lo** num container limpo (2.2 e 2.3).
3. **Restaurar num banco NOVO** do servidor de produção, `leadtogo_restaurado` (o `leadtogo` atual não é tocado). O dump é de **todos os bancos** e os papéis já existem em produção; por isso, a partir do container de teste, gere só o banco: `pg_dump -Fc leadtogo` lá e `pg_restore` aqui:
   ```bash
   createdb -U postgres leadtogo_restaurado
   pg_restore -U postgres -d leadtogo_restaurado <arquivo.dump>      # SEM --no-owner e SEM --no-acl
   ```
   **Nunca use `--no-owner` nem `--no-acl`:** as funções `SECURITY DEFINER` e as políticas de RLS dependem do dono (`leadtogo_owner`) e dos `GRANT` para `leadtogo_app`. Sem eles a aplicação sobe, mas falha ou **perde o isolamento entre empresas**.
4. **Conferir as contagens** em `leadtogo_restaurado` (consulta da seção 2.3) e os papéis: `leadtogo_owner` e `leadtogo_app` (sem `BYPASSRLS`, `leadtogo_app` não dono das tabelas).
5. **Trocar os nomes**, só agora, com `api` e `worker` **parados** no Coolify (o `web` pode ficar) e sem conexões no banco:
   ```sql
   ALTER DATABASE leadtogo RENAME TO leadtogo_antigo;
   ALTER DATABASE leadtogo_restaurado RENAME TO leadtogo;
   ```
   **Mantenha o `leadtogo_antigo`** até confirmar que está tudo bem; só depois apague.
6. **Migrações:** a `api` aplica as pendentes **ao iniciar** (`node dist/iniciar.js`); as já aplicadas ficam registradas no banco restaurado (nunca editar migração aplicada).
7. **Subir `api` e `worker`** e conferir: `/health`; login; **isolamento** (um usuário da empresa A não vê a empresa B).
8. **Registrar** o incidente (data, causa, backup usado, dados perdidos entre o backup e a falha) e fazer um backup manual.

Se o banco/VPS foi **perdido**: recrie o recurso `leadtogo-db` (`imresamu/postgis:17-3.5`, sem porta pública) e restaure o dump inteiro como em 2.2 (servidor limpo: o dump recria os papéis); depois, passos 6 a 8.

> **Pendência antes do primeiro cliente:** esse procedimento **ainda não foi testado de ponta a ponta**. Ensaiar completo num container descartável (com os papéis e a aplicação apontando para ele): restaurar em banco novo, trocar os nomes, subir a API e conferir login e isolamento.

Perda máxima esperada (RPO): até 24h, pois o backup é diário às 3h.

## 4. Espelho dos arquivos do Garage

O bucket `leadtogo-arquivos` do Garage é espelhado no R2 por `rclone sync` (container `rclone/rclone`, credenciais em `/root/backup-garage.env`), pelo script `/root/backup-garage.sh` da VPS. O destino é `r2:vps-backup/garage/leadtogo-arquivos`; o que for alterado ou apagado na origem vai para `r2:vps-backup/garage-alterados/<data>` (`--backup-dir`). O log é `/var/log/backup-garage.log`, com o código de saída de cada execução.

### 4.1 Aviso ao Uptime Kuma (monitor Push)

O script avisa o Uptime Kuma pelo monitor do tipo **Push** "Espelho Garage → R2" (ver `runbook_observabilidade.md`, seção 3):

- `status=up&msg=OK` quando o `rclone` termina com código 0;
- `status=down&msg=falhou-codigo-N` quando falha. A falha gera e-mail **na hora**, sem esperar o prazo do monitor.

Configuração do monitor: *Heartbeat Interval* **86400 s**, *Retries* **1**, *Heartbeat Retry Interval* **3600 s**. Sem aviso por cerca de **25 h**, o monitor dispara o alerta (cobre o timer que não rodou ou a VPS desligada).

A Push URL fica em `/root/backup-garage.push` (`chmod 600`), **fora do script**, porque funciona como segredo: nunca vai para o repositório, log ou chat. O script remove a query string da URL e monta a sua própria. Se o push falhar, o log registra `aviso: push ao Uptime Kuma falhou`, mas o código de saída continua sendo o do `rclone`.

Para trocar a Push URL (a digitação não aparece na tela nem no histórico do shell):

```bash
read -rsp "Push URL: " U; printf '%s\n' "$U" > /root/backup-garage.push; chmod 600 /root/backup-garage.push; unset U
```

### 4.2 Script atual (`/root/backup-garage.sh`)

```sh
#!/bin/sh
DATA=$(date +%Y-%m-%d)
LOG=/var/log/backup-garage.log
PUSH=$(cat /root/backup-garage.push 2>/dev/null)
PUSH=${PUSH%%\?*}
echo "=== $(date '+%F %T') ===" >> "$LOG"
docker run --rm --env-file /root/backup-garage.env rclone/rclone:latest \
  sync garage:leadtogo-arquivos r2:vps-backup/garage/leadtogo-arquivos \
  --backup-dir "r2:vps-backup/garage-alterados/$DATA" \
  --fast-list --stats-one-line -v >> "$LOG" 2>&1
RC=$?
echo "codigo de saida: $RC" >> "$LOG"
if [ -n "$PUSH" ]; then
  if [ "$RC" -eq 0 ]; then ST=up; MSG=OK; else ST=down; MSG="falhou-codigo-$RC"; fi
  curl -fsS -m 10 "$PUSH?status=$ST&msg=$MSG" >/dev/null 2>&1 || echo "aviso: push ao Uptime Kuma falhou" >> "$LOG"
fi
exit $RC
```

### 4.3 Agendamento (timer do systemd)

A imagem Ubuntu da Oracle não tem cron; o agendamento é um timer do systemd. O horário da VPS é `America/Sao_Paulo` (-03).

`/etc/systemd/system/backup-garage.service`:

```ini
[Unit]
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/root/backup-garage.sh
```

`/etc/systemd/system/backup-garage.timer`:

```ini
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target
```

Operação:

```bash
systemctl list-timers | grep backup-garage     # próxima execução
systemctl start backup-garage.service          # rodar agora
systemctl status backup-garage.service         # resultado da última execução
tail /var/log/backup-garage.log
```

### 4.4 Credenciais

- **`/root/backup-garage.env`** (`chmod 600`), lido pelo `--env-file` do Docker. **Sem aspas nos valores**: o `--env-file` mantém as aspas como parte do valor.
  - `RCLONE_CONFIG_GARAGE_*`: `type` s3, `provider` Other, `endpoint` `https://files.crm.aledias.com.br`, `region` `garage`, `force_path_style` ligado, mais a chave de acesso e o segredo.
  - `RCLONE_CONFIG_R2_*`: `provider` Cloudflare, `endpoint` da conta **sem o nome do bucket no final**, chave de acesso, segredo e `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true`.
- **Garage:** chave dedicada **`backup-leitura`**, só com permissão de leitura (R) no bucket `leadtogo-arquivos`. Não reutilizar a `leadtogo-app`. Para recriar:

  ```bash
  garage key create backup-leitura
  garage bucket allow --read leadtogo-arquivos --key backup-leitura
  ```

  Cuidado: dois `key create` com o mesmo nome criam **duas chaves** (erro "2 matching keys" depois).
- **R2:** bucket `vps-backup` (singular). Regra de ciclo de vida **`limpar-garage-alterados`**: prefixo `garage-alterados/`, apagar após **90 dias**. A regra padrão "Default Multipart Abort Rule" fica intacta. **Nunca criar regra de exclusão sem prefixo**: ela apagaria os backups do banco em `data/`.
- Chaves de acesso, segredos e o ID da conta ficam só na VPS e no gerenciador de segredos, nunca no repositório.

### 4.5 Erros comuns do rclone

| Mensagem | Causa |
|---|---|
| `is a file not a directory` | endpoint inválido |
| `No such key` | Key ID errado |
| `Operation is not allowed for this key` | chave sem permissão no bucket |
| `Invalid signature` | segredo errado, ou com aspas/espaços no `.env` |
| `CreateBucket AccessDenied` | falta `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true` (o token do R2 não cria buckets, o que é correto) |

### 4.6 Restauração dos arquivos

Use `rclone copy r2:vps-backup/garage/leadtogo-arquivos` para o Garage, com **temporariamente** uma chave com permissão de escrita (a `backup-leitura` não grava; remova a permissão extra depois). Versões antigas de arquivos alterados ou apagados ficam em `garage-alterados/<data>/`.

### 4.7 Pendência

Teste real de restauração dos arquivos, pendente até existirem arquivos no bucket.

## 5. Schema `referencia_geo` (CNEFE) dentro do backup

A tabela do CNEFE (`referencia_geo.cnefe_enderecos`, ~2,2 milhões de linhas) **fica no banco principal e entra no backup**: o `pg_dumpall` do Coolify (seção 2.0) a leva junto, sem nenhuma mudança na configuração. Decisão do Ale em 16/10/2026 (caminho A; as alternativas, banco separado sem backup e script de backup próprio, ficaram descartadas por ora).

- **Restauração:** o CNEFE volta junto; **não precisa recarregar** (`docs/geo_atualizacao.md`, seção 1). O script de carga só serve para atualizar (novo Censo) ou se o schema estiver vazio.
- **Custo estimado (a medir):** ~200 MB de SQL, cerca de 40 a 60 MB compactado por cópia, ~1,2 a 1,8 GB no R2 com as 30 cópias. **Na primeira carga em produção** registrar o tamanho do schema, o tamanho do dump compactado antes e depois e o tempo de restauração. **Se o dump compactado crescer mais de 150 MB, parar e avisar o Ale** para reavaliar o caminho B (banco separado sem backup).
- A migração 0026 só cria o schema e as tabelas **vazias**; a carga em produção é manual e só com o "pode carregar" do Ale, fora do horário de uso.
