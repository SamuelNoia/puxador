// Autenticacao opcional: so ativa quando ACCESS_PASSWORD esta definida.
import crypto from 'node:crypto';
import { ACCESS_PASSWORD } from './config.js';

const sessoes = new Map(); // token -> expira em ms
const VALIDADE_MS = 12 * 60 * 60 * 1000;

export const COOKIE_NAME = 'px_sid';

export function loginAtivo() {
  return Boolean(ACCESS_PASSWORD);
}

export function autenticar(senha) {
  if (!loginAtivo()) return { token: 'livre' };
  const esperado = Buffer.from(ACCESS_PASSWORD);
  const recebido = Buffer.from(String(senha ?? ''));
  if (esperado.length !== recebido.length) return null;
  if (!crypto.timingSafeEqual(esperado, recebido)) return null;
  const token = crypto.randomBytes(24).toString('base64url');
  sessoes.set(token, Date.now() + VALIDADE_MS);
  return { token };
}

export function sessaoValida(token) {
  if (!loginAtivo()) return true;
  if (!token) return false;
  const expira = sessoes.get(token);
  if (!expira) return false;
  if (Date.now() > expira) {
    sessoes.delete(token);
    return false;
  }
  return true;
}

export function encerrar(token) {
  if (token) sessoes.delete(token);
}

setInterval(() => {
  const agora = Date.now();
  for (const [token, expira] of sessoes) {
    if (agora > expira) sessoes.delete(token);
  }
}, 30 * 60 * 1000).unref();
