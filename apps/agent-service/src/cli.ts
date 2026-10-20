import { OpenRouterProvider } from "./llm/openrouter-provider.js";
import { OrderApiClient } from "./integrations/order-api.js";
import { FakeStoreClient } from "./integrations/fake-store.js";
import { ReadOnlyAgent } from "./agent/read-only-agent.js";

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL_MAIN;
const orderToken = process.env.DEMO_ACCESS_TOKEN;
if (!apiKey || !model || !orderToken) {
  throw new Error("Configure OPENROUTER_API_KEY, OPENROUTER_MODEL_MAIN e DEMO_ACCESS_TOKEN");
}

const agent = new ReadOnlyAgent(
  new OpenRouterProvider(apiKey, model),
  new OrderApiClient(process.env.ORDER_API_URL ?? "http://localhost:3000", orderToken),
  new FakeStoreClient()
);

const message = process.argv.slice(2).join(" ");
if (!message) {
  console.error('Uso: node --env-file=.env apps/agent-service/dist/cli.js "Consulte o pedido PED-1001"');
  process.exit(2);
}
console.log(await agent.reply(message));
