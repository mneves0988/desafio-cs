param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{4,61}[a-z0-9]$')]
    [string]$ProjectId,

    [ValidateRange(1, 120)]
    [int]$Minutes = 10,

    [ValidateRange(1, 30)]
    [int]$MaxEntries = 10
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw 'Google Cloud CLI (gcloud) não encontrado.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker não encontrado.'
}

# Envia somente resumo allowlisted, jamais a linha original do container.
$allowedEvents = @(
    'order.lookup', 'order.cancel', 'order_api.lookup',
    'fake_store.request', 'fake_store.validation_failed',
    'llm.tool_selection', 'llm.request_failed', 'handoff.requested'
)
$allowedOutcomes = @('ok', 'not_found', 'unavailable', 'invalid_id', 'invalid_response')
$sent = 0
$lines = docker compose logs --no-log-prefix --tail=250 --since "$($Minutes)m" order-api agent-service
if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler logs do Docker.' }

foreach ($line in $lines) {
    if ($sent -ge $MaxEntries) { break }
    try { $entry = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }
    if ($allowedEvents -notcontains [string]$entry.event) { continue }

    $severity = switch ([string]$entry.severity) {
        'ERROR' { 'ERROR' }
        'WARNING' { 'WARNING' }
        default {
            if ([string]$entry.level -eq 'error') { 'ERROR' }
            elseif ([string]$entry.level -eq 'warn') { 'WARNING' }
            else { 'INFO' }
        }
    }
    $safe = [ordered]@{
        severity = $severity
        event = [string]$entry.event
        service = if ($entry.event -match '^order\.') { 'order-api' } else { 'agent-service' }
        source = 'docker-local-snapshot'
    }
    foreach ($key in @('status', 'httpStatus', 'durationMs', 'promptTokens', 'completionTokens', 'toolCallCount')) {
        if ($entry.PSObject.Properties.Name -contains $key) {
            $value = 0L
            if ([long]::TryParse([string]$entry.$key, [ref]$value) -and $value -ge 0 -and $value -lt 10000000) {
                $safe[$key] = $value
            }
        }
    }
    if ($allowedOutcomes -contains [string]$entry.outcome) {
        $safe['outcome'] = [string]$entry.outcome
    }
    if (@('product', 'user') -contains [string]$entry.resource) {
        $safe['resource'] = [string]$entry.resource
    }
    if (@('http', 'telegram') -contains [string]$entry.channel) {
        $safe['channel'] = [string]$entry.channel
    }
    $payload = $safe | ConvertTo-Json -Compress -Depth 4
    & gcloud logging write contato-seguro-ai-demo $payload --payload-type=json --severity=$severity --project=$ProjectId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar entrada ao Cloud Logging." }
    $sent++
}
Write-Host "Entradas sanitizadas enviadas ao Cloud Logging: $sent"
