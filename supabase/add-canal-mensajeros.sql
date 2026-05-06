-- ============================================================
-- Separar B2B de B2C:
--   - mensajeros.canal  → a qué flujo pertenece el mensajero
--   - droguerias.tipo   → si es el operador principal o un socio B2B
-- Ejecutar UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================

-- 1. Agregar canal a mensajeros
ALTER TABLE mensajeros
  ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'b2c'
    CHECK (canal IN ('b2b', 'b2c', 'ambos'));

-- 2. Agregar tipo a droguerias
ALTER TABLE droguerias
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'socio'
    CHECK (tipo IN ('operador', 'socio'));

-- 3. Marcar la bodega del distribuidor como operador (ajustar email si es otro)
UPDATE droguerias
  SET tipo = 'operador'
WHERE email = 'cartagena@drogueriavirtual.co';

-- 4. Corregir la política RLS que aún usaba valores en inglés
DROP POLICY IF EXISTS "Lectura pública droguerias activas" ON droguerias;
CREATE POLICY "Lectura pública droguerias activas"
  ON droguerias FOR SELECT
  USING (status = 'activo');

-- Verificación
SELECT id, nombre, tipo, status FROM droguerias ORDER BY tipo, nombre;
SELECT id, nombre, canal, status FROM mensajeros ORDER BY canal, nombre;
