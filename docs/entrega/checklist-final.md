# Checklist final da entrega do desafio

## Escopo minimo verificado

| Entregavel pedido | Arquivo ou comprovacao | Estado |
| --- | --- | --- |
| Codigo-fonte, API Node/TypeScript/Express e agente IA | `apps/order-api`, `apps/agent-service` | Implementado |
| API de consulta e cancelamento com verificacao de status e confirmacao | `src/app.ts`, `src/agent/cancellation-agent.ts`, testes | Validado nos cenarios de teste |
| Encaminhamento humano em fila interna simulada | `handoff-agent.ts`, `pending-handoffs.ts`, migrações `005/006` | Validado: Telegram, log `handoff.requested` e 1 registro no PostgreSQL local |
| Integracao Fake Store | `src/integrations/fake-store.ts` | Testada em HTTP real e testes simulados |
| PostgreSQL e fila interna simulada | `infra/db/001..006`, Docker Compose | Migrações 001 a 006 aplicadas no Docker, `db-migrate` com exit 0 |
| Docker para execucao local | `compose.yaml`, Dockerfiles, `infra/docker-init` | Build, migracoes e health check validados |
| OpenAPI e Swagger UI | `apps/order-api/src/openapi.ts`, `/api-docs` | Validado: Swagger UI HTTP 200, OpenAPI e header interno obrigatório |
| Prompts e limites de IA | `docs/entrega/arquitetura-e-decisoes.md`, `openrouter-provider.ts` | Documentado |
| Regras, ambiguidades e suposicoes | `docs/entrega/regras-de-negocio.md` | Documentado |
| Casos de teste com objetivo/cenario/pre-condicoes/esperado | `docs/entrega/casos-de-teste.md` | Documentado; 162/162 testes aprovados (16 Order API + 146 Agent Service) |
| Logs estruturados e exemplos | `docs/entrega/logs.md` e `observabilidade-google-cloud.md` | Validado local e com amostra no Cloud Logging |
| Decisoes e limitacoes | `docs/entrega/arquitetura-e-decisoes.md`, README | Documentado |
| Link GitHub acessivel ao avaliador | README | Código publicado em https://github.com/mneves0988/desafio-cs; falta liberar acesso |

## Pontos para checagem antes do envio

1. Consolidar código, migrações 001–006 e documentação na pasta local; não incluir `.env`, `.env.*` privados, `LEIA-ME-*.txt` temporários nem a pasta `.git` antiga no repositório novo.
2. Após criar o histórico Git novo, verificar arquivos com `git status --short`, `git diff --cached --check` e `git ls-files` antes do primeiro commit.
3. Executar novamente builds e testes dos dois workspaces na versão final; a última execução observada aprovou **162/162** testes.
4. `docker compose config --quiet`, `docker compose up --build -d`, `docker compose ps`, e `docker compose ps -a db-migrate`. Nao e preciso resetar o volume.
5. Swagger UI, OpenAPI e header obrigatório já validados localmente; repetir, no teste limpo, consulta autenticada no mock HTTP. Testar cancelamento positivo apenas em pedido fictício descartável.
6. Validar por amostragem que `git grep` nao apresenta tokens, senhas nem strings reais de `DATABASE_URL` dentro dos arquivos versionados; nao imprimir segredos no terminal compartilhado.
7. **Validado:** instalação limpa, npm ci, builds e 162 testes. Docker validado no ambiente original; não repetido na cópia limpa.
8. **Concluído:** novo repositório criado e publicado manualmente, com histórico independente e auditoria local de credenciais. Liberar acesso ao avaliador.

## Limites assumidos

Demo com identidade ficticia compartilhada; Telegram aberto, sem login real; nao liberar backend em internet publica. Handoff registra apenas um encaminhamento no banco interno com `status=pending_demo`, sem notificacao, ticket externo ou operador real. A confirmacao de cancelamento permanece isolada. Cloud Monitoring usa cinco logs de amostra manual; nenhuma coleta continua ou SLA.
