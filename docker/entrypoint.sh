#!/bin/sh
# Ajusta a permissao da pasta de dados (volume montado pelo host) e roda como usuario node.
#
# O volume chega montado com dono do host (normalmente root). Sem isso, o SQLite
# falha com "unable to open database file" ao tentar criar data/puxador.db.
set -e

DATA_DIR="${DATA_DIR:-/data}"

mkdir -p "$DATA_DIR" 2>/dev/null || true

if [ "$(id -u)" = "0" ]; then
  # garante que o usuario node (uid 1000) possa escrever no volume
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  chmod u+rwx "$DATA_DIR" 2>/dev/null || true

  if ! su-exec node test -w "$DATA_DIR" 2>/dev/null; then
    echo "[puxador] AVISO: sem permissao de escrita em $DATA_DIR." >&2
    echo "[puxador] Monte um volume gravavel, por exemplo: -v /opt/puxador/data:/data" >&2
  fi

  exec su-exec node "$@"
fi

exec "$@"
