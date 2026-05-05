#!/usr/bin/env node
'use strict';

/**
 * backup-supabase.js — Backup automatizado de la base de datos Supabase.
 *
 * Exporta cada tabla crítica de Droguería Virtual a JSON, comprime todo en
 * un .tar.gz con timestamp y opcionalmente lo sube a AWS S3. Conserva
 * únicamente los últimos 30 backups locales.
 *
 * USO:
 *   node scripts/backup-supabase.js
 *
 * VARIABLES DE ENTORNO:
 *   SUPABASE_URL                (obligatoria)
 *   SUPABASE_SERVICE_KEY        (obligatoria)
 *   AWS_BACKUP_BUCKET           (opcional — activa subida a S3)
 *   AWS_ACCESS_KEY_ID           (opcional)
 *   AWS_SECRET_ACCESS_KEY       (opcional)
 *   AWS_REGION                  (opcional, default: us-east-1)
 *   BACKUP_RETENTION            (opcional, default: 30 backups locales)
 */

require('dotenv').config();

const fs              = require('fs');
const path            = require('path');
const os              = require('os');
const crypto          = require('crypto');
const https           = require('https');
const zlib            = require('zlib');
const { execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// ── Configuración ────────────────────────────────────────────────────────────
const TABLAS = [
  'medicamentos',
  'droguerias',
  'mensajeros',
  'catalogos',
  'pedidos',
  'detalle_pedidos',
  'ordenes_compra',
  'detalle_ordenes_compra',
  'configuracion_fee',
  'liquidaciones',
  'categorias_medicamentos',
];

const PAGE_SIZE       = 1000;
const RETENTION       = parseInt(process.env.BACKUP_RETENTION, 10) || 30;
const PROJECT_ROOT    = path.resolve(__dirname, '..');
const BACKUPS_DIR     = path.join(PROJECT_ROOT, 'backups');

// ── Utilidades ───────────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function err(msg) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`);
}

// ── Validación de credenciales ───────────────────────────────────────────────
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

