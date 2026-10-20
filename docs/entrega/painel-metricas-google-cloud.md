# Contato Seguro AI: painel de métricas de demonstração

Este painel representa **somente os logs reais de uma amostra manual do Docker local**. Ele não monitora continuamente o bot e não representa SLA, disponibilidade mensal, percentil p95 ou uma implantação no Cloud Run.

## Pré-requisitos

- Projeto Google Cloud **Contato Seguro AI** já criado e com faturamento associado. Identifique o `projectId` pela CLI; não use o nome de exibição como ID.
- `gcloud` autenticado com permissões para habilitar APIs, criar métricas de logs e dashboards e gravar logs. Se falhar com `PERMISSION_DENIED`, solicite as permissões específicas a um administrador; não atribua `Owner` ou `Editor` como atalho.
- Docker Compose já validado e executando para emitir eventos JSON reais.
- Script existente: `scripts/exportar-amostra-logs-gcp.ps1`, que recria somente campos permitidos.

## Passo a passo (PowerShell)

```powershell
gcloud projects list --format="table(projectId,name)"
$ProjectId = "contato-seguro-ai"
gcloud projects describe $ProjectId --format="table(projectId,name)"

gcloud services enable logging.googleapis.com monitoring.googleapis.com --project=$ProjectId

# Ordem importante: métricas ANTES dos 10 eventos, senão os gráficos podem ficar vazios.
.\scripts\criar-painel-gcp.ps1 -ProjectId $ProjectId

# Caso não haja logs recentes, faça duas consultas pelo endpoint HTTP para gerá-los.
.\scripts\exportar-amostra-logs-gcp.ps1 -ProjectId $ProjectId -Minutes 120 -MaxEntries 10

$filter = 'resource.type="global" AND log_id("contato-seguro-ai-demo")'
gcloud logging read $filter --project=$ProjectId --limit=10 --format="table(timestamp,severity,jsonPayload.event,jsonPayload.service)"
```

Abra `https://console.cloud.google.com/monitoring/dashboards?project=contato-seguro-ai`, selecione **Contato Seguro AI - Demo (10 logs)** e ajuste o intervalo para **Última 1 hora**. A coleta da métrica pode levar alguns minutos até aparecer no Cloud Monitoring.

## Widgets

- Todos os eventos: contador de qualquer `jsonPayload.event` na amostra.
- Consultas e cancelamentos: eventos `order.lookup`, `order.cancel` e `order_api.lookup` (conta eventos, não pedidos únicos).
- Fake Store: `fake_store.request` e `fake_store.validation_failed` (uma operação inválida pode produzir dois eventos).
- Modelo de IA: `llm.tool_selection` (somente decisões registradas, não total de mensagens).
- Eventos recentes: painel de logs seguro, com `status`, `durationMs` e contadores de tokens quando presentes.

**Importante:** a amostra inclui até dez eventos de log, mas o script seleciona somente eventos allowlisted. Os gráficos podem exibir menos categorias ou zero em alguns momentos; isso não é indicativo de indisponibilidade. As contagens de diferentes gráficos podem sobrepor-se.

O `gcloud logging write` usa `resource.type="global"` por padrão; no futuro a coleta via Cloud Run usará o tipo de recurso `cloud_run_revision` e exigirá atualização dos filtros.

## Limitações de segurança, custos e operação

- A demonstração não deve receber pedidos reais nem dados pessoais: o bot usa uma identidade fictícia compartilhada e não possui autorização de cliente real.
- Os filtros são restritos ao log `contato-seguro-ai-demo` para evitar coletar entradas de outros projetos ou aplicações.
- Logs e métricas gerenciados podem gerar custos conforme faturamento, volume e retenção do projeto. Para dez eventos, o volume é pequeno, mas custos não são garantidos como zero.
- O script de dashboard é conservador: reutiliza métricas com o mesmo filtro e não substitui um painel existente. Repetir o script não deve gerar duplicatas com o mesmo nome.
- Para um monitoramento contínuo de latência p95, use métricas de distribuição e ingestão contínua depois de uma implantação adequada. Não extrapolar taxas ou SLAs dos dez eventos.

Documentação oficial:
- https://cloud.google.com/logging/docs/logs-based-metrics/counter-metrics
- https://cloud.google.com/monitoring/dashboards/api-examples
- https://cloud.google.com/sdk/gcloud/reference/monitoring/dashboards/create

## Resultado comprovado em 19/10/2026

- Projeto: `contato-seguro-ai`.
- APIs Logging e Monitoring habilitadas.
- Metric descriptions: `csai_demo_events`, `csai_demo_orders`, `csai_demo_products`, `csai_demo_llm`.
- **5** logs efetivamente enviados e lidos pelo Google Cloud CLI (limite solicitado ao script: **10**).
- Grafico de eventos totais: **5**; consultas/pedidos: **2**; Fake Store: **1**; LLM: **2**.
- O painel e demonstrativo e baseado num unico minuto com atividade; nao inferir disponibilidade ou tendencia de trafego.
- Os indicadores deixam de aparecer no intervalo "Ultima hora" com o passar do tempo; selecione um intervalo que inclua a data dos registros para revisar a evidencia.
