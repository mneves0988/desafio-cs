import pg from "pg";
import { createApp } from "./app.js";
import { PostgresOrderRepository } from "./postgres-repository.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo authentication is not allowed in production.");
}

const databaseUrl = process.env.DATABASE_URL;
const demoToken = process.env.DEMO_ACCESS_TOKEN;
const confirmationSecret = process.env.CANCEL_CONFIRMATION_SECRET;

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!demoToken) throw new Error("DEMO_ACCESS_TOKEN is required.");
if (!confirmationSecret || confirmationSecret.length < 32) {
  throw new Error("CANCEL_CONFIRMATION_SECRET must have at least 32 characters.");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 5,
  connectionTimeoutMillis: 5000
});

try {
  await pool.query("SELECT 1");
} catch {
  console.error(JSON.stringify({ level: "error", event: "database.connection_failed" }));
  await pool.end();
  process.exit(1);
}

const repository = new PostgresOrderRepository(pool);
const tokens = new Map<string, number>([[demoToken, 1]]);
const app = createApp(repository, tokens, confirmationSecret);
const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    level: "info", event: "server.started", service: "order-api",
    storage: "postgresql", port
  }));
});

async function shutdown() {
  server.close(async () => { await pool.end(); });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
