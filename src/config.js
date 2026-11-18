// Configuracao central do Puxador de Dados.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const APP_NAME = 'Puxador de Dados';
export const APP_SLUG = 'puxador-dados';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const VERSION = pkg.version;

export const ROOT_DIR = ROOT;
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const DB_FILE = path.join(DATA_DIR, 'puxador.db');
export const KEY_FILE = path.join(DATA_DIR, 'secret.key');

export const PORT = Number(process.env.PORT || 8790);
export const HOST = process.env.HOST || '0.0.0.0';

// Senha opcional de acesso. Se vazia, o portal abre direto (uso local/rede interna).
export const ACCESS_PASSWORD = String(process.env.ACCESS_PASSWORD || '');

// Limite de linhas que a tela de resultado carrega de uma vez.
export const PREVIEW_LIMIT = Number(process.env.PREVIEW_LIMIT || 500);
// Limite maximo absoluto de linhas por exportacao (protege o servidor).
export const MAX_ROWS = Number(process.env.MAX_ROWS || 500000);
export const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 120000);
