CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(32) PRIMARY KEY,
    user_id INTEGER NOT NULL CHECK (user_id > 0),
    status VARCHAR(20) NOT NULL
        CHECK (status IN (
            'processing',
            'shipped',
            'cancelled'
        )),
    items JSONB NOT NULL
        CHECK (jsonb_typeof(items) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user
    ON orders (user_id);

INSERT INTO orders (id, user_id, status, items)
VALUES
(
    'PED-1001', 1, 'processing',
    '[{"productId":1,"quantity":2}]'::jsonb
),
(
    'PED-1002', 1, 'shipped',
    '[{"productId":3,"quantity":1}]'::jsonb
),
(
    'PED-2001', 2, 'processing',
    '[{"productId":5,"quantity":1}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
