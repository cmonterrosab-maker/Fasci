-- Agrega columna para foto comprobante de entrega del mensajero
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS foto_entrega_url TEXT;
