import pg from "pg";
import { CancellationAgent } from "../agent/cancellation-agent.js";
import { ContextualConversationAgent } from "../agent/contextual-agent.js";
import { HumanHandoffAgent } from "../agent/handoff-agent.js";
import { ReadOnlyAgent } from "../agent/read-only-agent.js";
import { CancellationOrderApiClient } from "../integrations/cancellation-order-api.js";
import { FakeStoreClient } from "../integrations/fake-store.js";
import { OpenRouterProvider } from "../llm/openrouter-provider.js";
import { PostgresPendingCancellationStore } from "../persistence/pending-cancellations.js";
import { PostgresPendingHandoffStore } from "../persistence/pending-handoffs.js";
import { PostgresSessionContextStore } from "../persistence/session-context.js";
import { createMockHttpServer } from "./mock-http.js";
import { pollTelegram } from "./telegram.js";

// Este servidor faz binding de um token de DEMO ao usuário fictício 1.
// Não deve ser exposto em Cloud Run ou usado com consumidores reais.
if (process.env.NODE_ENV === "production") {
  throw new Error("Demo agent channels cannot run in production.");
}
const required = ["DATABASE_URL", "DEMO_ACCESS_TOKEN", "CANCEL_CONFIRMATION_SECRET", "OPENROUTER_API_KEY", "OPENROUTER_MODEL_MAIN", "AGENT_HTTP_TOKEN"] as const;
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 5000
});

try {
  await pool.query("SELECT 1 FROM public.agent_pending_cancellations LIMIT 1");
  await pool.query("SELECT 1 FROM public.agent_session_context LIMIT 1");
  await pool.query("SELECT stage FROM public.agent_pending_handoffs LIMIT 1");
  await pool.query("SELECT 1 FROM public.agent_handoff_requests LIMIT 1");
} catch {
  console.error(JSON.stringify({ level: "error", event: "database.connection_failed" }));
  await pool.end();
  process.exit(1);
}

const orders = new CancellationOrderApiClient(
  process.env.ORDER_API_URL ?? "http://localhost:3000", process.env.DEMO_ACCESS_TOKEN!,
  undefined, process.env.CANCEL_CONFIRMATION_SECRET!
);
const readOnly = new ReadOnlyAgent(
  new OpenRouterProvider(process.env.OPENROUTER_API_KEY!, process.env.OPENROUTER_MODEL_MAIN!),
  orders, new FakeStoreClient()
);
const cancellationPending = new PostgresPendingCancellationStore(pool);
const cancellationAgent = new CancellationAgent(readOnly, orders, cancellationPending);
const contextualAgent = new ContextualConversationAgent(cancellationAgent, new PostgresSessionContextStore(pool));
const agent = new HumanHandoffAgent(
  contextualAgent,
  new PostgresPendingHandoffStore(pool, process.env.CANCEL_CONFIRMATION_SECRET!),
  cancellationPending
);
const server = createMockHttpServer(agent, process.env.AGENT_HTTP_TOKEN!);
const port = Number(process.env.AGENT_HTTP_PORT ?? 3001);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("AGENT_HTTP_PORT invalid");
const host = process.env.AGENT_HTTP_HOST ?? "127.0.0.1";
if (host !== "127.0.0.1" && host !== "0.0.0.0") throw new Error("AGENT_HTTP_HOST invalid");
server.listen(port, host, () => console.log(JSON.stringify({
  level: "info", event: "agent.http.started", port, host, mode: "demo"
})));

const controller = new AbortController();
let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  controller.abort();
  server.close(() => void pool.end());
}
process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });

if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log(JSON.stringify({ level: "info", event: "telegram.poll_started", mode: "demo", access: "open" }));
  void pollTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, agent }, controller.signal)
    .catch(error => console.error(JSON.stringify({
      level: "error", event: "telegram.poll_stopped",
      errorType: error instanceof Error ? error.name : "UnknownError"
    })));
}
