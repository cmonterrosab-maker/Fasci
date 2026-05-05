#!/usr/bin/env node
'use strict';

/**
 * restore-supabase.js — Restauración de base de datos Supabase desde backup.
 *
 * Acepta un .tar.gz creado por backup-supabase.js o una carpeta con los .json.
 * Trunca y reinserta cada tabla respetando el orden de FKs.
 *
 * USO:
 *   node scripts/restore-supabase.js ./backups/backup-2026-05-04-040000.tar.gz
 *   node scripts/restore-supabase.js ./tmp/backup-2026-05-04-040000
 *
 * Pide confirmación interactiva: "ESCRIBA RESTAURAR para confirmar".
 */

require('dotenv').config();

const fs               = require('fs');
const os               = require('os');
const path             = require('path');
const readline         = require('readline');
const { execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// ── Orden de restauración (respeta FKs) ──────────────────────────────────────
const ORDEN_TABLAS = [
  'categorias_medicamentos',
  'medicamentos',
  'droguerias',
  'mensajeros',
  'catalogos',
  'configuracion_fee',
  'pedidos',
  'detalle_pedidos',
  'ordenes_compra',
  'detalle_ordenes_compra',
  'liquidaciones',
];

const BATCH_SIZE = 500;

// ── Utilidades ───────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
function err(msg) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`);
}

function preguntarConfirmacion(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(texto, (r) => {
      rl.close();
      resolve(r);
    });
  });
}

// ── Argumentos ───────────────────────────────────────────────────────────────
const [, , entrada] = process.argv;
if (!entrada) {
  err('Uso: node scripts/restore-supabase.js <archivo.tar.gz | carpeta>');
  process.exit(1);
}
if (!fs.existsSync(entrada)) {
  err(`No existe: ${entrada}`);
  process.exit(1);
}

// ── Credenciales ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  err('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el entorno (.env).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Extracción ───────────────────────────────────────────────────────────────
function extraerTarGz(archivo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-restore-'));
  log(`Extrayendo ${archivo} en ${tmp} ...`);
  execFileSync('tar', ['-xzf', archivo, '-C', tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
  // El tar contiene una carpeta backup-<stamp>/ — la localizamos.
  const items = fs.readdirSync(tmp);
  const sub = items.find((n) => fs.statSync(path.join(tmp, n)).isDirectory());
  return sub ? path.join(tmp, sub) : tmp;
}

function resolverDirectorio(entrada) {
  const stat = fs.statSync(entrada);
  if (stat.isDirectory()) return { dir: entrada, esTemporal: false };
  if (entrada.endsWith('.tar.gz') || entrada.endsWith('.tgz')) {
    return { dir: extraerTarGz(entrada), esTemporal: true };
  }
  throw new Error('La entrada debe ser un .tar.gz/.tgz o una carpeta.');
}

// ── Truncado e inserción ─────────────────────────────────────────────────────
async function vaciarTabla(tabla) {
  // Borra todas las filas. Filtro tautológico para satisfacer el require de Supabase.
  const { error } = await supabase.from(tabla).delete().neq('id', -1);
  if (error) {
    // Si la columna 'id' no existe, intentamos otro filtro frecuente.
    const alt = await supabase.from(tabla).delete().not('created_at', 'is', null);
    if (alt.error) {
      throw new Error(`No se pudo vaciar ${tabla}: ${error.message}`);
    }
  }
}

async function insertarRegistros(tabla, rows) {
  let insertados = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(tabla).insert(lote);
    if (error) {
      throw new Error(`Insert en ${tabla} (lote ${i}-${i + lote.length}): ${error.message}`);
    }
    insertados += lote.length;
  }
  return insertados;
}

async function restaurarTabla(tabla, dir) {
  const archivo = path.join(dir, `${tabla}.json`);
  if (!fs.existsSync(archivo)) {
    log(`  ! ${tabla}: no hay archivo en el backup, se omite`);
    return { tabla, status: 'skipped', registros: 0 };
  }

  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (e) {
    return { tabla, status: 'error', error: `JSON inválido: ${e.message}` };
  }

  if (!Array.isArray(rows)) {
    return { tabla, status: 'error', error: 'El JSON no es un arreglo' };
  }

  try {
    log(`  > vaciando ${tabla} ...`);
    await vaciarTabla(tabla);
  } catch (e) {
    return { tabla, status: 'error', error: e.message };
  }

  if (rows.length === 0) {
    return { tabla, status: 'ok', registros: 0 };
  }

  try {
    const n = await insertarRegistros(tabla, rows);
    return { tabla, status: 'ok', registros: n };
  } catch (e) {
    return { tabla, status: 'error', error: e.message };
  }
}

// ── Flujo principal ──────────────────────────────────────────────────────────
async function main() {
  const { dir, esTemporal } = resolverDirectorio(entrada);
  log(`Origen del backup: ${dir}`);

  // Manifest opcional
  const manifestPath = path.join(dir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      log(`Manifest: proyecto=${m.proyecto || '?'}  fecha=${m.timestamp_utc || '?'}`);
    } catch {
      // ignorar
    }
  }

  console.log('');
  console.log('============================================================');
  console.log('  ATENCION — RESTAURACION DESTRUCTIVA');
  console.log('  Esto VACIARÁ y reinsertará las tablas listadas en');
  console.log(`  el proyecto Supabase: ${SUPABASE_URL}`);
  console.log('  Tablas afectadas (en orden):');
  ORDEN_TABLAS.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
  console.log('============================================================');
  console.log('');

  const resp = await preguntarConfirmacion('ESCRIBA RESTAURAR para confirmar: ');
  if ((resp || '').trim() !== 'RESTAURAR') {
    log('Cancelado por el usuario.');
    if (esTemporal) fs.rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  }

  const t0 = Date.now();
  const resultados = [];

  for (const tabla of ORDEN_TABLAS) {
    const r = await restaurarTabla(tabla, dir);
    if (r.status === 'ok') {
      log(`  + ${tabla.padEnd(28)} ${String(r.registros).padStart(6)} registros restaurados`);
    } else if (r.status === 'skipped') {
      log(`  ~ ${tabla.padEnd(28)} omitida`);
    } else {
      err(`${tabla}: ${r.error} — se continúa con la siguiente tabla`);
    }
    resultados.push(r);
  }

  if (esTemporal) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('');
  console.log('=============== RESUMEN DE RESTAURACION =================');
  let okN = 0, errN = 0, skipN = 0, totalReg = 0;
  for (const r of resultados) {
    if (r.status === 'ok') { okN++; totalReg += r.registros; }
    else if (r.status === 'error') errN++;
    else skipN++;
  }
  console.log(`Tablas OK:      ${okN}`);
  console.log(`Tablas error:   ${errN}`);
  console.log(`Tablas omitidas:${skipN}`);
  console.log(`Registros total:${totalReg}`);
  console.log(`Tiempo total:   ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('=========================================================');

  if (errN > 0) process.exit(2);
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});
