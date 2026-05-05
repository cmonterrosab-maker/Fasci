#!/usr/bin/env node
'use strict';

/**
 * import-catalogo.js — Importador masivo del catálogo de medicamentos.
 *
 * Lee un archivo CSV con el inventario del distribuidor y lo carga en
 * `medicamentos` + `catalogos` de la base de datos.
 *
 * USO:
 *   node scripts/import-catalogo.js ./catalogo-cartagena.csv
 *
 * FORMATO DEL CSV (primera fila = headers):
 *   nombre,nombre_generico,laboratorio,presentacion,concentracion,categoria,
 *   requiere_formula,codigo_cum,precio,precio_mayorista,stock,cantidad_minima_mayorista
 *
 * Ejemplo:
 *   "Acetaminofén 500mg","Paracetamol","Genfar","Tabletas x10","500mg","Analgésicos",false,"19900001-1",8500,6800,150,30
 *   "Ibuprofeno 400mg","Ibuprofeno","MK","Tabletas x10","400mg","Antiinflamatorios",false,"19900002-1",12000,9600,80,24
 *
 * Las filas con `nombre` duplicado se actualizan en lugar de duplicarse.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Validación de argumentos ──────────────────────────────────────────────
const [, , csvPath] = process.argv;
if (!csvPath) {
  console.error('❌ Uso: node scripts/import-catalogo.js <ruta-al-csv>');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`❌ Archivo no encontrado: ${csvPath}`);
  process.exit(1);
}

// ── Conexión Supabase ─────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Parser CSV simple (sin dependencias) ──────────────────────────────────
function parseCSV(contenido) {
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim());
  const headers = parseRow(lineas[0]);
  return lineas.slice(1).map(linea => {
    const valores = parseRow(linea);
    const fila = {};
    headers.forEach((h, i) => { fila[h.trim()] = valores[i]; });
    return fila;
  });
}

function parseRow(linea) {
  const valores = [];
  let actual = '';
  let dentroComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') { dentroComillas = !dentroComillas; continue; }
    if (c === ',' && !dentroComillas) { valores.push(actual); actual = ''; continue; }
    actual += c;
  }
  valores.push(actual);
  return valores.map(v => v.trim());
}

// ── Helpers ───────────────────────────────────────────────────────────────
function toBool(v) {
  return ['true', '1', 'sí', 'si', 'yes'].includes(String(v).toLowerCase());
}
function toNum(v) {
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── Importación ───────────────────────────────────────────────────────────
async function importar() {
  console.log(`📂 Leyendo ${csvPath}...`);
  const contenido = fs.readFileSync(csvPath, 'utf8');
  const filas = parseCSV(contenido);
  console.log(`📦 ${filas.length} filas detectadas\n`);

  // 1. Mapear categorías existentes
  const { data: categorias } = await supabase.from('categorias_medicamentos').select('id, nombre');
  const catMap = {};
  (categorias || []).forEach(c => { catMap[c.nombre.toLowerCase()] = c.id; });

  // 2. Obtener droguería bodega Cartagena
  const { data: droguerias } = await supabase
    .from('droguerias')
    .select('id, nombre')
    .eq('email', 'cartagena@drogueriavirtual.co')
    .maybeSingle();

  if (!droguerias) {
    console.error('❌ No se encontró la bodega "cartagena@drogueriavirtual.co".');
    console.error('   Ejecuta primero supabase/seed-cartagena.sql');
    process.exit(1);
  }
  const drogueriaId = droguerias.id;
  console.log(`🏪 Droguería destino: ${droguerias.nombre}\n`);

  // 3. Procesar cada fila
  let creados = 0, actualizados = 0, errores = 0;

  for (const f of filas) {
    if (!f.nombre) continue;

    try {
      const categoriaId = catMap[(f.categoria || '').toLowerCase()] || catMap['otros'];

      // Upsert medicamento maestro
      const { data: med, error: errMed } = await supabase
        .from('medicamentos')
        .upsert({
          nombre:                  f.nombre,
          nombre_generico:         f.nombre_generico || null,
          laboratorio:             f.laboratorio     || null,
          presentacion:            f.presentacion    || null,
          concentracion:           f.concentracion   || null,
          categoria_id:            categoriaId,
          requiere_formula_medica: toBool(f.requiere_formula),
          codigo_cum:              f.codigo_cum      || null,
          activo:                  true,
        }, { onConflict: 'nombre', ignoreDuplicates: false })
        .select('id')
        .single();

      if (errMed) throw errMed;

      // Upsert en catálogo de la bodega
      const { error: errCat } = await supabase
        .from('catalogos')
        .upsert({
          drogueria_id:              drogueriaId,
          medicamento_id:            med.id,
          precio:                    toNum(f.precio),
          precio_mayorista:          toNum(f.precio_mayorista) || Math.round(toNum(f.precio) * 0.8),
          cantidad_minima_mayorista: toNum(f.cantidad_minima_mayorista) || 10,
          stock:                     toNum(f.stock),
          disponible:                toNum(f.stock) > 0,
        }, { onConflict: 'drogueria_id,medicamento_id' });

      if (errCat) throw errCat;

      console.log(`✅ ${f.nombre} | $${toNum(f.precio).toLocaleString('es-CO')} | stock: ${f.stock}`);
      creados++;

    } catch (err) {
      console.error(`❌ ${f.nombre}: ${err.message}`);
      errores++;
    }
  }

  console.log('\n────────────────────────────────────');
  console.log(`📊 Resumen:`);
  console.log(`   ✅ Procesados:   ${creados}`);
  console.log(`   ❌ Errores:      ${errores}`);
  console.log('────────────────────────────────────\n');
}

importar().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
