import { describe, it, expect, vi } from "vitest";

import { ReadOnlyAgent, type ProductsPort } from "../src/agent/read-only-agent.js";
import type { ToolSelector } from "../src/llm/openrouter-provider.js";
import type { OrdersPort } from "../src/integrations/order-api.js";

function setup(name: string, rawArguments: string) {
  const llm: ToolSelector = {
    selectTool: vi.fn(async () => ({ calls: [{ name, rawArguments }] }))
  };
  const orders: OrdersPort = {
    getOrder: vi.fn(async () => ({
      ok: true as const,
      order: { id: "PED-1001", status: "processing" as const, items: [] }
    }))
  };
  const products: ProductsPort = {
    getProduct: vi.fn(async (id: number) => ({
      id, title: "Produto de teste", price: 19.9, category: "test"
    }))
  };
  return { llm, orders, products, agent: new ReadOnlyAgent(llm, orders, products) };
}

describe("ReadOnlyAgent", () => {
  it("consulta pedido autorizado e fundamenta a resposta", async () => {
    const s = setup("get_order", '{"orderId":"PED-1001"}');
    expect(await s.agent.reply("Status de PED-1001?")).toContain("em processamento");
    expect(s.orders.getOrder).toHaveBeenCalledWith("PED-1001");
  });

  it("não permite trocar o ID informado pelo usuário", async () => {
    const s = setup("get_order", '{"orderId":"PED-2001"}');
    expect(await s.agent.reply("Status de PED-1001?")).toContain("Não consegui confirmar");
    expect(s.orders.getOrder).not.toHaveBeenCalled();
  });

  it("rejeita argumentos inválidos do modelo", async () => {
    const s = setup("get_order", '{"orderId":"../secret"}');
    expect(await s.agent.reply("Consulte meu pedido")).toContain("válido");
    expect(s.orders.getOrder).not.toHaveBeenCalled();
  });

  it("não inventa cancelamento nem executa ferramenta", async () => {
    const s = setup("get_order", '{"orderId":"PED-1001"}');
    expect(await s.agent.reply("Cancele o PED-1001")).toContain("Ainda não consigo executar cancelamentos");
    expect(s.llm.selectTool).not.toHaveBeenCalled();
    expect(s.orders.getOrder).not.toHaveBeenCalled();
  });

  it("consulta produto sem enviar sua descrição ao modelo", async () => {
    const s = setup("get_product", '{"productId":1}');
    expect(await s.agent.reply("Consulte produto 1")).toContain("Produto 1:");
    expect(s.products.getProduct).toHaveBeenCalledWith(1);
  });

  it("nega operações desconhecidas", async () => {
    const s = setup("cancel_order", '{"orderId":"PED-1001"}');
    expect(await s.agent.reply("Preciso de ajuda")).toContain("atendimento humano");
    expect(s.orders.getOrder).not.toHaveBeenCalled();
  });

  it("não declara consulta realizada quando Order API falha", async () => {
    const s = setup("get_order", '{"orderId":"PED-1001"}');
    s.orders.getOrder = vi.fn(async () => ({ ok: false as const, code: "ORDER_API_UNAVAILABLE" as const }));
    const agent = new ReadOnlyAgent(s.llm, s.orders, s.products);
    expect(await agent.reply("PED-1001")).toContain("Não foi possível confirmar");
  });
});
