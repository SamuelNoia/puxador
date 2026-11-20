# Instalação e operação

Requisito único: **Node.js 22.5 ou superior** (Windows/Linux nativo) **ou** Docker.

Os instaladores estão organizados por sistema e por ação em [`install/`](../install/README.md):

| Sistema | Instalar | Atualizar | Desinstalar |
|---|---|---|---|
| Windows | `INSTALAR.cmd` | `ATUALIZAR.cmd` | `DESINSTALAR.cmd` |
| Linux (Node) | `install/linux/instalar.sh` | `install/linux/atualizar.sh` | `install/linux/desinstalar.sh` |
| Docker | `install/docker/instalar.sh` | `install/docker/atualizar.sh` | `install/docker/desinstalar.sh` |

---

## Windows

### Instalação assistida

1. Baixe o projeto (Code → Download ZIP) e descompacte.
2. Botão direito em **`INSTALAR.cmd`** → *Executar* (o mesmo arquivo está em `install/windows/`).
3. O script:
   - procura o Node.js (e instala pelo `winget` se faltar);
   - copia os arquivos para `%LOCALAPPDATA%\PuxadorDados`;
   - roda `npm install --omit=dev`;
   - cria `iniciar.cmd` e o atalho **Puxador de Dados** na área de trabalho;
   - abre o navegador em `http://localhost:8790`.

Opções do instalador (`powershell -ExecutionPolicy Bypass -File install\windows\instalar-windows.ps1`):

| Parâmetro | Efeito |
|---|---|
| `-Porta 8800` | muda a porta |
| `-Pasta D:\puxador` | muda o destino |
| `-Origem .` | instala da pasta local em vez de baixar do GitHub |
| `-SemAtalho` | não cria atalho |
| `-NaoIniciar` | não abre o navegador no fim |

### Manual

```powershell
cd puxador
npm install
$env:PORT=8790; npm start
```

### Atualizar / desinstalar

- **Atualizar:** `ATUALIZAR.cmd` — baixa a versão nova, preserva `data/`, reinstala dependências.
- **Desinstalar:** `DESINSTALAR.cmd` — encerra o servidor, remove o atalho e a pasta. Os dados só são
  apagados se você confirmar; caso contrário ficam em `PuxadorDados-data`.

---

## Ubuntu / Linux

### Docker (padrão — não precisa de Node)

```bash
curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/docker/instalar.sh | sh
```

O script confere o Docker, baixa `ghcr.io/samuelnoia/puxador:latest`, cria a pasta de dados
(`/DATA/AppData/puxador/data` em CasaOS/ZimaOS, senão `/opt/puxador/data`), sobe o container
`puxador` com `--restart unless-stopped`, espera o `/api/health` e mostra o endereço.

```bash
PORT=8800 sh install/docker/instalar.sh               # outra porta
ACCESS_PASSWORD=minhasenha sh install/docker/instalar.sh
DATA_DIR=/srv/puxador/data sh install/docker/instalar.sh
IMAGE=ghcr.io/samuelnoia/puxador:1.3.1 sh install/docker/instalar.sh
```

Atualizar e desinstalar:

```bash
sh install/docker/atualizar.sh                  # baixa a imagem nova e recria o container
sh install/docker/desinstalar.sh                # remove o container, mantém os dados
APAGAR_DADOS=1 sh install/docker/desinstalar.sh # remove também a pasta de dados
```

Se a imagem não puder ser baixada (pacote privado), o instalador tenta construir a partir do código
e, sem código, orienta o `docker login ghcr.io`.

### Node nativo (sem Docker)

```bash
curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/install/linux/instalar.sh | sh
```

Requer Node.js 22.5+. O script clona em `~/puxador`, instala dependências e cria o `iniciar.sh`.

```bash
sh install/linux/atualizar.sh                   # git pull + npm install
sh install/linux/desinstalar.sh                 # remove o programa e guarda os dados em ~/puxador-data-*
APAGAR_DADOS=1 sh install/linux/desinstalar.sh  # remove tudo
```

### Manual

```bash
sudo apt update && sudo apt install -y nodejs npm git   # garanta Node 22+
git clone https://github.com/SamuelNoia/puxador.git
cd puxador
npm install --omit=dev
PORT=8790 node server.js
```

### systemd

```bash
sudo cp docs/v1/systemd/puxador.service /etc/systemd/system/
sudo nano /etc/systemd/system/puxador.service     # ajuste User e WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now puxador
sudo systemctl status puxador
journalctl -u puxador -f                          # logs
```

---

## Docker (a partir do código)

```bash
docker compose up -d
docker compose logs -f
```

O `docker-compose.yml` monta `./data` no container e expõe a porta 8790.

```bash
docker build -t puxador-dados:1.4.0 .
docker run -d --name puxador -p 8790:8790 \
  -e ACCESS_PASSWORD=minhasenha \
  -v "$PWD/data:/data" --restart unless-stopped \
  puxador-dados:1.4.0
```

### Imagem publicada

A cada tag `v*` o GitHub Actions publica em `ghcr.io/samuelnoia/puxador`:

```bash
docker pull ghcr.io/samuelnoia/puxador:latest
```

---

## Backup e restauração

Tudo que o Puxador guarda está em **`data/`**:

| Arquivo | Conteúdo |
|---|---|
| `puxador.db` | conexões (senhas cifradas), mapeamentos e histórico |
| `secret.key` | chave que decifra as senhas |

Backup: copie a pasta `data/` com o servidor parado (ou use `docker cp`).
Restauração: devolva a pasta no mesmo caminho. **Sem o `secret.key`, as senhas não podem ser lidas** —
as conexões precisariam ser recadastradas.

---

## Diagnóstico

```bash
node tools/doctor.js      # versão do Node, dependências, pasta data, porta
node tools/check-ui.js    # integridade da interface (IDs, CSS, textos)
curl http://localhost:8790/api/health
```

Problemas comuns:

| Sintoma | Causa provável |
|---|---|
| `EADDRINUSE` | porta ocupada — use `PORT=8890` |
| `ECONNREFUSED` ao testar | banco fora do ar, porta errada ou firewall |
| `ER_ACCESS_DENIED_ERROR` | usuário/senha do banco |
| `ENOTFOUND` | host digitado errado |
| Firebird: `I/O error ... database` | caminho do `.fdb` inválido **no servidor** (não na sua máquina) |
| Firebird: `Unavailable database` | caminho com IP, alias do IBExpert ou só o nome do arquivo |
| Página em branco | abra o console do navegador; confira se `public/` foi copiado |
| Container reiniciando com `unable to open database file` | volume `/data` sem permissão para o uid 1000. A partir da 1.0.3 a imagem corrige sozinha; em volumes antigos: `sudo chown -R 1000:1000 /opt/puxador/data` e recrie o container |
| `Nome repetido na planilha` | duas colunas com o mesmo “Nome na planilha” — renomeie uma (ex.: `fabricante_Id`) |
