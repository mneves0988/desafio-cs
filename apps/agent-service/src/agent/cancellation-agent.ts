import type { CancelableOrdersPort } from "../integrations/cancellation-order-api.js";
import type { PendingCancellationStore } from "../persistence/pending-cancellations.js";

interface ReadOnlyResponder {
  reply(text: string): Promise<string>;
}

const ORDER_IDS = /\bPED-[0-9]{4}\b/g;
const CANCEL_WORDS = /\b(cancelar|cancela|cancele|cancelamento)\b/i;
const AFFIRMATIVE = /^(sim|confirmo|confirmar|confirmo o cancelamento|sim,? confirmo|sim,? pode cancelar|pode cancelar)$/i;
const NEGATIVE = /^(não|nao|negativo|desisto|esquece|não cancelar|nao cancelar|não quero cancelar|nao quero cancelar|não cancele|nao cancele)$/i;
const NEGATED_REQUEST = /\b(não|nao)\s+(quero\s+)?(cancelar|cancele|cancela)\b/i;

/**
 * O LLM não é consultado para aceitar uma confirmação nem recebe capacidade de escrita.
 * O cancelamento só é informado como concluído se a Order API o confirmar.
 */
export class CancellationAgent {
  constructor(
    private readonly readOnly: ReadOnlyResponder,
    private readonly orders: CancelableOrdersPort,
    private readonly pending: PendingCancellationStore
  ) {}

  async reply(text: string, sessionKey: string): Promise<string> {
    const input = text.trim();
    if (!input || input.length > 2_000) {
      return "Envie uma mensagem de até 2.000 caracteres, por favor.";
    }
    if (!sessionKey || sessionKey.length > 256) {
      throw new Error("Trusted session key required");
    }

    let existing: string | null;
    try {
      existing = await this.pending.get(sessionKey);
    } catch {
      return "Não consegui consultar a solicitação pendente. Tente novamente ou peça atendimento humano.";
    }

    if (existing && NEGATIVE.test(input)) {
      try {
        await this.pending.clear(sessionKey);
        return "Entendido. Nenhum cancelamento foi solicitado à Order API.";
      } catch {
        return "Não consegui encerrar a solicitação com segurança. Peça atendimento humano.";
      }
    }

    if (AFFIRMATIVE.test(input)) {
      if (!existing) {
        return "Não há um cancelamento pendente para confirmar. Informe o pedido que deseja cancelar.";
      }

      let claimed: string | null;
      try {
        claimed = await this.pending.claim(sessionKey, existing);
      } catch {
        return "Não consegui validar a confirmação. Nenhum cancelamento foi solicitado. Peça atendimento humano.";
      }

      if (!claimed) {
        return "A confirmação expirou ou já foi utilizada. Solicite o cancelamento novamente, se desejar.";
      }

      const result = await this.orders.cancelOrder(claimed);
      if (result.ok) {
        return `Cancelamento do pedido ${result.orderId} confirmado pela Order API.`;
      }
      if (result.code === "ORDER_NOT_CANCELABLE") {
        return `O pedido ${claimed} não pode mais ser cancelado. Seu estado pode ter mudado.`;
      }
      if (result.code === "ORDER_NOT_FOUND") {
        return "Não encontrei esse pedido na conta autenticada. Nenhum cancelamento foi confirmado.";
      }
      return "Não foi possível confirmar se o cancelamento ocorreu. Não vou afirmar que foi concluído. Solicite atendimento humano para verificar antes de tentar novamente.";
    }

    if (NEGATED_REQUEST.test(input)) {
      if (existing) {
        try { await this.pending.clear(sessionKey); } catch {
          return "Não consegui encerrar a solicitação com segurança. Peça atendimento humano.";
        }
      }
      return "Certo. Não vou solicitar o cancelamento do pedido.";
    }

    if (CANCEL_WORDS.test(input)) {
      // Nova solicitação invalida qualquer confirmação anterior, mesmo se for negada.
      if (existing) {
        try { await this.pending.clear(sessionKey); } catch {
          return "Não consegui encerrar a solicitação anterior com segurança. Peça atendimento humano.";
        }
      }
      const ids: string[] = [...new Set<string>(input.match(ORDER_IDS) ?? [])];
      if (ids.length !== 1) {
        return "Para solicitar o cancelamento, informe um único pedido no formato PED-0000.";
      }

      // Só permite troca de pedido mediante nova solicitação explícita.
      const orderId = ids[0]!;
      const result = await this.orders.getOrder(orderId);
      if (!result.ok) {
        return result.code === "ORDER_NOT_FOUND"
          ? "Não encontrei esse pedido na conta autenticada. Nenhum cancelamento foi solicitado."
          : "Não foi possível verificar o pedido agora. Nenhum cancelamento foi solicitado. Posso oferecer atendimento humano.";
      }
      if (result.order.status !== "processing") {
        return `O pedido ${orderId} não está em processamento, portanto não pode ser cancelado.`;
      }
      try {
        await this.pending.put(sessionKey, orderId);
      } catch {
        return "Não consegui registrar a solicitação de forma segura. Nenhum cancelamento foi solicitado.";
      }
      return `O pedido ${orderId} está em processamento. Confirma o cancelamento? Responda somente "sim" ou "não" em até 10 minutos.`;
    }

    // Qualquer mudança de assunto invalida a confirmação anterior.
    if (existing) {
      try { await this.pending.clear(sessionKey); } catch {
        return "Não consegui encerrar a solicitação com segurança. Peça atendimento humano.";
      }
    }

    if (NEGATIVE.test(input)) return "Não há cancelamento pendente.";
    return this.readOnly.reply(input);
  }
}
