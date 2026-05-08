ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS llegada_destino_at TIMESTAMPTZ;
ALTER TABLE pedidos        ADD COLUMN IF NOT EXISTS llegada_destino_at TIMESTAMPTZ;
