#!/bin/sh
# =====================================================================
#  Puxador de Dados - DESINSTALAR (Linux direto / Node.js)
#
#     sh install/linux/desinstalar.sh                 # remove o programa, mantem os dados
#     APAGAR_DADOS=1 sh install/linux/desinstalar.sh  # remove tambem a pasta data
# =====================================================================
set -eu

PASTA="${PASTA:-$HOME/puxador}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

[ -d "$PASTA" ] || erro "Instalacao nao encontrada em $PASTA"

info "Parando o servidor (se estiver rodando)..."
pkill -f "$PASTA/server.js" 2>/dev/null || true
sleep 1

if [ "${APAGAR_DADOS:-0}" = "1" ]; then
  info "Apagando tudo, inclusive os dados..."
  rm -rf "$PASTA"
else
  GUARDAR="$(dirname "$PASTA")/puxador-data-$(date +%Y%m%d-%H%M)"
  if [ -d "$PASTA/data" ]; then
    info "Preservando os dados em $GUARDAR ..."
    mkdir -p "$GUARDAR"
    cp -r "$PASTA/data/." "$GUARDAR/"
  fi
  info "Removendo $PASTA ..."
  rm -rf "$PASTA"
  echo ""
  echo "  Dados guardados em: $GUARDAR"
  echo "  (para apagar tudo de uma vez: APAGAR_DADOS=1 sh install/linux/desinstalar.sh)"
fi

echo ""
echo "  Desinstalado."
echo ""
