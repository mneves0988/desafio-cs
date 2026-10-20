import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderApiClient } from "../src/integrations/order-api.js";
import { FakeStoreClient, FakeStoreError } from "../src/integrations/fake-store.js";

const TOKEN = "super-secret-token-for-test";
const product = {
  id: 1, title: "PRIVATE TITLE - do not log", price: 30.2,
  category: "demo", description: "PRIVATE DESCRIPTION"
};

function capture() {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  return {
    spy,
    entries: () => spy.mock.calls.map(call => JSON.parse(String(call[0])) as Record<string, unknown>)
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Observabilidade integrações", () => {
  it("registra consulta ao Order API sem pedido ou bearer", async () => {
    const { entries } = capture();
    const client = new OrderApiClient("http://localhost:3000", TOKEN, async () =>
      new Response(JSON.stringify({ id: "PED-1001", status: "processing", items: [] }))
    );
    expect((await client.getOrder("PED-1001")).ok).toBe(true);
    expect(entries()).toContainEqual(expect.objectContaining({
      event: "order_api.lookup", severity: "INFO", outcome: "ok", status: 200
    }));
    const json = JSON.stringify(entries());
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain("PED-1001");
  });

  it("não aceita resposta de um pedido diferente", async () => {
    const { entries } = capture();
    const client = new OrderApiClient("http://localhost:3000", TOKEN, async () =>
      new Response(JSON.stringify({ id: "PED-2001", status: "processing", items: [] }))
    );
    expect(await client.getOrder("PED-1001")).toEqual({ ok: false, code: "INVALID_API_RESPONSE" });
    expect(entries()).toContainEqual(expect.objectContaining({
      event: "order_api.lookup", outcome: "invalid_response"
    }));
  });

  it("registra Fake Store sem revelar título ou descrição do catálogo", async () => {
    const { entries } = capture();
    const client = new FakeStoreClient(async () => new Response(JSON.stringify(product)));
    expect((await client.getProduct(1)).id).toBe(1);
    expect(entries()).toContainEqual(expect.objectContaining({
      event: "fake_store.request", resource: "product", outcome: "ok"
    }));
    const json = JSON.stringify(entries());
    expect(json).not.toContain("PRIVATE TITLE");
    expect(json).not.toContain("PRIVATE DESCRIPTION");
  });

  it("registra falha de validação externa sem payload bruto", async () => {
    const { entries } = capture();
    const client = new FakeStoreClient(async () => new Response(JSON.stringify({
      id: 1, title: "PRIVATE TITLE", invalid: true
    })));
    await expect(client.getProduct(1)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(entries()).toContainEqual(expect.objectContaining({
      event: "fake_store.validation_failed", outcome: "invalid_response"
    }));
    expect(JSON.stringify(entries())).not.toContain("PRIVATE TITLE");
  });

  it("categoriza indisponibilidade da Fake Store sem mensagem de erro sensível", async () => {
    const { entries } = capture();
    const client = new FakeStoreClient(async () => { throw new Error("secret diagnostic details"); });
    await expect(client.getProduct(1)).rejects.toBeInstanceOf(FakeStoreError);
    expect(entries()).toContainEqual(expect.objectContaining({
      event: "fake_store.request", severity: "WARNING", outcome: "unavailable"
    }));
    expect(JSON.stringify(entries())).not.toContain("secret diagnostic details");
  });
});
