param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{4,61}[a-z0-9]$')]
    [string]$ProjectId
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root 'infra/monitoring/contato-seguro-dashboard.template.json'
if (-not (Test-Path $template)) { throw "Template ausente: $template" }
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw 'Instale e autentique o Google Cloud CLI antes de prosseguir.' }

# Nenhum projeto global e alterado. O identificador precisa ser escolhido pelo usuario.
$project = & gcloud projects describe $ProjectId '--format=json' 2>&1
if ($LASTEXITCODE -ne 0) { throw "Projeto inacessivel: $ProjectId. Confirme a conta e o projectId." }
$projectInfo = ($project | Out-String | ConvertFrom-Json)
Write-Host "Projeto confirmado: $($projectInfo.name) [$($projectInfo.projectId)]"

# Cloud Logging/Monitoring APIs devem ser habilitadas previamente pelo operador.
$metrics = @(
    @{ name = 'csai_demo_events'; description = 'Contato Seguro AI demo - todos os eventos'; condition = 'jsonPayload.event:*' },
    @{ name = 'csai_demo_orders'; description = 'Contato Seguro AI demo - consultas e cancelamentos'; condition = '(jsonPayload.event="order.lookup" OR jsonPayload.event="order.cancel" OR jsonPayload.event="order_api.lookup")' },
    @{ name = 'csai_demo_products'; description = 'Contato Seguro AI demo - chamadas a Fake Store'; condition = '(jsonPayload.event="fake_store.request" OR jsonPayload.event="fake_store.validation_failed")' },
    @{ name = 'csai_demo_llm'; description = 'Contato Seguro AI demo - selecao de ferramentas LLM'; condition = 'jsonPayload.event="llm.tool_selection"' }
)

$filterPrefix = 'resource.type="global" AND log_id("contato-seguro-ai-demo")'
$metricListRaw = & gcloud logging metrics list "--project=$ProjectId" '--format=json'
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel listar metricas existentes. Verifique Logging API e permissoes.' }
$metricList = @($metricListRaw | Out-String | ConvertFrom-Json)
foreach ($metric in $metrics) {
    $filter = "$filterPrefix AND $($metric.condition)"
    $existing = $metricList | Where-Object { $_.name -eq $metric.name } | Select-Object -First 1
    if ($null -ne $existing) {
        if ($existing.filter -ne $filter) {
            throw "A metrica $($metric.name) ja existe com filtro diferente. Revise antes de alterar recursos existentes."
        }
        Write-Host "Metrica existente: $($metric.name)"
        continue
    }
    & gcloud logging metrics create $metric.name "--project=$ProjectId" "--description=$($metric.description)" "--log-filter=$filter" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar a metrica $($metric.name)." }
    Write-Host "Metrica criada: $($metric.name)"
}

$dashboardName = 'Contato Seguro AI - Demo (10 logs)'
$dashboardListRaw = & gcloud monitoring dashboards list "--project=$ProjectId" '--format=json'
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel listar dashboards existentes.' }
$dashboards = @($dashboardListRaw | Out-String | ConvertFrom-Json)
$found = @($dashboards | Where-Object { $_.displayName -eq $dashboardName })
if ($found.Count -gt 0) {
    Write-Host 'Painel ja existe. Para evitar duplicatas, a criacao foi ignorada.'
    Write-Host "Acesse: https://console.cloud.google.com/monitoring/dashboards?project=$ProjectId"
    exit 0
}

$rendered = (Get-Content -Path $template -Raw -Encoding UTF8).Replace('__PROJECT_ID__', $ProjectId)
$tempDashboard = Join-Path ([System.IO.Path]::GetTempPath()) ("csai-dashboard-$([guid]::NewGuid().ToString('N')).json")
try {
    Set-Content -Path $tempDashboard -Value $rendered -Encoding UTF8
    $null = Get-Content $tempDashboard -Raw | ConvertFrom-Json
    & gcloud monitoring dashboards create "--project=$ProjectId" "--config-from-file=$tempDashboard" '--validate-only' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'A validacao do dashboard falhou. Nenhum painel foi criado.' }
    & gcloud monitoring dashboards create "--project=$ProjectId" "--config-from-file=$tempDashboard" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'A criacao do dashboard falhou.' }
    Write-Host 'Dashboard criado com sucesso.'
} finally {
    Remove-Item $tempDashboard -Force -ErrorAction SilentlyContinue
}
Write-Host 'Proximo passo: exporte 10 logs novos, depois abra o dashboard e selecione Ultima 1 hora.'
Write-Host "Dashboard: https://console.cloud.google.com/monitoring/dashboards?project=$ProjectId"
