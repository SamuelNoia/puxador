#!/bin/sh
# =====================================================================
#  Puxador de Dados - INSTALAR no Linux direto (Node.js, sem Docker)
#
#     curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/linux/instalar.sh | sh
#
#  Personalizando:
#     PORT=8800 sh instalar.sh
#     ACCESS_PASSWORD=minhasenha sh instalar.sh
#     PASTA=/srv/puxador sh instalar.sh
#
#  Com Docker: install/docker/instalar.sh
# =====================================================================
set -eu

PORT="${PORT:-8790}"
TZ="${TZ:-America/Sao_Paulo}"
SENHA="${ACCESS_PASSWORD:-}"
PASTA="${PASTA:-$HOME/puxador}"
REPO_URL="${REPO_URL:-https://github.com/SamuelNoia/puxador.git}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || erro "Node.js nao encontrado. Instale com: sudo apt install -y nodejs npm (ou use o nvm, versao 22+)."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 22 ] || erro "Node.js 22.5+ e necessario (atual: $(node -v))."

info "Codigo em $PASTA"
if [ -d "$PASTA/.git" ]; then
  git -C "$PASTA" pull --ff-only || true
else
  mkdir -p "$(dirname "$PASTA")"
  command -v git >/dev/null 2>&1 || erro "git nao encontrado. Instale com: sudo apt install -y git"
  git clone --depth 1 "$REPO_URL" "$PASTA"
fi

cd "$PASTA"
info "Instalando dependencias..."
npm install --omit=dev --no-audit --no-fund
mkdir -p "$PASTA/data"

{
  echo '#!/bin/sh'
  # shellcheck disable=SC2016
  echo 'cd "$(dirname "$0")"'
  echo 'export NODE_ENV=production'
  echo "export PORT=${PORT}"
  echo 'export HOST=0.0.0.0'
  echo "export TZ=${TZ}"
  [ -n "$SENHA" ] && echo "export ACCESS_PASSWORD='${SENHA}'"
  echo 'exec node server.js'
} > "$PASTA/iniciar.sh"
chmod +x "$PASTA/iniciar.sh"

cat <<FIM

=====================================================================
  INSTALADO COM SUCESSO

  Pasta:    $PASTA
  Iniciar:  $PASTA/iniciar.sh
  Acesse:   http://localhost:${PORT}

  Atualizar:     sh $PASTA/install/linux/atualizar.sh
  Desinstalar:   sh $PASTA/install/linux/desinstalar.sh

  Para rodar como servico (systemd):
    sudo cp $PASTA/docs/v1/systemd/puxador.service /etc/systemd/system/
    sudo systemctl enable --now puxador
=====================================================================
FIM
