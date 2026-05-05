-- ============================================
-- SEED — Catálogo de prueba completo
-- 40 medicamentos comunes en droguerías colombianas
-- Asociados a la "Bodega Cartagena"
-- ============================================
-- Versión: TODO en un solo bloque DO (compatible con Supabase SQL Editor)
-- Funciona SIN depender de UNIQUE constraints

DO $$
DECLARE
  v_drogueria_id UUID;
  v_med_id       UUID;
  v_categoria_id UUID;
  v_total_insertados INTEGER := 0;
  v_total_actualizados INTEGER := 0;

  -- Cada fila es: (nombre, generico, lab, presentacion, concentracion, categoria, formula, cum, precio, mayorista, stock, min_mayorista)
  v_seed CONSTANT TEXT[][] := ARRAY[
    -- Analgésicos
    ARRAY['Acetaminofén 500mg', 'Paracetamol', 'Genfar', 'Tabletas x10', '500mg', 'Analgésicos', 'false', 'CUM-19900001-1', '8500', '6800', '250', '30'],
    ARRAY['Acetaminofén Jarabe', 'Paracetamol', 'MK', 'Frasco 60ml', '160mg/5ml', 'Analgésicos', 'false', 'CUM-19900002-1', '12000', '9600', '80', '12'],
    ARRAY['Dolex Forte', 'Paracetamol + Cafeína', 'GSK', 'Tabletas x12', '500mg+65mg', 'Analgésicos', 'false', 'CUM-19900003-1', '10500', '8400', '100', '12'],
    ARRAY['Tramadol 50mg', 'Tramadol', 'MK', 'Cápsulas x10', '50mg', 'Analgésicos', 'true', 'CUM-19900004-1', '22000', '17600', '50', '12'],
    ARRAY['Aspirina 500mg', 'Ácido acetilsalicílico', 'Bayer', 'Tabletas x10', '500mg', 'Analgésicos', 'false', 'CUM-19900005-1', '7500', '6000', '200', '30'],

    -- Antibióticos
    ARRAY['Amoxicilina 500mg', 'Amoxicilina', 'Genfar', 'Cápsulas x21', '500mg', 'Antibióticos', 'true', 'CUM-19900006-1', '18500', '14800', '80', '12'],
    ARRAY['Amoxicilina Suspensión', 'Amoxicilina', 'MK', 'Frasco 60ml', '250mg/5ml', 'Antibióticos', 'true', 'CUM-19900007-1', '15500', '12400', '60', '12'],
    ARRAY['Azitromicina 500mg', 'Azitromicina', 'Tecnoquímicas', 'Tabletas x3', '500mg', 'Antibióticos', 'true', 'CUM-19900008-1', '28000', '22400', '50', '6'],
    ARRAY['Cefalexina 500mg', 'Cefalexina', 'Lafrancol', 'Cápsulas x21', '500mg', 'Antibióticos', 'true', 'CUM-19900009-1', '24000', '19200', '40', '6'],
    ARRAY['Ciprofloxacino 500mg', 'Ciprofloxacino', 'Genfar', 'Tabletas x10', '500mg', 'Antibióticos', 'true', 'CUM-19900010-1', '19500', '15600', '70', '12'],

    -- Antiinflamatorios
    ARRAY['Ibuprofeno 400mg', 'Ibuprofeno', 'MK', 'Tabletas x10', '400mg', 'Antiinflamatorios', 'false', 'CUM-19900011-1', '12000', '9600', '180', '24'],
    ARRAY['Ibuprofeno 600mg', 'Ibuprofeno', 'Genfar', 'Tabletas x10', '600mg', 'Antiinflamatorios', 'false', 'CUM-19900012-1', '14500', '11600', '120', '24'],
    ARRAY['Diclofenaco 50mg', 'Diclofenaco sódico', 'MK', 'Tabletas x20', '50mg', 'Antiinflamatorios', 'false', 'CUM-19900013-1', '11000', '8800', '150', '24'],
    ARRAY['Naproxeno 500mg', 'Naproxeno', 'Genfar', 'Tabletas x10', '500mg', 'Antiinflamatorios', 'false', 'CUM-19900014-1', '13500', '10800', '90', '24'],
    ARRAY['Meloxicam 15mg', 'Meloxicam', 'Lafrancol', 'Tabletas x10', '15mg', 'Antiinflamatorios', 'true', 'CUM-19900015-1', '16500', '13200', '60', '12'],

    -- Vitaminas
    ARRAY['Vitamina C 500mg', 'Ácido ascórbico', 'Tecnoquímicas', 'Tabletas masticables x30', '500mg', 'Vitaminas', 'false', 'CUM-19900016-1', '18000', '14400', '100', '12'],
    ARRAY['Vitamina C 1g', 'Ácido ascórbico', 'Bayer', 'Tabletas efervescentes x10', '1g', 'Vitaminas', 'false', 'CUM-19900017-1', '16000', '12800', '80', '12'],
    ARRAY['Sulfato Ferroso', 'Hierro', 'Lafrancol', 'Tabletas x30', '300mg', 'Vitaminas', 'false', 'CUM-19900018-1', '12500', '10000', '70', '12'],
    ARRAY['Multivitamínico Adulto', 'Multivitamínico', 'Tecnoquímicas', 'Tabletas x30', 'Estándar', 'Vitaminas', 'false', 'CUM-19900019-1', '32000', '25600', '50', '6'],
    ARRAY['Calcio + Vit D3', 'Carbonato de calcio + colecalciferol', 'MK', 'Tabletas x60', '600mg+400UI', 'Vitaminas', 'false', 'CUM-19900020-1', '28000', '22400', '60', '6'],

    -- Antigripales
    ARRAY['Noxpirin Forte', 'Acetaminofén + clorfeniramina + fenilefrina', 'Tecnoquímicas', 'Cápsulas x12', 'Estándar', 'Antigripales', 'false', 'CUM-19900021-1', '13500', '10800', '100', '12'],
    ARRAY['Dolex Gripa', 'Acetaminofén + clorfeniramina + fenilefrina', 'GSK', 'Cápsulas x12', 'Estándar', 'Antigripales', 'false', 'CUM-19900022-1', '14000', '11200', '90', '12'],
    ARRAY['Amantadina + Clorfeniramina', 'Amantadina + clorfeniramina', 'MK', 'Tabletas x12', 'Estándar', 'Antigripales', 'false', 'CUM-19900023-1', '15500', '12400', '70', '12'],

    -- Antihistamínicos
    ARRAY['Loratadina 10mg', 'Loratadina', 'MK', 'Tabletas x10', '10mg', 'Antihistamínicos', 'false', 'CUM-19900024-1', '9500', '7600', '130', '24'],
    ARRAY['Cetirizina 10mg', 'Cetirizina', 'Tecnoquímicas', 'Tabletas x10', '10mg', 'Antihistamínicos', 'false', 'CUM-19900025-1', '10500', '8400', '110', '24'],
    ARRAY['Loratadina Jarabe', 'Loratadina', 'Genfar', 'Frasco 60ml', '5mg/5ml', 'Antihistamínicos', 'false', 'CUM-19900026-1', '13000', '10400', '60', '12'],

    -- Digestivos
    ARRAY['Omeprazol 20mg', 'Omeprazol', 'Genfar', 'Cápsulas x14', '20mg', 'Digestivos', 'false', 'CUM-19900027-1', '15000', '12000', '110', '12'],
    ARRAY['Ranitidina 150mg', 'Ranitidina', 'MK', 'Tabletas x20', '150mg', 'Digestivos', 'false', 'CUM-19900028-1', '13000', '10400', '80', '12'],
    ARRAY['Loperamida 2mg', 'Loperamida', 'Genfar', 'Tabletas x10', '2mg', 'Digestivos', 'false', 'CUM-19900029-1', '7500', '6000', '130', '24'],
    ARRAY['Buscapina', 'Butilbromuro de hioscina', 'Boehringer', 'Tabletas x20', '10mg', 'Digestivos', 'false', 'CUM-19900030-1', '18500', '14800', '70', '12'],
    ARRAY['Sales de rehidratación', 'Electrolitos', 'MK', 'Sobres x6', 'Estándar', 'Digestivos', 'false', 'CUM-19900031-1', '8500', '6800', '200', '30'],

    -- Respiratorios
    ARRAY['Salbutamol Inhalador', 'Salbutamol', 'Lafrancol', 'Inhalador 200 dosis', '100mcg', 'Respiratorios', 'true', 'CUM-19900032-1', '28000', '22400', '40', '6'],
    ARRAY['Ambroxol Jarabe', 'Ambroxol', 'MK', 'Frasco 120ml', '15mg/5ml', 'Respiratorios', 'false', 'CUM-19900033-1', '14000', '11200', '80', '12'],
    ARRAY['Bromhexol Jarabe', 'Bromhexina', 'Genfar', 'Frasco 120ml', '4mg/5ml', 'Respiratorios', 'false', 'CUM-19900034-1', '12500', '10000', '65', '12'],

    -- Cardiovasculares
    ARRAY['Captopril 25mg', 'Captopril', 'MK', 'Tabletas x30', '25mg', 'Cardiovasculares', 'true', 'CUM-19900035-1', '16000', '12800', '50', '12'],
    ARRAY['Losartán 50mg', 'Losartán potásico', 'Genfar', 'Tabletas x30', '50mg', 'Cardiovasculares', 'true', 'CUM-19900036-1', '22000', '17600', '60', '12'],
    ARRAY['Atorvastatina 20mg', 'Atorvastatina', 'Lafrancol', 'Tabletas x30', '20mg', 'Cardiovasculares', 'true', 'CUM-19900037-1', '28500', '22800', '45', '6'],

    -- Dermatológicos
    ARRAY['Hidrocortisona Crema', 'Hidrocortisona', 'MK', 'Crema 30g', '1%', 'Dermatológicos', 'false', 'CUM-19900038-1', '14500', '11600', '55', '12'],
    ARRAY['Aciclovir Crema', 'Aciclovir', 'Genfar', 'Crema 5g', '5%', 'Dermatológicos', 'false', 'CUM-19900039-1', '15500', '12400', '40', '12'],

    -- Otros
    ARRAY['Metformina 850mg', 'Metformina', 'Genfar', 'Tabletas x30', '850mg', 'Otros', 'true', 'CUM-19900040-1', '18500', '14800', '70', '12']
  ];

  v_row TEXT[];
