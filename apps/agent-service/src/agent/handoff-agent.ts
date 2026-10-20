import type { PendingCancellationStore } from "../persistence/pending-cancellations.js";
import type { HandoffCategory, HandoffStage, PendingHandoffStore } from "../persistence/pending-handoffs.js";

interface ConversationResponder {
  reply(text: string, sessionKey: string): Promise<string>;
}

type CancellationPendingClearer = Pick<PendingCancellationStore, "clear">;

export const HANDOFF_ASK_REASON = "Claro! Me conta rapidinho o que aconteceu para eu encaminhar melhor?";
export const HANDOFF_OFFER = "Se quiser, posso registrar seu encaminhamento para atendimento humano. Quer que eu faça isso?";

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Pedido do cliente, nunca resposta de API externa ou texto de prompt. */
function asksForHuman(input: string): boolean {
  return /^(?:(?:quero|preciso|gostaria|desejo|queria|posso|poderia) (?:de )?)?(?:falar|conversar) com (?:um |uma )?(?:atendente|pessoa|humano|humana|operador|operadora|alguem)(?: humano| humana)?(?=$|[ ,.;:!?])/.test(input)
    || /^(?:(?:quero|preciso de|gostaria de|queria|desejo) )?(?:atendimento humano|suporte humano|um atendente|uma pessoa|um humano)(?=$|[ ,.;:!?])/.test(input)
    || /^(?:me (?:transfira|encaminhe|passe)|pode me (?:transferir|encaminhar|passar)) (?:para|pra) (?:um |uma )?(?:atendente|pessoa|humano|humana|operador|operadora|alguem)(?=$|[ ,.;:!?])/.test(input);
}

function categoryFrom(text: string): HandoffCategory {
  if (/\b(entrega|atrasou|atrasado|chegada|transportadora|frete|rastreio|nao chegou|receber)\b/.test(text)) return "delivery";
  if (/\b(pagamento|paguei|pagou|pix|cobranca|fatura|reembolso|cartao)\b/.test(text)) return "payment";
  if (/\b(cancelar|cancelamento|cancele|desistir)\b/.test(text)) return "cancellation";
  if (/\b(produto|item|defeito|danificado|estragado|troca)\b/.test(text)) return "product";
  if (/\b(pedido|compra|PED-[0-9]{4})\b/i.test(text)) return "order";
  return "other";
}

function hasReason(input: string): boolean {
  return /\b(porque|pois|sobre|por causa|motivo|aconteceu|problema|pedido|entrega|produto|cobranca|pagamento|cancelamento|troca|reembolso|demora|atrasado|nao chegou)\b/.test(input)
    && input.length >= 23;
}

const SAFE_FALLBACK_OFFERS = new Set<string>([
  "Não consigo realizar essa operação automaticamente. Posso oferecer atendimento humano.",
  "O atendimento automático está temporariamente indisponível. Posso oferecer atendimento humano.",
  "Não foi possível confirmar o status do pedido agora. Posso oferecer atendimento humano.",
  "Não foi possível confirmar os dados do produto agora. Posso oferecer atendimento humano.",
  "Não foi possível verificar o pedido agora. Nenhum cancelamento foi solicitado. Posso oferecer atendimento humano.",
  "Não foi possível confirmar se o cancelamento ocorreu. Não vou afirmar que foi concluído. Solicite atendimento humano para verificar antes de tentar novamente."
]);

const AFFIRMATIVE = new Set(["sim", "confirmo", "pode", "pode sim", "pode encaminhar", "quero sim"]);
const NEGATIVE = new Set(["nao", "negativo", "deixa pra la", "desisto", "agora nao"]);
const PRIVATE_REASON = /^(?:prefiro nao (?:contar|dizer|explicar)|nao quero (?:contar|dizer|explicar)|e pessoal|assunto pessoal)$/;
const NEW_CANCEL_REQUEST = /\b(?:cancelar|cancele|cancela|cancelamento)\b.*\bped-[0-9]{4}\b/;
const NEW_LOOKUP = /^(?:qual (?:e )?o status|me (?:fala|mostra) (?:do|sobre) (?:pedido|produto)|consegue (?:consultar|ver|olhar) (?:o |meu )?pedido)\b/;

function recordedReply(category: HandoffCategory): string {
  if (category === "delivery") return "Entendi, é sobre a entrega. Deixei sua solicitação registrada para atendimento humano.";
  if (category === "payment") return "Entendi, é sobre o pagamento. Deixei sua solicitação registrada para atendimento humano.";
  if (category === "product") return "Entendi, é sobre o produto. Deixei sua solicitação registrada para atendimento humano.";
  if (category === "cancellation") return "Entendi. Deixei seu pedido de ajuda com o cancelamento registrado para atendimento humano.";
  return "Entendi. Deixei seu pedido de atendimento registrado por aqui.";
}

