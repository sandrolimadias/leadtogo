# Runbook de backup e restauração

Referências: `plano_implantacao.md` (4.4 e E15) e `runbook_e13.md`. Restauração testada em **09/10/2026**.

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

Fazer do WSL (ou de qualquer máquina com Docker). Nada de arquivo de configuração do rclone: as credenciais entram por variável de ambiente e morrem com o container.

### 2.1 Baixar o backup com rclone

```bash
mkdir -p ~/restore-teste && cd ~/restore-teste

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID='<access key do R2>'
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY='<secret do R2>'
export RCLONE_CONFIG_R2_ENDPOINT='https://<account-id>.r2.cloudflarestorage.com'
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# listar e escolher o arquivo mais recente do banco desejado
docker run --rm \
  -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  rclone/rclone lsf -R r2:vps-backup

# baixar
docker run --rm -v "$PWD:/dados" \
  -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  rclone/rclone copy "r2:vps-backup/<caminho/do/arquivo>" /dados
```

**Lição: `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true` é obrigatória.** Sem ela, o rclone tenta verificar/criar o bucket antes de copiar, e uma chave do R2 sem permissão de administração do bucket falha com erro de acesso negado (típico `403 AccessDenied`), mesmo com a leitura liberada. Com a variável, o rclone vai direto aos objetos. Vale para qualquer comando rclone contra o R2, inclusive o futuro espelhamento do Garage (seção 4).

(`<...>` são valores a preencher; as chaves do R2 ficam no gerenciador de senhas, nunca no repositório.)

### 2.2 Restaurar num Postgres descartável

Mesma imagem da produção, para a versão e o PostGIS baterem:

```bash
docker run -d --name pg-restore-teste -e POSTGRES_PASSWORD=teste imresamu/postgis:17-3.5
# aguardar subir: docker exec pg-restore-teste pg_isready -U postgres

docker exec pg-restore-teste createdb -U postgres leadtogo
docker cp ./<arquivo-baixado> pg-restore-teste:/tmp/backup.dmp

# formato custom (.dmp) do Coolify; se vier .sql, usar psql -f no lugar
docker exec pg-restore-teste pg_restore -U postgres -d leadtogo --no-owner /tmp/backup.dmp
```

### 2.3 Conferir as contagens

Em 09/10/2026 o resultado esperado era **`1332|5571|1|1`**. Rodar as mesmas contagens usadas naquele teste e comparar com o esperado (se o banco já tiver mais dados, o esperado muda: registrar o novo valor aqui ao refazer o teste).

```bash
docker exec pg-restore-teste psql -U postgres -d leadtogo -At -c "<consulta de contagens>"
```

### 2.4 Limpar

```bash
docker rm -f pg-restore-teste
rm -rf ~/restore-teste
unset RCLONE_CONFIG_R2_NO_CHECK_BUCKET RCLONE_CONFIG_R2_TYPE RCLONE_CONFIG_R2_PROVIDER RCLONE_CONFIG_R2_ACCESS_KEY_ID \
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY RCLONE_CONFIG_R2_ENDPOINT
```

O backup baixado contém dados reais: não deixe cópia no computador.

## 3. Restauração em produção (desastre)

Só com decisão do Ale. Antes de começar, avisar os usuários: o sistema ficará fora do ar.

1. **Parar quem escreve no banco:** no Coolify, parar `api` e `worker` (o `web` pode ficar).
2. **Preservar o estado atual**, se o banco ainda responder: gerar um backup manual (*Backups → Execute now*) ou `pg_dump` antes de qualquer coisa.
3. **Baixar o backup escolhido** como em 2.1 (o mais recente, ou o último anterior ao problema).
4. **Validar antes** no container descartável (2.2 e 2.3). Só siga se as contagens fizerem sentido.
5. **Restaurar:**
   - banco íntegro, só dados ruins: criar um banco novo (`leadtogo_novo`), restaurar nele, trocar os nomes (`ALTER DATABASE ... RENAME`) com as conexões encerradas;
   - VPS/banco perdido: recriar o recurso `leadtogo-db` (`imresamu/postgis:17-3.5`, sem porta pública), criar o banco `leadtogo` e restaurar com `pg_restore`.
6. **Papéis:** conferir `leadtogo_owner` e `leadtogo_app` (sem `BYPASSRLS`, `leadtogo_app` não dono das tabelas) e as permissões. `pg_restore --no-owner` não recria o dono; reaplicar os `GRANT`/`OWNER TO` do script de papéis.
7. **Migrações:** o pre-deploy da `api` aplica as pendentes; as já aplicadas ficam registradas no banco restaurado (nunca editar migração aplicada).
8. **Subir `api` e `worker`**, conferir `/health`, fazer login e abrir uma empresa.
9. **Registrar** o incidente (data, causa, backup usado, dados perdidos entre o backup e a falha) e refazer um backup manual.

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
