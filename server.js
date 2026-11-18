// Servidor do Puxador de Dados.
import http from 'node:http';
import fs from 'node:fs';
import { PORT, HOST, DATA_DIR, DB_FILE, PUBLIC_DIR, VERSION, APP_NAME } from './src/config.js';
import { openDb } from './src/db.js';
import { registrarRotas } from './src/routes/index.js';
import { matchRoute, parseCookies, readJson, sendJson, serveStatic, HttpError } from './src/web.js';
import { loginAtivo, sessaoValida, COOKIE_NAME } from './src/auth.js';

fs.mkdirSync(DATA_DIR, { recursive: true });
openDb(DB_FILE);
registrarRotas();

const ROTAS_LIVRES = new Set(['/api/health', '/api/login', '/api/sessao']);

function responderErro(res, err, pathname) {
  const status = err instanceof HttpError ? err.status : 500;
  const mensagem = err?.message || 'Erro inesperado.';
  if (!(err instanceof HttpError)) {
    console.error(`ERRO ${pathname}:`, err?.stack || err);
  }
  if (pathname.startsWith('/api/')) {
    sendJson(res, { ok: false, erro: mensagem }, status);
    return;
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Erro</title>
    <body style="font-family:Segoe UI,sans-serif;padding:40px;background:#f5f7fb">
    <h1 style="font-size:20px">${status}</h1><p>${mensagem.replace(/[<>&]/g, '')}</p>
    <p><a href="/">Voltar</a></p></body>`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
}

const server = http.createServer(async (req, res) => {
  const inicio = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const cookies = parseCookies(req.headers.cookie);
  const setCookies = [];

  try {
    // Estaticos
    if ((req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/api/')) {
      const arquivo = serveStatic(PUBLIC_DIR, pathname);
      if (arquivo) {
        res.writeHead(200, {
          'Content-Type': arquivo.contentType,
          'Content-Length': arquivo.buffer.length,
          'Cache-Control': pathname === '/index.html' || pathname === '/' ? 'no-cache' : 'public, max-age=300',
        }).end(req.method === 'HEAD' ? undefined : arquivo.buffer);
        return;
      }
      // SPA: qualquer rota desconhecida cai no index
      const index = serveStatic(PUBLIC_DIR, '/index.html');
      if (index) {
        res.writeHead(200, { 'Content-Type': index.contentType, 'Cache-Control': 'no-cache' }).end(index.buffer);
        return;
      }
    }

    const casada = matchRoute(req.method, pathname);
    if (!casada) throw new HttpError(404, 'Endereco nao encontrado.');

    if (loginAtivo() && pathname.startsWith('/api/') && !ROTAS_LIVRES.has(pathname)) {
      if (!sessaoValida(cookies[COOKIE_NAME])) throw new HttpError(401, 'Faca login para continuar.');
    }

    let body = {};
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      body = await readJson(req);
    }

    const ctx = {
      req, res, url, params: casada.params, cookies, setCookies, body,
      ip: (req.socket.remoteAddress || '').replace('::ffff:', ''),
    };

    const resultado = await casada.handler(ctx);
    if (resultado && resultado.handled) return; // handler ja respondeu (download)

    if (setCookies.length) {
      res.setHeader('Set-Cookie', setCookies.map((c) => {
        const parts = [`${c.name}=${encodeURIComponent(c.value ?? '')}`, `Path=${c.path || '/'}`];
        if (c.maxAge !== undefined) parts.push(`Max-Age=${c.maxAge}`);
        parts.push('HttpOnly', 'SameSite=Lax');
        return parts.join('; ');
      }));
    }

    sendJson(res, resultado ?? { ok: true });

    const dur = Date.now() - inicio;
    if (dur > 1500) console.log(`  [lento ${dur}ms] ${req.method} ${pathname}`);
  } catch (err) {
    try { responderErro(res, err, pathname); } catch { /* ignore */ }
  }
});

server.listen(PORT, HOST, () => {
  const linhas = [
    '='.repeat(60),
    `  ${APP_NAME} v${VERSION}`,
    `  Rodando em:   http://localhost:${PORT}`,
    `  Escutando em: ${HOST}:${PORT}`,
    `  Dados:        ${DB_FILE}`,
    `  Login:        ${loginAtivo() ? 'ativado (ACCESS_PASSWORD)' : 'desativado (uso interno)'}`,
    '  Para encerrar: Ctrl+C',
    '='.repeat(60),
  ];
  console.log('\n' + linhas.join('\n') + '\n');
});

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    console.log('\nEncerrando...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nA porta ${PORT} ja esta em uso. Use outra: PORT=8890 npm start\n`);
    process.exit(1);
  }
  throw err;
});
