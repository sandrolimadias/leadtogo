# Mapa base público: bucket, domínio e upload (passo a passo do Ale)

> **Por quê:** o mapa base (PMTiles do ES) é dado público (OpenStreetMap). Servi-lo pela API fez o navegador abrir dezenas de pedidos de faixa por movimento do mapa; foi o que travou a API em 19/10/2026 (`runbook_observabilidade.md`, "Trava do mapa"). Agora o navegador lê o arquivo **direto do Garage**, por um domínio próprio, sem passar pela API. **Nada de dado de cliente nesse bucket.**
>
> **Como funciona:** bucket `leadtogo-mapa` com o modo *website* do Garage ligado (leitura anônima de objetos, **sem listagem**; a API S3 continua exigindo credencial). Domínio `mapa.crm.aledias.com.br` → porta **3902** do Garage. O arquivo tem nome versionado (`es-AAAAMMDD.pmtiles`, `Cache-Control: public, max-age=31536000, immutable`). A versão em uso vem da variável **`MAPA_BASE_URL`** da API (o app a recebe em `GET /v1/mapa/base`). CORS só para `https://crm.aledias.com.br`.
>
> Testado antes em um Garage v2.1.0 local (mesma versão da produção): `206` com `Content-Range`, `cache-control` imutável, CORS só para a origem do app (preflight com `Range` e `If-Match` ok), raiz e listagem `404`, S3 sem credencial `403`, outro bucket pelo domínio `404`.
>
> **Estado (22/10/2026):** executado em produção e confirmado pelo Ale: o mapa abre por `https://mapa.crm.aledias.com.br/es-20261021.pmtiles` (206, CORS só do app, `Cache-Control` imutável, nenhum pedido a `/v1/mapa/base.pmtiles`, arrastar e zoom por minutos sem problema). O endpoint antigo `/v1/mapa/base.pmtiles` e o fallback pela API **foram removidos**; `MAPA_BASE_URL` agora é **obrigatória em produção** (a API não sobe sem ela).
>
> **O que foi diferente na execução real** (os passos 2, 3 e 4 abaixo já estão corrigidos): (1) o Garage é um **serviço Compose** no Coolify (`Garage-leadtogo-files`) com as regras do Traefik escritas **à mão** no Compose; o domínio posto na tela *Domains* do Coolify **não é aplicado**; (2) o `garage.toml` é um arquivo **gerenciado pelo Coolify** (*Storages → Files*, conteúdo guardado no Coolify e regravado a cada deploy); (3) **não há terminal do container do Garage** no Coolify: os comandos `/garage` rodam pelo terminal do **servidor**, com `docker exec`; (4) os segredos do `garage.toml` (`rpc_secret` e `admin_token`) foram **trocados em 22/10/2026**.

## 1. DNS
Crie o registro `mapa.crm.aledias.com.br` igual ao de `files.crm.aledias.com.br` (mesmo destino e mesmo modo de proxy). Espere resolver: `dig +short mapa.crm.aledias.com.br`.

## 2. Garage: ligar o servidor *website* (porta 3902)
O `garage.toml` **não é um arquivo solto no disco**: o Coolify guarda o conteúdo (recurso `Garage-leadtogo-files` → *Storages* → *Files* → `garage.toml`) e **o regrava a cada deploy**. Editar só o arquivo no servidor não basta: a mudança some no próximo deploy. Edite **ali** e **acrescente** (sem mexer no resto):

```toml
[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.garage.invalid"
index = "index.html"
```

(`root_domain` é só um valor exigido pelo Garage; o bucket é achado pelo alias `mapa.crm.aledias.com.br`, abaixo. `[::]` escuta em IPv4 e IPv6, como o resto do arquivo.) *Save* e **redeploy** do recurso. Confira (passo 4, comando `status`): o nó aparece `HEALTHY`.

> Se for trocar os segredos do arquivo: `rpc_secret` e `admin_token` foram trocados em **22/10/2026**; nada do sistema usa o `admin_token` (o Leadtogo só fala com o Garage pela API S3 com a chave `leadtogo-app`).

