-- ============================================================
-- DROGUERÍA VIRTUAL - Schema PostgreSQL (Supabase)
-- Versión: 1.0.0
-- Fecha: 2026-04-30
-- ============================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FUNCIÓN TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLA: categorias_medicamentos
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias_medicamentos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre       VARCHAR(100) NOT NULL,
  descripcion  TEXT,
  requiere_formula BOOLEAN DEFAULT false,
  icono        VARCHAR(50),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: medicamentos (catálogo maestro)
-- ============================================================
CREATE TABLE IF NOT EXISTS medicamentos (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                VARCHAR(255) NOT NULL UNIQUE,
  nombre_generico       VARCHAR(255),
  laboratorio           VARCHAR(255),
  presentacion          VARCHAR(100),   -- Tabletas, Jarabe, Inyectable, etc.
  concentracion         VARCHAR(100),   -- 500mg, 250mg/5ml, etc.
  categoria_id          UUID REFERENCES categorias_medicamentos(id),
  requiere_formula_medica BOOLEAN DEFAULT false,
  codigo_cum            VARCHAR(50),    -- Código Único de Medicamentos Colombia
  descripcion           TEXT,
  imagen_url            TEXT,
  activo                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_medicamentos
  BEFORE UPDATE ON medicamentos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre          ON medicamentos (nombre);
CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre_generico ON medicamentos (nombre_generico);
CREATE INDEX IF NOT EXISTS idx_medicamentos_categoria       ON medicamentos (categoria_id);
CREATE INDEX IF NOT EXISTS idx_medicamentos_activo          ON medicamentos (activo);

-- ============================================================
-- TABLA: droguerias
-- ============================================================
CREATE TABLE IF NOT EXISTS droguerias (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  telefono              VARCHAR(50),
  direccion             TEXT,
  ciudad                VARCHAR(100),
  barrio                VARCHAR(100),
  nit                   VARCHAR(50),
  propietario_nombre    VARCHAR(255),
  propietario_cedula    VARCHAR(50),
  regimen_sanitario     VARCHAR(50),                    -- INVIMA registration
  horario               JSONB,                          -- {lunes: "8:00-20:00", ...}
  whatsapp_numero       VARCHAR(50),
  lat                   DECIMAL(10,8),
  lng                   DECIMAL(11,8),
  status                VARCHAR(50) DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'active', 'inactive', 'suspended')),
  verificacion_notas    TEXT,
  total_pedidos         INTEGER DEFAULT 0,
  calificacion_promedio DECIMAL(3,2) DEFAULT 5.00,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_droguerias
  BEFORE UPDATE ON droguerias
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_droguerias_email   ON droguerias (email);
CREATE INDEX IF NOT EXISTS idx_droguerias_ciudad  ON droguerias (ciudad);
CREATE INDEX IF NOT EXISTS idx_droguerias_status  ON droguerias (status);
CREATE INDEX IF NOT EXISTS idx_droguerias_barrio  ON droguerias (barrio);

-- ============================================================
-- TABLA: catalogos (medicamentos por droguería)
-- ============================================================
CREATE TABLE IF NOT EXISTS catalogos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drogueria_id        UUID NOT NULL REFERENCES droguerias(id) ON DELETE CASCADE,
  medicamento_id      UUID NOT NULL REFERENCES medicamentos(id),
  precio              DECIMAL(10,2) NOT NULL,
  precio_sin_formula  DECIMAL(10,2),
  stock               INTEGER DEFAULT 0,
  disponible          BOOLEAN DEFAULT true,
  notas               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (drogueria_id, medicamento_id)
);

CREATE TRIGGER set_timestamp_catalogos
  BEFORE UPDATE ON catalogos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_catalogos_drogueria    ON catalogos (drogueria_id);
CREATE INDEX IF NOT EXISTS idx_catalogos_medicamento  ON catalogos (medicamento_id);
CREATE INDEX IF NOT EXISTS idx_catalogos_disponible   ON catalogos (disponible);
CREATE INDEX IF NOT EXISTS idx_catalogos_stock        ON catalogos (stock);

-- ============================================================
-- FUNCIÓN: generar numero_pedido secuencial (DV-YYYY-NNNN)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS pedido_seq START 1;

CREATE OR REPLACE FUNCTION generar_numero_pedido()
RETURNS VARCHAR AS $$
DECLARE
  anio  TEXT;
  seq   TEXT;
