import { createHmac, randomBytes } from "node:crypto";

/** Private proof for internal Order API calls; never expose it to Telegram or LLM. */
export function issueCancellationProof(orderId: string, secret: string, now = Date.now()): string {
  if (!/^PED-[0-9]{4}$/.test(orderId) || secret.length < 32) {
    throw new Error("Confirmation proof configuration invalid");
  }
  const timestamp = String(now);
  const nonce = randomBytes(16).toString("hex");
  const mac = createHmac("sha256", secret)
    .update(`v1\n${orderId}\n${timestamp}\n${nonce}`)
    .digest("hex");
  return `v1.${timestamp}.${nonce}.${mac}`;
}
