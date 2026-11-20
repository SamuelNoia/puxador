#!/bin/sh
# =====================================================================
#  Puxador de Dados - ATUALIZAR (Linux direto / Node.js)
#
#     sh install/linux/atualizar.sh
# =====================================================================
set -eu
PASTA="${PASTA:-$HOME/puxador}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

[ -d "$PASTA" ] || erro "Instalacao nao encontrada em $PASTA"
cd "$PASTA"

info "Parando processos antigos..."
pkill -f "$PASTA/server.js" 2>/dev/null || true

if [ -d .git ]; then
  info "Baixando atualizacao..."
  git pull --ff-only
else
  erro "A pasta nao e um repositorio git. Reinstale com install/linux/instalar.sh"
fi

info "Atualizando dependencias..."
npm install --omit=dev --no-audit --no-fund

echo ""
echo "  Atualizado. Inicie com: $PASTA/iniciar.sh"
echo ""
