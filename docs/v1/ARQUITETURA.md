# Arquitetura — v1

## Visão geral

```
┌──────────────┐   HTTP + JSON    ┌─────────────────────────────┐
│  navegador   │ ───────────────► │  server.js (node:http)      │
│  SPA sem     │ ◄─────────────── │  rotas /api/*               │
│  build       │   XLSX / CSV     │                             │
└──────────────┘                  └──────────┬──────────────────┘
                                             │
                    ┌────────────────────────┼─────────────────────────┐
                    ▼                        ▼                         ▼
            ┌───────────────┐        ┌───────────────┐        ┌────────────────┐
            │ node:sqlite   │        │   drivers/    │        │  xlsx.js       │
            │ data/         │        │ mysql2, pg,   │        │  ZIP + XML     │
            │ puxador.db    │        │ node-firebird │        │  (zero dep)    │
            └───────────────┘        └───────┬───────┘        └────────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │ bancos externos │
                                    └─────────────────┘
```

## Decisões

**Sem framework HTTP.** `node:http` + um roteador de ~90 linhas (`src/web.js`) resolve o escopo:
rotas com `:param`, JSON, estáticos, download. Menos dependências, menos vulnerabilidade, nada de build.

**Front-end sem build.** `public/index.html` + `app.css` + `app.js` em módulo ES. O navegador serve
direto. Não há npm install no front, nem passo de compilação — o que está no repositório é o que roda.

**Drivers isolados.** Cada banco implementa a mesma interface em `src/drivers/`. Trocar/adicionar
banco (SQL Server, Oracle) significa criar um arquivo e registrá-lo em `drivers/index.js`. O resto do
sistema não sabe qual banco está por trás.

**SQL montado, nunca concatenado.** `query.js` cita identificadores conforme o dialeto e transforma
todo valor de filtro em parâmetro posicional (`?` ou `$1`). O texto digitado pelo usuário nunca entra
na string SQL.

**Configuração em SQLite nativo.** `node:sqlite` (Node 22.5+) evita dependência de build nativo e
mantém o backup trivial: uma pasta `data/`.

**Senhas cifradas.** AES-256-GCM (`crypto.js`) com chave própria em `data/secret.key`. A senha em
claro nunca sai do servidor — nem volta para a tela ao editar uma conexão.

**XLSX próprio.** A engine em `src/xlsx.js` escreve o pacote OOXML (ZIP + XML) sem biblioteca externa.
Gera cabeçalho estilizado, números como números, painel congelado e largura de coluna.

## Fluxo de uma extração

1. `POST /api/puxar` recebe conexão, tabela, colunas, filtros, ordem, limite e **mapeamento**.
2. O servidor busca a conexão, decifra a senha e escolhe o driver.
3. `buildSelect` monta o SQL conforme o dialeto (incluindo `FIRST n` no Firebird).
4. O driver executa e devolve as linhas cruas.
5. `aplicarFormato` converte cada valor segundo o formato da coluna, devolvendo
   `{ value, type }` — `type` define se a célula vai como número ou texto no Excel.
6. A resposta é JSON para a prévia; no `/api/exportar` o mesmo caminho gera o binário.
7. Cada execução é registrada em `runs` (linhas, tempo, status) e aparece no histórico.

## Segurança em camadas

| Camada | Medida |
|---|---|
| Rede | escuta em `0.0.0.0:8790`; use `HOST=127.0.0.1` para uso local |
| Acesso | `ACCESS_PASSWORD` opcional, cookie `HttpOnly` + `SameSite=Lax` |
| Credenciais | AES-256-GCM em repouso, chave fora do banco |
| SQL | identificadores citados + valores parametrizados |
| Limites | `PREVIEW_LIMIT`, `MAX_ROWS`, `QUERY_TIMEOUT_MS` |
| Upload | a v1 não recebe arquivos (só leitura de banco) |

## Estrutura de arquivos

```
server.js                 bootstrap: abre SQLite, registra rotas, sobe o HTTP
src/config.js             variáveis de ambiente e caminhos
src/db.js                 schema e helpers do SQLite (connections, mappings, runs)
src/crypto.js             cifra/decifra de senhas
src/web.js                roteador, JSON, estáticos, HttpError
src/auth.js               senha opcional do portal (sessões em memória)
src/query.js              dialetos, citação de identificadores, buildSelect/buildCount
src/format.js             catálogo de formatações e conversões
src/export.js             monta XLSX/CSV a partir das linhas já formatadas
src/xlsx.js               engine OOXML
src/drivers/index.js      registro dos bancos + limpeza de valores para JSON
src/drivers/mysql.js      MySQL e MariaDB
src/drivers/postgres.js   PostgreSQL
src/drivers/firebird.js   Firebird
src/routes/index.js       rotas de sistema, login e catálogo
src/routes/conexoes.js    CRUD + introspecção de schema
src/routes/dados.js       prévia, contagem, exportação, mapeamentos, histórico
public/                   interface
tools/selftest.js         teste ponta a ponta
tools/doctor.js           diagnóstico do ambiente
```

## Roadmap (pós-v1)

- agendar extrações (cron interno) e enviar por e-mail/SFTP;
- mais de uma tabela por extração (join guiado);
- salvar modelo de planilha com layout (cabeçalho na linha 3, colunas fixas);
- perfis de acesso e trilha de auditoria por usuário;
- conector SQL Server e Oracle.
