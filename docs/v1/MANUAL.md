# Manual de uso — v1.2

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
| **Base de dados** | nome da base. **No Firebird** é o caminho do arquivo no servidor |
| **Usuário / Senha** | credenciais do banco |

Use **Testar conexão** antes de salvar: ele conecta, lê a versão do servidor e mostra o tempo de resposta.
Se falhar, a mensagem do banco aparece ali mesmo (senha inválida, host inacessível, caminho errado…).

**Opções avançadas**: `Schema` (só PostgreSQL, padrão `public`) e `Usar SSL`.

Depois de salva, a conexão aparece à direita com quatro ações:

- **testar** — confere se ainda está acessível
- **usar** — leva para a tela 2 já com essa conexão escolhida
- **editar** — reabre o formulário (deixe a senha em branco para manter a atual)
- **excluir** — remove a conexão e os mapeamentos ligados a ela

> Dica: cadastre um usuário de banco **somente leitura**. O Puxador nunca executa `INSERT`,
> `UPDATE` ou `DELETE`, mas o hábito protege contra acidente.

### Mapeamentos salvos

Abaixo das conexões fica a lista de **Mapeamentos salvos** — as configurações de extração que você
guardou com **Salvar mapeamento** na tela de resultado.

Cada item mostra o nome, a tabela principal, a conexão, quantas colunas/filtros tem e quando foi salvo.

- **usar** — remonta a tela 2 exatamente como estava: conexão, tabelas, relacionamentos, colunas
  marcadas (com nome na planilha e formatação), filtros, ordenação e limite. Depois é só clicar em
  **Puxar dados**.
- **excluir** — remove o mapeamento (não afeta os dados do ERP).

> Um mapeamento guarda apenas a *receita*; os dados são sempre lidos na hora, do banco.

---

## 2 · Puxar dados

A tela é numerada na ordem em que você trabalha: **1** tabelas → **2** colunas → **3** relacionamentos
→ **4** filtros → **5** ordenação e limite.

> **Pesquisa em todo campo de seleção.** Os campos com muitas opções (tabelas, colunas, tabela
> relacionada, coluna do filtro, ordenação) têm um campo de busca logo acima da lista: basta digitar
> parte do nome e a lista diminui na hora, **ignorando maiúsculas/minúsculas e acentos**
> (`descricao` encontra `Descrição`). Se sobrar só uma opção, ela é selecionada automaticamente.

### 1 · Tabelas e colunas

1. Escolha a **conexão** no canto superior direito do cartão.
2. Clique em **+ adicionar tabela**.
3. Ache a tabela de dois jeitos: digitando parte do nome no campo **Pesquisar tabela** (filtra na hora)
   ou escolhendo direto na lista — as tabelas mostram uma estimativa de linhas (`~11043`).
4. Quer cruzar com outra tabela (ex.: `fabricante`)? Clique em **+ adicionar tabela** de novo e escolha
   a segunda tabela. Pode repetir para até **6 tabelas**.

Cada fonte aparece numerada (**Fonte 1** é a principal) e mostra quantas colunas existem e quantas
estão marcadas. Dá para remover as fontes extras a qualquer momento.

### 2 · Colunas e formatação

Todas as colunas de todas as fontes aparecem numa única grade, agrupadas por tabela.

| Coluna da grade | Para que serve |
|---|---|
| ☑ | marcar/desmarcar a coluna na saída |
| **Coluna no banco** | nome técnico, com o tipo e a marcação `PK` quando é chave primária |
| **Tipo** | tipo no banco (ajuda a decidir a formatação) |
| **Nome na planilha** | **o cabeçalho que vai sair no arquivo** — é aqui que `Id` vira `cod produto` |
| **Formatação** | como o valor é convertido |
| **Decimais** | casas decimais para número/moeda/decimal |

Use o campo **pesquisar coluna ou tabela** para achar rápido em tabelas com centenas de colunas.
Os botões **marcar visíveis / desmarcar visíveis** agem só no que está filtrado pela pesquisa.

**Minimizar as fontes.** Cada faixa azul da grade (`Fonte 1 · item`, `Fonte 2 · fabricante`) tem um
botão **▾/▸** que recolhe só aquela tabela — com 154 colunas do `item`, isso deixa a `fonte 2`
visível sem rolar. O cabeçalho continua mostrando quantas colunas existem e quantas estão marcadas.
O botão **minimizar** no topo recolhe a grade inteira; ele vira **expandir** para voltar.

