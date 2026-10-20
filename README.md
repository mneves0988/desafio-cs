# Contato Seguro AI

Desafio tecnico: agente de atendimento textual que consulta pedidos e produtos e permite **solicitar cancelamento com confirmacao explicita**. Este repositorio usa pedidos **ficticios** e um token compartilhado de demonstracao; nao e um sistema pronto para clientes reais.

## Arquitetura

- **Order API**: Node.js + TypeScript + Express; fonte de verdade para status e cancelamentos, com controle por `user_id`, transicao atomica de `processing` para `cancelled`, Swagger UI e autenticacao de demonstracao.
- **Agent Service**: OpenRouter (Gemma por padrao) seleciona ferramentas de consulta. Validacoes deterministicas e a Order API controlam as operacoes. Confirmacoes pendentes e referencias contextuais ficam no PostgreSQL. O modelo nao possui ferramenta de cancelamento.
- **Fake Store API**: somente catalogo externo de produtos, sem autoridade sobre status ou cancelamento de pedidos.
- **Canais**: Telegram por long polling opcional e mock HTTP local protegido por bearer token.
- **Encaminhamento humano demonstrativo**: recebe o motivo em linguagem natural, persiste uma solicitacao resumida numa fila **interna** PostgreSQL e emite `handoff.requested`. Nao ha operador, notificacao ou fila externa conectada.
- **Seguranca de demonstracao**: confirmacao explicita antes do cancelamento, confirmacao assinada HMAC com expiracao curta, validacao de titularidade na Order API, limites de payload e logs sem conteudo das conversas.

**Repositório final:** https://github.com/mneves0988/desafio-cs

Consulte tambem o [painel de metricas Google Cloud](docs/entrega/painel-metricas-google-cloud.md) e as [instrucoes de observabilidade](docs/entrega/observabilidade-google-cloud.md).

Leia [Evidencias de validacao](docs/entrega/evidencias-validacao.md), [Arquitetura e decisoes](docs/entrega/arquitetura-e-decisoes.md), [Regras, duvidas e suposicoes](docs/entrega/regras-de-negocio.md), [Casos de teste obrigatorios](docs/entrega/casos-de-teste.md) e [Exemplos de logs](docs/entrega/logs.md).

## Requisitos

Docker Desktop com Docker Compose V2 para rodar tudo em containers. Alternativamente, Node.js 22+, npm e PostgreSQL para desenvolvimento direto. Internet para instalar dependencias e acessar OpenRouter e Fake Store.

## Execucao local com Docker (recomendada para avaliacao)

1. Prepare o `.env`. Para uma instalacao nova: `Copy-Item .env.example .env`; **nao substitua um `.env` ja configurado**. Configure `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `DEMO_ACCESS_TOKEN`, `CANCEL_CONFIRMATION_SECRET`, `AGENT_HTTP_TOKEN`, `OPENROUTER_API_KEY` e `OPENROUTER_MODEL_MAIN`. Use segredos longos e distintos. No PowerShell: `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')` gera uma string de 64 caracteres para cada segredo. Para a senha do Postgres use apenas caracteres alfanumericos porque a URL de conexao e interpolada no Compose.
2. Garanta que servidores Node.js locais das portas 3000 e 3001 estejam parados. Para Telegram, nao mantenha ao mesmo tempo o long polling local fora do Docker. `TELEGRAM_BOT_TOKEN` e **opcional**; deixe vazio para testar apenas o mock HTTP.
3. Execute `docker compose config --quiet` e `docker compose up --build -d`. O Compose utiliza volume local isolado `postgres_delivery_data` (nao modifica um volume antigo `postgres_data`). O servico `db-migrate` executa os scripts `001` a `006` no Postgres local e tambem em volumes persistentes preexistentes; o SQL e idempotente. Nenhuma migracao e enviada ao Supabase nessa modalidade.
4. Confira `docker compose ps` e `docker compose logs --tail=100 db-migrate order-api agent-service`.
5. Swagger UI: http://127.0.0.1:3000/api-docs . Health: http://127.0.0.1:3000/health e http://127.0.0.1:3001/health .
6. Mock HTTP (PowerShell):

