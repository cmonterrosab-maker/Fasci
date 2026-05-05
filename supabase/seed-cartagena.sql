-- ============================================
-- SEED INICIAL — Cartagena, Colombia
-- ============================================
-- Datos para arrancar el piloto en Cartagena estrato 4-6.
-- ANTES de ejecutar:
--   1. Reemplaza los teléfonos PLACEHOLDER por los reales.
--   2. Ajusta las coordenadas GPS de la bodega del distribuidor.
--   3. Pon el porcentaje de fee acordado entre socios.
-- ============================================

-- ── 1. BODEGA / PUNTO DE OPERACIÓN DEL DISTRIBUIDOR ────────────────────────
-- Se registra como una "droguería" en el sistema para que los pedidos B2C
-- queden asociados a un punto de despacho con ubicación GPS.

INSERT INTO droguerias (
  nombre, email, telefono, direccion, ciudad, barrio,
  nit, propietario_nombre, regimen_sanitario,
  whatsapp_numero, lat, lng, status, horario
) VALUES (
  'Droguería Virtual — Bodega Cartagena',
  'cartagena@drogueriavirtual.co',
  '3001234567',                   -- ⚠️ REEMPLAZAR con teléfono real
  'Av. Pedro de Heredia, Bodega XX',  -- ⚠️ REEMPLAZAR con dirección real
  'Cartagena',
  'Pie de la Popa',
  '900XXXXXXX-1',                 -- ⚠️ REEMPLAZAR con NIT real del distribuidor
  'Distribuidor Asociado',
  'INVIMA-XXXXX',                 -- ⚠️ REEMPLAZAR con registro INVIMA real
  '3001234567',                   -- ⚠️ Mismo teléfono de WhatsApp Business
  10.4236,                        -- Lat: Pie de la Popa, Cartagena (ajustar)
  -75.5378,                       -- Lng: Pie de la Popa, Cartagena (ajustar)
  'active',
  '{"lunes":"7:00-21:00","martes":"7:00-21:00","miercoles":"7:00-21:00","jueves":"7:00-21:00","viernes":"7:00-21:00","sabado":"8:00-20:00","domingo":"9:00-18:00"}'::jsonb
)
ON CONFLICT (email) DO UPDATE SET
  ciudad = EXCLUDED.ciudad,
  status = EXCLUDED.status;


-- ── 2. MENSAJEROS BASE EN CARTAGENA ────────────────────────────────────────
-- Mínimo 3 mensajeros activos para poder operar.
-- Sus teléfonos DEBEN ser WhatsApp activos (reciben asignaciones por ahí).

INSERT INTO mensajeros (
  nombre, telefono, cedula, ciudad, zona, vehiculo, placa, status, disponible
) VALUES
  ('Domiciliario 1 — Bocagrande', '3201234567', '10XXXXXXX1', 'Cartagena',
   'Bocagrande - El Laguito - Castillogrande', 'moto', 'XXX001', 'activo', true),

  ('Domiciliario 2 — Manga',      '3209876543', '10XXXXXXX2', 'Cartagena',
   'Manga - Pie de la Popa - Centro Histórico', 'moto', 'XXX002', 'activo', true),

  ('Domiciliario 3 — Crespo',     '3157654321', '10XXXXXXX3', 'Cartagena',
   'Crespo - Marbella - La Boquilla', 'moto', 'XXX003', 'activo', true)

ON CONFLICT (telefono) DO UPDATE SET
  status     = 'activo',
  disponible = true,
  zona       = EXCLUDED.zona;


-- ── 3. PRECIOS MAYORISTAS (B2B) — opcional ────────────────────────────────
-- Si la bodega también vende al canal B2B, completa el precio_mayorista
-- (por defecto ya se inicializó al 80% del precio retail en el schema).
-- Aquí solo ajustamos cantidad mínima por mayorista.

UPDATE catalogos
SET cantidad_minima_mayorista = 24    -- 24 unidades mínimo para B2B
WHERE drogueria_id = (
  SELECT id FROM droguerias
  WHERE email = 'cartagena@drogueriavirtual.co'
  LIMIT 1
);


-- ── 4. CONFIGURACIÓN DE FEE B2C ────────────────────────────────────────────
-- 12% es el porcentaje sugerido para el modelo de Cartagena.
-- Si pactaste otro con el distribuidor, cámbialo aquí.

UPDATE configuracion_fee
SET porcentaje  = 12.00,
    descripcion = 'Fee plataforma — modelo Cartagena estrato 4-6, modo socio operador'
WHERE canal = 'b2c' AND activo = true;


-- ── 5. VERIFICACIÓN ────────────────────────────────────────────────────────
-- Después de ejecutar este seed, valida con estas consultas:

-- SELECT nombre, ciudad, lat, lng, status FROM droguerias;
-- SELECT nombre, telefono, ciudad, disponible FROM mensajeros;
-- SELECT canal, porcentaje, descripcion FROM configuracion_fee WHERE activo;
-- SELECT COUNT(*) AS total_medicamentos FROM medicamentos WHERE activo = true;
