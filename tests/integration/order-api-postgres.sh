#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

set -a
source .env
set +a

export PORT=3107
export NODE_ENV=development

BASE="http://127.0.0.1:${PORT}"
TMP="$(mktemp -d)"
API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

start_api() {
  node apps/order-api/dist/server.js \
    > "$TMP/server.log" 2>&1 &
  API_PID=$!

  for i in {1..30}; do
    if curl -fsS "$BASE/health" >/dev/null 2>&1; then
      return
    fi
    sleep 0.3
  done

  cat "$TMP/server.log"
  exit 1
}

stop_api() {
  kill "$API_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
  API_PID=""
}

if curl -fsS --max-time 1 "$BASE/health" \
    >/dev/null 2>&1; then
  echo "Porta $PORT ja utilizada. Teste interrompido."
  exit 1
fi

echo "=== PREPARAR PEDIDOS DE TESTE ==="

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO orders (id, user_id, status, items)
VALUES
('PED-9101', 1, 'processing',
 '[{"productId":1,"quantity":1}]'::jsonb),
('PED-9102', 1, 'processing',
 '[{"productId":3,"quantity":1}]'::jsonb)
ON CONFLICT (id) DO UPDATE
SET status = 'processing',
    user_id = EXCLUDED.user_id,
    items = EXCLUDED.items;
SQL

echo "=== TESTE 1: CANCELAMENTO ==="

start_api

CODE=$(curl -sS -o "$TMP/cancel.json" \
  -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $DEMO_ACCESS_TOKEN" \
  "$BASE/orders/PED-9101/cancel")

[[ "$CODE" == "200" ]]

echo "Cancelamento: HTTP $CODE"

echo "=== TESTE 2: PERSISTENCIA APOS REINICIO ==="

stop_api
start_api

curl -fsS \
  -H "Authorization: Bearer $DEMO_ACCESS_TOKEN" \
  "$BASE/orders/PED-9101" \
  > "$TMP/order.json"

python3 - "$TMP/order.json" <<'PY'
import json
import sys

with open(sys.argv[1]) as f:
    order = json.load(f)

assert order["status"] == "cancelled"
print("Persistencia apos reinicio: OK")
PY

echo "=== TESTE 3: CONCORRENCIA ==="

pids=()

for i in 1 2; do
  (
    curl -sS \
      -o "$TMP/response-$i.json" \
      -w "%{http_code}" \
      -X POST \
      -H "Authorization: Bearer $DEMO_ACCESS_TOKEN" \
      "$BASE/orders/PED-9102/cancel" \
      > "$TMP/status-$i"
  ) &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

A=$(cat "$TMP/status-1")
B=$(cat "$TMP/status-2")

echo "Requisicao 1: HTTP $A"
echo "Requisicao 2: HTTP $B"

if [[ "$A:$B" != "200:409" &&
      "$A:$B" != "409:200" ]]; then
  echo "FALHA: concorrencia inesperada"
  exit 1
fi

echo "Concorrencia: OK"

echo "=== TESTE 4: SWAGGER UI ==="

curl -fsSL "$BASE/api-docs/" \
  > "$TMP/swagger.html"

grep -qi "swagger" "$TMP/swagger.html"

echo "Swagger UI: OK"

echo "=== RESULTADO FINAL ==="

psql "$DATABASE_URL" -c \
  "SELECT id, status FROM orders
   WHERE id IN ('PED-9101', 'PED-9102')
   ORDER BY id;"

echo "TODOS OS TESTES DE INTEGRACAO PASSARAM"
