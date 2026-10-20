import { z } from "zod";
import { OrderApiClient } from "./order-api.js";
import { issueCancellationProof } from "../security/confirmation-proof.js";

const ORDER_ID = /^PED-[0-9]{4}$/;
const cancellationResponse = z.object({
  success: z.literal(true),
  orderId: z.string().regex(ORDER_ID),
  status: z.literal("cancelled")
});

export type CancellationResult =
  | { ok: true; orderId: string }
  | { ok: false; code:
      | "INVALID_ORDER_ID"
      | "ORDER_NOT_FOUND"
      | "ORDER_NOT_CANCELABLE"
      | "UNAUTHORIZED"
      | "CONFIRMATION_REQUIRED"
      | "ORDER_API_UNAVAILABLE"
      | "INVALID_API_RESPONSE" };

export interface CancelableOrdersPort {
  getOrder(id: string): ReturnType<OrderApiClient["getOrder"]>;
  cancelOrder(id: string): Promise<CancellationResult>;
}

export class CancellationOrderApiClient extends OrderApiClient
  implements CancelableOrdersPort {
  constructor(
    private readonly url: string,
    private readonly accessToken: string,
    private readonly transport: typeof fetch = fetch,
    private readonly confirmationSecret: string = ""
  ) {
    super(url, accessToken, transport);
    if (confirmationSecret.length < 32) {
      throw new Error("CANCEL_CONFIRMATION_SECRET must have at least 32 characters");
    }
  }

  async cancelOrder(id: string): Promise<CancellationResult> {
    if (!ORDER_ID.test(id)) {
      return { ok: false, code: "INVALID_ORDER_ID" };
    }

    const proof = issueCancellationProof(id, this.confirmationSecret);
    let response: Response;
    try {
      response = await this.transport(
        `${this.url.replace(/\/$/, "")}/orders/${id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: "application/json",
            "X-Cancel-Confirmation": proof
          },
          signal: AbortSignal.timeout(5_000)
        }
      );
    } catch {
      return { ok: false, code: "ORDER_API_UNAVAILABLE" };
    }

    if (response.status === 401) return { ok: false, code: "UNAUTHORIZED" };
    if (response.status === 403) return { ok: false, code: "CONFIRMATION_REQUIRED" };
    if (response.status === 404) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (response.status === 409) return { ok: false, code: "ORDER_NOT_CANCELABLE" };
    if (!response.ok) return { ok: false, code: "ORDER_API_UNAVAILABLE" };

    try {
      const parsed = cancellationResponse.safeParse(await response.json());
      if (!parsed.success || parsed.data.orderId !== id) {
        return { ok: false, code: "INVALID_API_RESPONSE" };
      }
      return { ok: true, orderId: id };
    } catch {
      return { ok: false, code: "INVALID_API_RESPONSE" };
    }
  }
}
