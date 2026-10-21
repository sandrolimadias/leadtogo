# Mapa base público: bucket, domínio e upload (passo a passo do Ale)

> **Por quê:** o mapa base (PMTiles do ES) é dado público (OpenStreetMap). Servi-lo pela API fez o navegador abrir dezenas de pedidos de faixa por movimento do mapa; foi o que travou a API em 19/10/2026 (`runbook_observabilidade.md`, "Trava do mapa"). Agora o navegador lê o arquivo **direto do Garage**, por um domínio próprio, sem passar pela API. **Nada de dado de cliente nesse bucket.**
>
> **Como funciona:** bucket `leadtogo-mapa` com o modo *website* do Garage ligado (leitura anônima de objetos, **sem listagem**; a API S3 continua exigindo credencial). Domínio `mapa.crm.aledias.com.br` → porta **3902** do Garage. O arquivo tem nome versionado (`es-AAAAMMDD.pmtiles`, `Cache-Control: public, max-age=31536000, immutable`). A versão em uso vem da variável **`MAPA_BASE_URL`** da API (o app a recebe em `GET /v1/mapa/base`). CORS só para `https://crm.aledias.com.br`.
>
> Testado antes em um Garage v2.1.0 local (mesma versão da produção): `206` com `Content-Range`, `cache-control` imutável, CORS só para a origem do app (preflight com `Range` e `If-Match` ok), raiz e listagem `404`, S3 sem credencial `403`, outro bucket pelo domínio `404`.
>
> **Ordem importante:** faça o deploy deste push **antes** do passo 9 (a CSP nova libera `connect-src https://mapa.crm.aledias.com.br`). Enquanto `MAPA_BASE_URL` estiver vazia, o app segue lendo pela API como hoje: nada quebra no meio do caminho.

## 1. DNS
Crie o registro `mapa.crm.aledias.com.br` igual ao de `files.crm.aledias.com.br` (mesmo destino e mesmo modo de proxy). Espere resolver: `dig +short mapa.crm.aledias.com.br`.

## 2. Garage: ligar o servidor *website* (porta 3902)
No Coolify, recurso `leadtogo-files`, ache onde está o `garage.toml` (em *Storages*/arquivo montado em `/etc/garage.toml`) e **acrescente** (sem mexer no resto):

```toml
[s3_web]
bind_addr = "0.0.0.0:3902"
root_domain = ".web.garage.invalid"
index = "index.html"
```

(`root_domain` é só um valor exigido pelo Garage; o bucket é achado pelo alias `mapa.crm.aledias.com.br`, abaixo.) Reinicie o `leadtogo-files` (*Restart*). Confira no *Terminal* do container: `/garage status` mostra o nó `HEALTHY`.

## 3. Coolify: domínio na porta 3902
No `leadtogo-files`, no campo de domínios do serviço do Garage, **mantenha** o atual e **acrescente** o novo, separados por vírgula, cada um com a sua porta:

```
https://files.crm.aledias.com.br:3900,https://mapa.crm.aledias.com.br:3902
```

*Save* e *Redeploy*/*Restart*. O Traefik emite o certificado do novo domínio sozinho. (Se a sua versão do Coolify tiver um campo por porta, o resultado é o mesmo: `files` → 3900 e `mapa` → 3902.)

## 4. Garage: bucket, alias, chaves (Terminal do container `leadtogo-files`)
```bash
/garage bucket create leadtogo-mapa
/garage bucket alias leadtogo-mapa mapa.crm.aledias.com.br
/garage bucket website --allow leadtogo-mapa

# chave só de ESCRITA, para o upload (não lê, não lista, não administra)
/garage key create mapa-escrita
/garage bucket allow --write leadtogo-mapa --key mapa-escrita

# chave TEMPORÁRIA com dono, só para pôr o CORS (o garage não tem comando de CORS); apague no passo 6
/garage key create mapa-admin
/garage bucket allow --read --write --owner leadtogo-mapa --key mapa-admin
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
s3() { docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \\
  -v "$PWD":/d amazon/aws-cli --endpoint-url https://files.crm.aledias.com.br "$@"; }
s3 s3 cp /d/es.pmtiles "s3://leadtogo-mapa/$VERSAO" \\
  --cache-control "public, max-age=31536000, immutable" --content-type application/octet-stream
```
Na tela: a barra de progresso e `upload: ... to s3://leadtogo-mapa/es-AAAAMMDD.pmtiles`. (Se o `aws-cli` falhar com `signed header content-length is not present`, é o mesmo desvio da carga do CNEFE: use `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` e `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required` nas variáveis do `docker run`.)

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
Depois, no Terminal do container: `/garage key delete --yes mapa-admin`.

## 7. Conferir de fora (no WSL)
```bash
U=https://mapa.crm.aledias.com.br/$VERSAO
curl -sI -H 'Range: bytes=0-126' -H 'Origin: https://crm.aledias.com.br' "$U"
curl -s -o /dev/null -w 'raiz: %{http_code}\\n' https://mapa.crm.aledias.com.br/
curl -s -o /dev/null -w 'S3 sem chave: %{http_code}\\n' https://files.crm.aledias.com.br/leadtogo-mapa/$VERSAO
```
Esperado: `HTTP/2 206`, `content-range: bytes 0-126/<tamanho>`, `cache-control: public, max-age=31536000, immutable`, `access-control-allow-origin: https://crm.aledias.com.br`; raiz `404`; S3 sem chave `403`. Se o certificado do `mapa` ainda não saiu, espere 1 a 2 minutos.

## 8. Variável na API (Coolify, recurso `leadtogo-api`)
`MAPA_BASE_URL=https://mapa.crm.aledias.com.br/es-AAAAMMDD.pmtiles` (o mesmo nome do passo 5). *Restart* da API (não precisa de build). Nenhuma variável nova no web nem no worker.

## 9. Testar no navegador e me avisar
Abra **Mapa** (e **Ajustar posição** de uma empresa). Com o F12 → *Network*, filtre por `pmtiles`: os pedidos agora vão para `mapa.crm.aledias.com.br` (status 206), **nenhum** para `/v1/mapa/base.pmtiles`; o console sem erro de CSP ou CORS. Arraste e dê zoom à vontade. **Me diga "o mapa abriu pela URL nova"**: só então eu desligo o `/v1/mapa/base.pmtiles` (e o removo depois).

## Trocar a versão do mapa depois
Suba o arquivo novo com outro nome (`es-AAAAMMDD.pmtiles`, passo 5), confira (passo 7) e troque só a `MAPA_BASE_URL` (passo 8). O arquivo antigo pode ficar (imutável, sem custo relevante) ou ser apagado depois que ninguém mais usa; o app aberto em outra aba continua com a URL antiga até recarregar.

## O que NÃO fazer
- Não ponha nada além do mapa neste bucket (ele é legível por qualquer pessoa que souber o nome do arquivo).
- Não use a chave `leadtogo-app` neste bucket: ela é do bucket privado.
- O bucket `leadtogo-mapa` não precisa de backup (dado público e regenerável); o espelho do `rclone` não o inclui.
