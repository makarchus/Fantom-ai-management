import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function generateEncryptionKey() {
  return randomUUID();
}

export function normalizeEncryptionKey(key) {
  return key.trim().toLowerCase();
}

export function deriveDataKey(encryptionKey, userSalt) {
  return scryptSync(normalizeEncryptionKey(encryptionKey), userSalt, 32, SCRYPT_PARAMS);
}

export function createKeyVerifier(encryptionKey, userSalt) {
  const derived = deriveDataKey(encryptionKey, userSalt);
  return createHmac('sha256', userSalt).update(derived).digest('base64');
}

export function verifyEncryptionKey(encryptionKey, userSalt, storedVerifier) {
  if (!encryptionKey || !userSalt || !storedVerifier) return false;
  const computed = createKeyVerifier(encryptionKey, userSalt);
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(storedVerifier));
  } catch {
    return false;
  }
}

export function encryptString(plaintext, dataKey) {
  if (plaintext == null) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

export function decryptString(payload, dataKey) {
  if (!payload) return null;
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    dataKey,
    Buffer.from(parsed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function encryptJson(value, dataKey) {
  if (value == null) return null;
  return encryptString(JSON.stringify(value), dataKey);
}

export function decryptJson(payload, dataKey) {
  if (!payload) return null;
  return JSON.parse(decryptString(payload, dataKey));
}

export function generateUserSalt() {
  return randomBytes(16).toString('base64');
}

export function hashVerificationCode(code, pendingId) {
  return createHmac('sha256', pendingId).update(String(code).trim()).digest('base64');
}

export function verifyVerificationCode(code, pendingId, storedHash) {
  const computed = hashVerificationCode(code, pendingId);
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

export function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getStorageMasterKey() {
  const secret = process.env.ENCRYPTION_STORAGE_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_STORAGE_KEY or SESSION_SECRET must be set');
  }
  return scryptSync(secret, 'fantom-vault-storage', 32, SCRYPT_PARAMS);
}

export function encryptForStorage(plaintext, storageKey = getStorageMasterKey()) {
  return encryptString(plaintext, storageKey);
}

export function decryptFromStorage(payload, storageKey = getStorageMasterKey()) {
  return decryptString(payload, storageKey);
}
