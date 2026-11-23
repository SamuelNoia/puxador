#!/bin/sh
# =====================================================================
#  Puxador de Dados - INSTALAR com Docker (usa a imagem publicada)
#
#     curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh | sh
#
#  Personalizando:
#     PORT=8800 sh instalar.sh
#     ACCESS_PASSWORD=minhasenha sh instalar.sh
#     IMAGE=ghcr.io/samuelnoia/puxador:1.3.1 sh instalar.sh
#     DATA_DIR=/srv/puxador/data sh instalar.sh
#
#  Nao quer Docker? Use install/linux/instalar.sh (Node nativo).
#  Rodar de novo atualiza o container mantendo os dados.
# =====================================================================
set -eu

IMAGE="${IMAGE:-ghcr.io/samuelnoia/puxador:latest}"
NOME="${NOME:-puxador}"
PORT="${PORT:-8790}"
TZ="${TZ:-America/Sao_Paulo}"
SENHA="${ACCESS_PASSWORD:-}"
REPO_URL="${REPO_URL:-https://github.com/SamuelNoia/puxador.git}"
PASTA="${PASTA:-/opt/puxador}"
URL_INSTALADOR="${URL_INSTALADOR:-https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
erro() { printf '\033[1;31mERRO:\033[0m %s\n' "$1" >&2; exit 1; }

# Em ZimaOS/CasaOS o HOME as vezes aponta para /DATA, onde o docker nao consegue
# ler/escrever o config.json (aparece "WARNING: Error loading config file").
# Usar um diretorio temporario evita o aviso sem mudar nada da sua configuracao.
if [ -z "${DOCKER_CONFIG:-}" ]; then
  export DOCKER_CONFIG="${TMPDIR:-/tmp}/docker-puxador"
  mkdir -p "$DOCKER_CONFIG" 2>/dev/null || true
fi

command -v docker >/dev/null 2>&1 || erro "Docker nao encontrado. Instale o Docker ou use install/linux/instalar.sh."

if ! docker info >/dev/null 2>&1; then
  erro "Sem permissao para falar com o Docker. Rode o script com sudo:
       curl -fsSL $URL_INSTALADOR -o /tmp/puxador-instalar.sh && sudo sh /tmp/puxador-instalar.sh"
fi

# pasta de dados: segue o padrao do CasaOS/ZimaOS quando existir
if [ -z "${DATA_DIR:-}" ]; then
  if [ -d "/DATA" ]; then
    DATA_DIR="/DATA/AppData/${NOME}/data"
  else
    DATA_DIR="/opt/${NOME}/data"
  fi
fi

# Descobre o IP da maquina: hostname -I (Linux), rota padrao (ZimaOS as vezes nao tem -I)
detectar_ip() {
  _ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -n "${_ip:-}" ] && { echo "$_ip"; return; }
  _ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit }}')
  [ -n "${_ip:-}" ] && { echo "$_ip"; return; }
  _ip=$(ip -4 addr show scope global 2>/dev/null | awk '/inet /{sub(/\/.*/, "", $2); print $2; exit}')
  [ -n "${_ip:-}" ] && { echo "$_ip"; return; }
  echo ""
}

info "Imagem:  $IMAGE"
info "Porta:   $PORT"
info "Dados:   $DATA_DIR"

mkdir -p "$DATA_DIR" || erro "Nao foi possivel criar $DATA_DIR"

# o container roda como usuario node (uid 1000); o volume precisa ser gravavel por ele
if [ "$(id -u)" = "0" ]; then
  chown -R 1000:1000 "$DATA_DIR" 2>/dev/null || true
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$NOME"; then
  info "Removendo container anterior (os dados em $DATA_DIR sao preservados)"
  docker rm -f "$NOME" >/dev/null
fi

info "Baixando a imagem..."
if ! docker pull "$IMAGE"; then
  if [ -f "$PASTA/server.js" ]; then
    info "Imagem indisponivel no registry. Construindo localmente a partir de $PASTA..."
    docker build -t "$IMAGE" "$PASTA" || erro "Falha ao construir a imagem."
  else
    erro "Falha ao baixar a imagem.
       Se o pacote estiver privado no GitHub, faca login antes:
         echo SEU_TOKEN | docker login ghcr.io -u samuelnoia --password-stdin
       Ou torne o pacote publico: GitHub > seu perfil > Packages > puxador > Package settings > Change visibility > Public
       Para construir a partir do codigo:
         git clone $REPO_URL /opt/puxador && sh install/docker/instalar.sh"
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
  fi
  tentativas=$((tentativas + 1))
  sleep 2
done

if ! docker inspect --format '{{.State.Running}}' "$NOME" 2>/dev/null | grep -q true; then
  echo ""
  erro "O container parou. Veja o log com:
       docker logs $NOME"
fi

IP_LOCAL=$(detectar_ip)
SEM_IP=0
if [ -z "$IP_LOCAL" ]; then
  IP_LOCAL="IP-DO-SERVIDOR"
  SEM_IP=1
fi

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
    sh install/docker/atualizar.sh    atualizar
    sh install/docker/desinstalar.sh  desinstalar
FIM
if [ -z "$SENHA" ]; then
  echo "  O portal esta sem senha (rede interna). Para exigir senha:"
  echo "    docker rm -f ${NOME} && ACCESS_PASSWORD=suasenha sh instalar.sh"
fi
if [ "$SEM_IP" = "1" ]; then
  echo ""
  echo "  Nao consegui detectar o IP desta maquina. Descubra com:"
  echo "    hostname -I    (ou)    ip -4 addr show scope global"
fi
echo "====================================================================="
echo ""