BEGIN
  anio := TO_CHAR(NOW(), 'YYYY');
  seq  := LPAD(NEXTVAL('pedido_seq')::TEXT, 4, '0');
  RETURN 'DV-' || anio || '-' || seq;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLA: pedidos
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_pedido         VARCHAR(20) UNIQUE NOT NULL DEFAULT generar_numero_pedido(),
  drogueria_id          UUID REFERENCES droguerias(id),
  cliente_telefono      VARCHAR(50) NOT NULL,
  cliente_nombre        VARCHAR(255),
  cliente_direccion     TEXT,
  cliente_barrio        VARCHAR(100),
  modalidad             VARCHAR(20) DEFAULT 'domicilio'
    CHECK (modalidad IN ('domicilio', 'recoger')),
  status                VARCHAR(50) DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado')),
  total                 DECIMAL(10,2),
  metodo_pago           VARCHAR(50),   -- efectivo, nequi, daviplata, transferencia
  notas                 TEXT,
  formula_medica_url    TEXT,
  tiene_formula         BOOLEAN DEFAULT false,
  canal                 VARCHAR(20) DEFAULT 'whatsapp'
    CHECK (canal IN ('whatsapp', 'web', 'telefono')),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  confirmado_at         TIMESTAMPTZ,
  entregado_at          TIMESTAMPTZ
);

