const B = 'http://127.0.0.1:8790';
const j = async (m, p, b) => {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 200); }
  return { s: r.status, d };
};

const conexoes = await j('GET', '/api/conexoes');
const id = conexoes.d.conexoes.find((c) => c.kind === 'mysql').id;
console.log('conexao mysql:', id);

// 1) LEFT JOIN item -> fabricante, trazendo o nome e filtrando por ele
const corpo = {
  conexaoId: id,
  tabela: 'item',
  juncoes: [{ tabela: 'fabricante', esquerda: 'IdFabricante', direita: 'Id' }],
  selecao: [
    { alias: 'Id', column: 'Id', table: null },
    { alias: 'Descricao', column: 'Descricao', table: null },
    { alias: 'j1_Descricao', column: 'Descricao', table: 'j1' },
  ],
  filtros: [{ table: 'j1', column: 'Descricao', op: 'eq', value: 'FERTAK' }],
  mapeamento: [
    { origem: 'Id', destino: 'cod', formato: 'codigo' },
    { origem: 'Descricao', destino: 'produto', formato: 'texto' },
    { origem: 'j1_Descricao', destino: 'fabricante', formato: 'texto' },
  ],
  ordem: { table: 'j1', column: 'Descricao', dir: 'asc' },
  limite: 5,
};

const r1 = await j('POST', '/api/puxar', corpo);
console.log('\n1) join + filtro no fabricante:', r1.s, '| linhas:', r1.d.quantidade, '| total:', r1.d.total);
console.log('   sql:', r1.d.sql);
console.log('   amostra:', JSON.stringify(r1.d.linhas?.[0]));

// 2) contagem com o mesmo filtro
const r2 = await j('POST', '/api/puxar/contar', { ...corpo, mapeamento: undefined });
console.log('\n2) contagem com join:', r2.s, '| total:', r2.d.total);

// 3) filtro de data com "entre"
const r3 = await j('POST', '/api/puxar', {
  conexaoId: id,
  tabela: 'pedido_compra_cab',
  selecao: [
    { alias: 'Id', column: 'Id', table: null },
    { alias: 'DtMovto', column: 'DtMovto', table: null },
    { alias: 'ValorTotalPedido', column: 'ValorTotalPedido', table: null },
  ],
  filtros: [{ table: null, column: 'DtMovto', op: 'between', value: '2024-09-01', value2: '2024-12-31 23:59:59' }],
  mapeamento: [
    { origem: 'Id', destino: 'pedido', formato: 'codigo' },
    { origem: 'DtMovto', destino: 'data', formato: 'data' },
    { origem: 'ValorTotalPedido', destino: 'valor', formato: 'moeda' },
  ],
  ordem: { table: null, column: 'DtMovto', dir: 'asc' },
  limite: 30,
});
console.log('\n3) filtro entre datas:', r3.s, '| linhas:', r3.d.quantidade, '| total:', r3.d.total);
if (r3.d.linhas?.length) {
  console.log('   primeira:', JSON.stringify(r3.d.linhas[0]));
  console.log('   ultima  :', JSON.stringify(r3.d.linhas[r3.d.linhas.length - 1]));
}

// 4) filtro de data com datetime-local (T)
const r4 = await j('POST', '/api/puxar/contar', {
  conexaoId: id,
  tabela: 'pedido_compra_cab',
  filtros: [{ table: null, column: 'DtMovto', op: 'gte', value: '2024-11-01T00:00' }],
});
console.log('\n4) datetime-local (T):', r4.s, '| total:', r4.d.total);
