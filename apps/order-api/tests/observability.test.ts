import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { MemoryOrderRepository, demoOrders } from "../src/orders.js";

const SECRET = "test-confirmation-secret-longer-than-32-characters";
const TOKEN = "test-token-observability";

function prepare() {
  const logs = vi.spyOn(console, "log").mockImplementation(() => {});
  const app = createApp(new MemoryOrderRepository(demoOrders), new Map([[TOKEN, 1]]), SECRET);
  return { app, logs };
}

afterEach(() => vi.restoreAllMocks());

describe("Observabilidade Order API", () => {
  it("registra consulta com severidade, resultado HTTP e tempo sem expor pedido ou token", async () => {
    const { app, logs } = prepare();
    const response = await request(app).get("/orders/PED-1001")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    const entries = logs.mock.calls.map(call => JSON.parse(String(call[0])) as Record<string, unknown>);
    const entry = entries.find(log => log.event === "order.lookup");
    expect(entry).toMatchObject({ severity: "INFO", service: "order-api", status: 200 });
    expect(typeof entry?.durationMs).toBe("number");
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("PED-1001");
    expect(serialized).not.toContain(TOKEN);
  });

  it("registra cancelamento bloqueado sem material de confirmacao", async () => {
    const { app, logs } = prepare();
    const response = await request(app).post("/orders/PED-1001/cancel")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(response.status).toBe(403);
    const entries = logs.mock.calls.map(call => JSON.parse(String(call[0])) as Record<string, unknown>);
    expect(entries).toContainEqual(expect.objectContaining({
      event: "order.cancel", severity: "WARNING", status: 403
    }));
    expect(JSON.stringify(entries)).not.toContain("PED-1001");
  });
});
