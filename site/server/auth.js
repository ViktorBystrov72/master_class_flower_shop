import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function hashCode(code) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(code, salt, 64).toString('hex')}`;
}
export function verifyCode(code, encoded) {
  if (typeof code !== 'string' || code.length > 128) return false;
  const [salt, hash] = encoded.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(code, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function loadOwnerHash({ production }) {
  if (process.env.OWNER_CODE_HASH) {
    if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.OWNER_CODE_HASH)) throw new Error('Неверный формат OWNER_CODE_HASH');
    return process.env.OWNER_CODE_HASH;
  }
  if (production) throw new Error('Установите серверный секрет OWNER_CODE_HASH перед публикацией.');
  const passPath = resolve('../pass.txt');
  const code = existsSync(passPath) ? readFileSync(passPath, 'utf8').split('\n')[0].trim() : `AC-${randomBytes(9).toString('base64url')}`;
  const hash = hashCode(code);
  if (!existsSync(passPath)) writeFileSync(passPath, `${code}\n/admin\n`, { mode: 0o600 });
  return hash;
}
export function cookieToken(req) {
  const entry = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('flower_session='));
  const token = entry?.slice('flower_session='.length);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}
