import type { SessionContextStore, ContextKind } from "../persistence/session-context.js";

interface ConversationAgent {
  reply(text: string, sessionKey: string): Promise<string>;
}

const ORDER_ID = /\bPED-[0-9]{4}\b/g;
// Apenas respostas internas verificadas pela API podem criar ou renovar memoria.
const VERIFIED_ORDER = /^O pedido (PED-[0-9]{4}) está (em processamento|enviado|registrado como cancelado), conforme a Order API\.$/;
const VERIFIED_CANCELLATION = /^Cancelamento do pedido (PED-[0-9]{4}) confirmado pela Order API\.$/;
const VERIFIED_PRODUCT = /^Produto ([1-9][0-9]*): [^\r\n]+\. Preço de referência: \d+\.\d{2} \(moeda da Fake Store\)\.$/;

type ContextIntent = "order_status" | "product_price" | "delivery_eta" | "shipping_status";

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Reconhece perguntas de continuidade sem inventar referencia ou status. */
function contextualIntent(text: string): ContextIntent | null {
  const input = normalize(text);

  // "Ele ja saiu pra entrega?" nao e o mesmo que "pedido enviado":
  // a resposta deve respeitar apenas o status que a Order API devolveu.
  if (/^(?:e )?(?:(?:ele|o pedido|esse pedido) (?:ja )?)?saiu (?:pra|para) (?:a )?entrega$/.test(input)
      || /^(?:e )?(?:ele|o pedido|esse pedido) (?:ja )?foi (?:enviado|despachado)$/.test(input)
      || /^(?:e )?(?:ja )?foi enviado$/.test(input)) {
    return "shipping_status";
  }

  if (/^(?:e )?(?:quando (?:(?:ele|o pedido) )?(?:chega|vai chegar|sera entregue)|(?:tem|ha|existe) (?:alguma )?previsao (?:de entrega(?: dele)?|de quando (?:(?:ele|o pedido) )?(?:chega|vai chegar))|qual (?:e )?(?:a )?previsao (?:de entrega|de chegada)|sabe quando (?:(?:ele|o pedido) )?(?:chega|vai chegar))$/.test(input)) {
    return "delivery_eta";
  }

  if (/^(?:e )?(?:(?:qual (?:e )?o |o )?status(?: (?:dele|desse pedido))?|como (?:esta|anda) (?:ele|esse pedido)|ele (?:ja )?foi cancelado)$/.test(input)) {
    return "order_status";
  }
  if (/^(?:e )?(?:qual (?:e )?o preco(?: dele| desse produto)?|quanto (?:ele|o produto) custa|quanto custa)$/.test(input)) {
    return "product_price";
  }
  return null;
}

/**
 * Retem apenas referencias verificadas e isoladas por sessao. O Postgres usado
 * aqui e o definido por DATABASE_URL: Supabase fora do Docker ou Postgres local
 * dentro do Docker Compose. Nao armazena mensagens ou historico bruto.
 */
export class ContextualConversationAgent implements ConversationAgent {
  constructor(
    private readonly base: ConversationAgent,
    private readonly context: SessionContextStore
  ) {}

  async reply(text: string, sessionKey: string): Promise<string> {
    if (!sessionKey || sessionKey.length > 256) {
      throw new Error("Trusted session key required");
    }
    const input = text.trim();
    if (!input || input.length > 2_000) {
      return this.base.reply(text, sessionKey);
    }

    // Cancelamentos exigem um codigo explicito e nunca usam referencias implicitas.
    const ids = [...new Set(input.match(ORDER_ID) ?? [])];
    const intent = ids.length === 0 ? contextualIntent(input) : null;
    let effectiveInput = input;
    let previous: string | null = null;

    if (intent) {
      const kind: ContextKind = intent === "product_price" ? "product" : "order";
      try {
        previous = await this.context.get(sessionKey, kind);
      } catch {
        return "Não consegui recuperar o contexto da conversa agora. Informe o identificador novamente, por favor.";
      }
      if (!previous) {
        return kind === "order"
          ? "De qual pedido estamos falando? Me informe o número no formato PED-0000, por favor."
          : "De qual produto estamos falando? Me informe o ID numérico, por favor.";
      }
      // Sempre passa pelo agente de negocio: isso invalida eventual confirmacao
      // de cancelamento pendente quando a pessoa muda de assunto.
      effectiveInput = kind === "order"
        ? `Qual o status do pedido ${previous}?`
        : `Qual o preço do produto ${previous}?`;
    }

    const answer = await this.base.reply(effectiveInput, sessionKey);
    const verifiedStatus = VERIFIED_ORDER.exec(answer);
    const order = verifiedStatus ?? VERIFIED_CANCELLATION.exec(answer);
    const product = VERIFIED_PRODUCT.exec(answer);

    try {
      if (order) {
        await this.context.save(sessionKey, "order", order[1]!);
      } else if (ids.length > 0) {
        await this.context.clear(sessionKey, "order");
      }
      if (product) {
        await this.context.save(sessionKey, "product", product[1]!);
      } else if (/\bproduto\s+\d+\b/i.test(input)) {
        await this.context.clear(sessionKey, "product");
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn", event: "conversation.context_unavailable",
        errorType: error instanceof Error ? error.name : "UnknownError"
      }));
    }

    // Nao inventa previsao, etapa de entrega ou status. Se a consulta de
    // status falhou, transmite a falha sem apresenta-la como informacao real.
    if (previous && verifiedStatus && verifiedStatus[1] === previous) {
      if (intent === "delivery_eta") {
        return "Ainda não tenho previsão de entrega para esse pedido. Posso acompanhar o status com você.";
      }
      if (intent === "shipping_status") {
        switch (verifiedStatus[2]) {
          case "em processamento":
            return "Ainda está em processamento. Não tenho confirmação de que saiu para entrega.";
          case "enviado":
            return "Já foi enviado, mas não tenho confirmação de que saiu para entrega.";
          case "registrado como cancelado":
            return "Esse pedido consta como cancelado, então não está em processo de entrega.";
        }
      }
    }
    return answer;
  }
}
