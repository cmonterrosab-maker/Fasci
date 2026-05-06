-- Metadatos de verificación de comprobantes y fotos de entrega
--
-- comprobante_meta (enviado por el cliente al pagar):
-- {
--   "sha256":             "abc...",        -- hash SHA-256 del archivo
--   "file_size_bytes":    143210,
--   "content_type":       "image/jpeg",
--   "twilio_message_sid": "MM...",         -- auditable en consola Twilio
--   "received_at":        "2026-05-05T...",
--   "sender_phone":       "3015077489"
-- }
--
-- foto_entrega_meta (foto que envía el mensajero al entregar):
-- {
--   "sha256":                "abc...",
--   "file_size_bytes":       87300,
--   "content_type":          "image/jpeg",
--   "twilio_message_sid":    "MM...",
--   "received_at":           "2026-05-05T...",
--   "sender_phone":          "3005292953",
--   -- identidad del mensajero (audit trail completo)
--   "mensajero_id":          "uuid",
--   "mensajero_nombre":      "Pedro Pérez",
--   "mensajero_ciudad":      "Cartagena",
--   -- GPS del mensajero en el momento de la entrega
--   "mensajero_ultima_lat":  10.3997,
--   "mensajero_ultima_lng":  -75.5144,
--   "mensajero_gps_at":      "2026-05-05T...",
--   -- contexto de la entrega
--   "confirmado_at":         "2026-05-05T...",
--   "pedido_numero":         "DV-2026-0002"
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

-- Índice para búsquedas por mensajero en fotos de entrega
CREATE INDEX IF NOT EXISTS idx_pedidos_foto_entrega_mensajero
  ON pedidos ((foto_entrega_meta->>'mensajero_id'))
  WHERE foto_entrega_meta IS NOT NULL;
