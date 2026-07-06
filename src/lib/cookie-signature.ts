import crypto from 'crypto';

const ALGORITHM = 'sha256';
const SEPARATOR = '.';

export function signCookie(value: string, secret: string): string {
  const hmac = crypto.createHmac(ALGORITHM, secret);
  hmac.update(value);
  const signature = hmac.digest('base64').replace(/=+$/, '');
  return `${value}${SEPARATOR}${signature}`;
}

export function verifyCookie(signedValue: string, secret: string): string | null {
  const lastSep = signedValue.lastIndexOf(SEPARATOR);
  if (lastSep === -1) return null;
  const value = signedValue.slice(0, lastSep);
  const expectedSig = signedValue.slice(lastSep + 1);
  const hmac = crypto.createHmac(ALGORITHM, secret);
  hmac.update(value);
  const actualSig = hmac.digest('base64').replace(/=+$/, '');
  if (expectedSig !== actualSig) return null;
  return value;
}

export function parseCookieValue(cookieValue: string): Record<string, string> | null {
  try {
    return JSON.parse(Buffer.from(cookieValue, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

export function stringifyCookieValue(obj: Record<string, string>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}
