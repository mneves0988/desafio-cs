import pg from "pg";
import { CancellationAgent } from "./agent/cancellation-agent.js";
import { ReadOnlyAgent } from "./agent/read-only-agent.js";
import { CancellationOrderApiClient } from "./integrations/cancellation-order-api.js";
import { FakeStoreClient } from "./integrations/fake-store.js";
import { OpenRouterProvider } from "./llm/openrouter-provider.js";
import { PostgresPendingCancellationStore } from "./persistence/pending-cancellations.js";

// APENAS desenvolvimento local. Em HTTP/Telegram, a sessão deve vir de
// identidade autenticada, e NÃO de texto ou ID arbitrário informado pelo cliente.
if (process.env.NODE_ENV === "production") {
  throw new Error("CLI with demo authorization is forbidden in production.");
}

const databaseUrl = process.env.DATABASE_URL;
const token = process.env.DEMO_ACCESS_TOKEN;
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL_MAIN;
const confirmationSecret = process.env.CANCEL_CONFIRMATION_SECRET;
if (!databaseUrl || !token || !apiKey || !model || !confirmationSecret) {
  throw new Error("Configure DATABASE_URL, DEMO_ACCESS_TOKEN, OPENROUTER_API_KEY e OPENROUTER_MODEL_MAIN");
}

const message = process.argv.slice(2).join(" ");
if (!message) {
  console.error('Uso: node --env-file=.env apps/agent-service/dist/cancellation-cli.js "Quero cancelar PED-1001"');
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  connectionTimeoutMillis: 5_000
});

try {
  const orders = new CancellationOrderApiClient(
    process.env.ORDER_API_URL ?? "http://localhost:3000", token, undefined, confirmationSecret
  );
  const readOnly = new ReadOnlyAgent(
    new OpenRouterProvider(apiKey, model), orders, new FakeStoreClient()
  );
  const agent = new CancellationAgent(
    readOnly, orders, new PostgresPendingCancellationStore(pool)
  );
  console.log(await agent.reply(message, "cli:demo-user-1"));
} catch (error) {
  console.error(JSON.stringify({
    level: "error",
    event: "agent.failure",
    errorType: error instanceof Error ? error.name : "UnknownError"
  }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