> **Nomes repetidos.** Colunas de tabelas diferentes podem ter o mesmo nome (`Id`, `Descricao`).
> Para evitar que uma sobrescreva a outra na planilha, as colunas vindas de tabelas relacionadas ganham
> o prefixo da tabela (`fabricante_Id`, `fabricante_Descricao`). Se você renomear duas colunas para o
> mesmo nome, o campo fica **vermelho** e o Puxador bloqueia a extração avisando quais nomes repetem.

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

### 3 · Relacionamentos

Só aparece quando existe mais de uma tabela. Cada relacionamento é uma igualdade entre duas tabelas,
com o nome real delas (nada de “fonte 1 / fonte 2”):

```
Tabela 1 [item ▼]   Coluna [IdFabricante ▼]   =   Tabela 2 [fabricante ▼]   Coluna [Id ▼]
```

- **Tabela 1** — qualquer tabela já adicionada. É o que permite encadear `item → fabricante → país`.
- **Tabela 2** — a tabela deste relacionamento; trocar aqui recarrega as colunas e a saída.
- O sistema já sugere o par: procura `IdFabricante` na Tabela 1 e a chave primária `Id` na Tabela 2.

Logo abaixo, em **“O que sai de fabricante”**, você configura a saída sem precisar voltar à grade:

```
☑  Descricao   →  nome na planilha [fabricante]   formatação [Texto ▼]   decimais [ ]
```

Use **“+ adicionar coluna de fabricante…”** para trazer outras colunas da mesma tabela. O que você
marca aqui é o mesmo que aparece na grade de colunas — os dois lugares ficam sincronizados.

O SQL gerado é `LEFT JOIN`, então registros sem correspondência **continuam aparecendo**, com as
colunas da outra tabela vazias.

### 4 · Filtros

Clique em **+ filtro**. Cada linha tem coluna, operador e valor:

`igual a`, `diferente de`, `contém`, `começa com`, `maior que`, `maior ou igual`, `menor que`,
`menor ou igual`, **`entre (período)`**, `está vazio`, `não está vazio`.

A lista de colunas inclui as colunas das tabelas relacionadas (aparecem como `fabricante · Descricao`).
Com várias tabelas, dá para filtrar por qualquer uma delas.

**Datas e horas:** quando a coluna é de data, o campo de valor vira um **calendário** (`data`) ou
**data e hora** (`data e hora`) — dá para escolher no calendário **ou digitar direto**
(`dd/mm/aaaa` e `hh:mm`). No operador **entre**, aparecem dois campos (de / até); se a coluna tiver
hora e você informar só a data final, o sistema inclui até `23:59:59` do último dia.

Os filtros são combinados com **E** (todos precisam ser verdadeiros).
Os valores vão como parâmetros para o banco — não há risco de injeção.

### 5 · Ordenação e limite

- **Ordenar por**: qualquer coluna de qualquer fonte, crescente ou decrescente.
- **Limite de linhas**: `0` = todas. A **prévia** mostra até 500 linhas (configurável por
  `PREVIEW_LIMIT`); a **exportação** respeita o limite digitado, até `MAX_ROWS`.

**Contar registros** executa um `COUNT(*)` com os mesmos filtros e relacionamentos, sem carregar os dados.

Clique em **Puxar dados** para ir à tela 3.

---

## 3 · Resultado

- **← Voltar** retorna para a tela anterior **na mesma posição** (tabelas, colunas, relacionamentos e
  filtros continuam como estavam, sem perder a rolagem).
- **Prévia** das linhas na tela, com os cabeçalhos já renomeados.
- **Linhas**, **total no banco** e **tempo** da consulta.
- **SQL gerado** (útil para conferir ou reaproveitar).
- **Exportar Excel** — `.xlsx` com cabeçalho azul, painel congelado e a formatação escolhida.
- **Exportar CSV** — separador `;` com BOM UTF-8, abre direto no Excel em português.
- **Exportar PDF** — A4 paisagem, com cabeçalho repetido em todas as páginas, linhas zebradas e
  numeração “Página X de Y”. Bom para conferência impressa ou envio ao cliente.
- **Salvar mapeamento** — guarda colunas/filtros/relacionamentos com um nome para reutilizar depois.

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

**Consigo cruzar três tabelas?**
Sim: adicione as três fontes e ligue a segunda à primeira e a terceira a qualquer uma das anteriores.

**O arquivo saiu com acento errado?**
Confira a formatação da coluna (`Texto` ou `Texto limpo`). O CSV já vai com BOM UTF-8 para o Excel
brasileiro reconhecer.
