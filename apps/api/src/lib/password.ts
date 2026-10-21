import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Formato guardado en usuario.password_hash: scrypt$<salt base64>$<hash base64>
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algoritmo, saltB64, hashB64] = stored.split('$');
  if (algoritmo !== 'scrypt' || !saltB64 || !hashB64) return false;

  const esperado = Buffer.from(hashB64, 'base64');
  const hash = await scryptAsync(password, Buffer.from(saltB64, 'base64'), esperado.length);
  return timingSafeEqual(hash, esperado);
}
