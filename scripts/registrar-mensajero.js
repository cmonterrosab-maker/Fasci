#!/usr/bin/env node
'use strict';

/**
 * registrar-mensajero.js — Registro interactivo de mensajeros
 *
 * Uso:
 *   node scripts/registrar-mensajero.js
 *
 * Pregunta los datos paso a paso y registra al mensajero en Supabase.
 * Sin necesidad de SQL ni del panel admin.
 */

require('dotenv').config();
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

function pregunta(texto) {
  return new Promise(resolve => rl.question(texto, ans => resolve(ans.trim())));
}

function normalizarTelefono(tel) {
  return String(tel).replace(/\D/g, '').slice(-10);
}

function validarTelefono(tel) {
  const limpio = normalizarTelefono(tel);
  return /^3\d{9}$/.test(limpio);
}

async function main() {
  console.log('\n🛵 ════════════════════════════════════════');
  console.log('   REGISTRO DE MENSAJERO — Droguería Virtual');
  console.log('═════════════════════════════════════════\n');

  // Datos básicos
  const nombre = await pregunta('👤 Nombre completo: ');
  if (!nombre) { console.error('❌ Nombre requerido'); process.exit(1); }

  let telefono;
  while (true) {
    const t = await pregunta('📱 Teléfono WhatsApp (10 dígitos, ej: 3001234567): ');
    if (validarTelefono(t)) { telefono = normalizarTelefono(t); break; }
    console.log('   ⚠️  Inválido. Debe ser celular colombiano (10 dígitos, empieza en 3).');
  }

  const cedula  = await pregunta('🪪 Cédula (opcional, Enter para saltar): ');
  const ciudad  = await pregunta('🏙️  Ciudad [Cartagena]: ') || 'Cartagena';
  const zona    = await pregunta('📍 Zona/barrio de cobertura (ej: Bocagrande - Manga): ');

  // Vehículo
  console.log('\n🚲 Tipo de vehículo:');
  console.log('  1) Moto');
  console.log('  2) Bicicleta');
  console.log('  3) A pie');
  const vehOpcion = await pregunta('Opción [1]: ') || '1';
  const vehiculo  = { '1': 'moto', '2': 'bicicleta', '3': 'pie' }[vehOpcion] || 'moto';

  let placa = null;
  if (vehiculo === 'moto') {
    placa = await pregunta('🔢 Placa (ej: ABC123): ') || null;
  }

  // Confirmación
  console.log('\n📋 Resumen:');
  console.log(`   Nombre:     ${nombre}`);
  console.log(`   Teléfono:   +57 ${telefono}`);
  console.log(`   Cédula:     ${cedula || '(no proporcionada)'}`);
  console.log(`   Ciudad:     ${ciudad}`);
  console.log(`   Zona:       ${zona || '(no proporcionada)'}`);
  console.log(`   Vehículo:   ${vehiculo}${placa ? ` — ${placa}` : ''}`);
  console.log('');

  const conf = await pregunta('¿Confirmar registro? (si/no): ');
  if (!['si', 's', 'yes', 'y'].includes(conf.toLowerCase())) {
    console.log('❌ Cancelado.');
    process.exit(0);
  }

  // Insertar
  try {
    const { data, error } = await supabase
      .from('mensajeros')
      .upsert({
        nombre,
        telefono,
        cedula:     cedula || null,
        ciudad,
        zona:       zona || null,
        vehiculo,
        placa,
        status:     'activo',
        disponible: true,
      }, { onConflict: 'telefono' })
      .select()
      .single();

    if (error) throw error;

    console.log('\n✅ ¡Mensajero registrado!');
    console.log(`   ID: ${data.id}`);
    console.log('\n📌 Próximos pasos:');
    console.log(`   1. Pídele al mensajero que envíe un WhatsApp al bot`);
    console.log(`      desde el número +57 ${telefono}`);
    console.log('   2. El bot lo reconocerá automáticamente y mostrará su menú.');
    console.log('   3. Para que aparezca su ubicación en el mapa, debe compartir');
    console.log('      su ubicación en vivo desde WhatsApp.\n');

  } catch (err) {
    console.error('\n❌ Error registrando mensajero:', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