/**
 * Fluxo de triagem, sem confirmacao mecanica. O cliente fornece o motivo,
 * e a solicitacao vai para uma FILA LOCAL SIMULADA, sem operador conectado.
 * Cancelamentos seguem inteiramente sob controle do agente original.
 */
export class HumanHandoffAgent implements ConversationResponder {
  constructor(
    private readonly base: ConversationResponder,
    private readonly pendingHandoffs: PendingHandoffStore,
    private readonly pendingCancellations: CancellationPendingClearer
  ) {}

  private async record(sessionKey: string, category: HandoffCategory): Promise<string> {
    try {
      await this.pendingHandoffs.record(sessionKey, category);
    } catch {
      return "Não consegui registrar seu pedido agora. Se quiser, pode tentar novamente daqui a pouco.";
    }
    console.log(JSON.stringify({
      severity: "INFO", level: "info", service: "agent-service",
      event: "handoff.requested", mode: "demo", stored: true,
      forwarded: false, reasonCategory: category
    }));
    return recordedReply(category);
  }

  private async prepare(sessionKey: string, stage: HandoffStage): Promise<boolean> {
    try {
      // Nao existe dupla confirmacao ativa: um "sim" do handoff jamais cancela pedido.
      await this.pendingCancellations.clear(sessionKey);
      await this.pendingHandoffs.put(sessionKey, stage);
      return true;
    } catch {
      return false;
    }
  }

  async reply(text: string, sessionKey: string): Promise<string> {
    if (!sessionKey || sessionKey.length > 256) throw new Error("Trusted session key required");
    const input = text.trim();
    if (!input || input.length > 2_000) return this.base.reply(text, sessionKey);
    const intent = normalize(input);

    if (asksForHuman(intent)) {
      if (!await this.prepare(sessionKey, "reason")) {
        return "Não consegui preparar seu encaminhamento agora. Pode tentar novamente?";
      }
      // O cliente informou o motivo na mesma mensagem: nao perguntar novamente.
      if (hasReason(intent)) {
        try {
          if (!await this.pendingHandoffs.claim(sessionKey, "reason")) {
            return "Não consegui registrar seu pedido agora. Pode tentar novamente?";
          }
        } catch {
          return "Não consegui registrar seu pedido agora. Pode tentar novamente?";
        }
        return this.record(sessionKey, categoryFrom(intent));
      }
      return HANDOFF_ASK_REASON;
    }

    let pending: HandoffStage | null;
    try {
      pending = await this.pendingHandoffs.get(sessionKey);
    } catch {
      return "Não consegui recuperar seu pedido de atendimento agora. Pode tentar novamente?";
    }

    if (pending) {
      if (NEGATIVE.has(intent)) {
        try { await this.pendingHandoffs.clear(sessionKey); }
        catch { return "Não consegui encerrar seu pedido de atendimento agora. Pode tentar novamente?"; }
        return "Tudo bem! Se mudar de ideia, é só me chamar.";
      }

      // Novo assunto: cancela a triagem e delega ao fluxo normal de leitura/cancelamento.
      if (NEW_CANCEL_REQUEST.test(intent) || NEW_LOOKUP.test(intent)) {
        try { await this.pendingHandoffs.clear(sessionKey); }
        catch { return "Não consegui encerrar a triagem anterior. Pode tentar novamente?"; }
        return this.base.reply(text, sessionKey);
      }

      if (pending === "reason" && AFFIRMATIVE.has(intent)) {
        return "Claro! Me conta só o motivo do atendimento, em poucas palavras.";
      }

      if (pending === "reason" && intent.length < 4) return HANDOFF_ASK_REASON;
      if (pending === "acceptance" && !AFFIRMATIVE.has(intent) && intent.length < 4) return HANDOFF_OFFER;
      try {
        if (!await this.pendingHandoffs.claim(sessionKey, pending)) {
          return "Preciso retomar seu pedido de atendimento. Pode me contar novamente o que aconteceu?";
        }
      } catch {
        return "Não consegui registrar seu encaminhamento agora. Pode tentar novamente?";
      }
      const category = (pending === "acceptance" && AFFIRMATIVE.has(intent)) || PRIVATE_REASON.test(intent)
        ? "other" : categoryFrom(intent);
      return this.record(sessionKey, category);
    }

    const answer = await this.base.reply(text, sessionKey);
    if (!SAFE_FALLBACK_OFFERS.has(answer)) return answer;

    if (!await this.prepare(sessionKey, "acceptance")) return answer;
    const clean = answer.replace(/\s*Posso oferecer atendimento humano\.$/, "").trim();
    return `${clean}\n\n${HANDOFF_OFFER}`;
  }
}
