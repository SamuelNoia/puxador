#!/bin/sh
# =====================================================================
#  Puxador de Dados - instalacao no Ubuntu/Linux
#
#  Nativo (Node.js):
#     sh instalar.sh
#     PORT=8800 sh instalar.sh
#
#  Com Docker:
#     MODO=docker sh instalar.sh
#
#  Direto do GitHub:
#     curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/instalar.sh | sh
# =====================================================================
set -eu

MODO="${MODO:-native}"
PORT="${PORT:-8790}"
TZ="${TZ:-America/Sao_Paulo}"
SENHA="${ACCESS_PASSWORD:-}"
PASTA="${PASTA:-$HOME/puxador}"
[ "$MODO" = "docker" ] && PASTA="${PASTA:-/opt/puxador}"
REPO_URL="${REPO_URL:-https://github.com/SamuelNoia/puxador.git}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

# ------------------------------------------------------------------ docker
if [ "$MODO" = "docker" ]; then
  command -v docker >/dev/null 2>&1 || erro "Docker nao encontrado. Instale o Docker primeiro."
  docker info >/dev/null 2>&1 || erro "Sem permissao no Docker. Rode com sudo."

  info "Baixando o codigo..."
  if [ -d "$PASTA/.git" ]; then
    git -C "$PASTA" pull --ff-only || true
  else
    command -v git >/dev/null 2>&1 || erro "git nao encontrado."
    git clone --depth 1 "$REPO_URL" "$PASTA"
  fi

  info "Construindo a imagem..."
  docker build -t puxador-dados:latest "$PASTA"

  docker rm -f puxador-dados >/dev/null 2>&1 || true

  ARGS="-e PORT=8790 -e HOST=0.0.0.0 -e DATA_DIR=/data -e TZ=$TZ"
  [ -n "$SENHA" ] && ARGS="$ARGS -e ACCESS_PASSWORD=$SENHA"

  info "Subindo o container..."
  # shellcheck disable=SC2086
  docker run -d --name puxador-dados --restart unless-stopped \
    -p "${PORT}:8790" $ARGS -v "$PASTA/data:/data" puxador-dados:latest >/dev/null

  sleep 5
  docker ps --filter name=puxador-dados --format '  container: {{.Status}}'
  echo ""
  echo "  Acesse: http://localhost:${PORT}"
  echo "  Dados:  $PASTA/data"
  echo "  Logs:   docker logs -f puxador-dados"
  exit 0
fi

# ------------------------------------------------------------------ nativo
command -v node >/dev/null 2>&1 || erro "Node.js nao encontrado. Instale com: sudo apt install -y nodejs npm (ou use o nvm, versao 22+)."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 22 ] || erro "Node.js 22.5+ e necessario (atual: $(node -v))."

info "Codigo em $PASTA"
if [ -d "$PASTA/.git" ]; then
  git -C "$PASTA" pull --ff-only || true
else
  mkdir -p "$(dirname "$PASTA")"
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 "$REPO_URL" "$PASTA"
  else
    erro "git nao encontrado. Instale com: sudo apt install -y git"
  fi
fi

cd "$PASTA"
info "Instalando dependencias..."
npm install --omit=dev --no-audit --no-fund

mkdir -p "$PASTA/data"

cat > "$PASTA/iniciar.sh" <<FIM
#!/bin/sh
cd "\$(dirname "\$0")"
export NODE_ENV=production
export PORT=${PORT}
export HOST=0.0.0.0
export TZ=${TZ}
$( [ -n "$SENHA" ] && echo "export ACCESS_PASSWORD='${SENHA}'" )
exec node server.js
FIM
chmod +x "$PASTA/iniciar.sh"

echo ""
echo "  Instalado em: $PASTA"
echo "  Iniciar:      $PASTA/iniciar.sh"
echo "  Acesse:       http://localhost:${PORT}"
echo ""
echo "  Para rodar como servico (systemd), use:"
echo "    sudo cp docs/v1/systemd/puxador.service /etc/systemd/system/"
echo "    sudo systemctl enable --now puxador"
