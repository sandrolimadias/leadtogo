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

# listar e escolher o arquivo mais recente do banco desejado
docker run --rm \
  -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT \
  rclone/rclone lsf -R r2:vps-backup

# baixar
docker run --rm -v "$PWD:/dados" \
  -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT \
  rclone/rclone copy "r2:vps-backup/<caminho/do/arquivo>" /dados
```

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
unset RCLONE_CONFIG_R2_TYPE RCLONE_CONFIG_R2_PROVIDER RCLONE_CONFIG_R2_ACCESS_KEY_ID \
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

## 4. Pendência: arquivos do Garage

O bucket `leadtogo-arquivos` do Garage **ainda não é copiado** para fora da VPS. Hoje não há anexos, então não há o que perder. **Quando houver anexos:**

- espelhar o bucket no R2 com `rclone sync` (container `rclone/rclone`, credenciais por variável, como em 2.1), com origem no endpoint do Garage (`S3_ENDPOINT`, região `garage`, chave `leadtogo-app`) e destino num bucket/prefixo próprio do R2;
- agendar diariamente (cron do Coolify ou tarefa agendada) e acompanhar a execução;
- fazer um teste de restauração dos arquivos, como o do banco.
