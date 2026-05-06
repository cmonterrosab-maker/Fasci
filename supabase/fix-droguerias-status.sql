-- ============================================================
-- FIX: Migrar constraint droguerias_status_check a valores en español
-- El backend y frontend usan valores en español; el schema original
-- tenía valores en inglés. Ejecutar UNA SOLA VEZ.
-- ORDEN IMPORTANTE: primero eliminar constraint, luego actualizar datos,
-- luego crear nuevo constraint (hacer al revés viola el constraint viejo).
-- ============================================================

-- 1. Eliminar el constraint viejo PRIMERO (antes de tocar los datos)
ALTER TABLE droguerias DROP CONSTRAINT IF EXISTS droguerias_status_check;

-- 2. Traducir valores existentes con valores en inglés → español
UPDATE droguerias SET status = 'activo'     WHERE status = 'active';
UPDATE droguerias SET status = 'pendiente'  WHERE status = 'pending';
UPDATE droguerias SET status = 'suspendido' WHERE status = 'suspended';
UPDATE droguerias SET status = 'inactivo'   WHERE status = 'inactive';
UPDATE droguerias SET status = 'pendiente'  WHERE status = 'approved';

-- 3. Crear el nuevo constraint con valores en español
ALTER TABLE droguerias
  ADD CONSTRAINT droguerias_status_check
  CHECK (status IN ('pendiente', 'activo', 'inactivo', 'suspendido', 'rechazado'));

-- 4. Ajustar el DEFAULT para que coincida
ALTER TABLE droguerias ALTER COLUMN status SET DEFAULT 'pendiente';

-- Verificación
SELECT '✅ Constraint droguerias_status_check actualizado a español' AS resultado;
SELECT id, nombre, status FROM droguerias ORDER BY created_at;

-- ============================================================
-- FIX 2: Asegurar tipo y whatsapp_numero en filas existentes
-- ============================================================

-- Setear tipo = 'socio' donde sea NULL y no es el operador
UPDATE droguerias
SET tipo = 'socio'
WHERE tipo IS NULL
  AND email != 'cartagena@drogueriavirtual.co';

-- Copiar telefono → whatsapp_numero donde esté vacío o NULL
UPDATE droguerias
SET whatsapp_numero = REGEXP_REPLACE(telefono, '\D', '', 'g')
WHERE (whatsapp_numero IS NULL OR whatsapp_numero = '')
  AND telefono IS NOT NULL;

-- Verificar resultado final
SELECT id, nombre, telefono, whatsapp_numero, tipo, status
FROM droguerias
ORDER BY created_at;
