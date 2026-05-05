# Setup completo de Supabase (3 pasos)

## Paso 1 — Ejecutar el schema en Supabase SQL Editor

En el dashboard de Supabase → **SQL Editor** → **New query**:

### 1.1 Ejecutar `supabase/schema.sql` completo
Pega TODO el contenido de `supabase/schema.sql` y dale **Run**.

Crea las **17 tablas** del sistema:
- `categorias_medicamentos`, `medicamentos`, `droguerias`, `catalogos`
- `pedidos`, `detalle_pedidos`, `bot_sessions`
- `mensajeros`, `ordenes_compra`, `detalle_ordenes_compra`
- `configuracion_fee`, `liquidaciones`
- `calificaciones`, `clientes_lealtad`, `movimientos_puntos`, `cupones`
- **`admins`** (acceso al panel)

### 1.2 Ejecutar `supabase/seed-cartagena.sql`
Crea la bodega del distribuidor + 3 mensajeros base.

### 1.3 Ejecutar `supabase/seed-catalogo-prueba.sql`
Carga **40 medicamentos reales** colombianos en la bodega Cartagena, con precios B2C y B2B.

Al final verás:
```
✅ Catálogo de prueba cargado | 40 medicamentos
```

---

## Paso 2 — Crear el usuario admin

Desde la terminal, en la raíz del proyecto:

```bash
node scripts/setup-admin.js
```

Esto crea el usuario admin `soporte@promidamos.org` con:
- Rol `super_admin`
- Password aleatorio de 16 caracteres

**⚠️ La contraseña se muestra UNA SOLA VEZ.** Guárdala inmediatamente en tu gestor de contraseñas.

Salida esperada:
```
═══════════════════════════════════════
🎉 ADMIN LISTO PARA USAR
═══════════════════════════════════════
Email:    soporte@promidamos.org
Password: aB3xY2fGh8KmP4Lq
URL:      http://localhost:5173/admin/login
═══════════════════════════════════════
```

### Crear admins adicionales

Si quieres crear otros admins:
```bash
node scripts/setup-admin.js juan@empresa.com "Juan Pérez" admin
node scripts/setup-admin.js operador@empresa.com "Operador Cartagena" operativo
```

Roles disponibles: `super_admin`, `admin`, `soporte`, `operativo`.

---

## Paso 3 — Probar el login

1. Asegura que el frontend esté corriendo: `npm run dev`
2. Ve a `http://localhost:5173/admin/login`
3. Ingresa:
   - **Email:** `soporte@promidamos.org`
   - **Password:** la que generó el script
4. Deberías entrar al panel admin

---

## Verificación rápida desde Supabase

En el SQL Editor:

```sql
-- ¿Existe el admin?
SELECT email, nombre, rol, activo FROM admins;

-- ¿Tiene auth user enlazado?
SELECT a.email, u.email AS auth_email, u.email_confirmed_at
FROM admins a
JOIN auth.users u ON u.id = a.user_id;

-- Catálogo cargado
SELECT
  m.nombre, m.laboratorio,
  c.precio, c.precio_mayorista, c.stock
FROM catalogos c
JOIN medicamentos m ON m.id = c.medicamento_id
WHERE c.drogueria_id = (
  SELECT id FROM droguerias WHERE email = 'cartagena@drogueriavirtual.co'
)
ORDER BY m.nombre;
```

---

## Recovery — Si algo sale mal

### Borrar usuario admin para volver a crearlo
```sql
-- En SQL Editor de Supabase
DELETE FROM admins WHERE email = 'soporte@promidamos.org';
-- El user en auth.users se borra desde el dashboard de Supabase Auth
```

### Volver a poblar catálogo
El seed `seed-catalogo-prueba.sql` usa `ON CONFLICT DO UPDATE`, así que puedes ejecutarlo varias veces sin problema. Actualizará precios y stock.

### Resetear todo
```sql
-- ⚠️ Borra TODO. Solo en pruebas.
TRUNCATE
  pedidos, detalle_pedidos, ordenes_compra, detalle_ordenes_compra,
  catalogos, medicamentos, mensajeros, droguerias,
  bot_sessions, calificaciones, clientes_lealtad, movimientos_puntos,
  cupones, liquidaciones
  CASCADE;
```

Luego vuelve a ejecutar los seeds en orden.
