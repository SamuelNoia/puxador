# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.9.1] — 2026-11-23

### Corrigido

- **PDF: descrição invadia a coluna de `NumFabricante`.** A medição de largura usava uma média única por
  caractere e subestimava maiúsculas em ~25%; o texto era desenhado mais largo que a coluna calculada.
  Agora a medição é por classe de caractere (maiúscula, minúscula, dígito, estreito, acentuada), com
  folga de 2% e 4 pt de padding em cada lado.
- **Espaço em branco nas colunas de valor.** A largura era influenciada pelo cabeçalho
  (`item_valor_MargemLucroBrutoVarejo`). Agora a coluna é dimensionada pelas **linhas** e o cabeçalho
  quebra em até **3 linhas** (com `...` se ainda não couber); a sobra da página vai, com peso, para a
  coluna mais larga (a descrição). Colunas numéricas ficam justas.
- Números passaram a ser **alinhados à direita** no PDF.

### Adicionado

- `npm run test:pdf` (`tools/test-pdf.mjs`): monta um PDF com 9 colunas e valida, lendo as posições reais
  dos textos com `pdfjs`, que **nenhum texto invade a coluna vizinha**, que a descrição é a coluna mais
  larga e que as numéricas ficam abaixo de 90 pt.

## [1.9.0] — 2026-11-23

### Adicionado

- **Formato “Número (sem zeros à direita)”**: `41.000000` sai como `41` e `1.500000` como `1,5` — na
  prévia, no PDF e no Excel (célula em formato Geral). Ótimo para quantidades.
- **Card “6 · Impressão e aparência”** no fim da tela 2:
  - **quebrar linha nas células** (PDF com linha mais alta; Excel com `wrapText`);
  - **tamanho da letra** de 6 a 12 pt (PDF);
  - **formato de impressão**: A4 paisagem ou A4 retrato.
  As escolhas são salvas junto com o mapeamento e voltam ao reabri-lo.

### Alterado

- O gerador de PDF passou a paginar por **altura real de cada linha** (com quebra de texto), em vez de
  um número fixo de linhas por página.
- Excel ganhou o estilo numérico `#,##0.00` para os formatos *Número/Decimal* (antes saíam em Geral).
- Autoteste: **37 verificações** (novas checagens de formatação numérica e de data).

## [1.8.2] — 2026-11-23

### Corrigido

- **Interface “pela metade” depois de atualizar** (cabeçalho novo, linhas velhas): o `app.js` podia ficar
  até 5 minutos em cache no navegador, então a grade aparecia desalinhada — com a coluna *Ordem* no
  cabeçalho e sem o campo nas linhas. Agora:
  - o HTML injeta a versão nos links (`/app.css?v=1.8.2`, `/app.js?v=1.8.2`), forçando o navegador a
    baixar o arquivo novo depois de cada atualização;
  - `app.js`, `app.css` e o HTML são servidos com `Cache-Control: no-cache`; imagens e fontes seguem
    com cache de 1 hora.
- Autoteste passou a checar o cache-buster no HTML (**32 verificações**).

## [1.8.1] — 2026-11-23

### Alterado

- Coluna de sequência renomeada de **“Seq”** para **“Ordem”**, com tooltip explicando que é a posição na
  planilha e que pode ser digitada outra.
- Subtítulo do card “2 · Colunas e formatação” passou a citar a coluna *Ordem*; o resumo mostra a faixa
  usada (`ordem 1–8`), e o campo ficou mais largo.

## [1.8.0] — 2026-11-23

### Adicionado

- **Coluna “Seq” na grade**: a ordem das colunas na planilha/CSV/PDF passou a ser definida por um número
  editável em cada linha (vem preenchido na ordem em que as colunas foram marcadas). Trocar o número
  reordena a saída — `1` vai para a primeira posição.
- **Verificador de sequência**: nunca sobra número repetido, buraco (1, 5, 9) ou campo vazio — o que
  faltar é reatribuído automaticamente ao fim; em empate vence quem foi editado por último.
- Coluna sem “Nome na planilha” volta a usar o nome do banco (não sai cabeçalho vazio).
- `npm run test:seq` (`tools/test-sequencia.mjs`): 9 verificações da ordenação, extraindo a função real
  do `public/app.js`.

### Alterado

