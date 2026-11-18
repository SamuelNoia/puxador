// Registro das rotas da aplicacao.
import { route } from '../web.js';
import { loginAtivo, autenticar, sessaoValida, encerrar, COOKIE_NAME } from '../auth.js';
import { registrar as registrarConexoes } from './conexoes.js';
import { registrar as registrarDados } from './dados.js';
import { VERSION, ACCESS_PASSWORD } from '../config.js';
import { HttpError } from '../web.js';
import { BANCOS } from '../drivers/index.js';
import { FORMATOS } from '../format.js';

export function registrarRotas() {
  route('GET', '/api/health', async () => ({
    ok: true,
    versao: VERSION,
    login: loginAtivo(),
    bancos: BANCOS.length,
  }));

  route('GET', '/api/sessao', async (ctx) => ({
    autenticado: sessaoValida(ctx.cookies[COOKIE_NAME]),
    loginAtivo: loginAtivo(),
    versao: VERSION,
  }));

  route('POST', '/api/login', async (ctx) => {
    if (!loginAtivo()) return { ok: true };
    const res = autenticar(ctx.body?.senha ?? '');
    if (!res) throw new HttpError(401, 'Senha incorreta.');
    ctx.setCookies.push({ name: COOKIE_NAME, value: res.token, maxAge: 12 * 60 * 60 });
    return { ok: true };
  });

  route('POST', '/api/logout', async (ctx) => {
    encerrar(ctx.cookies[COOKIE_NAME]);
    ctx.setCookies.push({ name: COOKIE_NAME, value: '', maxAge: 0 });
    return { ok: true };
  });

  route('GET', '/api/catalogo', async () => ({ formatos: FORMATOS }));
  route('GET', '/api/bancos', async () => ({ bancos: BANCOS }));

  registrarConexoes();
  registrarDados();
}

