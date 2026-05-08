CREATE TABLE IF NOT EXISTS alertas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             VARCHAR(60) NOT NULL,   -- 'orden_atascada_b2b' | 'orden_atascada_b2c' | 'sin_mensajero' | 'sin_gps'
  severidad        VARCHAR(20) DEFAULT 'warning' CHECK (severidad IN ('info', 'warning', 'critical')),
  referencia_id    UUID,                  -- ID de la orden o mensajero
  referencia_tipo  VARCHAR(30),           -- 'pedido' | 'orden_compra' | 'mensajero'
  numero_ref       VARCHAR(40),           -- numero_orden o numero_pedido (para mostrar)
  mensaje          TEXT NOT NULL,
  resuelta         BOOLEAN DEFAULT false,
  resuelta_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_resuelta   ON alertas(resuelta);
CREATE INDEX IF NOT EXISTS idx_alertas_ref        ON alertas(referencia_id);
CREATE INDEX IF NOT EXISTS idx_alertas_created    ON alertas(created_at DESC);
