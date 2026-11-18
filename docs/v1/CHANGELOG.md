# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento [SemVer](https://semver.org/lang/pt-BR/).

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
