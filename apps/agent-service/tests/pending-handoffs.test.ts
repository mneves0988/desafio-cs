import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresPendingHandoffStore } from "../src/persistence/pending-handoffs.js";

function setup() {
  const query = vi.fn(async (_sql: string, _args?: unknown[]) => ({ rows: [{ session_hash: "hashed", stage: "reason" }] }));
  const pool = { query } as unknown as Pool;
  return { store: new PostgresPendingHandoffStore(pool, "H".repeat(64)), query };
}

describe("Persistencia de triagem e fila interna de handoff", () => {
  it("guarda apenas hash HMAC ao iniciar triagem", async () => {
    const s = setup();
    await s.store.put("telegram:demo-user-1:7654321", "reason");
    const [sql, args] = s.query.mock.calls[0]!;
    expect(String(sql)).toContain("agent_pending_handoffs");
    expect(JSON.stringify(args)).not.toContain("7654321");
    expect(String((args ?? [])[0])).toMatch(/^[a-f0-9]{64}$/);
    expect((args ?? [])[1]).toBe("reason");
  });

  it("le fase pendente e exige validade temporal", async () => {
    const s = setup();
    expect(await s.store.get("A")).toBe("reason");
    expect(String(s.query.mock.calls[0]?.[0])).toContain("expires_at > NOW()");
  });

  it("consome pendencia uma unica vez por fase atomica", async () => {
    const s = setup();
    expect(await s.store.claim("A", "acceptance")).toBe(true);
    const [sql, args] = s.query.mock.calls[0]!;
    expect(String(sql)).toContain("DELETE FROM public.agent_pending_handoffs");
    expect(String(sql)).toContain("stage = $2");
    expect(String(sql)).toContain("RETURNING session_hash");
    expect((args ?? [])[1]).toBe("acceptance");
  });

  it("registra no banco categoria sem texto, ID de pedido ou ID de Telegram", async () => {
    const s = setup();
    await s.store.record("telegram:demo-user-1:7654321", "delivery");
    const [sql, args] = s.query.mock.calls[0]!;
    expect(String(sql)).toContain("agent_handoff_requests");
    expect(String(sql)).toContain("pending_demo");
    expect(JSON.stringify(args)).not.toContain("7654321");
    expect((args ?? [])[1]).toBe("delivery");
  });

  it("recusa segredo HMAC curto", () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    expect(() => new PostgresPendingHandoffStore(pool, "fraco")).toThrow("CANCEL_CONFIRMATION_SECRET");
  });
});
