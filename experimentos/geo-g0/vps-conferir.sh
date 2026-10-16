#!/usr/bin/env bash
# Rode na VPS (Oracle ARM) e me devolva a saída inteira. Só lê; não muda nada.
echo "=== arquitetura, CPU e carga ==="
uname -m; nproc; uptime
echo; echo "=== memória e swap ==="
free -h; swapon --show 2>/dev/null
echo; echo "=== disco (raiz e docker) ==="
df -h / /var/lib/docker 2>/dev/null
echo; echo "=== uso do docker em disco ==="
docker system df 2>/dev/null
echo; echo "=== containers: memória e CPU agora ==="
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' 2>/dev/null
echo; echo "=== maiores consumidores de memória (processos) ==="
ps aux --sort=-%mem | head -8 | cut -c1-160
echo; echo "=== versão do docker e do kernel ==="
docker --version 2>/dev/null; uname -r