```powershell
$token = ((Get-Content .env | Where-Object { $_ -match '^AGENT_HTTP_TOKEN=' } | Select-Object -First 1) -split '=',2)[1]
Invoke-RestMethod -Uri 'http://127.0.0.1:3001/messages' -Method Post `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType 'application/json; charset=utf-8' `
  -Body (@{ message = 'Qual o status do PED-1001?' } | ConvertTo-Json)
```

O pedido `PED-1001` inicia como `processing`, `PED-1002` como `shipped` e `PED-2001` pertence ao ficticio usuario 2 (inacessivel com token demonstrativo do usuario 1). As informacoes de produtos vem da Fake Store API; o preco esta na moeda da API e nao deve ser interpretado como BRL.

**Atencao ao estado:** cancelar um pedido altera permanentemente seu status naquele banco. Para testes de cancelamento positivo, use um pedido descartavel criado especificamente para isso; evite consumir `PED-1001`. `docker compose down` para os containers e preserva dados. **`docker compose down -v` apaga o volume de dados local**; execute apenas se desejar realmente reinicializar o ambiente.

## Execucao sem Docker (desenvolvimento)

`npm ci`, `npm run build -w @contato-seguro/order-api` e `npm run build -w @contato-seguro/agent-service`. Configure `DATABASE_URL` apontando para seu PostgreSQL com as migracoes `001` a `006` aplicadas. Para quem utiliza Supabase ja inicializado, aplique manualmente as migracoes `infra/db/005_agent_pending_handoffs.sql` e `infra/db/006_agent_handoff_requests.sql` (nessa ordem) no SQL Editor antes de reiniciar o agente. Inicie Order API com `node --env-file=.env apps/order-api/dist/server.js`; em outro terminal, `node --env-file=.env apps/agent-service/dist/channels/server.js`. O mock HTTP usa `127.0.0.1` por padrao; a variavel `AGENT_HTTP_HOST=0.0.0.0` serve apenas ao bind dentro do container, cuja porta e publicada no loopback do host.

## Testes

```powershell
npm.cmd run build -w @contato-seguro/order-api
npm.cmd run build -w @contato-seguro/agent-service
npm.cmd run test -w @contato-seguro/order-api
npm.cmd run test -w @contato-seguro/agent-service
```

**Validação em 20/10/2026:** **162/162 testes aprovados**, sendo 16 na Order API (2 arquivos de teste) e 146 no Agent Service (12 arquivos de teste). Os builds TypeScript dos dois serviços foram aprovados. Em execução local com Docker Desktop, `postgres`, `order-api` e `agent-service` ficaram `healthy`; o `db-migrate` terminou com código zero e aplicou as migrações `001` a `006`. Foram verificados consultas de pedido e produto, atendimento pelo Telegram e encaminhamento humano registrado no PostgreSQL. A Order API também teve o OpenAPI e o Swagger UI verificados em execução, inclusive o parâmetro obrigatório `X-Cancel-Confirmation`.

O histórico anterior de 107 e 124 testes permanece descrito apenas para rastreabilidade em [evidências de validação](docs/entrega/evidencias-validacao.md). **Ainda falta repetir o teste de instalação em uma cópia limpa da versão final**, já que o clone limpo anteriormente aprovado continha uma versão anterior do código.

## Encaminhamento humano (fila interna simulada)

Ao pedir `Queria conversar com alguém`, a Camila pergunta brevemente o motivo, sem exigir um `sim` de confirmacao. Assim que a pessoa explica, grava na tabela `public.agent_handoff_requests` uma categoria ampla (`delivery`, `payment`, `order`, `product`, `cancellation` ou `other`) e um hash HMAC da sessao. **Nenhum texto de conversa, ID de pedido, nome ou ID do Telegram e salvo nessa tabela.** O evento estruturado `handoff.requested` so aparece quando o registro no banco teve sucesso.

