# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.4.0] — 2026-11-21

### Adicionado

- **Minimizar cada tabela na grade de colunas**: a faixa de cada fonte (`Fonte 1 · item`) agora tem um
  botão ▾/▸ que recolhe apenas aquela tabela, mostrando no cabeçalho quantas colunas existem e quantas
  estão marcadas. Ideal para chegar rápido na segunda tabela quando a primeira tem centenas de colunas.
- **Repositório organizado por uso**: os instaladores saíram da raiz para `install/`
  - `install/windows/` — `INSTALAR.cmd`, `ATUALIZAR.cmd`, `DESINSTALAR.cmd` e os `.ps1`
  - `install/linux/` — `instalar.sh`, `atualizar.sh`, `desinstalar.sh` (Node nativo)
  - `install/docker/` — `instalar.sh`, `atualizar.sh`, `desinstalar.sh` (imagem publicada)
  - `install/README.md` — índice “escolha o seu caso”
- Scripts de **atualizar** e **desinstalar** para Docker (antes só existia o instalar), preservando a
  pasta de dados por padrão (`APAGAR_DADOS=1` para remover).
- `desinstalar.sh` para Linux nativo, que guarda os dados em `~/puxador-data-<data>` antes de remover.

### Alterado

- Atalhos na raiz (`INSTALAR.cmd`, `ATUALIZAR.cmd`, `DESINSTALAR.cmd`) continuam funcionando e apontam
  para `install/windows/`. O `instalar.sh` da raiz virou um atalho que avisa os novos endereços.
- URLs de instalação em um comando passaram a ser
  `.../main/install/docker/instalar.sh` e `.../main/install/linux/instalar.sh`.
- Manuais (README, INSTALAÇÃO e MANUAL) atualizados com a nova estrutura e o recurso de minimizar.

## [1.3.1] — 2026-11-21

### Corrigido

- **Colunas homônimas de tabelas diferentes se sobrescreviam na saída** (ex.: `item.Id` e
  `fabricante.Id`, `item.Descricao` e `fabricante.Descricao`): o resultado mostrava dois cabeçalhos
  iguais e apenas o último valor sobrevivia.
  - Colunas de tabelas relacionadas agora recebem o prefixo da tabela por padrão
    (`fabricante_Id`, `fabricante_Descricao`).
  - Nomes repetidos ficam **destacados em vermelho** na grade, e a extração/exportação é bloqueada
    com a mensagem `Nome repetido na planilha: "Id". Renomeie uma das colunas…` — tanto na interface
    quanto na API (defesa em profundidade), para nunca gerar arquivo com dado perdido.

## [1.3.0] — 2026-11-21

### Alterado

- **Tela de relacionamentos redesenhada**: agora mostra `Tabela 1 · coluna = Tabela 2 · coluna` com os
  nomes reais das tabelas (antes era “Fonte 1 / Fonte 2”, o que confundia). Dá para trocar a Tabela 1,
  trocar a Tabela 2 e escolher as duas colunas no mesmo bloco.
- **Saída dentro do relacionamento**: cada coluna trazida ganhou, ali mesmo, o *nome na planilha*, a
  *formatação* (texto, inteiro, moeda, data…) e os *decimais*, com “+ adicionar coluna” para incluir
  outras. O que é marcado ali reflete na grade de colunas e vice-versa.

### Adicionado

- Botão **minimizar / expandir** na grade de colunas, para enxergar relacionamentos e filtros sem
  rolar uma lista de centenas de colunas.

## [1.2.0] — 2026-11-21

### Adicionado

- **Fluxo por etapas na tela 2**: `1 · Tabelas e colunas` → `2 · Colunas e formatação` →
  `3 · Relacionamentos` → `4 · Filtros` → `5 · Ordenação e limite`. Você adiciona a primeira tabela e
  suas colunas, depois a segunda, e assim por diante — o relacionamento é montado no fim.
- **Várias tabelas por extração** (até 6), com **encadeamento**: `item → fabricante → país`.
- **Pesquisa em toda lista grande**: filtro de tabelas por fonte, busca na grade de colunas
  (com “marcar/desmarcar visíveis”), busca de coluna nos filtros e na ordenação.
- `tools/check-ui.js` (`npm run check:ui`): confere IDs, classes e textos corrompidos sem navegador.

### Corrigido

- **Acentos quebrados na interface** (`item Â· ~11043`, `â€œ coluna â€�`): o `app.js` havia sido
  regravado em ANSI por um script de manutenção. Arquivo reescrito em UTF-8 e o `check:ui` passou a
  detectar esse tipo de corrupção.
- Colunas trazidas de relacionamento mantêm o alias estável ao remover uma fonte intermediária.

## [1.1.0] — 2026-11-20

### Adicionado

- **Relacionamentos (LEFT JOIN)**: trazer colunas de outra tabela a partir da chave estrangeira —
  ex.: `item.IdFabricante` → `fabricante.Descricao`, resolvendo o nome no lugar do Id. Até 4
  relacionamentos por extração, com seleção de quais colunas trazer e opção de **filtrar** por elas.
- **Filtros de data com calendário**: campos `date` e `datetime-local` (escolha no calendário ou
  digitação manual) e novo operador **entre (período)**, que inclui o dia final inteiro quando a
  coluna tem hora.
- **Botão “← Voltar”** na tela de resultado.

### Alterado

