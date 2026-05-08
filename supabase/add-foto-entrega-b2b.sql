-- Añadir campos de foto de entrega a ordenes_compra (entrega B2B por mensajero)
ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS foto_entrega_url  TEXT,
  ADD COLUMN IF NOT EXISTS foto_entrega_meta JSONB;
