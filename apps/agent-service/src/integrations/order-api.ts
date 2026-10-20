import { z } from "zod";
import { logIntegrationEvent } from "../observability/events.js";

const orderSchema = z.object({
  id: z.string().regex(/^PED-[0-9]{4}$/),
  status: z.enum(["processing", "shipped", "cancelled"]),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive()
  }))
});

export type OrderView = z.infer<typeof orderSchema>;
export type OrderLookup =
  | { ok: true; order: OrderView }
  | { ok: false; code: "INVALID_ORDER_ID" | "ORDER_NOT_FOUND" | "ORDER_API_UNAVAILABLE" | "INVALID_API_RESPONSE" };

export interface OrdersPort {
  getOrder(id: string): Promise<OrderLookup>;
}

export class OrderApiClient implements OrdersPort {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly http: typeof fetch = fetch
  ) {
    if (!baseUrl || !token) throw new Error("Order API URL and token are required");
  }

  async getOrder(id: string): Promise<OrderLookup> {
    const startedAt = Date.now();
    let status: number | undefined;
    let outcome: "ok" | "not_found" | "unavailable" | "invalid_id" | "invalid_response" = "unavailable";

    try {
      if (!/^PED-[0-9]{4}$/.test(id)) {
        outcome = "invalid_id";
        return { ok: false, code: "INVALID_ORDER_ID" };
      }

      let response: Response;
      try {
        response = await this.http(`${this.baseUrl.replace(/\/$/, "")}/orders/${id}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(5_000)
        });
      } catch {
        outcome = "unavailable";
        return { ok: false, code: "ORDER_API_UNAVAILABLE" };
      }

      status = response.status;
      if (response.status === 404) {
        outcome = "not_found";
        return { ok: false, code: "ORDER_NOT_FOUND" };
      }
      if (!response.ok) {
        outcome = "unavailable";
        return { ok: false, code: "ORDER_API_UNAVAILABLE" };
      }

      try {
        const parsed = orderSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.id !== id) {
          outcome = "invalid_response";
          return { ok: false, code: "INVALID_API_RESPONSE" };
        }
        outcome = "ok";
        return { ok: true, order: parsed.data };
      } catch {
        outcome = "invalid_response";
        return { ok: false, code: "INVALID_API_RESPONSE" };
      }
    } finally {
      logIntegrationEvent("order_api.lookup", outcome === "ok" ? "INFO" : "WARNING", {
        status, outcome, durationMs: Date.now() - startedAt
      });
    }
  }
}