- A navegação entre as telas **preserva a posição de rolagem** de cada uma — voltar para “Puxar dados”
  mantém o usuário onde ele estava (filtros, colunas), sem pular para o topo.
- `src/query.js` reescrito: SELECT com aliases explícitos, joins e filtros por dialeto
  (MySQL/MariaDB, PostgreSQL, Firebird), mantendo compatibilidade com o formato antigo de `colunas`.
- Firebird: aliases entre aspas preservam o nome exato (não força mais maiúsculas).
- Autoteste passou a validar o SQL gerado (join, período, placeholders por banco): **27 verificações**.

## [1.0.4] — 2026-11-20

### Corrigido

- Teste de escrita do `entrypoint.sh` passou a usar `touch` (presente no Alpine) em vez de `test`, que
  pode não existir como binário e gerava aviso falso de permissão a cada inicialização.

## [1.0.3] — 2026-11-20

### Corrigido

- **Container em loop de reinicio com `unable to open database file`.** O volume de dados era montado
  com dono do host (root), mas o processo roda como usuário `node` (uid 1000) e o SQLite não conseguia
  criar `puxador.db`. A imagem agora tem um `entrypoint.sh` que ajusta o dono de `/data`, valida a
  escrita e só então executa a aplicação como `node` (via `su-exec`).
- O `instalar.sh` faz `chown 1000:1000` na pasta de dados quando executado como root, cobrindo volumes
  criados por versões anteriores.
- Se o banco não puder ser aberto, o servidor agora encerra com uma mensagem explicando a causa e o
  comando de correção, em vez de apenas o stack trace.

## [1.0.2] — 2026-11-20

### Alterado

- **`instalar.sh` agora instala via Docker com a imagem publicada**, igual ao orca3:
  `curl -fsSL .../instalar.sh | sh` baixa `ghcr.io/samuelnoia/puxador:latest` e sobe o container —
  sem Node, sem npm e sem clonar o código. A instalação nativa virou opção: `MODO=native sh instalar.sh`.
- O instalador espera o `/api/health` responder antes de exibir o endereço, reaproveita a pasta de
  dados do CasaOS/ZimaOS (`/DATA/AppData/puxador/data`) e aceita `IMAGE`, `NOME`, `DATA_DIR`.
- Se a imagem não estiver acessível, tenta construir a partir do código e, se não houver código,
  orienta o `docker login ghcr.io`.
- Documentação de instalação no Linux reescrita para os dois modos (Docker padrão e nativo).

## [1.0.1] — 2026-11-18

### Corrigido

- **Firebird: caminho do banco com o servidor dentro** (`10.0.0.52:\dados\base.eco`) agora é barrado
  no formulário e na API, com a explicação de que o IP vai apenas no campo *Servidor*. Antes o erro
  exibido era apenas `Unavailable database`.
- **Firebird: alias do IBExpert** (`eco Copy`) também é detectado, com a orientação de usar o caminho
  completo do arquivo no servidor.
- Mensagens de erro de conexão traduzidas: arquivo não encontrado, banco indisponível, usuário/senha
  recusados, servidor recusou a conexão, host não encontrado, tempo esgotado e charset incompatível
  passam a vir com a causa provável e o que conferir.
- Campo do Firebird renomeado para **“Caminho do banco no servidor (.fdb / .eco)”**, com placeholder
  e ajuda específicos.

## [1.0.0] — 2026-11-18

Primeira versão estável.

### Adicionado

- **Tela de conexões** com cadastro de MySQL, MariaDB, PostgreSQL e Firebird
  (servidor, porta, base, usuário, senha) e botão *Testar conexão* antes de salvar.
- **Tela de extração** que lista tabelas e views do banco e, ao escolher uma, mostra
  **todas as colunas com tipo e chave primária**.
- **Mapeamento por coluna**: renomear (`Id` → `cod produto`), marcar/desmarcar e escolher a
  formatação (16 opções: texto, código, número, inteiro, decimal, moeda, percentual, data,
  data e hora, hora, maiúsculo, minúsculo, primeira maiúscula, texto limpo, sim/não, original).
- **Filtros** com 12 operadores, combinados com E, aplicados como parâmetros (sem injeção).
- **Ordenação** por qualquer coluna e **limite de linhas**.
- **Tela de resultado** com prévia, total de registros, tempo, SQL gerado e exportação em
  **Excel (.xlsx)** e **CSV** (separador `;`, BOM UTF-8).
- **Mapeamentos salvos** para reutilizar a configuração e **histórico** das últimas extrações.
- **Senhas de banco cifradas** em AES-256-GCM; a API nunca devolve a senha.
- **Login opcional** por `ACCESS_PASSWORD` com cookie de sessão de 12 horas.
- **Instalação** para Windows (`INSTALAR.cmd` + PowerShell), Ubuntu (`instalar.sh`, com opção
  Docker e unit systemd) e Docker (`Dockerfile` + `docker-compose.yml`).
- **Atualização e desinstalação** assistidas, preservando a pasta `data/`.
- **Publicação automática** da imagem no GHCR a cada tag `v*` (GitHub Actions).
- **Autoteste** ponta a ponta (`npm test`) com 17 verificações, incluindo extração real.
- **Documentação v1**: manual, instalação, conectores, API e arquitetura.

### Conhecido

- Uma tabela por extração (sem join guiado).
- Sem agendamento de extrações.
- Firebird 1.x não suportado.

[1.0.0]: https://github.com/SamuelNoia/puxador/releases/tag/v1.0.0
