const key = process.env.OPENROUTER_API_KEY;
const model = "google/gemma-4-26b-a4b-it";

if (!key) {
  throw new Error("OPENROUTER_API_KEY ausente");
}

const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json"
};

console.log("=== VERIFICACAO DA CHAVE ===");

const check = await fetch(
  "https://openrouter.ai/api/v1/key",
  {
    headers,
    signal: AbortSignal.timeout(10000)
  }
);

const keyData = await check.json();

console.log("HTTP:", check.status);
console.log(
  "Management key:",
  keyData.data?.is_management_key
);
console.log(
  "Provisioning key:",
  keyData.data?.is_provisioning_key
);

if (!check.ok) {
  process.exit(1);
}

console.log("\n=== GERACAO DIRETA ===");
console.log("Modelo:", model);

try {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: "Responda apenas OK."
          }
        ],
        max_tokens: 30
      }),
      signal: AbortSignal.timeout(30000)
    }
  );

  const body = await response.json();

  console.log("HTTP:", response.status);

  console.log(
    "Request ID:",
    response.headers.get("x-request-id") ??
    response.headers.get("x-openrouter-request-id") ??
    "Nao informado"
  );

  if (response.ok) {
    console.log(
      "Resposta:",
      body.choices?.[0]?.message?.content
    );
  } else {
    console.log(
      "Erro:",
      body.error?.message ?? "Desconhecido"
    );
    console.log(
      "Codigo:",
      body.error?.code ?? "Nao informado"
    );
    console.log(
      "Provedor:",
      body.error?.metadata?.provider_name ??
      "Nao informado"
    );
  }
} catch (error) {
  console.log("Falha de rede:", error.message);
}
