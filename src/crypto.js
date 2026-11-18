// Criptografia das senhas de banco guardadas localmente.
// AES-256-GCM com chave gerada na primeira execucao (data/secret.key).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { KEY_FILE, DATA_DIR } from './config.js';

let _key = null;

function loadKey() {
  if (_key) return _key;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) {
    const raw = fs.readFileSync(KEY_FILE);
    if (raw.length !== 32) throw new Error('Arquivo secret.key invalido.');
    _key = raw;
    return _key;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  try { fs.chmodSync(path.dirname(KEY_FILE), 0o700); } catch { /* windows */ }
  _key = key;
  return _key;
}

/** Criptografa um texto e devolve "v1:iv:tag:conteudo" em base64url. */
export function encrypt(text) {
  if (text === null || text === undefined || text === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(':');
}

/** Descriptografa o formato acima. Devolve '' quando o valor nao foi cifrado. */
export function decrypt(payload) {
  if (!payload) return '';
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return String(payload);
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** Mascara usada na API: nunca devolve a senha em claro para o navegador. */
export function maskSecret(has) {
  return has ? '********' : '';
}
