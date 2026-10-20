import { describe, expect, it, vi } from "vitest";
import { ContextualConversationAgent } from "../src/agent/contextual-agent.js";
import type { ContextKind, SessionContextStore } from "../src/persistence/session-context.js";

const SESSION_A = "telegram:demo-user-1:111";
const SESSION_B = "telegram:demo-user-1:222";

function setup() {
  const data = new Map<string, string>();
  const key = (session: string, kind: ContextKind) => `${session}:${kind}`;
  const context: SessionContextStore = {
    get: vi.fn(async (session, kind) => data.get(key(session, kind)) ?? null),
    save: vi.fn(async (session, kind, ref) => { data.set(key(session, kind), ref); }),
    clear: vi.fn(async (session, kind) => { data.delete(key(session, kind)); })
  };
  const base = {
    reply: vi.fn(async (text: string) => {
      if (text.includes("Quero cancelar")) {
        return "O pedido PED-1001 está em processamento. Confirma o cancelamento? Responda somente \"sim\" ou \"não\" em até 10 minutos.";
      }
      if (text === "sim") return "Não há um cancelamento pendente para confirmar. Informe o pedido que deseja cancelar.";
      if (text.includes("PED-2001")) return "Não encontrei esse pedido na conta autenticada. Confira o número ou solicite atendimento humano.";
      const order = text.match(/PED-[0-9]{4}/)?.[0];
      if (order) return `O pedido ${order} está em processamento, conforme a Order API.`;
      const product = text.match(/produto (\d+)/i)?.[1];
      if (product) return `Produto ${product}: Produto demonstrativo. Preço de referência: 109.95 (moeda da Fake Store).`;
      return "Preciso de mais informações.";
    })
  };
  return { agent: new ContextualConversationAgent(base, context), base, context, data };
}