Se a mensagem ja inclui o motivo (`Quero um atendente porque minha entrega atrasou`), registra sem segunda pergunta. Quando a propria Camila oferece ajuda humana apos uma falha interna, o cliente pode responder `sim` e o registro ocorre sem pedir o motivo novamente. A solicitacao de ajuda humana invalida qualquer confirmacao de cancelamento pendente: um `sim` para atendimento nao executa cancelamento.

**Transparencia:** esta e uma fila **interna demonstrativa**, sem consumidor real, ticket em CRM, notificacao ou operador conectado. A demonstração utiliza pedidos fictícios e a documentação deixa claro que esse registro não aciona um atendente. O bot não deve afirmar que alguém assumiu a conversa. A Camila diz apenas que registrou o pedido de atendimento, jamais que uma pessoa recebeu ou assumiu a conversa. Os dados da demo nao sao adequados para clientes reais.

Migracoes: `005_agent_pending_handoffs.sql` e `006_agent_handoff_requests.sql`. Se a `005` ja tiver sido aplicada, a `006` acrescenta a fase de triagem e cria a tabela de registros; ambas sao idempotentes.

Teste manual **realizado em 20/10/2026**: `Quero falar com uma pessoa.` → `Meu pedido está atrasado` → Camila registra o encaminhamento. O log retornou `handoff.requested` com `stored:true`, `forwarded:false` e `reasonCategory:"delivery"`. A consulta SQL retornou **1 registro**. Para repetir a verificação no Docker local:

```powershell
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) AS total_encaminhamentos FROM public.agent_handoff_requests;"'
```

Nao expor o campo `session_hash` em prints. Na execucao direta com `DATABASE_URL` do Supabase, aplicar as migrations `005` e `006` no **projeto correto** antes de iniciar o agente; o Docker usa seu proprio Postgres local.

## API e comunicacao

| Metodo | Rota | Descricao |
| --- | --- | --- |
| GET | `/health` | Health Order API |
| GET | `/orders/:id` | Consultar pedido autenticado |
| POST | `/orders/:id/cancel` | Cancelar com prova assinada e estado `processing` |
| GET | `/openapi.json` | OpenAPI JSON |
| GET | `/api-docs` | Swagger UI |
| GET | `:3001/health` | Health Agent Service |
| POST | `:3001/messages` | Mock HTTP com bearer token e corpo `{ "message": "..." }` |

O header `X-Cancel-Confirmation` é **interno**, obrigatório no endpoint de cancelamento e consta dos parâmetros do OpenAPI. É criado pelo Agent Service somente após a confirmação explícita do cliente; não deve ser solicitado ao usuário. A Swagger UI foi validada via HTTP 200. A interface permite explorar os contratos, mas uma prova válida não pode ser fabricada apenas clicando em `Try it out`. A demonstracao publica nao deve expor o token de desenvolvimento.

## Evolucao da conversa e memoria

A Camila usa referencias de pedido e produto persistidas em `public.agent_session_context` (migração `004`, TTL 24h), sem armazenar texto integral da conversa. A versao v3 reconhece perguntas contextuais como `Ele ja saiu pra entrega?` e `Tem previsao de quando chega?` sem inventar dados logisticos. Em Docker utiliza Postgres local; fora do Docker pode apontar para o Supabase via `DATABASE_URL`. Veja `docs/entrega/memoria-contextual-v3.md`.

## Limites conhecidos

Nao ha login de clientes reais nem verificacao de titularidade por Telegram; conversas Telegram diferentes isolam memoria e confirmacoes, mas consultam a mesma **conta ficticia**. A interface HTTP usa sessao fixa. Handoff humano real (a demonstracao registra na fila PostgreSQL interna, sem operador conectado), envio de notificacoes, webhook Telegram, Cloud Run, Redis e protecao anti-replay HMAC duravel nao foram implementados. Ha um painel demonstrativo no Cloud Monitoring alimentado por amostra manual de **cinco logs**, nao monitoramento em tempo real. `NODE_ENV=production` bloqueia intencionalmente os canais demonstrativos e a Order API. A comprovacao de seguranca se limita aos casos documentados; a aplicacao nao deve processar pedidos reais sem uma arquitetura de autenticacao e autorizacao apropriada.
