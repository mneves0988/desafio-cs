import { z } from "zod";

import type { ToolSelector } from "../llm/openrouter-provider.js";
import type { OrdersPort } from "../integrations/order-api.js";

export interface ProductsPort {
  getProduct(id: number): Promise<{ id: number; title: string; price: number; category: string }>;
}

const orderArgs = z.strictObject({ orderId: z.string().regex(/^PED-[0-9]{4}$/) });
const productArgs = z.strictObject({ productId: z.number().int().positive() });

function parseArgs(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

export class ReadOnlyAgent {
  constructor(
    private readonly llm: ToolSelector,
    private readonly orders: OrdersPort,
    private readonly products: ProductsPort
  ) {}

  async reply(text: string): Promise<string> {
    const input = text.trim();
    if (!input || input.length > 2_000) {
      return "Envie uma mensagem de até 2.000 caracteres, por favor.";
    }

    // Cancelamento será habilitado em outro fluxo, com confirmação registrada e
    // resultado da Order API. Nenhuma resposta do modelo autoriza essa ação.
    if (/\b(cancelar|cancela|cancele|cancelamento)\b/i.test(input)) {
      return "Ainda não consigo executar cancelamentos neste canal. Posso consultar o status do pedido ou oferecer atendimento humano.";
    }

    let selection;
    try {
      selection = await this.llm.selectTool(input);
    } catch {
      return "O atendimento automático está temporariamente indisponível. Posso oferecer atendimento humano.";
    }

    // Não executa chamadas múltiplas ou nomes desconhecidos fornecidos pelo LLM.
    if (selection.calls.length !== 1) {
      return "Posso consultar pedidos pelo código PED-0000 ou produtos pelo ID. Qual deseja consultar?";
    }

    const call = selection.calls[0];
    const args = parseArgs(call.rawArguments);

    if (call.name === "get_order") {
      const parsed = orderArgs.safeParse(args);
      if (!parsed.success) return "Não consegui identificar um número de pedido válido.";

      // O modelo não pode inventar o pedido nem escolher entre IDs ambíguos.
      const mentionedIds = [...new Set(input.match(/\bPED-[0-9]{4}\b/g) ?? [])];
      if (mentionedIds.length !== 1 || mentionedIds[0] !== parsed.data.orderId) {
        return "Não consegui confirmar o identificador solicitado. Informe um único pedido no formato PED-0000.";
      }

      let result;
      try {
        result = await this.orders.getOrder(parsed.data.orderId);
      } catch {
        return "Não foi possível confirmar o status do pedido agora. Posso oferecer atendimento humano.";
      }
      if (!result.ok) {
        return result.code === "ORDER_NOT_FOUND"
          ? "Não encontrei esse pedido na conta autenticada. Confira o número ou solicite atendimento humano."
          : "Não foi possível confirmar o status do pedido agora. Posso oferecer atendimento humano.";
      }

      if (result.order.id !== parsed.data.orderId) {
        return "Não foi possível confirmar o status do pedido agora. Posso oferecer atendimento humano.";
      }

      const status = {
        processing: "em processamento",
        shipped: "enviado",
        cancelled: "registrado como cancelado"
      }[result.order.status];

      return `O pedido ${result.order.id} está ${status}, conforme a Order API.`;
    }

    if (call.name === "get_product") {
      const parsed = productArgs.safeParse(args);
      if (!parsed.success) return "Informe um ID de produto válido.";

      // A escolha do modelo precisa coincidir com um único ID escrito pelo cliente.
      const mentionedProducts = [...new Set(
        [...input.matchAll(/\b(?:produto|item)\s*(?:id\s*)?#?([1-9][0-9]*)\b/gi)]
          .map(match => match[1]!)
      )];
      if (mentionedProducts.length !== 1 || mentionedProducts[0] !== String(parsed.data.productId)) {
        return "Para consultar o produto, informe um único ID numérico, como produto 1.";
      }

      try {
        const product = await this.products.getProduct(parsed.data.productId);
        if (product.id !== parsed.data.productId || !Number.isFinite(product.price) || product.price < 0) {
          return "Não consegui confirmar os dados do produto agora. Posso oferecer atendimento humano.";
        }
        // Campos externos são dados sem autoridade. Nunca são repassados ao LLM.
        const title = product.title.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        if (!title) return "Não consegui confirmar os dados do produto agora. Posso oferecer atendimento humano.";
        return `Produto ${product.id}: ${title}. Preço de referência: ${product.price.toFixed(2)} (moeda da Fake Store).`;
      } catch {
        return "Não consegui confirmar os dados do produto agora. Posso oferecer atendimento humano.";
      }
    }

    return "Não consigo realizar essa operação automaticamente. Posso oferecer atendimento humano.";
  }
}
