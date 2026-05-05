-- ============================================
-- FIX: Constraints faltantes para los seeds
-- Ejecutar UNA SOLA VEZ antes de seed-catalogo-prueba.sql
-- ============================================

-- 1. UNIQUE en medicamentos.nombre (necesario para ON CONFLICT del seed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'medicamentos_nombre_key'
  ) THEN
    ALTER TABLE medicamentos
      ADD CONSTRAINT medicamentos_nombre_key UNIQUE (nombre);
  END IF;
END $$;

-- 2. Asegurar UNIQUE en catalogos(drogueria_id, medicamento_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalogos_drogueria_id_medicamento_id_key'
       OR conname = 'catalogos_drogueria_medicamento_unique'
  ) THEN
    ALTER TABLE catalogos
      ADD CONSTRAINT catalogos_drogueria_medicamento_unique
      UNIQUE (drogueria_id, medicamento_id);
  END IF;
END $$;

-- 3. UNIQUE en categorias_medicamentos.nombre (por si lo necesitas en el futuro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categorias_medicamentos_nombre_key'
  ) THEN
    ALTER TABLE categorias_medicamentos
      ADD CONSTRAINT categorias_medicamentos_nombre_key UNIQUE (nombre);
  END IF;
END $$;

-- Verificación
SELECT '✅ Constraints corregidos' AS resultado;

SELECT
  conname AS constraint_name,
  conrelid::regclass AS tabla
FROM pg_constraint
WHERE conrelid::regclass::text IN ('medicamentos', 'catalogos', 'categorias_medicamentos')
  AND contype = 'u'
ORDER BY tabla, conname;
