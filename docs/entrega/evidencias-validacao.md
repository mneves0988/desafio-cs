# Evidências de validação do desafio

**Atualização:** 20/10/2026. **Escopo:** atendimento demonstrativo com pedidos fictícios em Windows, Docker Desktop 29.8.2, Telegram e PostgreSQL local. Os resultados abaixo foram observados nos comandos e nas conversas fornecidos durante o desenvolvimento. Não representam homologação para clientes reais.

## 1. Builds e testes automatizados: versão atual

| Verificação | Resultado observado |
| --- | --- |
| Build TypeScript da Order API | Aprovado, sem erros |
| Build TypeScript do Agent Service | Aprovado, sem erros |
| `npm.cmd run test -w @contato-seguro/order-api` | **16/16** testes aprovados, 2 arquivos |
| `npm.cmd run test -w @contato-seguro/agent-service` | **146/146** testes aprovados, 12 arquivos |
| Total | **162/162** testes aprovados |
| `git diff --check` | Sem erros de espaço em branco; apenas avisos LF/CRLF do Git no Windows |

As suítes incluem consulta e cancelamento de pedidos, prova HMAC, isolamento de sessões, segurança do agente, seleção de ferramentas, Fake Store, contexto, linguagem da Camila, 24 testes de `handoff-agent.test.ts` e cinco de `pending-handoffs.test.ts`. A suíte de conversa `camila-natural.test.ts` concluiu com 19 testes aprovados após atualização da expectativa do handoff.

**Histórico, não resultado atual:** um clone independente de versão anterior havia aprovado 107 testes; a Camila Fluidez v2 havia aprovado 124. Esses marcos são mantidos para rastreabilidade, não como pendências dos testes atuais.

## 2. Docker, banco e migrações

- `docker compose up --build -d` concluiu a construção; `postgres`, `order-api` e `agent-service` foram exibidos como **healthy**.
- `docker compose ps -a db-migrate` mostrou **Exited (0)**.
- O log do migrador mostrou `001_init.sql` a `006_agent_handoff_requests.sql` executados com sucesso. Avisos `already exists, skipping` indicaram tabelas/índices preexistentes nos scripts idempotentes.
- `GET http://127.0.0.1:3000/health`: `status=ok`, `service=order-api`.
- `GET http://127.0.0.1:3001/health`: `status=ok`, `service=agent-service`, `mode=demo`.
- O Docker Compose utiliza **PostgreSQL local**, separado de qualquer projeto Supabase; o resultado acima não comprova aplicação das migrações 005/006 no Supabase.

## 3. Swagger e contratos da API

- `GET /openapi.json` respondeu com `Contato Seguro - Order API`, versão `0.1.0`, e caminhos `/health`, `/orders/{id}` e `/orders/{id}/cancel`.
- `GET /api-docs/` respondeu **HTTP 200** com a interface Swagger UI.
- Após ajuste do documento OpenAPI, uma verificação automática local confirmou **exatamente um** parâmetro `X-Cancel-Confirmation`, declarado como `in: header` e `required: true` no `POST /orders/{id}/cancel`.
- O header é uma prova assinada interna, não uma senha a ser fornecida pelo cliente ou gerada no Swagger; os testes do backend comprovam sua validação e o bloqueio de requisições sem prova.

## 4. Atendimento funcional: HTTP, LLM e Telegram

- Pelo mock HTTP autenticado, a mensagem sobre o pedido `PED-1001` retornou o estado `processing` consultado na Order API, e a consulta ao produto 1 retornou dados da Fake Store API.
- Logs de execução evidenciaram `llm.tool_selection` pelo OpenRouter com o modelo configurado `google/gemma-4-26b-a4b-it`. O LLM seleciona apenas ferramentas de leitura; não tem permissão de cancelamento.
- No Telegram, `/start` respondeu com apresentação da Camila e aviso de dados fictícios. Uma consulta real a `PED-1001` retornou que o pedido estava em processamento.
- Em um teste inicial de acompanhamento, as mensagens `Ele já saiu pra entrega?` e `Tem previsão de quando chega?` receberam fallback genérico. **Esse comportamento inicial motivou a correção contextual v3 e não deve ser apresentado como sucesso.** O usuário confirmou posteriormente melhora da conversa com a v3. Não foi anexada transcrição literal completa pós-correção para essas duas frases.
- A Camila Fluidez v2 também foi observada consultando produto e preço e respondendo a agradecimento. A v3 evita repetir referências e evita inventar previsão de entrega; a cobertura automatizada está incluída na suíte atual.

