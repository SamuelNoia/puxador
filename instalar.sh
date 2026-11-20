#!/bin/sh
# =====================================================================
#  Atalho de compatibilidade.
#
#  Os instaladores oficiais agora ficam organizados por sistema e por acao:
#     install/docker/instalar.sh   (padrao - sobe a imagem pronta)
#     install/linux/instalar.sh    (Node nativo, sem Docker)
#     install/windows/             (INSTALAR.cmd, ATUALIZAR.cmd, DESINSTALAR.cmd)
#
#  Um comando, do GitHub:
#     curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh | sh
# =====================================================================
set -eu

DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

if [ -f "$DIR/install/docker/instalar.sh" ]; then
  exec sh "$DIR/install/docker/instalar.sh" "$@"
fi

echo "Este arquivo agora e um atalho. Use um dos instaladores:"
echo ""
echo "  Docker:       curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh | sh"
echo "  Linux/Node:   curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/linux/instalar.sh | sh"
echo "  Windows:      baixe o ZIP e rode INSTALAR.cmd"
echo ""
exit 1
