import type { ConversationAgent } from "./mock-http.js";
import { CAMILA_WELCOME, humanizeTelegramReply } from "./telegram-copy.js";

type TelegramMessage = {
  chat?: { id?: number; type?: string };
  from?: { id?: number; is_bot?: boolean };
  text?: string;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramConfig {
  token: string;
  agent: ConversationAgent;
  transport?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Bot aberto para demonstracao com dados ficticios. ID da plataforma isola sessoes, nao comprova titularidade. */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  agent: ConversationAgent,
  send: (chatId: number, message: string) => Promise<void>
): Promise<void> {
  const message = update.message;
  const chat = message?.chat;
  const from = message?.from;
  if (!chat || chat.type !== "private" || !Number.isSafeInteger(chat.id) ||
      !from || !Number.isSafeInteger(from.id) || from.is_bot || chat.id !== from.id) {
    return;
  }
  const userId = String(from.id);
  const input = message?.text;
  if (input === "/start") {
    await send(chat.id!, CAMILA_WELCOME);
    return;
  }
  if (typeof input !== "string" || !input.trim() || input.length > 2000) {
    await send(chat.id!, "Envie uma mensagem de texto de até 2.000 caracteres.");
    return;
  }
  const reply = await agent.reply(input, `telegram:demo-user-1:${userId}`);
  await send(chat.id!, humanizeTelegramReply(reply, input));
}

/** Long polling para demo local. Não habilitar em produção ou paralelamente a um webhook. */
export async function pollTelegram(config: TelegramConfig, signal: AbortSignal): Promise<void> {
  const http = config.transport ?? fetch;
  const wait = config.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  if (!config.token || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(config.token)) {
    throw new Error("TELEGRAM_BOT_TOKEN invalid");
  }
  let offset = 0;

  async function call<T>(method: string, payload: Record<string, unknown>, timeout: number): Promise<T> {
    const response = await http(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    });
    if (!response.ok) throw new Error(`TELEGRAM_HTTP_${response.status}`);
    const body = await response.json() as TelegramResponse<T>;
    if (!body.ok || body.result === undefined) throw new Error("TELEGRAM_API_ERROR");
    return body.result;
  }

  const send = async (chatId: number, text: string) => {
    await call<unknown>("sendMessage", { chat_id: chatId, text }, 10_000);
  };
  while (!signal.aborted) {
    try {
      const updates = await call<TelegramUpdate[]>("getUpdates", {
        offset, timeout: 20, limit: 10,
        allowed_updates: ["message"]
      }, 27_000);
      for (const update of updates) {
        if (signal.aborted) break;
        try {
          await handleTelegramUpdate(update, config.agent, send);
        } catch (error) {
          console.error(JSON.stringify({
            level: "error", event: "telegram.update_failed",
            errorType: error instanceof Error ? error.name : "UnknownError"
          }));
        }
        // Evita reprocessar comandos em falhas de envio. A confirmação é claim atômico no banco.
        if (Number.isSafeInteger(update.update_id) && update.update_id! >= offset) {
          offset = update.update_id! + 1;
        }
      }
    } catch (error) {
      if (signal.aborted) break;
      console.error(JSON.stringify({
        level: "error", event: "telegram.poll_failed",
        errorType: error instanceof Error ? error.name : "UnknownError"
      }));
      await wait(2000);
    }
  }
}
