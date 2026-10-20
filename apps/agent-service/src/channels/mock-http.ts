import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { CancellationAgent } from "../agent/cancellation-agent.js";

export interface ConversationAgent {
  reply(text: string, sessionKey: string): Promise<string>;
}

const MAX_BYTES = 8192;
const SESSION_KEY = "http:demo-user-1";

function json(res: ServerResponse, code: number, body: unknown): void {
  const value = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(value);
}

function equalsSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  let oversized = false;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BYTES) {
      oversized = true;
      continue;
    }
    chunks.push(buf);
  }
  if (oversized) throw new Error("BODY_TOO_LARGE");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function createMockHttpServer(agent: ConversationAgent, apiToken: string) {
  if (apiToken.length < 24) {
    throw new Error("AGENT_HTTP_TOKEN must have at least 24 characters");
  }

  return createServer(async (req, res) => {
    const started = Date.now();
    let status = 500;
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (req.method === "GET" && path === "/health") {
        status = 200;
        json(res, status, { status: "ok", service: "agent-service", mode: "demo" });
        return;
      }
      if (req.method !== "POST" || path !== "/messages") {
        status = 404;
        json(res, status, { code: "NOT_FOUND" });
        return;
      }

      const match = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "");
      if (!match || !equalsSecret(match[1], apiToken)) {
        status = 401;
        json(res, status, { code: "UNAUTHORIZED" });
        return;
      }
      const contentType = req.headers["content-type"] ?? "";
      if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
        status = 415;
        json(res, status, { code: "UNSUPPORTED_MEDIA_TYPE" });
        return;
      }

      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        status = error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400;
        json(res, status, { code: status === 413 ? "BODY_TOO_LARGE" : "INVALID_JSON" });
        return;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        status = 400;
        json(res, status, { code: "INVALID_MESSAGE" });
        return;
      }
      const fields = Object.keys(body);
      if (fields.length !== 1 || fields[0] !== "message") {
        status = 400;
        json(res, status, { code: "INVALID_MESSAGE" });
        return;
      }
      const message = (body as { message?: unknown }).message;
      if (typeof message !== "string" || message.trim().length < 1 || message.length > 2000) {
        status = 400;
        json(res, status, { code: "INVALID_MESSAGE" });
        return;
      }

      const reply = await agent.reply(message, SESSION_KEY);
      status = 200;
      json(res, status, { reply });
    } catch (error) {
      console.error(JSON.stringify({
        level: "error", event: "conversation.unhandled", channel: "http",
        errorType: error instanceof Error ? error.name : "UnknownError"
      }));
      if (!res.headersSent) json(res, 503, { code: "SERVICE_UNAVAILABLE", message: "Atendimento indisponível. Solicite atendimento humano." });
      status = 503;
    } finally {
      console.log(JSON.stringify({
        level: "info", event: "conversation.request", channel: "http",
        status, durationMs: Date.now() - started
      }));
    }
  });
}
