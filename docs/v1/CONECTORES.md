# Conectores — v1

Cada banco tem seu driver em `src/drivers/`, todos com a mesma interface
(`test`, `listSchemas`, `listTables`, `listColumns`, `query`, `count`).

| Banco | Pacote | Porta padrão | Dialeto de citação | Limite de linhas |
|---|---|---|---|---|
| MySQL | `mysql2` | 3306 | `` `coluna` `` | `LIMIT n` |
| MariaDB | `mysql2` | 3306 | `` `coluna` `` | `LIMIT n` |
| PostgreSQL | `pg` | 5432 | `"coluna"` | `LIMIT n` |
| Firebird | `node-firebird` | 3050 | `"COLUNA"` | `SELECT FIRST n` |

---

## MySQL

- Conexão com `dateStrings: true` (datas voltam como texto, sem fuso surpresa).
- `supportBigNumbers` ligado; `DECIMAL` volta como **string** para não perder centavos — a formatação
  *Moeda*/*Número* converte na saída.
- Lista de tabelas: `information_schema.TABLES` da base escolhida; `TABLE_ROWS` é usado apenas como
  estimativa na lista.
- Escolha do banco: o campo **Base de dados** define o `database` da conexão.
- SSL opcional (`options.ssl = true`), com `rejectUnauthorized: false` para certificados internos.

## MariaDB

Usa o mesmo driver do MySQL — o protocolo é compatível. Versões 10.x e 11.x funcionam com `mysql2`.
Se a autenticação for `ed25519`, o servidor precisa permitir `mysql_native_password` (padrão no MariaDB).

## PostgreSQL

- Suporte a **schema**: a tela mostra um seletor quando há mais de um schema (padrão `public`).
- Lista tabelas e **views** do schema escolhido; estimativa de linhas via `pg_class.reltuples`.
- Chave primária detectada por `information_schema` (marca `PK` na tela).
- `statement_timeout` aplicado pela variável `QUERY_TIMEOUT_MS`.
- SSL opcional para bancos gerenciados (RDS, Azure, Supabase).

## Firebird

Diferenças importantes em relação aos outros:

1. **O campo “Base de dados” é o caminho do arquivo `.fdb` no servidor**, não um nome de base.
   Exemplo Windows: `C:\dados\empresa.fdb` · Linux: `/var/lib/firebird/3.0/data/empresa.fdb`
2. Não existe conceito de *schema* — o seletor fica oculto.
3. Os nomes de objetos são **maiúsculos** por padrão. A tela mostra e envia exatamente o que está no
   catálogo (`RDB$RELATIONS` / `RDB$RELATION_FIELDS`).
4. Limite usa `SELECT FIRST n`, compatível com 2.5 e 3+.
5. Tipos mapeados: `SMALLINT`, `INTEGER`, `BIGINT`, `FLOAT`, `DOUBLE`, `DATE`, `TIME`, `TIMESTAMP`,
   `CHAR`, `VARCHAR`, `BLOB`; `NUMERIC(p,s)` quando o campo tem escala negativa.
6. BLOBs são lidos como texto (`blobAsText: true`); BLOBs binários são exportados em hexadecimal.
7. Firebird 2.5 exige que a `wireCrypt` esteja desativada em servidores antigos — se der erro de
   conexão, ajuste `options.wireCrypt` no cadastro.

---

## Tipos × formatação sugerida

| Tipo no banco | Formatação inicial |
|---|---|
| `int`, `serial`, `bigint` | Código (preserva zeros) |
| `decimal`, `numeric`, `money`, `float`, `double` | Moeda |
| `date` | Data |
| `datetime`, `timestamp` | Data e hora |
| `time` | Hora |
| `boolean` / `bit` | Sim / Não |
| `varchar`, `text`, `char` | Texto |

A sugestão é só o ponto de partida — a escolha final é sua, coluna por coluna.

---

## Limitações conhecidas da v1

- **Uma tabela por extração.** Para juntar tabelas, crie uma *view* no banco e puxe a view.
- **Sem escrita.** O Puxador só executa `SELECT`.
- **Sem agendamento.** A exportação é sob demanda, pelo navegador.
- **Firebird 1.x** não é suportado.
- **Bancos com autenticação proprietária** (Kerberos, IAM) não foram testados.
