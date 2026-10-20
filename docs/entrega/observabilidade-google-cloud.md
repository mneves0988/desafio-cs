# Observabilidade: Docker e Google Cloud Logging

## Objetivo

Produzir evidências locais e permitir análise centralizada no Google Cloud **sem tornar a Google uma dependência da execução do desafio**.

- A aplicação escreve um objeto JSON por linha no stdout.
- Os eventos de consulta e cancelamento são gerados pela **Order API**, responsável pela regra de negócio.
- O Agent Service registra as consultas à Order API e à Fake Store, além dos eventos já existentes de uso e falha do OpenRouter e do canal HTTP.
- O `severity` (INFO, WARNING, ERROR) é reconhecido pelo Cloud Logging em ambientes gerenciados, como o Cloud Run.
- Não é necessário instalar uma biblioteca de Cloud Logging nos serviços para coletar stdout quando executados no Cloud Run.

### Exemplos de eventos (ilustrativos, não são evidências capturadas)

```json
{"severity":"INFO","level":"info","service":"order-api","event":"order.lookup","status":200,"durationMs":8}
{"severity":"WARNING","level":"warning","service":"order-api","event":"order.cancel","status":403,"durationMs":2}
{"severity":"INFO","level":"info","service":"agent-service","event":"order_api.lookup","status":200,"durationMs":17,"outcome":"ok"}
{"severity":"INFO","level":"info","service":"agent-service","event":"fake_store.request","status":200,"durationMs":405,"outcome":"ok","resource":"product"}
{"severity":"WARNING","level":"warning","service":"agent-service","event":"fake_store.validation_failed","outcome":"invalid_response","resource":"product"}
```

Os logs anteriores (`conversation.request`, `llm.tool_selection`) continuam funcionando e possuem campos `level`; a padronização de todos os eventos legados para `severity` poderá ser feita posteriormente. Os exemplos acima correspondem aos **novos** eventos.

## Teste local (obrigatório para o desafio)

```powershell
npm.cmd run build -w @contato-seguro/order-api
npm.cmd run build -w @contato-seguro/agent-service
npm.cmd run test -w @contato-seguro/order-api
npm.cmd run test -w @contato-seguro/agent-service

docker compose up --build -d
docker compose logs --tail=100 order-api agent-service
```

Faça consultas pelo mock HTTP, sem incluir tokens nos logs compartilhados. Confira `order.lookup`, `order_api.lookup` e `fake_store.request`. Uma tentativa de POST de cancelamento sem prova deve retornar HTTP 403 e gerar `order.cancel` com `status=403`.

## Enviar um snapshot dos eventos locais ao Google Cloud (opcional)

O script `scripts/exportar-amostra-logs-gcp.ps1` lê os logs recentes do Docker, **reconstrói um objeto seguro somente com campos permitidos** e envia até dez eventos ao Cloud Logging usando a identidade do `gcloud` já autenticada. Não transfere a linha JSON original, IDs de pedidos, mensagens, nomes, tokens ou segredos. Este procedimento é um **snapshot manual**, não um coletor contínuo e não representa uma implantação da aplicação no GCP.

Pré-requisitos: Cloud SDK configurado com permissão de gravação de logs no projeto (`logging.logEntries.create`, geralmente `roles/logging.logWriter`), Docker em execução e conectividade à Google Cloud. Se necessário, habilite a API Cloud Logging no projeto com permissão administrativa.

No PowerShell:

```powershell
gcloud auth list
gcloud config set project contato-seguro-ai
gcloud services enable logging.googleapis.com --project=contato-seguro-ai

.\scripts\exportar-amostra-logs-gcp.ps1 -ProjectId contato-seguro-ai -Minutes 30 -MaxEntries 10

gcloud logging read 'logName="projects/contato-seguro-ai/logs/contato-seguro-ai-demo"' --project=contato-seguro-ai --limit=10 --format='table(timestamp,severity,jsonPayload.event,jsonPayload.service)'
```

Se não houver autorização para habilitar APIs ou enviar logs, documente a limitação; não modifique permissões IAM globais automaticamente.

## Evidencia do dashboard concluida em 19/10/2026

O projeto **Contato Seguro AI**, projectId `contato-seguro-ai`, recebeu cinco entradas sanitizadas, retornadas por `gcloud logging read`. Quatro metricas baseadas em logs foram criadas e exibidas no dashboard `Contato Seguro AI - Demo (10 logs)`: total (5), consultas de pedidos (2), Fake Store (1) e selecoes do modelo (2). Os numeros correspondem **somente a esta amostra pontual** e nao representam atividade em tempo real nem um SLA.

Para consultar: `https://console.cloud.google.com/monitoring/dashboards?project=contato-seguro-ai`. Nao e necessario executar os scripts novamente para inspecionar os dados persistidos. A consulta pode precisar de um intervalo historico apropriado quando os registros sairem da janela de uma hora.

### Consultas no Logs Explorer

Para eventos enviados pelo script (recurso `global`):

```
logName="projects/contato-seguro-ai/logs/contato-seguro-ai-demo"
jsonPayload.event="order.cancel"
```

No futuro, **somente depois de uma implantação adequada e segura no Cloud Run**, consultas sobre a aplicação hospedada podem usar:

```
resource.type="cloud_run_revision"
resource.labels.service_name="contato-seguro-order-api"
jsonPayload.event="order.cancel"
```

O serviço demonstrativo atual **não é adequado para implantação pública**: compartilha o usuário fictício entre todos os usuários do Telegram, exige `NODE_ENV` diferente de `production` e usa polling do Telegram. O Cloud Run exigirá uma revisão específica de autenticação e de webhook. Nenhum desses recursos é requisito obrigatório do desafio.

## Privacidade e limites

Campos permitidos: `service`, `event`, `severity`, `status`, `durationMs`, `outcome`, `resource` e métricas numéricas agregadas do LLM. Não registrar texto da conversa, ID de chat ou pedido, prompts, tokens, payloads externos, e-mails, URLs com segredos ou strings brutas de exceções.

Os testes de observabilidade verificam a ausência de dados sensíveis nos **eventos adicionados**. Isso não substitui auditoria de todos os logs existentes, red team ou controles de acesso ao Cloud Logging.

Documentação oficial:
- https://cloud.google.com/run/docs/logging
- https://cloud.google.com/logging/docs/structured-logging
- https://cloud.google.com/logging/docs/view/logging-query-language