## 3. Traefik: o domínio novo vai no Compose, não na tela *Domains*
O Garage é um **serviço Docker Compose** do Coolify, e as regras do Traefik estão **escritas à mão** nos `labels` do Compose (routers `garage-http` e `garage-https`, porta 3900). Por isso o domínio colocado na tela *Domains* do Coolify **não é aplicado**: o Coolify só injeta as regras dele quando o Compose não tem as suas. Edite o Compose do recurso e, nos `labels` do serviço do Garage, **acrescente** os dois routers do mapa e deixe explícito o serviço do router antigo:

```yaml
      # (já existentes: garage-http e garage-https; o service do router antigo passa a ser explícito)
      - traefik.http.routers.garage-http.service=garage
      # novos: o mapa público, porta 3902 do Garage
      - traefik.http.routers.garage-mapa-http.rule=Host(`mapa.crm.aledias.com.br`)
      - traefik.http.routers.garage-mapa-http.entrypoints=http
      - traefik.http.routers.garage-mapa-http.middlewares=redirect-to-https
      - traefik.http.routers.garage-mapa.rule=Host(`mapa.crm.aledias.com.br`)
      - traefik.http.routers.garage-mapa.entrypoints=https
      - traefik.http.routers.garage-mapa.tls=true
      - traefik.http.routers.garage-mapa.tls.certresolver=letsencrypt
      - traefik.http.routers.garage-mapa.service=garage-mapa
      - traefik.http.services.garage-mapa.loadbalancer.server.port=3902
```

(Copie o formato exato dos labels `garage-http` / `garage-https` que já estão no seu Compose — nomes de *entrypoints* e do *middleware* de redirecionamento — e troque só o `Host`, o nome do service e a porta.) *Save* e **redeploy**. O Traefik emite o certificado do novo domínio sozinho em 1 a 2 minutos.

## 4. Garage: bucket, alias, chaves (terminal do SERVIDOR, não do container)
O Coolify **não tem terminal do container do Garage**. Os comandos `/garage` rodam no terminal do servidor (o do Coolify), por `docker exec` (o nome do container é `garage-0tdmqt0xu2rbfs4wpygkmxwr`; confira com `docker ps --format '{{.Names}}' | grep garage`):

```bash
G="docker exec garage-0tdmqt0xu2rbfs4wpygkmxwr /garage"
$G status

$G bucket create leadtogo-mapa
$G bucket alias leadtogo-mapa mapa.crm.aledias.com.br
$G bucket website --allow leadtogo-mapa

# chave só de ESCRITA, para o upload (não lê, não lista, não administra)
$G key create mapa-escrita
$G bucket allow --write leadtogo-mapa --key mapa-escrita

# chave TEMPORÁRIA com dono, só para pôr o CORS (o garage não tem comando de CORS); apague no passo 6
$G key create mapa-admin
$G bucket allow --read --write --owner leadtogo-mapa --key mapa-admin
```
Cada `key create` mostra `Key ID` e `Secret key`: guarde no gerenciador de senhas (a do `mapa-escrita` fica; a do `mapa-admin` some no passo 6). **Um `key create` por nome** (dois criam duas chaves).

## 5. Upload pelo WSL (nome versionado)
Você já tem o `~/geo/es.pmtiles` (ou extraia de novo, `geo_atualizacao.md`, seção 3). Escolha a data (hoje) e renomeie na subida:

```bash
cd ~/geo
VERSAO=es-$(date +%Y%m%d).pmtiles ; echo "$VERSAO"
read -rsp 'AWS_ACCESS_KEY_ID (mapa-escrita): ' AWS_ACCESS_KEY_ID; echo
read -rsp 'AWS_SECRET_ACCESS_KEY: ' AWS_SECRET_ACCESS_KEY; echo
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=garage
# as duas variáveis *_CHECKSUM_* = when_required são o padrão: o aws-cli novo calcula checksums que o Garage não aceita
s3() { docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
  -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  -v "$PWD":/d amazon/aws-cli --endpoint-url https://files.crm.aledias.com.br "$@"; }
s3 s3 cp /d/es.pmtiles "s3://leadtogo-mapa/$VERSAO" \
  --cache-control "public, max-age=31536000, immutable" --content-type application/octet-stream
```
Na tela: a barra de progresso e `upload: ... to s3://leadtogo-mapa/es-AAAAMMDD.pmtiles`. (O `s3()` acima já leva `AWS_REQUEST_CHECKSUM_CALCULATION` e `AWS_RESPONSE_CHECKSUM_VALIDATION` como `when_required`; sem elas o `aws-cli` novo falha no Garage com `signed header content-length is not present`.)