// ── Exportar una tabla con paginación ────────────────────────────────────────
async function exportarTabla(tabla) {
  const rows = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .range(from, to);

    if (error) {
      // Si la tabla no existe, lo notamos pero no rompemos el backup completo.
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
        log(`  ! tabla ${tabla} no existe — se omite`);
        return [];
      }
      throw new Error(`Fallo al exportar ${tabla}: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

// ── Crear .tar.gz con tar nativo del sistema ─────────────────────────────────
function crearTarGz(directorioFuente, archivoSalida) {
  const cwd  = path.dirname(directorioFuente);
  const base = path.basename(directorioFuente);
  // -C cwd → entra a esa carpeta primero, evita rutas absolutas dentro del tar
  execFileSync('tar', ['-czf', archivoSalida, '-C', cwd, base], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ── Limpiar backups antiguos ─────────────────────────────────────────────────
function limpiarAntiguos(carpeta, retener) {
  if (!fs.existsSync(carpeta)) return;
  const archivos = fs.readdirSync(carpeta)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.tar.gz'))
    .map((f) => ({
      nombre: f,
      ruta: path.join(carpeta, f),
      mtime: fs.statSync(path.join(carpeta, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const aBorrar = archivos.slice(retener);
  for (const a of aBorrar) {
    try {
      fs.unlinkSync(a.ruta);
      log(`  - eliminado backup antiguo: ${a.nombre}`);
    } catch (e) {
      err(`No se pudo borrar ${a.nombre}: ${e.message}`);
    }
  }
}

// ── Subida a S3 con AWS Signature v4 (sin SDK) ───────────────────────────────
function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function subirAS3({ bucket, key, body, accessKeyId, secretAccessKey, region }) {
  return new Promise((resolve, reject) => {
    const host    = `${bucket}.s3.${region}.amazonaws.com`;
    const ahora   = new Date();
    const amzDate = ahora.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const fecha   = amzDate.slice(0, 8);

    const payloadHash = sha256Hex(body);
    const canonicalUri = `/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
    const headers = {
      'host': host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'content-type': 'application/gzip',
      'content-length': String(body.length),
    };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort()
      .map((h) => `${h}:${headers[h]}`).join('\n') + '\n';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${fecha}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate    = hmac(`AWS4${secretAccessKey}`, fecha);
    const kRegion  = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const req = https.request({
      method: 'PUT',
      host,
      path: canonicalUri,
      headers: { ...headers, Authorization: authHeader },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`S3 respondió ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Flujo principal ──────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  log('Iniciando backup de Supabase para Droguería Virtual...');
  log(`  proyecto Supabase: ${SUPABASE_URL}`);

  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const stamp = timestamp();
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), `dv-backup-${stamp}-`));
  const dirBackup = path.join(dirTmp, `backup-${stamp}`);
  fs.mkdirSync(dirBackup, { recursive: true });

  const resumen = [];
  let totalRegistros = 0;

  for (const tabla of TABLAS) {
    const tStart = Date.now();
    try {
      const rows = await exportarTabla(tabla);
      const archivo = path.join(dirBackup, `${tabla}.json`);
      fs.writeFileSync(archivo, JSON.stringify(rows, null, 2), 'utf8');
      const tamano = fs.statSync(archivo).size;
      const ms = Date.now() - tStart;
      log(`  + ${tabla.padEnd(28)} ${String(rows.length).padStart(6)} registros · ${fmtBytes(tamano).padStart(9)} · ${ms} ms`);
      resumen.push({ tabla, registros: rows.length, bytes: tamano, ms });
      totalRegistros += rows.length;
    } catch (e) {
      err(`Tabla ${tabla}: ${e.message}`);
      resumen.push({ tabla, registros: 0, error: e.message });
    }
  }

  // Metadata
  const meta = {
    proyecto: 'drogueria-virtual',
    timestamp_utc: new Date().toISOString(),
    supabase_url: SUPABASE_URL,
    tablas: resumen,
    nodo: { platform: process.platform, node: process.version, hostname: os.hostname() },
  };
  fs.writeFileSync(path.join(dirBackup, 'manifest.json'), JSON.stringify(meta, null, 2), 'utf8');

  // Comprimir
  const archivoTar = path.join(BACKUPS_DIR, `backup-${stamp}.tar.gz`);
  log(`Comprimiendo a ${path.basename(archivoTar)} ...`);
  try {
    crearTarGz(dirBackup, archivoTar);
  } catch (e) {
    err(`No se pudo crear el .tar.gz: ${e.message}`);
    fs.rmSync(dirTmp, { recursive: true, force: true });
    process.exit(2);
  }

  // Limpiar tmp
  fs.rmSync(dirTmp, { recursive: true, force: true });

  const tamanoTar = fs.statSync(archivoTar).size;
  log(`Backup local listo: ${archivoTar}  (${fmtBytes(tamanoTar)})`);

  // Subir a S3 si está configurado
  const bucket = process.env.AWS_BACKUP_BUCKET;
  const akid   = process.env.AWS_ACCESS_KEY_ID;
  const sak    = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (bucket && akid && sak) {
    try {
      log(`Subiendo a s3://${bucket}/ ...`);
      const cuerpo = fs.readFileSync(archivoTar);
      await subirAS3({
        bucket,
        key: `drogueria-virtual/backup-${stamp}.tar.gz`,
        body: cuerpo,
        accessKeyId: akid,
        secretAccessKey: sak,
        region,
      });
      log(`  + S3 OK: s3://${bucket}/drogueria-virtual/backup-${stamp}.tar.gz`);
    } catch (e) {
      err(`Falló subida a S3: ${e.message}`);
      // No abortamos: el backup local ya existe.
    }
  } else {
    log('S3 no configurado (omite subida). Define AWS_BACKUP_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY para activar.');
  }

  // Rotación
  log(`Rotando backups locales (conservar ${RETENTION})...`);
  limpiarAntiguos(BACKUPS_DIR, RETENTION);

  const segs = ((Date.now() - t0) / 1000).toFixed(1);
  log(`OK · ${TABLAS.length} tablas · ${totalRegistros} registros · ${fmtBytes(tamanoTar)} · ${segs}s`);
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});