BEGIN
  -- Validar bodega
  SELECT id INTO v_drogueria_id
  FROM droguerias
  WHERE email = 'cartagena@drogueriavirtual.co'
  LIMIT 1;

  IF v_drogueria_id IS NULL THEN
    RAISE EXCEPTION 'No existe la bodega Cartagena. Ejecuta primero supabase/seed-cartagena.sql';
  END IF;

  -- Iterar por cada medicamento del seed
  FOREACH v_row SLICE 1 IN ARRAY v_seed
  LOOP
    -- Obtener la categoría
    SELECT id INTO v_categoria_id
    FROM categorias_medicamentos
    WHERE nombre = v_row[6]
    LIMIT 1;

    IF v_categoria_id IS NULL THEN
      -- Si no existe la categoría, usar Otros
      SELECT id INTO v_categoria_id FROM categorias_medicamentos WHERE nombre = 'Otros' LIMIT 1;
    END IF;

    -- Buscar si el medicamento ya existe
    SELECT id INTO v_med_id FROM medicamentos WHERE nombre = v_row[1] LIMIT 1;

    IF v_med_id IS NULL THEN
      -- Insertar nuevo medicamento
      INSERT INTO medicamentos (nombre, nombre_generico, laboratorio, presentacion, concentracion, categoria_id, requiere_formula_medica, codigo_cum, activo)
      VALUES (v_row[1], v_row[2], v_row[3], v_row[4], v_row[5], v_categoria_id, v_row[7]::BOOLEAN, v_row[8], true)
      RETURNING id INTO v_med_id;
      v_total_insertados := v_total_insertados + 1;
    ELSE
      -- Actualizar el existente
      UPDATE medicamentos SET
        nombre_generico = v_row[2],
        laboratorio     = v_row[3],
        presentacion    = v_row[4],
        concentracion   = v_row[5],
        categoria_id    = v_categoria_id,
        requiere_formula_medica = v_row[7]::BOOLEAN,
        codigo_cum      = v_row[8],
        activo          = true
      WHERE id = v_med_id;
      v_total_actualizados := v_total_actualizados + 1;
    END IF;

    -- Upsert en catálogo (insertar o actualizar la entrada de la bodega Cartagena)
    IF EXISTS (SELECT 1 FROM catalogos WHERE drogueria_id = v_drogueria_id AND medicamento_id = v_med_id) THEN
      UPDATE catalogos SET
        precio                    = v_row[9]::NUMERIC,
        precio_mayorista          = v_row[10]::NUMERIC,
        stock                     = v_row[11]::INTEGER,
        cantidad_minima_mayorista = v_row[12]::INTEGER,
        disponible                = true
      WHERE drogueria_id = v_drogueria_id AND medicamento_id = v_med_id;
    ELSE
      INSERT INTO catalogos (drogueria_id, medicamento_id, precio, precio_mayorista, stock, cantidad_minima_mayorista, disponible)
      VALUES (v_drogueria_id, v_med_id, v_row[9]::NUMERIC, v_row[10]::NUMERIC, v_row[11]::INTEGER, v_row[12]::INTEGER, true);
    END IF;
  END LOOP;

  RAISE NOTICE 'Seed completado: % medicamentos nuevos, % actualizados', v_total_insertados, v_total_actualizados;
END $$;


-- ══════════════════════════════════════════════════════════════════════════
-- Verificación final
-- ══════════════════════════════════════════════════════════════════════════
SELECT
  '✅ Catálogo cargado en bodega Cartagena' AS resultado,
  COUNT(*)::text || ' medicamentos' AS detalle
FROM catalogos c
JOIN droguerias d ON d.id = c.drogueria_id
WHERE d.email = 'cartagena@drogueriavirtual.co';

SELECT
  cat.nombre AS categoria,
  COUNT(*) AS cantidad,
  ROUND(AVG(c.precio), 0) AS precio_promedio_cop,
  SUM(c.stock) AS stock_total
FROM catalogos c
JOIN medicamentos m   ON m.id = c.medicamento_id
JOIN categorias_medicamentos cat ON cat.id = m.categoria_id
JOIN droguerias d     ON d.id = c.drogueria_id
WHERE d.email = 'cartagena@drogueriavirtual.co'
GROUP BY cat.nombre
ORDER BY cantidad DESC;
