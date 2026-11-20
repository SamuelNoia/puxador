# API REST — v1

Base: `http://localhost:8790`. Todas as respostas são JSON, exceto os downloads.
Erros seguem o formato `{ "ok": false, "erro": "mensagem" }` com o código HTTP adequado.

Quando `ACCESS_PASSWORD` está definida, todos os endpoints (exceto `/api/health`, `/api/login` e
`/api/sessao`) exigem o cookie de sessão obtido no login.

---

## Sistema

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | versão, se o login está ativo, quantidade de bancos |
| GET | `/api/sessao` | estado da autenticação |
| POST | `/api/login` | `{ senha }` → grava cookie `px_sid` (12 h) |
| POST | `/api/logout` | encerra a sessão |
| GET | `/api/catalogo` | lista das formatações disponíveis |
| GET | `/api/bancos` | bancos suportados e portas padrão |

## Conexões

| Método | Rota | Corpo / parâmetros |
|---|---|---|
| GET | `/api/conexoes` | — |
| POST | `/api/conexoes` | `{ nome, kind, host, porta, base, usuario, senha, options }` |
| PUT | `/api/conexoes/:id` | mesmos campos; senha vazia mantém a atual |
| DELETE | `/api/conexoes/:id` | — |
| POST | `/api/conexoes/:id/testar` | `{}` — testa a conexão salva |
| POST | `/api/conexoes/testar` | credenciais avulsas, sem salvar |
| GET | `/api/conexoes/:id/schemas` | schemas (PostgreSQL) |
| GET | `/api/conexoes/:id/tabelas?schema=` | tabelas e views |
| GET | `/api/conexoes/:id/colunas?tabela=&schema=` | colunas com tipo e PK |

`kind` aceita `mysql`, `mariadb`, `postgres` e `firebird`.

Resposta de uma conexão (a senha **nunca** é devolvida):

```json
{
  "id": 1, "nome": "ERP Produção", "kind": "mysql",
  "host": "10.0.1.67", "port": 3307, "database": "z_prod",
  "username": "leitor", "temSenha": true, "options": {}
}
```

## Extração

### POST `/api/puxar` — prévia

```json
{
  "conexaoId": 1,
  "schema": null,
  "tabela": "item",
  "selecao": [
    { "alias": "t0_Id", "column": "Id", "table": "t0" },
    { "alias": "t0_Descricao", "column": "Descricao", "table": "t0" },
    { "alias": "t1_Descricao", "column": "Descricao", "table": "t1" }
  ],
  "juncoes": [
    { "alias": "t1", "de": "t0", "tabela": "fabricante", "esquerda": "IdFabricante", "direita": "Id" }
  ],
  "filtros": [
    { "table": "t1", "column": "Descricao", "op": "eq", "value": "FERTAK" },
    { "table": "t0", "column": "DtMovto", "op": "between", "value": "2024-09-01", "value2": "2024-12-31 23:59:59" }
  ],
  "ordem": { "table": "t0", "column": "Descricao", "dir": "asc" },
  "limite": 100,
  "mapeamento": [
    { "origem": "t0_Id", "destino": "cod produto", "formato": "codigo" },
    { "origem": "t0_Descricao", "destino": "descricao", "formato": "maiusculo" },
    { "origem": "t1_Descricao", "destino": "fabricante", "formato": "texto" }
  ]
}
```

**Tabelas relacionadas (`juncoes`)** — cada item vira um `LEFT JOIN`; podem ser encadeados:

| Campo | Descrição |
|---|---|
| `alias` | identificador da tabela nova (`t1`, `t2`…). A tabela principal é sempre `t0` |
| `de` | alias da tabela **anterior** à qual esta se liga (`t0`, `t1`…) — permite `item → fabricante → pais` |
| `tabela` | tabela relacionada |
| `esquerda` | coluna **da tabela `de`** (a chave estrangeira) |
| `direita` | coluna **da tabela nova** (normalmente `Id`) |
| `esquema` | schema, para PostgreSQL |

**Seleção (`selecao`)**: `alias` é o nome que a coluna terá no JSON; `table` é o alias da tabela
(`t0` = principal, `t1`, `t2`… = relacionadas). O `origem` do mapeamento usa o mesmo alias.

O formato antigo continua aceito: `"colunas": ["Id", "Descricao"]` (tabela única, sem relacionamento).

Resposta:

```json
{
  "ok": true,
  "colunas": [{ "destino": "cod produto", "origem": "Id", "formato": "codigo" }],
  "linhas": [{ "cod produto": { "value": "6881", "type": "s" } }],
  "quantidade": 100,
  "total": 3515,
  "truncado": true,
  "limite": 500,
  "ms": 42,
  "sql": "SELECT `Id`, `Descricao`, `ValorVendaVarejo` FROM `item` WHERE ..."
}
```

`type` é `s` (texto) ou `n` (número) e indica como a célula deve ser gravada na planilha.

### POST `/api/puxar/contar`

Mesmo corpo (sem `mapeamento`) → `{ "ok": true, "total": 3515 }`.

### POST `/api/exportar`

Mesmo corpo de `/api/puxar` mais `formato` (`xlsx` | `csv`), `arquivo` e `titulo`.
Responde o arquivo binário com `Content-Disposition: attachment`.

### Operadores de filtro

`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (contém), `notlike`, `starts` (começa com),
`ends` (termina com), **`between`** (usa `value` e `value2`), `null`, `notnull`,
`in` (lista separada por vírgula).

Datas aceitam `YYYY-MM-DD` ou `YYYY-MM-DDTHH:mm` / `YYYY-MM-DD HH:mm:ss` — o servidor normaliza para
o formato de cada banco.

## Mapeamentos salvos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/mapeamentos?conexao=` | lista |
| POST | `/api/mapeamentos` | `{ conexaoId, nome, schema, tabela, config }` |
| DELETE | `/api/mapeamentos/:id` | remove |

## Histórico

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/historico` | últimas 40 extrações (linhas, tempo, status) |
| POST | `/api/formatos/amostra` | `{ valor, formato, decimais }` → testa uma formatação |

---

## Exemplo com curl

```bash
ID=$(curl -s -X POST http://localhost:8790/api/conexoes \
  -H 'Content-Type: application/json' \
  -d '{"nome":"ERP","kind":"mysql","host":"10.0.1.67","porta":3307,"base":"z_prod","usuario":"leitor","senha":"senha"}' \
  | jq .id)

curl -s "http://localhost:8790/api/conexoes/$ID/tabelas" | jq '.tabelas[:5]'

curl -s -X POST http://localhost:8790/api/exportar \
  -H 'Content-Type: application/json' \
  -d "{\"conexaoId\":$ID,\"tabela\":\"item\",\"formato\":\"xlsx\",
       \"colunas\":[\"Id\",\"Descricao\"],
       \"mapeamento\":[{\"origem\":\"Id\",\"destino\":\"cod produto\",\"formato\":\"codigo\"},
                      {\"origem\":\"Descricao\",\"destino\":\"descricao\",\"formato\":\"texto\"}]}" \
  -o produtos.xlsx
```
