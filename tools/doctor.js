// Diagnostico do ambiente de instalacao.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (t) => console.log(`  ok    ${t}`);
const falha = (t) => console.log(`  FALHA ${t}`);
const aviso = (t) => console.log(`  aviso ${t}`);

let problemas = 0;

async function main() {
  console.log('\nPuxador de Dados — diagnostico\n');

  const versao = process.versions.node;
  const [major, minor] = versao.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 5)) ok(`Node.js ${versao}`);
  else { falha(`Node.js ${versao} (precisa 22.5+)`); problemas += 1; }

  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t(a)');
    db.close();
    ok('modulo node:sqlite disponivel');
  } catch {
    falha('node:sqlite indisponivel (Node antigo)');
    problemas += 1;
  }

  for (const pacote of ['mysql2', 'pg', 'node-firebird']) {
    try {
      await import(pacote);
      ok(`dependencia ${pacote}`);
    } catch {
      falha(`dependencia ${pacote} ausente — rode: npm install`);
      problemas += 1;
    }
  }

  const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const teste = path.join(dataDir, '.escrita');
    fs.writeFileSync(teste, 'x');
    fs.unlinkSync(teste);
    ok(`pasta de dados gravavel: ${dataDir}`);
  } catch (e) {
    falha(`sem permissao em ${dataDir}: ${e.message}`);
    problemas += 1;
  }

  const porta = Number(process.env.PORT || 8790);
  await new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (e) => {
      if (e.code === 'EADDRINUSE') aviso(`porta ${porta} ja esta em uso (o servidor pode estar rodando)`);
      else falha(`porta ${porta}: ${e.message}`);
      resolve();
    });
    srv.once('listening', () => { ok(`porta ${porta} livre`); srv.close(resolve); });
    srv.listen(porta, '127.0.0.1');
  });

  for (const p of ['public/index.html', 'public/app.js', 'src/xlsx.js']) {
    if (fs.existsSync(path.join(ROOT, p))) ok(`arquivo ${p}`);
    else { falha(`arquivo ${p} ausente`); problemas += 1; }
  }

  console.log(problemas ? `\n${problemas} problema(s) encontrado(s).\n` : '\nAmbiente pronto para rodar: npm start\n');
  process.exit(problemas ? 1 : 0);
}

main();
