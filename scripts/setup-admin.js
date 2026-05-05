#!/usr/bin/env node
'use strict';

/**
 * setup-admin.js — Crea el usuario admin inicial
 *
 * Uso:
 *   node scripts/setup-admin.js
 *   node scripts/setup-admin.js soporte@promidamos.org "Soporte" super_admin
 *
 * Pasos que hace:
 *   1. Crea el usuario en Supabase Auth (auth.users) con email + password
 *   2. Inserta el perfil en la tabla admins con su rol
 *   3. Imprime las credenciales para guardarlas
 *
 * Si el usuario ya existe en auth.users, solo se asegura el registro en admins.
 */

require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY en el .env');
  process.exit(1);
}

// Cliente con permisos de servicio (puede crear users en auth)
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Argumentos opcionales
const [, , emailArg, nombreArg, rolArg] = process.argv;
const email   = emailArg  || 'soporte@promidamos.org';
const nombre  = nombreArg || 'Soporte Promidamos';
const rol     = rolArg    || 'super_admin';

// Generar contraseña aleatoria robusta (16 caracteres)
function generarPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
  let pwd = '';
  for (let i = 0; i < 16; i++) {
    pwd += chars[crypto.randomInt(0, chars.length)];
  }
  return pwd;
}

async function main() {
  console.log('\n🔐 ════════════════════════════════════════');
  console.log('   SETUP ADMIN — Droguería Virtual');
  console.log('════════════════════════════════════════════\n');

  console.log(`Email:  ${email}`);
  console.log(`Nombre: ${nombre}`);
  console.log(`Rol:    ${rol}\n`);

  // Verificar si ya existe en auth.users
  const { data: existingList } = await supabase.auth.admin.listUsers();
  let user = existingList?.users?.find(u => u.email === email);
  let passwordParaMostrar = null;

  if (user) {
    console.log('ℹ️  El usuario ya existe en Supabase Auth.');
    console.log(`   user_id: ${user.id}`);
    console.log('   Si quieres restablecer la contraseña, usa el dashboard de Supabase.\n');
  } else {
    // Crear nuevo usuario
    const password = generarPassword();
    passwordParaMostrar = password;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,        // ya marcado como confirmado, no necesita verificación
      user_metadata: { nombre, rol },
    });

    if (error) {
      console.error('❌ Error creando usuario en auth:', error.message);
      process.exit(1);
    }
    user = data.user;
    console.log('✅ Usuario creado en Supabase Auth');
    console.log(`   user_id: ${user.id}\n`);
  }

  // Asegurar el registro en tabla admins
  const { data: adminExistente } = await supabase
    .from('admins')
    .select('id, rol')
    .eq('email', email)
    .maybeSingle();

  if (adminExistente) {
    console.log('ℹ️  Perfil admin ya existe. Actualizando datos...');
    const { error } = await supabase
      .from('admins')
      .update({ user_id: user.id, nombre, rol, activo: true })
      .eq('email', email);
    if (error) throw error;
    console.log('✅ Perfil admin actualizado.\n');
  } else {
    const { error } = await supabase
      .from('admins')
      .insert({ user_id: user.id, email, nombre, rol, activo: true });

    if (error) {
      console.error('❌ Error insertando en admins:', error.message);
      console.error('   Asegúrate de haber ejecutado supabase/schema.sql primero.');
      process.exit(1);
    }
    console.log('✅ Perfil admin creado en tabla admins.\n');
  }

  // Resumen final
  console.log('════════════════════════════════════════════');
  console.log('🎉 ADMIN LISTO PARA USAR');
  console.log('════════════════════════════════════════════');
  console.log(`Email:    ${email}`);
  if (passwordParaMostrar) {
    console.log(`Password: ${passwordParaMostrar}`);
    console.log('\n⚠️  GUARDA ESTA CONTRASEÑA AHORA — no se mostrará de nuevo.');
  }
  console.log(`URL:      http://localhost:5173/admin/login`);
  console.log('════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