- A ordem do `mapeamento` enviado à API segue a sequência definida, então o XLSX/CSV/PDF saem na mesma
  ordem da grade — e o mapeamento salvo guarda essa sequência para reabrir igual.

## [1.7.0] — 2026-11-23

### Adicionado

- **Identidade visual**: logo do macaco puxando a sigla **SQL** (`docs/img/logo.svg`), aplicada no
  cabeçalho do portal, no favicon (`public/favicon.svg` + PNG 64), no ícone de app
  (`logo-192.png`), no README e no app personalizado do ZimaOS/CasaOS.
- `docs/img/social-preview.png` (1280×640) para o *Social preview* do GitHub.
- Versões rasterizadas 512 e 192 px geradas do mesmo SVG.

### Alterado

- O quadrado “PD” do cabeçalho virou a logo; `<title>`, favicon, `theme-color` e metatags `og:*`
  atualizados.

## [1.6.1] — 2026-11-23

### Corrigido

- **Instalação no ZimaOS/CasaOS**:
  - o aviso `WARNING: Error loading config file: /DATA/.docker/config.json: permission denied` foi
    eliminado (o instalador usa um `DOCKER_CONFIG` temporário quando o HOME não é gravável);
  - a detecção de IP não depende mais de `hostname -I` (que falta em algumas versões do ZimaOS):
    tenta a rota padrão (`ip -4 route get`) e depois `ip -4 addr`, e avisa como descobrir se falhar;
  - a mensagem de erro de permissão agora mostra o comando certo (`curl -o arquivo && sudo sh arquivo`),
    porque em `sudo curl ... | sh` o `sudo` não se aplica ao `sh`.

### Adicionado

- [`install/zimaos/docker-compose.yml`](../install/zimaos/docker-compose.yml) para instalar pelo painel
  do ZimaOS/CasaOS (com bloco `x-casaos` e volume em `/DATA/AppData/puxador/data`).
- Seção **ZimaOS / CasaOS** no [guia de instalação](../install/README.md#zimaos--casaos).

## [1.6.0] — 2026-11-23

### Adicionado

- **Mapeamentos salvos na tela inicial**: a aba *Conexões* agora lista os mapeamentos com nome, tabela,
  conexão, quantidade de colunas/filtros e data. O botão **usar** remonta a tela 2 inteira (conexão,
  tabelas, relacionamentos, colunas marcadas com destino/formatação, filtros, ordenação e limite);
  **excluir** remove o mapeamento. O que é salvo passou a incluir as fontes (todas as tabelas) e a
  origem de cada coluna, permitindo reabrir extrações com relacionamento.
- **Exportar PDF**: A4 paisagem, cabeçalho repetido em cada página, linhas zebradas e rodapé
  “Página X de Y”. Gerador próprio (`src/pdf.js`), sem dependência externa; acentos em WinAnsi e
  caracteres tipográficos convertidos (`—` vira `-`).

### Verificado

- Autoteste: **31/31** (novas verificações da assinatura `%PDF` e do fechamento `%%EOF`).
- PDF real do ERP (120 linhas, 3 páginas) lido de volta pelo `pdfjs`: cabeçalhos e acentos corretos.
- Round-trip de mapeamento pela API: salvar → listar → excluir com o `config` completo.

## [1.5.0] — 2026-11-23

### Adicionado

- **Campo de busca em todos os selects longos**: relacionamento (Tabela 1, Tabela 2 e as duas colunas),
  coluna do filtro e ordenação. A filtragem acontece enquanto se digita, **ignorando maiúsculas,
  minúsculas e acentos** (`idncm` encontra `IdNcm`, `descricao` encontra `Descrição`). Quando sobra uma
  única opção, ela é selecionada automaticamente; a opção já escolhida nunca desaparece da lista.
- `npm run test:busca` (`tools/test-busca.mjs`): teste com DOM real (jsdom) que extrai as funções do
  `public/app.js` e valida maiúsculas/minúsculas, acentos, limpeza da busca e opção selecionada.
  O `check:ui` também passou a exigir que esses cinco selects estejam dentro do combo com busca.

### Alterado

- `jsdom` adicionado como **dependência de desenvolvimento** (não entra na imagem Docker nem na
  instalação do usuário, que usam `--omit=dev`).

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
