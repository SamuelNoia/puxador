# Instalação e operação — v1

Requisito único: **Node.js 22.5 ou superior** (para Windows/Linux nativo) **ou** Docker.

O Node 22.5+ é necessário porque o armazenamento interno usa o módulo `node:sqlite`, nativo.

---

## Windows

### Instalação assistida

1. Baixe o projeto (Code → Download ZIP) e descompacte.
2. Botão direito em **`INSTALAR.cmd`** → *Executar*.
3. O script:
   - procura o Node.js (e instala pelo `winget` se faltar);
   - copia os arquivos para `%LOCALAPPDATA%\PuxadorDados`;
   - roda `npm install --omit=dev`;
   - cria `iniciar.cmd` e o atalho **Puxador de Dados** na área de trabalho;
   - abre o navegador em `http://localhost:8790`.

Opções do instalador (`powershell -ExecutionPolicy Bypass -File instalar-windows.ps1`):

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
- **Desinstalar:** `DESINSTALAR.cmd` — encerra o servidor, remove o atalho e a pasta.
  Os dados só são apagados se você confirmar; caso contrário ficam em `PuxadorDados-data`.

---

## Ubuntu / Linux

### Instalação assistida (Docker — padrão)

Baixa e sobe a **imagem publicada** no GHCR. Não precisa de Node, npm nem do código-fonte:

```bash
curl -fsSL https://raw.githubusercontent.com/SamuelNoia/puxador/main/instalar.sh | sh
```

O script:

1. confere se o Docker está instalado e acessível;
2. baixa `ghcr.io/samuelnoia/puxador:latest`;
3. cria a pasta de dados (`/DATA/AppData/puxador/data` em CasaOS/ZimaOS, senão `/opt/puxador/data`);
4. sobe o container `puxador` com `--restart unless-stopped`;
5. espera o `/api/health` responder e mostra o endereço.

Variáveis aceitas:

```bash
PORT=8800 sh instalar.sh                        # outra porta no host
ACCESS_PASSWORD=minhasenha sh instalar.sh       # exige login
DATA_DIR=/srv/puxador/data sh instalar.sh       # pasta de dados
IMAGE=ghcr.io/samuelnoia/puxador:1.0.2 sh instalar.sh
NOME=puxador-erp sh instalar.sh                 # outro nome de container
```

Rodar o comando de novo **atualiza** a imagem e recria o container, preservando `DATA_DIR`.

Se a imagem não puder ser baixada (pacote privado), o script tenta construir a partir do código
clonado; caso contrário, orienta o `docker login ghcr.io`.

### Instalação nativa (sem Docker)

```bash
MODO=native sh instalar.sh
```

Requer Node.js 22.5+. O script clona em `~/puxador`, instala dependências e cria o `iniciar.sh`.

### Manual

```bash
sudo apt update && sudo apt install -y nodejs npm git   # garanta Node 22+
git clone https://github.com/SamuelNoia/puxador.git
cd puxador
npm install --omit=dev
PORT=8790 node server.js
```

### systemd

Copie o arquivo pronto, ajuste usuário/pasta e ative:

```bash
sudo cp docs/v1/systemd/puxador.service /etc/systemd/system/
sudo nano /etc/systemd/system/puxador.service     # ajuste User e WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now puxador
sudo systemctl status puxador
journalctl -u puxador -f                          # logs
```

---

## Docker

### Com compose (recomendado)

```bash
docker compose up -d
docker compose logs -f
```

O `docker-compose.yml` já monta `./data` no container e expõe a porta 8790.

### Sem compose

```bash
docker build -t puxador-dados:1.0.0 .
docker run -d --name puxador \
  -p 8790:8790 \
  -e ACCESS_PASSWORD=minhasenha \
  -v "$PWD/data:/data" \
  --restart unless-stopped \
  puxador-dados:1.0.0
```

### Imagem publicada

A cada tag `v*` o GitHub Actions publica em `ghcr.io/samuelnoia/puxador`:

```bash
docker pull ghcr.io/samuelnoia/puxador:latest
```

> Se o pacote estiver privado, faça login antes:
> `echo SEU_TOKEN | docker login ghcr.io -u samuelnoia --password-stdin`

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
