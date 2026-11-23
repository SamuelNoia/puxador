# Instalação — escolha o seu caso

Cada pasta tem os três comandos: **instalar**, **atualizar** e **desinstalar**.

| Sistema | Pasta | Como rodar |
|---|---|---|
| **Windows** | [`windows/`](windows) | duplo clique em `INSTALAR.cmd` (ou `ATUALIZAR.cmd` / `DESINSTALAR.cmd`) |
| **Linux (Node nativo)** | [`linux/`](linux) | `sh install/linux/instalar.sh` |
| **Docker** | [`docker/`](docker) | `sh install/docker/instalar.sh` |
| **ZimaOS / CasaOS** | [`zimaos/`](zimaos) | `sudo sh /tmp/puxador.sh` (veja abaixo) |

---

## Windows

Na raiz do projeto (ou na cópia baixada do GitHub):

| Ação | Arquivo |
|---|---|
| Instalar | `INSTALAR.cmd` → cria atalho e abre o portal |
| Atualizar | `ATUALIZAR.cmd` → baixa a versão nova mantendo `data/` |
| Desinstalar | `DESINSTALAR.cmd` → remove o programa (os dados só com confirmação) |

Os mesmos arquivos existem em [`windows/`](windows) se você estiver navegando o repositório.

## Linux

```sh
# instalar (Node 22.5+)
curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/linux/instalar.sh | sh

# atualizar
sh ~/puxador/install/linux/atualizar.sh

# desinstalar (mantém os dados)
sh ~/puxador/install/linux/desinstalar.sh

# desinstalar apagando os dados
APAGAR_DADOS=1 sh ~/puxador/install/linux/desinstalar.sh
```

## Docker

```sh
# instalar (baixa a imagem publicada no GHCR)
curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh | sh

# atualizar (baixa a imagem nova e recria o container)
sh install/docker/atualizar.sh

# desinstalar (mantém os dados)
sh install/docker/desinstalar.sh

# desinstalar apagando os dados
APAGAR_DADOS=1 sh install/docker/desinstalar.sh
```

> **Atenção ao `sudo`.** Em `sudo curl ... | sh` o `sudo` vale só para o `curl` — o `sh` roda como
> seu usuário. Se o Docker exige root, baixe e rode o script com `sudo`:
>
> ```sh
> curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh -o /tmp/puxador.sh
> sudo sh /tmp/puxador.sh
> ```

## ZimaOS / CasaOS

O instalador já reconhece o padrão do ZimaOS e grava os dados em
**`/DATA/AppData/puxador/data`** (o volume que aparece no painel).

```sh
# no terminal do ZimaOS (SSH ou app Terminal)
curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh -o /tmp/puxador.sh
sudo sh /tmp/puxador.sh
```

Depois acesse `http://IP-DO-ZIMA:8790` (a porta 8790 fica publicada; `hostname -I` às vezes não
existe no ZimaOS, então o instalador descobre o IP pela rota padrão).

**Pelo painel (app personalizado):** copie [`zimaos/docker-compose.yml`](zimaos/docker-compose.yml)
para `/DATA/AppData/puxador/docker-compose.yml` e use *Install a customized app* apontando para ele.
O arquivo já traz `x-casaos` para aparecer bonito no painel.

Atualizar/desinstalar no ZimaOS:

```sh
docker pull ghcr.io/samuelnoia/puxador:latest
sh install/docker/atualizar.sh     # se tiver o repositório na máquina
# ou
docker rm -f puxador && sudo sh /tmp/puxador.sh
```

---

## Variáveis aceitas

| Variável | Vale para | Padrão |
|---|---|---|
| `PORT` | todos | `8790` |
| `ACCESS_PASSWORD` | todos | *(vazio = sem senha)* |
| `NOME` | docker | `puxador` (nome do container) |
| `IMAGE` | docker | `ghcr.io/samuelnoia/puxador:latest` |
| `DATA_DIR` | docker | `/opt/puxador/data` (ou `/DATA/AppData/puxador/data` em CasaOS) |
| `PASTA` | linux / docker | `~/puxador` / `/opt/puxador` |
| `TZ` | todos | `America/Sao_Paulo` |

Detalhes de operação, backup e diagnóstico: [docs/v1/INSTALACAO.md](../docs/v1/INSTALACAO.md).