CREATE TRIGGER set_timestamp_pedidos
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_pedidos_drogueria       ON pedidos (drogueria_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_tel     ON pedidos (cliente_telefono);
CREATE INDEX IF NOT EXISTS idx_pedidos_status          ON pedidos (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_numero          ON pedidos (numero_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at      ON pedidos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_canal           ON pedidos (canal);

-- ============================================================
-- TABLA: detalle_pedidos
-- ============================================================
CREATE TABLE IF NOT EXISTS detalle_pedidos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id           UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  medicamento_id      UUID REFERENCES medicamentos(id),
  catalogo_id         UUID REFERENCES catalogos(id),
  nombre_medicamento  VARCHAR(255) NOT NULL,   -- snapshot del nombre en el momento del pedido
  cantidad            INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario     DECIMAL(10,2) NOT NULL,
  subtotal            DECIMAL(10,2) NOT NULL,
  requiere_formula    BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detalle_pedido      ON detalle_pedidos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_detalle_medicamento ON detalle_pedidos (medicamento_id);

-- ============================================================
-- TABLA: bot_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_sessions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telefono              VARCHAR(50) NOT NULL,
  estado                VARCHAR(50) DEFAULT 'inicio',
  flujo                 VARCHAR(50),   -- buscar_med, hacer_pedido, ver_pedidos, registro_drogueria
  datos                 JSONB DEFAULT '{}',
  drogueria_contexto_id UUID REFERENCES droguerias(id),
  ultimo_pedido_id      UUID REFERENCES pedidos(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_bot_sessions
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_bot_sessions_telefono   ON bot_sessions (telefono);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_updated_at ON bot_sessions (updated_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE droguerias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicamentos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_pedidos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_medicamentos ENABLE ROW LEVEL SECURITY;

-- Políticas públicas de lectura (anon puede leer catálogo activo)
CREATE POLICY "Lectura pública medicamentos activos"
  ON medicamentos FOR SELECT
  USING (activo = true);

CREATE POLICY "Lectura pública categorías"
  ON categorias_medicamentos FOR SELECT
  USING (true);

CREATE POLICY "Lectura pública catalogos disponibles"
  ON catalogos FOR SELECT
  USING (disponible = true);

CREATE POLICY "Lectura pública droguerias activas"
  ON droguerias FOR SELECT
  USING (status IN ('active', 'approved'));

-- El service_role (backend) tiene acceso completo (bypass RLS por defecto en Supabase)

-- ============================================================
-- SEED: Categorías de medicamentos
-- ============================================================
INSERT INTO categorias_medicamentos (nombre, descripcion, requiere_formula, icono) VALUES
  ('Analgésicos',       'Medicamentos para el dolor',                    false, '💊'),
  ('Antibióticos',      'Tratamiento de infecciones bacterianas',        true,  '🦠'),
  ('Antiinflamatorios', 'Reducción de inflamación y dolor',              false, '🔴'),
  ('Vitaminas',         'Suplementos vitamínicos y minerales',           false, '🌿'),
  ('Antigripales',      'Tratamiento de gripa y resfriado común',        false, '🤧'),
  ('Dermatológicos',    'Medicamentos para la piel',                     false, '🧴'),
  ('Cardiovasculares',  'Medicamentos para el corazón y presión arterial', true,'❤️'),
  ('Digestivos',        'Medicamentos para el sistema digestivo',        false, '🫃'),
  ('Respiratorios',     'Medicamentos para el sistema respiratorio',     false, '🫁'),
  ('Otros',             'Otros medicamentos de uso general',             false, '📦')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: 20 medicamentos comunes en Colombia
-- ============================================================
INSERT INTO medicamentos
  (nombre, nombre_generico, laboratorio, presentacion, concentracion,
   categoria_id, requiere_formula_medica, codigo_cum, descripcion)
SELECT
  m.nombre, m.nombre_generico, m.laboratorio, m.presentacion, m.concentracion,
  c.id, m.requiere_formula, m.codigo_cum, m.descripcion
FROM (VALUES
  ('Acetaminofén 500mg','Acetaminofén','Genfar','Tabletas','500mg',
   'Analgésicos',false,'19968330-3',
   'Analgésico y antipirético de uso común para dolor leve a moderado y fiebre'),
  ('Ibuprofeno 400mg','Ibuprofeno','Tecnoquímicas','Tabletas','400mg',
   'Antiinflamatorios',false,'20027988-1',
   'Antiinflamatorio no esteroideo para dolor, inflamación y fiebre'),
  ('Amoxicilina 500mg','Amoxicilina','Lafrancol','Cápsulas','500mg',
   'Antibióticos',true,'20037521-2',
   'Antibiótico de amplio espectro para infecciones bacterianas'),
  ('Loratadina 10mg','Loratadina','Genfar','Tabletas','10mg',
   'Antigripales',false,'20045678-1',
   'Antihistamínico para alergias, rinitis y urticaria'),
  ('Omeprazol 20mg','Omeprazol','Mk','Cápsulas','20mg',
   'Digestivos',false,'20012345-3',
   'Inhibidor de la bomba de protones para gastritis y úlceras'),
  ('Metformina 850mg','Metformina','Genfar','Tabletas','850mg',
   'Otros',true,'20098765-1',
   'Antidiabético oral para diabetes tipo 2'),
  ('Atorvastatina 20mg','Atorvastatina','Pfizer','Tabletas','20mg',
   'Cardiovasculares',true,'20054321-2',
   'Estatina para reducir el colesterol LDL'),
  ('Losartán 50mg','Losartán','Tecnoquímicas','Tabletas','50mg',
   'Cardiovasculares',true,'20067890-1',
   'Antihipertensivo, antagonista de los receptores de angiotensina II'),
  ('Azitromicina 500mg','Azitromicina','Mk','Tabletas','500mg',
   'Antibióticos',true,'20034567-2',
   'Antibiótico macrólido para infecciones respiratorias y otras'),
  ('Naproxeno 500mg','Naproxeno','Genfar','Tabletas','500mg',
   'Antiinflamatorios',false,'20023456-1',
   'AINE para artritis, dolor muscular y dismenorrea'),
  ('Vitamina C 1g','Ácido ascórbico','Bayer','Tabletas efervescentes','1000mg',
   'Vitaminas',false,'20011111-1',
   'Suplemento vitamínico para reforzar el sistema inmune'),
  ('Complejo B','Vitaminas del complejo B','Lafrancol','Tabletas','Complejo',
   'Vitaminas',false,'20022222-1',
   'Vitaminas B1, B6 y B12 para el sistema nervioso'),
  ('Salbutamol Inhalador','Salbutamol','Glaxo','Inhalador','100mcg/dosis',
   'Respiratorios',true,'20033333-1',
   'Broncodilatador para asma y EPOC, uso de rescate'),
  ('Hidrocortisona Crema 1%','Hidrocortisona','Genfar','Crema','1%',
   'Dermatológicos',false,'20044444-1',
   'Corticosteroide tópico para eczema, dermatitis y picaduras'),
  ('Diclofenaco 75mg Inyectable','Diclofenaco','Mk','Inyectable','75mg/3ml',
   'Antiinflamatorios',true,'20055555-1',
   'AINE inyectable para dolor agudo e inflamación'),
  ('Acetaminofén Pediátrico 150mg/5ml','Acetaminofén','Tecnoquímicas','Jarabe','150mg/5ml',
   'Analgésicos',false,'20066666-1',
   'Analgésico y antipirético pediátrico en suspensión oral'),
  ('Ciprofloxacina 500mg','Ciprofloxacina','Genfar','Tabletas','500mg',
   'Antibióticos',true,'20077777-1',
   'Fluoroquinolona para infecciones urinarias, respiratorias y gastrointestinales'),
  ('Dextrometorfano Jarabe','Dextrometorfano','Mk','Jarabe','15mg/5ml',
   'Antigripales',false,'20088888-1',
   'Antitusivo para tos seca e irritativa'),
  ('Calcio + Vitamina D','Carbonato de calcio + Vitamina D3','Bayer','Tabletas','600mg + 400UI',
   'Vitaminas',false,'20099999-1',
   'Suplemento para huesos y dientes, prevención de osteoporosis'),
  ('Metronidazol 500mg','Metronidazol','Lafrancol','Tabletas','500mg',
   'Antibióticos',true,'20010101-1',
   'Antibiótico y antiparasitario para infecciones anaerobias y protozoarias')
) AS m(nombre, nombre_generico, laboratorio, presentacion, concentracion,
       cat_nombre, requiere_formula, codigo_cum, descripcion)
JOIN categorias_medicamentos c ON c.nombre = m.cat_nombre
ON CONFLICT DO NOTHING;

-- ============================================
-- MENSAJEROS TABLE (Pool de mensajeros)
-- ============================================
CREATE TABLE IF NOT EXISTS mensajeros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(50) UNIQUE NOT NULL,
  cedula VARCHAR(50),
  ciudad VARCHAR(100),
  zona VARCHAR(100), -- barrio/zona de cobertura
  vehiculo VARCHAR(50) DEFAULT 'moto', -- 'moto', 'bicicleta', 'pie'
  placa VARCHAR(20),

  -- Status
  status VARCHAR(50) DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo', 'suspendido')),
  disponible BOOLEAN DEFAULT true, -- si está disponible para recibir pedidos ahora

  -- Stats
  pedidos_completados INTEGER DEFAULT 0,
  calificacion_promedio DECIMAL(3,2) DEFAULT 5.00,

  -- Pedido actual
  pedido_actual_id UUID, -- FK referenciada después

  -- Timestamps
  ultimo_pedido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajeros_disponible ON mensajeros(disponible) WHERE status = 'activo';
CREATE INDEX IF NOT EXISTS idx_mensajeros_telefono ON mensajeros(telefono);

-- Agregar FK en pedidos a mensajero
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mensajero_id UUID REFERENCES mensajeros(id);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_lat DECIMAL(10,8);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_lng DECIMAL(11,8);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_cedula VARCHAR(50);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comprobante_pago_url TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tc_aceptado BOOLEAN DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tc_aceptado_at TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS costo_domicilio DECIMAL(10,2) DEFAULT 4000;

-- FK bidireccional después de crear ambas tablas
ALTER TABLE mensajeros ADD CONSTRAINT fk_mensajero_pedido_actual
  FOREIGN KEY (pedido_actual_id) REFERENCES pedidos(id) ON DELETE SET NULL;

-- Trigger updated_at para mensajeros
DROP TRIGGER IF EXISTS update_mensajeros_updated_at ON mensajeros;
CREATE TRIGGER update_mensajeros_updated_at
  BEFORE UPDATE ON mensajeros
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- RLS mensajeros
ALTER TABLE mensajeros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mensajeros visibles por autenticados"
  ON mensajeros FOR SELECT TO authenticated USING (true);

-- Datos de ejemplo: 3 mensajeros
INSERT INTO mensajeros (nombre, telefono, cedula, ciudad, zona, vehiculo, placa) VALUES
  ('Carlos Gómez', '3209876543', '1012345678', 'Bogotá', 'Kennedy - Bosa', 'moto', 'ABC123'),
  ('Andrés Martínez', '3159876543', '1023456789', 'Bogotá', 'Suba - Engativá', 'moto', 'XYZ789'),
  ('María Rodríguez', '3009876543', '1034567890', 'Bogotá', 'Chapinero - Usaquén', 'bicicleta', NULL)
ON CONFLICT (telefono) DO NOTHING;

-- ============================================
-- B2B: Columnas mayoristas en catalogos
-- ============================================
ALTER TABLE catalogos ADD COLUMN IF NOT EXISTS precio_mayorista DECIMAL(10,2);
ALTER TABLE catalogos ADD COLUMN IF NOT EXISTS cantidad_minima_mayorista INTEGER DEFAULT 10;
-- Actualizar precios mayoristas iniciales (80% del precio retail)
UPDATE catalogos SET precio_mayorista = ROUND(precio * 0.80, 0) WHERE precio_mayorista IS NULL;

-- ============================================
-- ORDENES_COMPRA (Pedidos B2B entre droguerías)
-- ============================================
CREATE SEQUENCE IF NOT EXISTS orden_compra_seq START 1;

CREATE OR REPLACE FUNCTION generar_numero_orden()
RETURNS TEXT AS $$
BEGIN
  RETURN 'DV-OC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('orden_compra_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ordenes_compra (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_orden            VARCHAR(25) UNIQUE NOT NULL DEFAULT generar_numero_orden(),

  -- Droguería compradora (cliente B2B)
  drogueria_compradora_id UUID REFERENCES droguerias(id),
  compradora_nombre       VARCHAR(255),  -- snapshot del nombre
  compradora_telefono     VARCHAR(50) NOT NULL,
  compradora_direccion    TEXT,
  compradora_lat          DECIMAL(10,8),
  compradora_lng          DECIMAL(11,8),
  compradora_nit          VARCHAR(50),

  -- Estado de la orden
  status VARCHAR(50) DEFAULT 'cotizacion' CHECK (status IN (
    'cotizacion',      -- cotización generada, pendiente confirmar
    'confirmada',      -- droguería confirmó la compra
    'pago_pendiente',  -- esperando comprobante
    'pagada',          -- comprobante recibido
    'en_preparacion',  -- preparando despacho
    'enviada',         -- mensajero en camino
    'entregada',       -- entregada y confirmada
    'cancelada'
  )),

  -- Totales
  subtotal            DECIMAL(12,2) DEFAULT 0,
  descuento           DECIMAL(12,2) DEFAULT 0,
  total               DECIMAL(12,2) DEFAULT 0,

  -- Pago
  metodo_pago         VARCHAR(50) DEFAULT 'nequi_daviplata',
  comprobante_url     TEXT,
  tc_aceptado         BOOLEAN DEFAULT false,
  tc_aceptado_at      TIMESTAMPTZ,

  -- Logística
  mensajero_id        UUID REFERENCES mensajeros(id),

  -- Canal y notas
  canal               VARCHAR(20) DEFAULT 'whatsapp',
  notas               TEXT,

  -- Timestamps de flujo
  confirmada_at       TIMESTAMPTZ,
  pagada_at           TIMESTAMPTZ,
  enviada_at          TIMESTAMPTZ,
  entregada_at        TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_ordenes_compra
  BEFORE UPDATE ON ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_oc_compradora    ON ordenes_compra(drogueria_compradora_id);
CREATE INDEX IF NOT EXISTS idx_oc_telefono      ON ordenes_compra(compradora_telefono);
CREATE INDEX IF NOT EXISTS idx_oc_status        ON ordenes_compra(status);
CREATE INDEX IF NOT EXISTS idx_oc_numero        ON ordenes_compra(numero_orden);

-- ============================================
-- DETALLE_ORDENES_COMPRA
-- ============================================
CREATE TABLE IF NOT EXISTS detalle_ordenes_compra (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_id            UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  medicamento_id      UUID REFERENCES medicamentos(id),
  catalogo_id         UUID REFERENCES catalogos(id),
  nombre_medicamento  VARCHAR(255) NOT NULL,  -- snapshot
  presentacion        VARCHAR(100),
  laboratorio         VARCHAR(100),
  cantidad            INTEGER NOT NULL,
  precio_mayorista    DECIMAL(10,2) NOT NULL,  -- precio al que se vendió
  subtotal            DECIMAL(12,2) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_orden ON detalle_ordenes_compra(orden_id);

-- RLS
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_ordenes_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ordenes compra visibles por autenticados"
  ON ordenes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Detalle ordenes visible por autenticados"
  ON detalle_ordenes_compra FOR SELECT TO authenticated USING (true);

-- ============================================
-- SEGUIMIENTO EN TIEMPO REAL
-- Columnas de ubicación del mensajero (se actualizan
-- cada vez que el mensajero comparte su GPS por WhatsApp)
-- ============================================
ALTER TABLE mensajeros
  ADD COLUMN IF NOT EXISTS ultima_lat            DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS ultima_lng            DECIMAL(11,8),
  ADD COLUMN IF NOT EXISTS ultima_ubicacion_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mensajeros_ubicacion
  ON mensajeros(ultima_ubicacion_at DESC)
  WHERE ultima_lat IS NOT NULL;

-- Snapshot de ubicación del mensajero en pedidos y órdenes
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS mensajero_ultima_lat  DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS mensajero_ultima_lng  DECIMAL(11,8);

ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS mensajero_ultima_lat  DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS mensajero_ultima_lng  DECIMAL(11,8);

-- ============================================
-- SISTEMA DE FEE B2C
-- La plataforma cobra un % por cada pedido B2C
-- que despacha el distribuidor socio.
-- ============================================

-- Configuración dinámica del fee (permite cambiarlo sin tocar código)
CREATE TABLE IF NOT EXISTS configuracion_fee (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canal        VARCHAR(20) NOT NULL DEFAULT 'b2c'
                 CHECK (canal IN ('b2c', 'b2b')),
  porcentaje   DECIMAL(5,2) NOT NULL,   -- ej: 12.00 = 12%
  descripcion  TEXT,
  activo       BOOLEAN DEFAULT true,
  vigente_desde DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Fee activo inicial: 12% para B2C
INSERT INTO configuracion_fee (canal, porcentaje, descripcion)
VALUES ('b2c', 12.00, 'Fee estándar plataforma Droguería Virtual — Cartagena estrato 4-6')
ON CONFLICT DO NOTHING;

-- Columnas de fee en cada pedido B2C
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS es_b2c          BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fee_porcentaje  DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS fee_monto       DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS neto_distribuidor DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS fee_estado      VARCHAR(20) DEFAULT 'pendiente'
    CHECK (fee_estado IN ('pendiente', 'liquidado', 'disputado'));

-- Liquidaciones periódicas (cortes entre socios)
CREATE TABLE IF NOT EXISTS liquidaciones (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periodo_inicio      DATE NOT NULL,
  periodo_fin         DATE NOT NULL,

  -- Totales del período
  total_pedidos       INTEGER DEFAULT 0,
  valor_bruto         DECIMAL(12,2) DEFAULT 0,  -- suma de todos los pedidos
  total_fee           DECIMAL(12,2) DEFAULT 0,  -- lo que gana la plataforma
  total_neto          DECIMAL(12,2) DEFAULT 0,  -- lo que recibe el distribuidor

  -- Estado del corte
  status              VARCHAR(20) DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'revisado', 'pagado')),
  notas               TEXT,
  pagado_at           TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_liquidaciones
  BEFORE UPDATE ON liquidaciones
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Relación pedidos ↔ liquidación
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS liquidacion_id UUID REFERENCES liquidaciones(id);

CREATE INDEX IF NOT EXISTS idx_pedidos_fee_estado
  ON pedidos(fee_estado) WHERE es_b2c = true;
CREATE INDEX IF NOT EXISTS idx_pedidos_liquidacion
  ON pedidos(liquidacion_id);

-- ============================================
-- WOMPI: Pasarela de pago
-- Reemplaza el flujo manual de Nequi/Daviplata + screenshot.
-- ============================================
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS wompi_referencia      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS wompi_link_id         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS wompi_link_url        TEXT,
  ADD COLUMN IF NOT EXISTS wompi_transaction_id  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS wompi_status          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS wompi_evento_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pagado_at             TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pedidos_wompi_ref
  ON pedidos(wompi_referencia) WHERE wompi_referencia IS NOT NULL;

-- Permitir nuevo status 'pendiente_pago' en pedidos
ALTER TABLE pedidos
  DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_status_check
  CHECK (status IN (
    'pendiente', 'pendiente_pago', 'confirmado', 'en_preparacion',
    'en_camino', 'entregado', 'cancelado'
  ));

-- ============================================
-- CALIFICACIONES (rating de mensajeros)
-- ============================================
CREATE TABLE IF NOT EXISTS calificaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id       UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  mensajero_id    UUID REFERENCES mensajeros(id),
  cliente_telefono VARCHAR(50) NOT NULL,
  estrellas       INTEGER NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario      TEXT,
  pedido_solicitado_at TIMESTAMPTZ,    -- cuando el bot pidió la calificación
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pedido_id)                    -- una calificación por pedido
);

CREATE INDEX IF NOT EXISTS idx_calificaciones_mensajero ON calificaciones(mensajero_id);
CREATE INDEX IF NOT EXISTS idx_calificaciones_estrellas ON calificaciones(estrellas);

-- Trigger: actualizar promedio del mensajero cuando llega una calificación
CREATE OR REPLACE FUNCTION actualizar_promedio_mensajero()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE mensajeros m
  SET calificacion_promedio = (
    SELECT ROUND(AVG(estrellas)::numeric, 2)
    FROM calificaciones
    WHERE mensajero_id = m.id
  )
  WHERE m.id = NEW.mensajero_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calificacion_actualiza_promedio ON calificaciones;
CREATE TRIGGER calificacion_actualiza_promedio
  AFTER INSERT ON calificaciones
  FOR EACH ROW EXECUTE FUNCTION actualizar_promedio_mensajero();

-- Marca en pedidos si ya se pidió calificación
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS calificacion_solicitada_at TIMESTAMPTZ;

-- ============================================
-- LEALTAD: PUNTOS Y REFERIDOS
-- ============================================

-- Saldo de puntos por cliente (1 punto = $1.000 COP)
CREATE TABLE IF NOT EXISTS clientes_lealtad (
  telefono       VARCHAR(50) PRIMARY KEY,
  nombre         VARCHAR(255),
  puntos_actuales INTEGER DEFAULT 0,
  puntos_totales_ganados INTEGER DEFAULT 0,
  pedidos_completados   INTEGER DEFAULT 0,
  codigo_referido VARCHAR(20) UNIQUE,
  referido_por    VARCHAR(50),  -- teléfono del referidor
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico de movimientos de puntos
CREATE TABLE IF NOT EXISTS movimientos_puntos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telefono    VARCHAR(50) NOT NULL,
  tipo        VARCHAR(30) NOT NULL CHECK (tipo IN (
    'gana_compra', 'gana_referido', 'canje', 'expiracion', 'ajuste_admin'
  )),
  puntos      INTEGER NOT NULL,        -- positivo o negativo
  pedido_id   UUID REFERENCES pedidos(id),
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_telefono ON movimientos_puntos(telefono);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo     ON movimientos_puntos(tipo);

-- Cupones aplicables a pedidos
CREATE TABLE IF NOT EXISTS cupones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo       VARCHAR(20) UNIQUE NOT NULL,
  tipo         VARCHAR(20) CHECK (tipo IN ('porcentaje', 'monto_fijo', 'envio_gratis')),
  valor        DECIMAL(10,2),           -- 10 = 10% si tipo=porcentaje, 5000 si monto_fijo
  uso_maximo   INTEGER DEFAULT 1,       -- cuántas veces puede usarse globalmente
  usos_actuales INTEGER DEFAULT 0,
  vigente_hasta DATE,
  para_telefono VARCHAR(50),            -- si es exclusivo de un cliente (NULL = todos)
  activo       BOOLEAN DEFAULT true,
  descripcion  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cupones_codigo ON cupones(codigo) WHERE activo = true;

-- Marca en pedidos para guardar cupón aplicado
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cupon_aplicado VARCHAR(20),
  ADD COLUMN IF NOT EXISTS descuento_cupon DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS puntos_canjeados INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_puntos DECIMAL(10,2) DEFAULT 0;

-- Función para generar código de referido único
CREATE OR REPLACE FUNCTION generar_codigo_referido()
RETURNS TEXT AS $$
DECLARE
  caracteres TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  codigo     TEXT := '';
  i          INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    codigo := codigo || substring(caracteres FROM (floor(random() * length(caracteres))::int + 1) FOR 1);
  END LOOP;
  RETURN 'DV-' || codigo;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ADMINS — Acceso al panel administrativo
-- Vinculados a auth.users de Supabase
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       VARCHAR(255) UNIQUE NOT NULL,
  nombre      VARCHAR(255) NOT NULL,
  rol         VARCHAR(20) NOT NULL DEFAULT 'admin'
              CHECK (rol IN ('super_admin', 'admin', 'soporte', 'operativo')),
  activo      BOOLEAN DEFAULT true,
  ultimo_login TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_admins
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);

-- RLS para que solo admins puedan leer admins
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven admins"
  ON admins FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid())
  );

CREATE POLICY "Super admins gestionan admins"
  ON admins FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid() AND a.rol = 'super_admin')
  );
