-- Metadatos de verificación de comprobantes y fotos de entrega
-- comprobante_meta: prueba del pago enviado por el cliente
-- foto_entrega_meta: prueba de la entrega enviada por el mensajero
--
-- Estructura del JSONB:
-- {
--   "sha256":             "abc123...",     -- hash del archivo (integridad)
--   "file_size_bytes":    143210,          -- tamaño en bytes
--   "content_type":       "image/jpeg",    -- tipo MIME
--   "twilio_message_sid": "MM...",         -- ID único del mensaje Twilio (auditable)
--   "received_at":        "2026-05-05T...",-- timestamp de recepción en el servidor
--   "sender_phone":       "3015077489"     -- teléfono del remitente
-- }

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS comprobante_meta  JSONB,
  ADD COLUMN IF NOT EXISTS foto_entrega_meta JSONB;

-- Índices para búsquedas por MessageSid (auditoría y deduplicación)
CREATE INDEX IF NOT EXISTS idx_pedidos_comprobante_sid
  ON pedidos ((comprobante_meta->>'twilio_message_sid'))
  WHERE comprobante_meta IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_foto_entrega_sid
  ON pedidos ((foto_entrega_meta->>'twilio_message_sid'))
  WHERE foto_entrega_meta IS NOT NULL;
