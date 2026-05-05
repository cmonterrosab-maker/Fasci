# Cómo cargar el catálogo del distribuidor

## Resumen del proceso

```
Excel del distribuidor  →  CSV con formato correcto  →  npm run import-catalogo
```

---

## Paso 1 — Preparar el Excel del distribuidor

El distribuidor probablemente tiene un Excel con columnas como:
- Código, Nombre, Presentación, Lab, Costo, PVP, Stock...

Hay que **mapear esas columnas** al formato esperado por el sistema. Las columnas requeridas son:

| Columna requerida | Descripción | Ejemplo |
|---|---|---|
| `nombre` | Nombre comercial completo | Acetaminofén 500mg Tabletas |
| `nombre_generico` | Principio activo | Paracetamol |
| `laboratorio` | Marca/lab | Genfar |
| `presentacion` | Forma farmacéutica | Tabletas x10 |
| `concentracion` | Dosis | 500mg |
| `categoria` | Categoría (debe coincidir con tabla `categorias_medicamentos`) | Analgésicos |
| `requiere_formula` | true/false | false |
| `codigo_cum` | Código CUM (INVIMA) | 19900001-1 |
| `precio` | Precio retail al público (B2C) | 8500 |
| `precio_mayorista` | Precio B2B (opcional, default 80%) | 6800 |
| `stock` | Unidades disponibles | 200 |
| `cantidad_minima_mayorista` | Mínimo unidades para B2B | 30 |

**Categorías válidas** (deben coincidir exacto):
- Analgésicos
- Antibióticos
- Antiinflamatorios
- Vitaminas
- Antigripales
- Dermatológicos
- Cardiovasculares
- Digestivos
- Respiratorios
- Antihistamínicos
- Otros

---

## Paso 2 — Convertir Excel → CSV

### Si tienes Excel:
1. Abre el Excel
2. Asegura que la **primera fila** sean los headers exactos del paso 1
3. **Archivo → Guardar como → CSV (delimitado por comas) (.csv)**
4. Si los nombres tienen acentos o "ñ", usa codificación UTF-8

### Si tienes Google Sheets:
1. **Archivo → Descargar → Valores separados por comas (.csv)**

### Verificación rápida
Abre el CSV con un editor de texto. La primera línea debe verse así:
```
nombre,nombre_generico,laboratorio,presentacion,concentracion,categoria,requiere_formula,codigo_cum,precio,precio_mayorista,stock,cantidad_minima_mayorista
```

Tienes un ejemplo real en `scripts/catalogo-ejemplo.csv` — úsalo como plantilla.

---

## Paso 3 — Ejecutar el importador

### Pre-requisitos
1. Haber ejecutado primero el `supabase/seed-cartagena.sql` (crea la bodega del distribuidor)
2. `.env` configurado con `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`
3. Dependencias instaladas: `cd backend && npm install`

### Comando
```bash
cd "/Users/carlosandresmonterrosabaquero/Documents/Claude/Projects/Drogueria virtual"
node scripts/import-catalogo.js ./mi-catalogo.csv
```

### Salida esperada
```
📂 Leyendo ./mi-catalogo.csv...
📦 200 filas detectadas

🏪 Droguería destino: Droguería Virtual — Bodega Cartagena

✅ Acetaminofén 500mg | $8.500 | stock: 200
✅ Ibuprofeno 400mg | $12.000 | stock: 150
✅ Amoxicilina 500mg | $18.500 | stock: 80
... (etc)

────────────────────────────────────
📊 Resumen:
   ✅ Procesados:   195
   ❌ Errores:      5
────────────────────────────────────
```

Los errores típicos:
- Categoría que no existe (queda como "Otros")
- Precio en formato con `$` o `,` → el script los limpia automáticamente
- Nombre vacío → la fila se ignora

---

## Paso 4 — Verificar en Supabase

Abre tu proyecto Supabase → **Table Editor** → tabla `catalogos`. Debes ver tus medicamentos con sus precios y stock.

Para validación rápida:
```sql
SELECT
  m.nombre, m.laboratorio,
  c.precio, c.precio_mayorista, c.stock, c.disponible
FROM catalogos c
JOIN medicamentos m ON m.id = c.medicamento_id
WHERE c.drogueria_id = (
  SELECT id FROM droguerias WHERE email = 'cartagena@drogueriavirtual.co'
)
ORDER BY m.nombre;
```

---

## Actualizaciones posteriores

Cada vez que el distribuidor actualice su inventario:
1. Exporta el Excel actualizado a CSV con los mismos headers
2. Corre `node scripts/import-catalogo.js ./catalogo-nuevo.csv`
3. El script hace **UPSERT**: actualiza precios y stock de los existentes, agrega los nuevos.

Los medicamentos que **dejan de aparecer** en el CSV NO se eliminan automáticamente. Si quieres descontinuar uno, márcalo `disponible=false` desde el panel admin.

---

## Sugerencia: cargar primero un lote pequeño

Para evitar errores en producción, prueba primero con 10-20 medicamentos.
Verifica que se cargan bien, que aparecen al buscar en el bot, y luego carga el catálogo completo.
