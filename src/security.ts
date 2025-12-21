import { createHmac, timingSafeEqual } from "crypto";

export interface HmacConfig {
  secret: string;
  maxSkewMs?: number;
}

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    const expected = signBody(body, secret);
    const expectedBuf = Buffer.from(expected, "hex");
    const signatureBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

export function validateWindow(iat: number, exp: number, maxSkewMs = 60_000): boolean {
  const now = Date.now();
  if (iat > now + maxSkewMs) return false;
  if (exp < now - maxSkewMs) return false;
  if (exp <= iat) return false;
  return true;
}
