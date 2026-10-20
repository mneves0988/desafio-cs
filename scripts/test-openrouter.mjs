import OpenAI from "openai";

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL_MAIN;

if (!apiKey || !model) {
  throw new Error("Configure OpenRouter no .env");
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  maxRetries: 0,
  timeout: 30000
});

const tools = [
  {
    type: "function",
    function: {
      name: "get_order",
      description: "Consulta um pedido na API principal.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "Identificador do pedido."
          }
        },
        required: ["orderId"],
        additionalProperties: false
      }
    }
  }
];

try {
  const start = Date.now();

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `Você é um agente de atendimento.
Para consultar pedidos, utilize get_order.
Nunca invente status de pedidos.`
      },
      {
        role: "user",
        content: "Consulte o status do pedido PED-1001."
      }
    ],
    tools,
    tool_choice: "auto",
    max_tokens: 350
  });

  const message = response.choices[0]?.message;

  console.log("Modelo:", response.model);
  console.log("Latência:", Date.now() - start, "ms");
  console.log("Resposta:", message?.content ?? "(sem texto)");

  if (message?.tool_calls?.length) {
    console.log("=== TOOL CALLS ===");

    for (const call of message.tool_calls) {
      if (call.type === "function") {
        console.log("Ferramenta:", call.function.name);
        console.log("Argumentos:", call.function.arguments);
      }
    }
  } else {
    console.log("Nenhuma ferramenta solicitada.");
  }
} catch (error) {
  console.error(
    "Falha OpenRouter:",
    error.status ?? "sem status",
    error.message
  );
  process.exitCode = 1;
}
