import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockHttpServer } from "../src/channels/mock-http.js";
import { handleTelegramUpdate } from "../src/channels/telegram.js";
import type { ConversationAgent } from "../src/channels/mock-http.js";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const token = "test-token-longer-than-24-characters";
const fakeAgent: ConversationAgent = { reply: vi.fn(async () => "Pedido verificado.") };
let server: Server | undefined;
let base = "";

async function start() {
  server = createMockHttpServer(fakeAgent, token);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function post(payload: unknown, authorization = `Bearer ${token}`) {
  return fetch(base + "/messages", {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  });
}

afterEach(async () => {
  vi.clearAllMocks();
  if (server) {
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => current.close(err => err ? reject(err) : resolve()));
  }
});

describe("mock HTTP", () => {
  it("exige token mesmo em localhost", async () => {
    await start();
    expect((await post({ message: "oi" }, "Bearer wrong")).status).toBe(401);
    expect(fakeAgent.reply).not.toHaveBeenCalled();
  });
  it("aceita mensagem e usa sessão confiável fixa", async () => {
    await start();
    const r = await post({ message: "Status PED-1001" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ reply: "Pedido verificado." });
    expect(fakeAgent.reply).toHaveBeenCalledWith("Status PED-1001", "http:demo-user-1");
  });
  it("rejeita sessionKey e userId enviados pelo cliente", async () => {
    await start();
    expect((await post({ message: "sim", sessionKey: "telegram:someone-else" })).status).toBe(400);
    expect((await post({ message: "sim", userId: 2 })).status).toBe(400);
    expect(fakeAgent.reply).not.toHaveBeenCalled();
  });
  it("rejeita conteúdo inválido e JSON malformado", async () => {
    await start();
    expect((await post({ message: 123 })).status).toBe(400);
    expect((await post("{broken")).status).toBe(400);
  });
  it("nega entrada grande antes da orquestração", async () => {
    await start();
    expect((await post({ message: "a".repeat(9000) })).status).toBe(413);
    expect(fakeAgent.reply).not.toHaveBeenCalled();
  });
  it("exibe health sem expor tokens", async () => {
    await start();
    const r = await fetch(base + "/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ service: "agent-service" });
  });
});

describe("Telegram aberto (somente demo ficticia)", () => {
  it("atende qualquer usuario de chat privado valido", async () => {
    const send = vi.fn(async () => {});
    await handleTelegramUpdate({ message: { chat: { id: 44, type: "private" }, from: { id: 44 }, text: "Status PED-1001" } }, fakeAgent, send);
    expect(fakeAgent.reply).toHaveBeenCalledWith("Status PED-1001", "telegram:demo-user-1:44");
    expect(send).toHaveBeenCalledWith(44, "Pedido verificado.");
  });
  it("separa sessoes de dois usuarios diferentes", async () => {
    const send = vi.fn(async () => {});
    await handleTelegramUpdate({ message: { chat: { id: 44, type: "private" }, from: { id: 44 }, text: "Quero cancelar PED-1001" } }, fakeAgent, send);
    await handleTelegramUpdate({ message: { chat: { id: 55, type: "private" }, from: { id: 55 }, text: "sim" } }, fakeAgent, send);
    expect(fakeAgent.reply).toHaveBeenNthCalledWith(1, "Quero cancelar PED-1001", "telegram:demo-user-1:44");
    expect(fakeAgent.reply).toHaveBeenNthCalledWith(2, "sim", "telegram:demo-user-1:55");
  });
  it("ignora mensagens de grupos e mensagens de bots", async () => {
    const send = vi.fn(async () => {});
    await handleTelegramUpdate({ message: { chat: { id: -300, type: "group" }, from: { id: 44 }, text: "sim" } }, fakeAgent, send);
    await handleTelegramUpdate({ message: { chat: { id: 44, type: "private" }, from: { id: 44, is_bot: true }, text: "sim" } }, fakeAgent, send);
    expect(fakeAgent.reply).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("bloqueia spoofing por usuario diferente do chat privado", async () => {
    const send = vi.fn(async () => {});
    await handleTelegramUpdate({ message: { chat: { id: 55, type: "private" }, from: { id: 44 }, text: "sim" } }, fakeAgent, send);
    expect(fakeAgent.reply).not.toHaveBeenCalled();
  });
  it("/start explica que e uma demonstracao", async () => {
    const send = vi.fn(async () => {});
    await handleTelegramUpdate({ message: { chat: { id: 44, type: "private" }, from: { id: 44 }, text: "/start" } }, fakeAgent, send);
    expect(fakeAgent.reply).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(44, expect.stringContaining("pedidos fictícios"));
  });
  it("rejeita texto excessivo", async () => {
    const send = vi.fn(async () => {});
    await handleTelegramUpdate({ message: { chat: { id: 44, type: "private" }, from: { id: 44 }, text: "a".repeat(2001) } }, fakeAgent, send);
    expect(fakeAgent.reply).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(44, expect.stringContaining("2.000"));
  });
});