### Telegram: handoff conversacional observado em 20/10/2026

Transcrição real compartilhada pelo usuário:

> **Cliente:** Quero falar com uma pessoa.
>
> **Camila:** Claro! Me conta rapidinho o que aconteceu para eu encaminhar melhor?
>
> **Cliente:** Meu pedido está atrasado
>
> **Camila:** Entendi, é sobre a entrega. Deixei sua solicitação registrada para atendimento humano.

A aplicação gravou o seguinte evento estruturado (sem texto nem identificadores pessoais):

```json
{"severity":"INFO","level":"info","service":"agent-service","event":"handoff.requested","mode":"demo","stored":true,"forwarded":false,"reasonCategory":"delivery"}
```

O comando `SELECT COUNT(*) AS total_encaminhamentos FROM public.agent_handoff_requests;` executado no PostgreSQL do Docker retornou **1**. Isso comprova o registro na fila **interna e simulada**, não um contato efetivo com operador, CRM ou sistema externo.

## 5. Cancelamento seguro: testes e evidência manual anterior

- Chamada direta ao `POST /orders/PED-1001/cancel` com bearer demonstrativo e sem `X-Cancel-Confirmation` retornou **HTTP 403 `CONFIRMATION_REQUIRED`**.
- Em validação manual anterior, após pedido de cancelamento e confirmação afirmativa através do agente, o pedido fictício descartável `PED-1004` passou para `cancelled` no **Supabase**.
- Nos testes atuais, a Order API bloqueou cancelamento de `shipped` (409), de outro cliente (404), prova ausente/inválida/expirada (403) e segunda tentativa após conclusão (409); autorizou apenas a transição válida de `processing`.
- O teste manual anterior em Supabase e a validação recente em PostgreSQL local são ambientes distintos. Não há evidência de cancelamento positivo adicional em pedido descartável no banco Docker após a instalação do handoff, e isso não deve ser presumido.

## 6. Logs e demonstração Google Cloud

- Eventos estruturados registrados ou exercitados em testes: `order.lookup`, `order.cancel`, `order_api.lookup`, `fake_store.request`, `fake_store.validation_failed`, `llm.tool_selection` e `handoff.requested`.
- O projeto GCP `contato-seguro-ai` recebeu cinco logs reais **sanitizados e enviados manualmente**: `order.lookup` (1), `order_api.lookup` (1), `fake_store.request` (1) e `llm.tool_selection` (2).
- Dashboard **Contato Seguro AI - Demo (10 logs)**: quatro gráficos de eventos, consultas, Fake Store e LLM; o limite de exportação era dez eventos, mas **cinco** foram efetivamente enviados.
- Esses gráficos são um snapshot; **não** existe ingestão contínua, relatório de disponibilidade, percentil p95 ou implantação no Cloud Run.
- Os testes verificam ausência de dados sensíveis nos eventos instrumentados; após a revisão, o log genérico `http.error` da Order API também deixou de incluir `req.path`.

## 7. Limitações e verificação final ainda pendente

- **Instalação limpa da versão final:** o clone independente anterior contemplava uma versão mais antiga. Ainda é necessário copiar/clonar a versão consolidada, executar `npm ci`, builds, testes e Docker com configuração de demonstração, antes de afirmar que um terceiro pode reproduzi-la integralmente.
- **Memória após reinício:** o armazenamento em PostgreSQL com TTL de 24 horas e testes automatizados estão presentes; não há log neste conjunto comprovando explicitamente o teste manual após reiniciar o container e depois recuperar a referência no Telegram.
- **Telegram:** foi observado um `telegram.poll_failed` com `TypeError` em uma execução anterior. O endpoint `getMe` respondeu 200 e a consulta posterior funcionou; o recorte curto de logs não constitui garantia de estabilidade prolongada.
- **Segurança:** os canais representam uma única identidade fictícia compartilhada, sem autenticação de clientes reais. A fila humana é demonstrativa e não aciona pessoas. Não publicar APIs de demonstração com tokens compartilhados em endereço externo.
- **Publicação:** o link definitivo do novo repositório GitHub precisa ser preenchido após revisão de segredos e envio manual do código; a PR do repositório antigo não integra a entrega.
