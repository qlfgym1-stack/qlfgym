const SEPARATOR = '.';

function base64UrlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/, '');
}

function base64Decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function hmacSign(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(sig);
}

export async function signCookie(value: string, secret: string): Promise<string> {
  const signature = await hmacSign(value, secret);
  return `${value}${SEPARATOR}${signature}`;
}

export async function verifyCookie(signedValue: string, secret: string): Promise<string | null> {
  const lastSep = signedValue.lastIndexOf(SEPARATOR);
  if (lastSep === -1) return null;
  const value = signedValue.slice(0, lastSep);
  const expectedSig = signedValue.slice(lastSep + 1);
  const actualSig = await hmacSign(value, secret);
  if (expectedSig !== actualSig) return null;
  return value;
}

export function parseCookieValue(cookieValue: string): Record<string, string> | null {
  try {
    const json = new TextDecoder().decode(base64Decode(cookieValue));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function stringifyCookieValue(obj: Record<string, string>): string {
  return btoa(JSON.stringify(obj));
}
