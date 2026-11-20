# Manual de uso — v1

Três telas, na ordem. A barra azul no topo mostra em qual você está.

---

## 1 · Conexões

Cadastre uma vez cada banco de onde você vai puxar dados.

| Campo | O que preencher |
|---|---|
| **Banco** | MySQL, MariaDB, PostgreSQL ou Firebird |
| **Nome da conexão** | livre, só para você identificar (ex.: `ERP Produção`) |
| **Servidor** | IP ou host do banco (ex.: `10.0.1.67`) |
| **Porta** | já vem preenchida com a padrão (3306 / 5432 / 3050) |
| **Base de dados** | nome da base. **No Firebird** é o caminho do arquivo `.fdb` no servidor |
| **Usuário / Senha** | credenciais do banco |

Use **Testar conexão** antes de salvar: ele conecta, lê a versão do servidor e mostra o tempo de resposta.
Se falhar, a mensagem do banco aparece ali mesmo (senha inválida, host inacessível, base inexistente…).

**Opções avançadas**: `Schema` (só PostgreSQL, padrão `public`) e `Usar SSL`.

Depois de salva, a conexão aparece à direita com quatro ações:

- **testar** — confere se ainda está acessível
- **usar** — leva para a tela 2 já com essa conexão escolhida
- **editar** — reabre o formulário (deixe a senha em branco para manter a atual)
- **excluir** — remove a conexão e os mapeamentos ligados a ela

> Dica: cadastre um usuário de banco **somente leitura**. O Puxador nunca executa `INSERT`,
> `UPDATE` ou `DELETE`, mas o hábito protege contra acidente.

---

## 2 · Puxar dados

### Escolher a tabela

Escolha a conexão, o schema (PostgreSQL) e clique na tabela na lista.
O campo de filtro acima da lista procura pelo nome — útil em bases com centenas de tabelas.

### Colunas e formatação

Para cada coluna aparece:

| Coluna da grade | Para que serve |
|---|---|
| ☑ | marcar/desmarcar a coluna na saída |
| **Coluna no banco** | nome técnico, com o tipo e a marcação `PK` quando é chave primária |
| **Tipo** | tipo no banco (ajuda a decidir a formatação) |
| **Nome na planilha** | **o cabeçalho que vai sair no arquivo** — é aqui que `Id` vira `cod produto` |
| **Formatação** | como o valor é convertido |
| **Decimais** | casas decimais para número/moeda/decimal |

O sistema já sugere a formatação pelo tipo (campo numérico → moeda, data → data, texto → texto),
mas você pode trocar linha a linha.

**Formatações disponíveis**

| Formatação | Resultado |
|---|---|
| Original | o valor como o banco devolve |
| Texto | converte em texto |
| Código | texto preservando zeros à esquerda (`000123`) |
| Número | numérico com casas configuráveis |
| Inteiro | arredonda para inteiro |
| Decimal | numérico com casas configuráveis |
| Moeda (R$) | numérico no formato de moeda do Excel |
| Percentual | numérico em % |
| Data (dd/mm/aaaa) | `31/12/2026` |
| Data e hora | `31/12/2026 14:30` |
| Hora (hh:mm) | `14:30` |
| MAIÚSCULO / minúsculo | caixa do texto |
| Primeira Maiúscula | `Cabo Flexível` |
| Texto limpo | remove espaços duplicados e das pontas |
| Sim / Não | converte `1/0`, `S/N`, `true/false` |

### Relacionamentos (trazer o nome que está em outra tabela)

Quando a tabela principal guarda só o **Id** de outra (ex.: `item.IdFabricante`) e você precisa do
**nome** (`fabricante.Descricao`), use o card **Relacionamentos**:

1. Clique em **+ relacionamento**.
2. Escolha a **tabela relacionada** (ex.: `fabricante`).
3. Confirme as colunas da ligação — o sistema já sugere:
   - *Coluna desta tabela*: `IdFabricante`
   - *Coluna da outra tabela*: `Id`
