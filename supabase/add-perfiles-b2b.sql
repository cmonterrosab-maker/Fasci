-- ============================================================
-- Perfiles de compra B2B por droguería
-- Calculado a partir de ordenes_compra + detalle_ordenes_compra
-- ============================================================

CREATE TABLE IF NOT EXISTS perfiles_compra_b2b (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drogueria_id            UUID NOT NULL REFERENCES droguerias(id) ON DELETE CASCADE,

  -- Producto
  nombre_medicamento      VARCHAR(255) NOT NULL,
  catalogo_id             UUID REFERENCES catalogos(id),
  medicamento_id          UUID REFERENCES medicamentos(id),

  -- Estadísticas calculadas
  veces_ordenado          INTEGER DEFAULT 1,
  cantidad_promedio       DECIMAL(10,2) DEFAULT 0,
  frecuencia_dias         INTEGER,          -- días promedio entre pedidos de este producto
  ultimo_pedido_at        TIMESTAMPTZ,
  proximo_pedido_estimado TIMESTAMPTZ,      -- ultimo_pedido_at + frecuencia_dias

  -- Alerta
  alerta_enviada_at       TIMESTAMPTZ,      -- cuando se envió el último WhatsApp proactivo

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (drogueria_id, nombre_medicamento)
);

CREATE INDEX IF NOT EXISTS idx_perfiles_drogueria ON perfiles_compra_b2b(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_proximo   ON perfiles_compra_b2b(proximo_pedido_estimado);

ALTER TABLE perfiles_compra_b2b ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lee perfiles" ON perfiles_compra_b2b FOR SELECT TO authenticated USING (true);

SELECT '✅ Tabla perfiles_compra_b2b creada' AS resultado;
