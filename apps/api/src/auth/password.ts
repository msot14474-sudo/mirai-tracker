import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;

  return {
    passwordHash: derivedKey.toString('hex'),
    passwordSalt: salt,
  };
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
) {
  const stored = Buffer.from(passwordHash, 'hex');
  const candidate = (await scrypt(
    password,
    passwordSalt,
    stored.length,
  )) as Buffer;

  return (
    stored.length === candidate.length && timingSafeEqual(stored, candidate)
  );
}