describe("Memoria contextual minima", () => {
  it("guarda pedido apenas apos retorno confirmado pela Order API", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    expect(s.data.get(`${SESSION_A}:order`)).toBe("PED-1001");
    expect(s.context.save).toHaveBeenCalledWith(SESSION_A, "order", "PED-1001");
  });

  it("resolve 'e qual o status dele?' com o ultimo pedido verificado", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    expect(await s.agent.reply("E qual o status dele?", SESSION_A))
      .toContain("PED-1001 está em processamento");
    expect(s.base.reply).toHaveBeenLastCalledWith("Qual o status do pedido PED-1001?", SESSION_A);
  });

  it("nao inventa pedido quando nao ha contexto", async () => {
    const s = setup();
    expect(await s.agent.reply("E o status dele?", SESSION_A)).toContain("Me informe o número");
    expect(s.base.reply).not.toHaveBeenCalled();
  });

  it("isola contextos de sessoes diferentes", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    expect(await s.agent.reply("E qual o status dele?", SESSION_B)).toContain("Me informe o número");
    expect(s.context.get).toHaveBeenCalledWith(SESSION_B, "order");
  });

  it("invalida contexto antigo apos tentativa de acesso a pedido desconhecido", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    await s.agent.reply("Qual o status do PED-2001?", SESSION_A);
    expect(await s.agent.reply("E qual o status dele?", SESSION_A)).toContain("Me informe o número");
  });

  it("nao transforma 'cancela ele' em cancelamento de pedido lembrado", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    await s.agent.reply("Cancela ele", SESSION_A);
    expect(s.base.reply).toHaveBeenLastCalledWith("Cancela ele", SESSION_A);
  });

  it("nao transforma 'sim' em instrucao de consulta ou cancelamento", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    await s.agent.reply("sim", SESSION_A);
    expect(s.base.reply).toHaveBeenLastCalledWith("sim", SESSION_A);
  });

  it("guarda produto confirmado e entende 'quanto ele custa?'", async () => {
    const s = setup();
    await s.agent.reply("Qual o preço do produto 1?", SESSION_A);
    expect(await s.agent.reply("Quanto ele custa?", SESSION_A)).toContain("Produto 1:");
    expect(s.base.reply).toHaveBeenLastCalledWith("Qual o preço do produto 1?", SESSION_A);
  });

  it("nao inventa previsao de entrega", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    const reply = await s.agent.reply("E quando ele chega?", SESSION_A);
    expect(reply).toContain("não tenho previsão de entrega");
    expect(s.base.reply).toHaveBeenCalledTimes(2);
    expect(s.base.reply).toHaveBeenLastCalledWith("Qual o status do pedido PED-1001?", SESSION_A);
  });

  it("um pedido de cancelamento pendente nao e memorizado como status confirmado", async () => {
    const s = setup();
    await s.agent.reply("Quero cancelar PED-1001", SESSION_A);
    expect(s.data.has(`${SESSION_A}:order`)).toBe(false);
  });

  it("erro de leitura de contexto exige ID novamente sem adivinhar", async () => {
    const s = setup();
    s.context.get = vi.fn(async () => { throw new Error("DB down"); });
    expect(await s.agent.reply("E o status dele?", SESSION_A)).toContain("Informe o identificador");
    expect(s.base.reply).not.toHaveBeenCalled();
  });

  it("nao reutiliza contexto de produto quando referencia de pedido e solicitada", async () => {
    const s = setup();
    await s.agent.reply("Qual o preço do produto 1?", SESSION_A);
    expect(await s.agent.reply("E qual o status dele?", SESSION_A)).toContain("Me informe o número");
  });
  it("entende 'Ele já saiu pra entrega?' usando o último pedido confirmado", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    const reply = await s.agent.reply("Ele já saiu pra entrega?", SESSION_A);
    expect(reply).toContain("Ainda está em processamento");
    expect(reply).toContain("Não tenho confirmação");
    expect(s.base.reply).toHaveBeenLastCalledWith("Qual o status do pedido PED-1001?", SESSION_A);
  });

  it("entende 'Tem previsão de quando chega?' e não inventa uma data", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    const reply = await s.agent.reply("Tem previsão de quando chega?", SESSION_A);
    expect(reply).toContain("não tenho previsão de entrega");
    expect(reply).not.toMatch(/amanhã|segunda-feira|dias úteis/i);
    expect(s.base.reply).toHaveBeenLastCalledWith("Qual o status do pedido PED-1001?", SESSION_A);
  });

  it("pede identificação se a pergunta de entrega não tem pedido confirmado", async () => {
    const s = setup();
    expect(await s.agent.reply("Ele já saiu pra entrega?", SESSION_B)).toContain("Me informe o número");
    expect(await s.agent.reply("Tem previsão de quando chega?", SESSION_B)).toContain("Me informe o número");
    expect(s.base.reply).not.toHaveBeenCalled();
  });

  it("não consulta pedido de outra sessão ao perguntar sobre entrega", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    expect(await s.agent.reply("Tem previsão de quando chega?", SESSION_B)).toContain("Me informe o número");
  });

  it("não afirma saída para entrega quando a Order API só confirma 'enviado'", async () => {
    const s = setup();
    s.base.reply = vi.fn(async () => "O pedido PED-1002 está enviado, conforme a Order API.");
    await s.agent.reply("Qual o status do PED-1002?", SESSION_A);
    const reply = await s.agent.reply("Ele já saiu pra entrega?", SESSION_A);
    expect(reply).toContain("Já foi enviado");
    expect(reply).toContain("não tenho confirmação de que saiu para entrega");
    expect(reply).not.toContain("Já saiu para entrega");
  });

  it("não fabrica previsão quando a consulta atual falha", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    s.base.reply = vi.fn(async () => "Não foi possível confirmar o status do pedido agora. Posso oferecer atendimento humano.");
    expect(await s.agent.reply("Tem previsão de quando chega?", SESSION_A))
      .toContain("Não foi possível confirmar o status");
  });

  it("consegue recuperar a referência a partir de um novo agente que usa o mesmo repositório", async () => {
    const s = setup();
    await s.agent.reply("Qual o status do PED-1001?", SESSION_A);
    const newAgent = new ContextualConversationAgent(s.base, s.context);
    expect(await newAgent.reply("Ele já saiu pra entrega?", SESSION_A))
      .toContain("Ainda está em processamento");
  });

});
