const key = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL_MAIN;

console.log("=== CONFIGURACAO ===");
console.log("Chave carregada:", Boolean(key));
console.log("Prefixo valido:", key?.startsWith("sk-or-v1-") ?? false);
console.log("Possui espacos:", /\s/.test(key ?? ""));
console.log("Modelo configurado:", model || "NAO CONFIGURADO");

if (!key) {
  process.exit(1);
}

console.log("\n=== AUTENTICACAO OPENROUTER ===");

try {
  const response = await fetch(
    "https://openrouter.ai/api/v1/key",
    {
      headers: {
        Authorization: `Bearer ${key}`
      },
      signal: AbortSignal.timeout(10000)
    }
  );

  const body = await response.json();

  console.log("HTTP:", response.status);

  if (response.ok) {
    console.log("Autenticacao: OK");
    console.log("Free tier:", body.data?.is_free_tier);
    console.log("Limite restante:", body.data?.limit_remaining);
  } else {
    console.log(
      "Erro:",
      body.error?.message ?? "Resposta nao reconhecida"
    );
  }
} catch (error) {
  console.log("Erro de conexao:", error.message);
}
