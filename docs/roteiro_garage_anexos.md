# Roteiro: Garage para os anexos dos chamados (endereço público, CORS e CSP)

> Parte da implantação da Fase 2 (`roteiro_teste_chamados.md`, seção 0). Segue o mesmo procedimento do bucket do mapa (`roteiro_mapa_publico.md`), com uma diferença: **o bucket de arquivos já existe e é privado**. Aqui não se liga o modo *website* nem se cria alias: só se libera o **CORS** para o navegador enviar o arquivo direto ao Garage.
> **Por quê:** o anexo não passa pela API. A API só gera uma URL pré-assinada; o navegador faz `PUT` nela (envio) e abre outra URL com `GET` (download). O `PUT` é um pedido de outra origem (`files.crm.aledias.com.br` a partir de `crm.aledias.com.br`), então o Garage precisa de CORS e a CSP do web precisa permitir a conexão.

## 1. O que já está pronto (nada a fazer)
- **Endereço público:** `files.crm.aledias.com.br` já é a API S3 do Garage (Traefik, porta 3900, certificado válido). Confira: `curl -s -o /dev/null -w '%{http_code}\n' https://files.crm.aledias.com.br/` deve dar `403` (sem credencial).
- **Bucket:** o de arquivos (`S3_BUCKET`, normalmente `leadtogo-arquivos`) é privado e continua assim: ninguém lê sem a URL assinada, e a API só gera a de download para anexo **limpo**.
- **URL de envio:** a API a assina com `S3_PUBLIC_ENDPOINT`, sem checksum embutido (`X-Amz-Content-Sha256=UNSIGNED-PAYLOAD`), sem cabeçalho obrigatório além do que o navegador manda sozinho.

## 2. Variável na API e no worker
`S3_PUBLIC_ENDPOINT=https://files.crm.aledias.com.br` (sem barra no fim). O `S3_ENDPOINT` interno **não muda**. Sem esta variável a API assina com o endereço interno e o navegador não consegue enviar.

## 3. CSP do web (já corrigida no código)
`docker/web.Caddyfile`: o `connect-src` ganhou `https://files.crm.aledias.com.br`. Sem isso o navegador **bloqueia o `PUT`** antes de sair (erro de CSP no console), mesmo com o CORS certo. O download abre a URL assinada numa aba nova (navegação), que a CSP não restringe. A mudança vai na imagem do **web**: faça o deploy do web (o push na `main` já faz).

## 4. CORS do bucket de arquivos
O Garage não tem comando de CORS; ele aceita a chamada S3 `PutBucketCors` de uma chave que seja **dona** do bucket. Use uma chave temporária, como no mapa.

**4.1. No terminal do SERVIDOR** (o Coolify não tem terminal do container do Garage):
```bash
G="docker exec garage-0tdmqt0xu2rbfs4wpygkmxwr /garage"   # confira: docker ps --format '{{.Names}}' | grep garage
$G bucket list                                            # confirme o nome do bucket de arquivos
$G key create arquivos-admin                              # mostra Key ID e Secret key: anote, só serve até o passo 4.4
$G bucket allow --read --write --owner leadtogo-arquivos --key arquivos-admin
```
Troque `leadtogo-arquivos` pelo nome que `bucket list` mostrou, se for outro. Crie **uma** chave só (dois `key create` criam duas).

**4.2. No WSL** (qualquer máquina com Docker), crie o arquivo de regras:
```bash
cat > cors.json <<'JSON'
{"CORSRules":[{"AllowedOrigins":["https://crm.aledias.com.br"],
 "AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["*"],
 "ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]}
JSON
```
Só a origem do app, só estes métodos. `AllowedHeaders: ["*"]` cobre o `Content-Type` que o navegador manda no `PUT`.

**4.3. Aplique e confira:**
```bash
read -rsp 'AWS_ACCESS_KEY_ID (arquivos-admin): ' AWS_ACCESS_KEY_ID; echo
read -rsp 'AWS_SECRET_ACCESS_KEY: ' AWS_SECRET_ACCESS_KEY; echo
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=garage
s3() { docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
  -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  -v "$PWD":/d amazon/aws-cli --endpoint-url https://files.crm.aledias.com.br "$@"; }
s3 s3api put-bucket-cors --bucket leadtogo-arquivos --cors-configuration file:///d/cors.json
s3 s3api get-bucket-cors --bucket leadtogo-arquivos
```
O `get-bucket-cors` deve devolver exatamente as regras acima. (As duas variáveis `*_CHECKSUM_*` são necessárias: o `aws-cli` novo calcula checksums que o Garage não aceita.)

**4.4. Apague a chave temporária** (terminal do servidor):
```bash
docker exec garage-0tdmqt0xu2rbfs4wpygkmxwr /garage key delete --yes arquivos-admin
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
```
**Não** mexa na chave `leadtogo-app` (a da aplicação) e **não** ponha `AllowedOrigins: ["*"]`.

## 5. Conferir de fora (no WSL)
```bash
U=https://files.crm.aledias.com.br/leadtogo-arquivos/teste-cors
# origem do app: deve liberar
curl -s -i -X OPTIONS "$U" -H 'Origin: https://crm.aledias.com.br' \
  -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type'
# outra origem: NÃO pode liberar
curl -s -i -X OPTIONS "$U" -H 'Origin: https://outro.exemplo.com' \
  -H 'Access-Control-Request-Method: PUT'
```
Esperado no primeiro: `HTTP/2 200` com `access-control-allow-origin: https://crm.aledias.com.br` e `access-control-allow-methods` contendo `PUT`. No segundo: sem `access-control-allow-origin` (ou `403`).

## 6. Provar no navegador
Depois do deploy da API, do worker e do web, abra um chamado, **Anexar arquivos** com um PDF pequeno e **Enviar**. Com o F12 → *Network*: um `OPTIONS` e um `PUT` para `files.crm.aledias.com.br` (status 200). O console **sem** erro de CSP ou de CORS. O anexo passa de "em verificação" a baixável (isso exige o ClamAV, `roteiro_teste_chamados.md`, seção 4).

## Se der erro
| No console / na tela | Causa | Correção |
|---|---|---|
| `Refused to connect … violates the following Content Security Policy … connect-src` | O web antigo ainda está no ar | Confirme o deploy do web; recarregue sem cache |
| `blocked by CORS policy: No 'Access-Control-Allow-Origin'` | CORS não aplicado, ou aplicado em outro bucket | Passos 4.3 e 5; confirme o nome do bucket |
| `PUT` volta `403` `SignatureDoesNotMatch` | `S3_PUBLIC_ENDPOINT` diferente do host real (outra barra, `http` em vez de `https`) | Corrija a variável na API e reinicie |
| `PUT` volta `403` `AccessDenied` / `ExpiredToken` | URL vencida (a validade é curta) ou relógio do servidor | Tente de novo; confira a hora do servidor |
| `PUT` ok, mas o anexo fica "em verificação" | Problema do ClamAV, não do Garage | `roteiro_teste_chamados.md`, "Se algo não bater" |