## 6. CORS (só para o app) e apagar a chave temporária
```bash
cat > cors.json <<'EOF'
{"CORSRules":[{"AllowedOrigins":["https://crm.aledias.com.br"],"AllowedMethods":["GET","HEAD"],
 "AllowedHeaders":["*"],"ExposeHeaders":["Content-Range","Content-Length","ETag","Accept-Ranges"],
 "MaxAgeSeconds":86400}]}
EOF
read -rsp 'AWS_ACCESS_KEY_ID (mapa-admin): ' AWS_ACCESS_KEY_ID; echo
read -rsp 'AWS_SECRET_ACCESS_KEY: ' AWS_SECRET_ACCESS_KEY; echo
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
s3 s3api put-bucket-cors --bucket leadtogo-mapa --cors-configuration file:///d/cors.json
s3 s3api get-bucket-cors --bucket leadtogo-mapa
```
Depois, no terminal do servidor: `docker exec garage-0tdmqt0xu2rbfs4wpygkmxwr /garage key delete --yes mapa-admin`.

## 7. Conferir de fora (no WSL)
```bash
U=https://mapa.crm.aledias.com.br/$VERSAO
curl -sI -H 'Range: bytes=0-126' -H 'Origin: https://crm.aledias.com.br' "$U"
curl -s -o /dev/null -w 'raiz: %{http_code}\n' https://mapa.crm.aledias.com.br/
curl -s -o /dev/null -w 'S3 sem chave: %{http_code}\n' https://files.crm.aledias.com.br/leadtogo-mapa/$VERSAO
```
Esperado: `HTTP/2 206`, `content-range: bytes 0-126/<tamanho>`, `cache-control: public, max-age=31536000, immutable`, `access-control-allow-origin: https://crm.aledias.com.br`; raiz `404`; S3 sem chave `403`. Se o certificado do `mapa` ainda não saiu, espere 1 a 2 minutos.

## 8. Variável na API (Coolify, recurso `leadtogo-api`)
`MAPA_BASE_URL=https://mapa.crm.aledias.com.br/es-AAAAMMDD.pmtiles` (o mesmo nome do passo 5; em produção a API **não sobe** sem ela). *Restart* da API (não precisa de build). Nenhuma variável nova no web nem no worker.

## 9. Testar no navegador e me avisar
Abra **Mapa** (e **Ajustar posição** de uma empresa). Com o F12 → *Network*, filtre por `pmtiles`: os pedidos agora vão para `mapa.crm.aledias.com.br` (status 206), **nenhum** para `/v1/mapa/base.pmtiles`; o console sem erro de CSP ou CORS. Arraste e dê zoom à vontade. Feito em 21/10/2026 (`es-20261021.pmtiles`); com isso o `/v1/mapa/base.pmtiles` foi removido.

## Trocar a versão do mapa depois
Suba o arquivo novo com outro nome (`es-AAAAMMDD.pmtiles`, passo 5), confira (passo 7) e troque só a `MAPA_BASE_URL` (passo 8). O arquivo antigo pode ficar (imutável, sem custo relevante) ou ser apagado depois que ninguém mais usa; o app aberto em outra aba continua com a URL antiga até recarregar.

## O que NÃO fazer
- Não ponha nada além do mapa neste bucket (ele é legível por qualquer pessoa que souber o nome do arquivo).
- Não use a chave `leadtogo-app` neste bucket: ela é do bucket privado.
- O bucket `leadtogo-mapa` não precisa de backup (dado público e regenerável); o espelho do `rclone` não o inclui.
