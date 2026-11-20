#!/bin/sh
# =====================================================================
#  Puxador de Dados - ATUALIZAR (Docker)
#
#     sh install/docker/atualizar.sh
#
#  Baixa a imagem mais nova e recria o container mantendo os dados.
#  Variaveis: NOME (container), IMAGE, PORT, DATA_DIR
# =====================================================================
set -eu

IMAGE="${IMAGE:-ghcr.io/samuelnoia/puxador:latest}"
NOME="${NOME:-puxador}"
PORT="${PORT:-8790}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || erro "Docker nao encontrado."
docker info >/dev/null 2>&1 || erro "Sem permissao no Docker. Rode com sudo."

docker inspect "$NOME" >/dev/null 2>&1 || erro "Container '$NOME' nao existe. Rode install/docker/instalar.sh primeiro."

# descobre o volume e as variaveis atuais para recriar igual
DATA_DIR=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$NOME")
[ -n "$DATA_DIR" ] || erro "Nao encontrei o volume /data do container $NOME."

info "Baixando a imagem mais recente..."
docker pull "$IMAGE" || erro "Falha ao baixar a imagem."

info "Recriando o container (dados preservados em $DATA_DIR)..."
docker rm -f "$NOME" >/dev/null
# shellcheck disable=SC2086
docker run -d --name "$NOME" --restart unless-stopped \
  -p "${PORT}:8790" \
  -e PORT=8790 -e HOST=0.0.0.0 -e DATA_DIR=/data -e NODE_ENV=production -e TZ="${TZ:-America/Sao_Paulo}" \
  -v "${DATA_DIR}:/data" \
  "$IMAGE" >/dev/null

sleep 4
if docker inspect --format '{{.State.Running}}' "$NOME" 2>/dev/null | grep -q true; then
  echo ""
  echo "  Atualizado. Acesse: http://localhost:${PORT}"
  echo "  Versao em execucao:"
  curl -fsS "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo "  (aguarde alguns segundos e recarregue a pagina)"
  echo ""
else
  erro "O container nao subiu. Veja: docker logs $NOME"
fi