4. Marque em **quais colunas trazer** (ex.: `Descricao`).
5. A coluna aparece na grade de colunas com a etiqueta do relacionamento — renomeie e formate como
   qualquer outra. Pode trazer várias colunas da mesma tabela, e criar até **4 relacionamentos**.

O SQL gerado usa `LEFT JOIN`, então itens **sem** fabricante continuam aparecendo (com a coluna vazia).
É possível também **filtrar** por uma coluna trazida pelo relacionamento — o campo aparece na lista de
filtros com o nome `fabricante → Descricao`.

> Prefere não usar relacionamento? Crie uma **view** no banco com o join e puxe a view.

### Filtros

Clique em **+ filtro**. Cada linha tem coluna, operador e valor:

`igual a`, `diferente de`, `contém`, `começa com`, `maior que`, `maior ou igual`, `menor que`,
`menor ou igual`, **`entre (período)`**, `está vazio`, `não está vazio`.

**Datas e horas:** quando a coluna é de data, o campo de valor vira um **calendário** (`data`) ou
**data e hora** (`data e hora`) — dá para escolher no calendário **ou digitar direto**
(`dd/mm/aaaa` e `hh:mm`). No operador **entre**, aparecem dois campos (de / até); se a coluna tiver
hora e você informar só a data final, o sistema inclui até `23:59:59` do último dia.

Os filtros são combinados com **E** (todos precisam ser verdadeiros).
Os valores vão como parâmetros para o banco — não há risco de injeção.

### Ordenação e limite

- **Ordenar por**: qualquer coluna, crescente ou decrescente. Por padrão já vem na chave primária.
- **Limite de linhas**: `0` = todas. A **prévia** mostra até 500 linhas (configurável por
  `PREVIEW_LIMIT`); a **exportação** respeita o limite que você digitar, até `MAX_ROWS`.

**Contar registros** executa um `COUNT(*)` com os mesmos filtros, sem carregar os dados.

Clique em **Puxar dados** para ir à tela 3.

---

## 3 · Resultado

- **← Voltar** retorna para a tela anterior **na mesma posição** (filtros, colunas e relacionamentos
  continuam como estavam, sem perder a rolagem).
- **Prévia** das linhas na tela, com os cabeçalhos já renomeados.
- **Linhas**, **total no banco** e **tempo** da consulta.
- **SQL gerado** (útil para conferir ou reaproveitar).
- **Exportar Excel** — `.xlsx` com cabeçalho azul, painel congelado e a formatação escolhida.
- **Exportar CSV** — separador `;` com BOM UTF-8, abre direto no Excel em português.
- **Salvar mapeamento** — guarda colunas/filtros/ordem com um nome para reutilizar depois.

> A exportação refaz a consulta com o mesmo mapeamento. Se alguém alterou o banco no meio do caminho,
> o arquivo sai com os dados atuais.

---

## Perguntas frequentes

**A senha do banco fica salva?**
Sim, cifrada (AES-256-GCM) em `data/puxador.db`, com a chave em `data/secret.key`.
Quem tiver acesso à pasta `data/` consegue abrir — proteja a pasta.

**Preciso abrir porta no firewall do banco?**
O Puxador conecta **do servidor onde ele roda** para o banco. Libere o IP do Puxador na porta do banco.

**Funciona com banco na nuvem?**
Sim, desde que a porta esteja acessível. Para bancos gerenciados (RDS, Azure) marque *Usar SSL*.

**Dá para puxar de duas tabelas ao mesmo tempo (join)?**
Não na v1. Alternativa: criar uma **view** no banco com o join e puxar a view — ela aparece na lista
de tabelas.

**O arquivo saiu com acento errado?**
Confira a formatação da coluna (`Texto` ou `Texto limpo`). O CSV já vai com BOM UTF-8 para o Excel
brasileiro reconhecer.
