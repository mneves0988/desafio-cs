import { createHmac, timingSafeEqual } from "node:crypto";

const WINDOW_MS = 60_000;

/** Only trusted Agent Service can mint this short-lived demo confirmation proof. */
export function verifyCancellationProof(
  orderId: string,
  proof: string | undefined,
  secret: string,
  now = Date.now()
): boolean {
  if (secret.length < 32 || !proof) return false;
  const parts = /^v1\.(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(proof);
  if (!parts) return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isSafeInteger(issuedAt) || Math.abs(now - issuedAt) > WINDOW_MS) return false;

  const payload = `v1\n${orderId}\n${parts[1]}\n${parts[2]}`;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const provided = Buffer.from(parts[3]!, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
