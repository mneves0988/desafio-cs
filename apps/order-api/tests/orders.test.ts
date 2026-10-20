import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app";
import { MemoryOrderRepository, demoOrders } from "../src/orders";

const SECRET = "a-test-confirmation-secret-longer-than-thirty-two-characters";
const auth = { Authorization: "Bearer test-token" };

function confirmation(orderId: string, issuedAt = Date.now()) {
  const nonce = "1234567890abcdef1234567890abcdef";
  const timestamp = String(issuedAt);
  const mac = createHmac("sha256", SECRET)
    .update(`v1\n${orderId}\n${timestamp}\n${nonce}`)
    .digest("hex");
  return `v1.${timestamp}.${nonce}.${mac}`;
}

function setup() {
  const repository = new MemoryOrderRepository(demoOrders);
  const app = createApp(repository, new Map([["test-token", 1]]), SECRET);
  return { app, repository };
}

describe("Order API - Regras de negócio e confirmação", () => {
  it("01 - Health check retorna 200", async () => {
    const { app } = setup();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("02 - Exige autenticação", async () => {
    const { app } = setup();
    const res = await request(app).get("/orders/PED-1001");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("03 - Consulta pedido autorizado", async () => {
    const { app } = setup();
    const res = await request(app).get("/orders/PED-1001").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processing");
    expect(res.body.userId).toBeUndefined();
  });

  it("04 - Protege pedidos de outros clientes", async () => {
    const { app } = setup();
    const res = await request(app).get("/orders/PED-2001").set(auth);
    expect(res.status).toBe(404);
  });

  it("05 - Rejeita identificadores inválidos", async () => {
    const { app } = setup();
    const res = await request(app).get("/orders/INVALIDO").set(auth);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ORDER_ID");
  });

  it("06 - Cancela pedido em processamento somente com prova assinada", async () => {
    const { app } = setup();
    const res = await request(app).post("/orders/PED-1001/cancel")
      .set(auth).set("X-Cancel-Confirmation", confirmation("PED-1001"));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("cancelled");
  });

  it("07 - Impede cancelamento de pedido enviado", async () => {
    const { app } = setup();
    const res = await request(app).post("/orders/PED-1002/cancel")
      .set(auth).set("X-Cancel-Confirmation", confirmation("PED-1002"));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORDER_NOT_CANCELABLE");
  });

  it("08 - Impede cancelamento de outro cliente", async () => {
    const { app } = setup();
    const res = await request(app).post("/orders/PED-2001/cancel")
      .set(auth).set("X-Cancel-Confirmation", confirmation("PED-2001"));
    expect(res.status).toBe(404);
  });

  it("09 - Persiste estado e impede novo cancelamento", async () => {
    const { app } = setup();
    const first = await request(app).post("/orders/PED-1001/cancel")
      .set(auth).set("X-Cancel-Confirmation", confirmation("PED-1001"));
    expect(first.status).toBe(200);
    const consultation = await request(app).get("/orders/PED-1001").set(auth);
    expect(consultation.body.status).toBe("cancelled");
    const second = await request(app).post("/orders/PED-1001/cancel")
      .set(auth).set("X-Cancel-Confirmation", confirmation("PED-1001"));
    expect(second.status).toBe(409);
  });

  it("10 - Bloqueia cancelamento direto sem confirmação", async () => {
    const { app } = setup();
    const res = await request(app).post("/orders/PED-1001/cancel").set(auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CONFIRMATION_REQUIRED");
    expect((await request(app).get("/orders/PED-1001").set(auth)).body.status).toBe("processing");
  });

  it("11 - Bloqueia prova de confirmação para outro pedido", async () => {
    const { app } = setup();
    const res = await request(app).post("/orders/PED-1001/cancel")
      .set(auth).set("X-Cancel-Confirmation", confirmation("PED-1002"));
    expect(res.status).toBe(403);
  });

  it("12 - Bloqueia prova de confirmação expirada", async () => {
    const { app } = setup();
    const res = await request(app).post("/orders/PED-1001/cancel")
      .set(auth).set("X-Cancel-Confirmation", confirmation("PED-1001", Date.now() - 120_000));
    expect(res.status).toBe(403);
  });

  it("13 - Bloqueia prova manipulada", async () => {
    const { app } = setup();
    const proof = confirmation("PED-1001");
    const res = await request(app).post("/orders/PED-1001/cancel")
      .set(auth).set("X-Cancel-Confirmation", proof.slice(0, -1) + (proof.at(-1) === "a" ? "b" : "a"));
    expect(res.status).toBe(403);
  });

  it("14 - Bloqueia configuração com segredo fraco", () => {
    expect(() => createApp(new MemoryOrderRepository(demoOrders), new Map(), "short"))
      .toThrow("CANCEL_CONFIRMATION_SECRET");
  });
});
