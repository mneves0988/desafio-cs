import { describe, it, expect, vi } from "vitest";
import { CancellationOrderApiClient } from "../src/integrations/cancellation-order-api.js";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const SECRET = "test-confirmation-secret-value-more-than-thirty-two-characters";
const client = (http: typeof fetch) =>
  new CancellationOrderApiClient("http://localhost:3000", "token", http, SECRET);

describe("CancellationOrderApiClient", () => {
  it("reconhece cancelamento somente com resposta explicitamente válida", async () => {
    const http = vi.fn(async () => response({ success: true, orderId: "PED-1001", status: "cancelled" })) as unknown as typeof fetch;
    expect(await client(http).cancelOrder("PED-1001"))
      .toEqual({ ok: true, orderId: "PED-1001" });
    expect(vi.mocked(http).mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "X-Cancel-Confirmation": expect.stringMatching(/^v1\./)
      })
    });
  });

  it("resposta 200 sem sucesso confirmado nunca é aceita", async () => {
    const http = vi.fn(async () => response({ success: false, orderId: "PED-1001", status: "processing" })) as unknown as typeof fetch;
    expect(await client(http).cancelOrder("PED-1001"))
      .toEqual({ ok: false, code: "INVALID_API_RESPONSE" });
  });

  it("resposta 200 de outro pedido nunca é aceita", async () => {
    const http = vi.fn(async () => response({ success: true, orderId: "PED-2001", status: "cancelled" })) as unknown as typeof fetch;
    expect(await client(http).cancelOrder("PED-1001"))
      .toEqual({ ok: false, code: "INVALID_API_RESPONSE" });
  });

  it("409 da Order API nunca é tratado como sucesso", async () => {
    const http = vi.fn(async () => response({ code: "ORDER_NOT_CANCELABLE" }, 409)) as unknown as typeof fetch;
    expect(await client(http).cancelOrder("PED-1001"))
      .toEqual({ ok: false, code: "ORDER_NOT_CANCELABLE" });
  });

  it("erro de rede não dispara retry automático", async () => {
    const http = vi.fn(async () => { throw new Error("fail"); }) as unknown as typeof fetch;
    expect(await client(http).cancelOrder("PED-1001"))
      .toEqual({ ok: false, code: "ORDER_API_UNAVAILABLE" });
    expect(vi.mocked(http)).toHaveBeenCalledTimes(1);
  });

  it("IDs inválidos são bloqueados antes de HTTP", async () => {
    const http = vi.fn() as unknown as typeof fetch;
    expect(await client(http).cancelOrder("../../PED-1001"))
      .toEqual({ ok: false, code: "INVALID_ORDER_ID" });
    expect(http).not.toHaveBeenCalled();
  });
});
