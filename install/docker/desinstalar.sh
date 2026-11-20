#!/bin/sh
# =====================================================================
#  Puxador de Dados - DESINSTALAR (Docker)
#
#     sh install/docker/desinstalar.sh            # remove o container, mantem os dados
#     APAGAR_DADOS=1 sh install/docker/desinstalar.sh   # remove tambem a pasta de dados
#     APAGAR_IMAGEM=1 sh install/docker/desinstalar.sh  # remove tambem a imagem
# =====================================================================
set -eu

NOME="${NOME:-puxador}"
IMAGE="${IMAGE:-ghcr.io/samuelnoia/puxador:latest}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || erro "Docker nao encontrado."
docker info >/dev/null 2>&1 || erro "Sem permissao no Docker. Rode com sudo."

if docker inspect "$NOME" >/dev/null 2>&1; then
  DATA_DIR=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$NOME")
  info "Parando e removendo o container $NOME..."
  docker rm -f "$NOME" >/dev/null
else
  DATA_DIR="${DATA_DIR:-/opt/${NOME}/data}"
  info "Container $NOME nao existe (nada a remover)."
fi

if [ "${APAGAR_DADOS:-0}" = "1" ] && [ -n "${DATA_DIR:-}" ] && [ -d "$DATA_DIR" ]; then
  info "Apagando dados em $DATA_DIR ..."
  rm -rf "$DATA_DIR"
else
  [ -n "${DATA_DIR:-}" ] && info "Dados preservados em $DATA_DIR (use APAGAR_DADOS=1 para apagar)."
fi

if [ "${APAGAR_IMAGEM:-0}" = "1" ]; then
  info "Removendo a imagem $IMAGE ..."
  docker rmi "$IMAGE" >/dev/null 2>&1 || true
fi

echo ""
echo "  Desinstalado."
echo ""
