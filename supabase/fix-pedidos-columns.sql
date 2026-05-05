-- ============================================================
-- FIX: Columnas faltantes en tabla pedidos
-- Ejecutar en Supabase SQL Editor — es seguro correr varias veces
-- ============================================================

-- 1. Datos del cliente
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_cedula    VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_lat       DECIMAL(10,7);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_lng       DECIMAL(10,7);

-- 2. Desglose del total
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS costo_domicilio   DECIMAL(10,2) DEFAULT 4000;

-- 3. Comprobante de pago (imagen enviada por WhatsApp)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comprobante_url   TEXT;

-- 4. Términos y condiciones
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tc_aceptado       BOOLEAN DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tc_aceptado_at    TIMESTAMPTZ;

-- 5. Origen del pedido
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS es_b2c            BOOLEAN DEFAULT true;

-- 6. Ampliar CHECK de status para incluir 'pendiente_pago' (Wompi)
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN (
    'pendiente', 'pendiente_pago', 'confirmado',
    'en_preparacion', 'en_camino', 'entregado', 'cancelado'
  ));

-- Verificación
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'pedidos'
ORDER BY ordinal_position;
