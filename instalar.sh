#!/bin/sh
# =====================================================================
#  Puxador de Dados - instalacao no Ubuntu/Linux
#
#  Padrao: sobe a imagem Docker publicada (nao precisa de Node nem do codigo).
#     curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/instalar.sh | sh
#
#  Personalizando:
#     PORT=8800 sh instalar.sh
#     ACCESS_PASSWORD=minhasenha sh instalar.sh
#     IMAGE=ghcr.io/samuelnoia/puxador:1.0.2 sh instalar.sh
#     DATA_DIR=/srv/puxador/data sh instalar.sh
#
#  Instalacao nativa (Node.js, sem Docker):
#     MODO=native sh instalar.sh
#
#  Rodar de novo atualiza o container mantendo os dados.
# =====================================================================
set -eu

MODO="${MODO:-docker}"
IMAGE="${IMAGE:-ghcr.io/samuelnoia/puxador:latest}"
NOME="${NOME:-puxador}"
PORT="${PORT:-8790}"
TZ="${TZ:-America/Sao_Paulo}"
SENHA="${ACCESS_PASSWORD:-}"
PASTA="${PASTA:-$HOME/puxador}"
REPO_URL="${REPO_URL:-https://github.com/SamuelNoia/puxador.git}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

# ------------------------------------------------------------------ nativo
if [ "$MODO" = "native" ]; then
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
    # shellcheck disable=SC2016  # o $(dirname) deve ir literal para o iniciar.sh
    echo 'cd "$(dirname "$0")"'
    echo 'export NODE_ENV=production'
    echo "export PORT=${PORT}"
    echo 'export HOST=0.0.0.0'
    echo "export TZ=${TZ}"
    [ -n "$SENHA" ] && echo "export ACCESS_PASSWORD='${SENHA}'"
    echo 'exec node server.js'
  } > "$PASTA/iniciar.sh"
  chmod +x "$PASTA/iniciar.sh"

  echo ""
  echo "  Instalado em: $PASTA"
  echo "  Iniciar:      $PASTA/iniciar.sh"
  echo "  Acesse:       http://localhost:${PORT}"
  echo ""
  echo "  Para rodar como servico (systemd):"
  echo "    sudo cp docs/v1/systemd/puxador.service /etc/systemd/system/"
  exit 0
fi

# ------------------------------------------------------------------ docker
command -v docker >/dev/null 2>&1 || erro "Docker nao encontrado. Instale o Docker ou use MODO=native."

if ! docker info >/dev/null 2>&1; then
  erro "Sem permissao para falar com o Docker. Rode com sudo ou adicione seu usuario ao grupo docker."
fi

# pasta de dados: segue o padrao do CasaOS/ZimaOS quando existir
if [ -z "${DATA_DIR:-}" ]; then
  if [ -d "/DATA" ]; then
    DATA_DIR="/DATA/AppData/${NOME}/data"
  else
    DATA_DIR="/opt/${NOME}/data"
  fi
fi

info "Imagem:  $IMAGE"
info "Porta:   $PORT"
info "Dados:   $DATA_DIR"

mkdir -p "$DATA_DIR" || erro "Nao foi possivel criar $DATA_DIR"

if docker ps -a --format '{{.Names}}' | grep -qx "$NOME"; then
  info "Removendo container anterior (os dados em $DATA_DIR sao preservados)"
  docker rm -f "$NOME" >/dev/null
fi

info "Baixando a imagem..."
if ! docker pull "$IMAGE"; then
  # sem imagem publicada? tenta construir a partir do codigo-fonte
  if [ -f "$PASTA/server.js" ]; then
    info "Imagem indisponivel no registry. Construindo localmente a partir de $PASTA..."
    docker build -t "$IMAGE" "$PASTA" || erro "Falha ao construir a imagem."
  else
    erro "Falha ao baixar a imagem.
       Se o pacote estiver privado no GitHub, faca login antes:
         echo SEU_TOKEN | docker login ghcr.io -u samuelnoia --password-stdin
       Ou torne o pacote publico: GitHub > seu perfil > Packages > puxador > Package settings > Change visibility > Public
       Para construir a partir do codigo:
         git clone $REPO_URL /opt/puxador && docker build -t $IMAGE /opt/puxador"
  fi
fi

info "Subindo o container..."
ARGS="-e PORT=8790 -e HOST=0.0.0.0 -e DATA_DIR=/data -e NODE_ENV=production -e TZ=$TZ"
[ -n "$SENHA" ] && ARGS="$ARGS -e ACCESS_PASSWORD=$SENHA"

# shellcheck disable=SC2086
docker run -d \
  --name "$NOME" \
  --restart unless-stopped \
  -p "${PORT}:8790" \
  $ARGS \
  -v "${DATA_DIR}:/data" \
  "$IMAGE" >/dev/null

# ------------------------------------------------------------------ espera
info "Aguardando a aplicacao responder..."
tentativas=0
while [ "$tentativas" -lt 40 ]; do
  if docker inspect --format '{{.State.Running}}' "$NOME" 2>/dev/null | grep -q true; then
    if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      break
    fi
    if ! command -v curl >/dev/null 2>&1 && command -v wget >/dev/null 2>&1 \
       && wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" 2>/dev/null; then
      break
    fi
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1 && [ "$tentativas" -ge 5 ]; then
      break
    fi
  fi
  tentativas=$((tentativas + 1))
  sleep 2
done

if ! docker inspect --format '{{.State.Running}}' "$NOME" 2>/dev/null | grep -q true; then
  echo ""
  erro "O container parou. Veja o log com:
       docker logs $NOME"
fi

IP_LOCAL=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -n "${IP_LOCAL:-}" ] || IP_LOCAL="IP-DO-SERVIDOR"

cat <<FIM

=====================================================================
  INSTALADO COM SUCESSO

  Acesse:   http://${IP_LOCAL}:${PORT}
  ou:       http://localhost:${PORT}

  Dados:    ${DATA_DIR}
  Backup:   copie essa pasta com o container parado.

  Comandos uteis:
    docker logs -f ${NOME}       acompanhar
    docker restart ${NOME}       reiniciar
    docker stop ${NOME}          parar

  Para atualizar: rode este instalador de novo (os dados sao mantidos).
FIM
if [ -z "$SENHA" ]; then
  echo "  O portal esta sem senha (rede interna). Para exigir senha:"
  echo "    docker rm -f ${NOME} && ACCESS_PASSWORD=suasenha sh instalar.sh"
fi
echo "====================================================================="
echo ""
