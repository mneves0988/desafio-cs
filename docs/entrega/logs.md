# Observabilidade e exemplos de log

A aplicacao emite JSON por linha no stdout/stderr. Estes exemplos sao **ilustrativos** do esquema de eventos existente, nao evidencias de uma execucao especifica.

```json
{"level":"info","event":"server.started","service":"order-api","storage":"postgresql","port":3000}
{"level":"info","event":"conversation.request","channel":"http","status":200,"durationMs":120}
{"level":"info","event":"llm.tool_selection","provider":"openrouter","model":"google/gemma-4-26b-a4b-it","durationMs":1200,"toolCallCount":1,"promptTokens":87,"completionTokens":15}
{"level":"warn","event":"llm.request_failed","provider":"openrouter","model":"google/gemma-4-26b-a4b-it","durationMs":20000,"httpStatus":429,"errorType":"RateLimitError"}
{"level":"error","event":"conversation.unhandled","channel":"http","errorType":"Error"}
```

Evento **real observado em 20/10/2026** após registro de encaminhamento na fila interna:

```json
{"severity":"INFO","level":"info","service":"agent-service","event":"handoff.requested","mode":"demo","stored":true,"forwarded":false,"reasonCategory":"delivery"}
```

`stored:true` confirma o registro na fila PostgreSQL da demo; `forwarded:false` deixa explicito que nenhum atendente real recebeu a solicitacao. Nao sao gravados ID de chat, pedido ou texto de conversa.

## Regras de privacidade

Nao incluir no log: mensagens do cliente, titulos de produtos, prompts completos, nome/email, token bearer, segredo HMAC, token do Telegram ou URL de conexao ao banco. A aplicacao atual registra metricas das chamadas ao LLM (quando presentes), status HTTP e tempos de resposta. Foram acrescentados eventos de consultas, cancelamentos e chamadas externas (`order.lookup`, `order.cancel`, `order_api.lookup`, `fake_store.request`, `fake_store.validation_failed`). Nao existe tracing distribuido com IDs de correlacao entre servicos; os novos testes verificam privacidade nesses eventos. Nos testes, as falhas devem ser identificaveis sem expor segredos.

Para inspecionar:

```powershell
docker compose logs --tail=100 order-api agent-service
```

## Evidencia real da execucao Docker de 19/10/2026

As linhas abaixo foram coletadas do `docker compose logs` fornecido durante a validacao, nao sao logs de producao:

```json
{"level":"info","event":"server.started","service":"order-api","storage":"postgresql","port":3000}
{"level":"info","event":"agent.http.started","port":3001,"host":"0.0.0.0","mode":"demo"}
{"level":"info","event":"llm.tool_selection","provider":"openrouter","model":"google/gemma-4-26b-a4b-it","durationMs":1382,"toolCallCount":1,"promptTokens":230,"completionTokens":21}
{"level":"info","event":"conversation.request","channel":"http","status":200,"durationMs":2183}
{"level":"info","event":"llm.tool_selection","provider":"openrouter","model":"google/gemma-4-26b-a4b-it","durationMs":1091,"toolCallCount":1,"promptTokens":230,"completionTokens":21}
```

Tambem ocorreu anteriormente um `telegram.poll_failed` com `errorType: TypeError`; um teste subsequente da API Telegram pelo container retornou HTTP 200 e uma consulta real via bot foi respondida. O erro intermitente nao deve ser descrito como resolvido definitivamente sem monitoramento mais longo.

## Evidencia adicional real: novas chamadas locais e amostra Google Cloud

Estes registros foram observados apos a instrumentacao em 19/10/2026:

```json
{"severity":"INFO","level":"info","service":"order-api","event":"order.lookup","status":200,"durationMs":68}
{"level":"info","event":"llm.tool_selection","provider":"openrouter","model":"google/gemma-4-26b-a4b-it","durationMs":1128,"toolCallCount":1,"promptTokens":230,"completionTokens":21}
{"severity":"INFO","level":"info","service":"agent-service","event":"order_api.lookup","status":200,"durationMs":95,"outcome":"ok"}
{"level":"info","event":"llm.tool_selection","provider":"openrouter","model":"google/gemma-4-26b-a4b-it","durationMs":531,"toolCallCount":1,"promptTokens":226,"completionTokens":13}
{"severity":"INFO","level":"info","service":"agent-service","event":"fake_store.request","status":200,"durationMs":970,"outcome":"ok","resource":"product"}
```

Estes **cinco** registros foram enviados de forma sanitizada ao projeto `contato-seguro-ai` e apareceram no Cloud Logging e no painel demonstrativo. O nome do painel indica uma capacidade maxima de dez logs no script de exportacao, nao dez eventos efetivamente enviados. Ver `observabilidade-google-cloud.md` e `painel-metricas-google-cloud.md`.
