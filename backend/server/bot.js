'use strict';

/**
 * bot.js - WhatsApp Bot para Droguería Virtual
 *
 * Flujo completo del cliente:
 *   PASO 0  → Bienvenida / primer contacto
 *   PASO 1  → Cliente escribe nombre del medicamento → bot busca
 *   PASO 2  → Cliente elige número de resultado → bot pregunta cantidad
 *   PASO 3  → Bot agrega al carrito → ¿agregar otro? SI/NO
 *   PASO 4  → Resumen del pedido → ¿confirmamos? SI/NO
 *   PASO 5  → Solicitar ubicación GPS
 *   PASO 6  → Nombre completo del cliente
 *   PASO 7  → Cédula del cliente
 *   PASO 8  → Términos y condiciones → ACEPTO/NO ACEPTO
 *   PASO 9  → Instrucciones de pago → esperar comprobante (imagen)
 *   PASO 10 → Comprobante recibido → crear pedido → notificar mensajero
 *   PASO 11 → Confirmación final con número de pedido
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const MedicamentoService = require('../services/medicamento-service');
const CatalogoService    = require('../services/catalogo-service');
const PedidoService      = require('../services/pedido-service');
const InventarioService  = require('../services/inventario-service');
const MensajeroService   = require('../services/mensajero-service');
const AsignacionService  = require('../services/asignacion-service');
const FeeService         = require('../services/fee-service');
const WompiService       = require('../services/wompi-service');
const CalificacionService = require('../services/calificacion-service');
const LealtadService      = require('../services/lealtad-service');
const B2BService         = require('../services/b2b-service');
const securityService    = require('../services/security-service');
const CacheService       = require('../services/cache-service');
const { sendWhatsAppMessage } = require('../services/whatsapp-service');

// ─── Inicialización ────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const medicamentoService = new MedicamentoService(supabase);
const catalogoService    = new CatalogoService(supabase);
const pedidoService      = new PedidoService(supabase);
const inventarioService  = new InventarioService(supabase);
const mensajeroService   = new MensajeroService(supabase);
const asignacionService  = new AsignacionService(supabase);
const feeService         = new FeeService(supabase);
const wompiService       = new WompiService(supabase);
const calificacionService = new CalificacionService(supabase);
const lealtadService      = new LealtadService(supabase);
const b2bService         = new B2BService(supabase);

// Wompi habilitado solo si están las credenciales configuradas
const WOMPI_HABILITADO = !!process.env.WOMPI_PRIVATE_KEY;
const cache              = new CacheService(300);

// ─── Constantes ───────────────────────────────────────────────────────────────

const COSTO_DOMICILIO = 4000;
const SESION_TTL_MS   = 30 * 60 * 1000; // 30 minutos

const NEQUI_NUMERO    = process.env.NEQUI_NUMERO    || '3001234567';
const DAVIPLATA_NUMERO = process.env.DAVIPLATA_NUMERO || '3001234567';
const NOMBRE_CUENTA   = process.env.NOMBRE_CUENTA   || 'Droguería Virtual SAS';

// ─── Estados del flujo ────────────────────────────────────────────────────────

const ESTADOS = {
  INICIO:        'inicio',
  BUSCANDO:      'buscando',
  SELECCIONANDO: 'seleccionando',
  CANTIDAD:      'cantidad',
  CARRITO:       'carrito',
  CONFIRMACION:  'confirmacion',
  UBICACION:     'ubicacion',
  NOMBRE:        'nombre',
  CEDULA:        'cedula',
  TC:            'tc',
  PAGO:          'pago',
  COMPROBANTE:   'comprobante',
  FINALIZADO:    'finalizado',

  // B2B: droguería comprando al por mayor
  B2B_MENU:          'b2b_menu',
  B2B_BUSCANDO:      'b2b_buscando',
  B2B_SELECCIONANDO: 'b2b_seleccionando',
  B2B_CANTIDAD:      'b2b_cantidad',
  B2B_CARRITO:       'b2b_carrito',
  B2B_COTIZACION:    'b2b_cotizacion',
  B2B_PAGO:          'b2b_pago',
  B2B_COMPROBANTE:   'b2b_comprobante',
};

// ─── Gestión de sesiones ──────────────────────────────────────────────────────

/** @type {Map<string, object>} */
const sesiones = new Map();

/**
 * Retorna la sesión activa del usuario o crea una nueva si no existe / expiró.
 */
function obtenerSesion(telefono) {
  const ahora = Date.now();

  if (sesiones.has(telefono)) {
    const sesion = sesiones.get(telefono);
    if (ahora - sesion.timestamp > SESION_TTL_MS) {
      // Sesión expirada → nueva sesión
      return crearSesion(telefono);
    }
    sesion.timestamp = ahora;
    return sesion;
  }

  return crearSesion(telefono);
}

function crearSesion(telefono) {
  const sesion = {
    estado:             ESTADOS.INICIO,
    carrito:            [],         // [{ nombre, cantidad, precio_unitario, subtotal, medicamento_id, catalogo_id }]
    resultados_busqueda: [],        // Últimos resultados de búsqueda
    datos: {
      ubicacion:   null,            // { lat, lng, label }
      nombre:      null,
      cedula:      null,
      comprobante: null,            // URL de la imagen del comprobante
    },
    timestamp: Date.now(),
  };
  sesiones.set(telefono, sesion);
  return sesion;
}

function guardarSesion(telefono, sesion) {
  sesion.timestamp = Date.now();
  sesiones.set(telefono, sesion);
}

function resetearSesion(telefono) {
  return crearSesion(telefono);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatearPrecio(valor) {
  if (!valor && valor !== 0) return 'precio no disponible';
  return `$${Number(valor).toLocaleString('es-CO')}`;
}

function normalizarTexto(texto) {
  return (texto || '').toLowerCase().trim();
}

function esCancelar(msg) {
  const t = normalizarTexto(msg);
  return ['cancelar', 'salir', '0', 'cancel'].includes(t);
}

function esVerCarrito(msg) {
  return normalizarTexto(msg) === 'carrito';
}

function esMenu(msg) {
  return ['menu', 'menú', 'inicio', 'volver'].includes(normalizarTexto(msg));
}

function totalCarrito(carrito) {
  return carrito.reduce((acc, item) => acc + item.subtotal, 0);
}

function textoCarrito(carrito) {
  if (!carrito || carrito.length === 0) return '🛒 Tu carrito está vacío.';
  let texto = '🛒 *Tu carrito:*\n';
  carrito.forEach(item => {
    texto += `• ${item.nombre} x${item.cantidad} - ${formatearPrecio(item.subtotal)}\n`;
  });
  return texto.trimEnd();
}

function generarNumeroPedido(id) {
  const anio = new Date().getFullYear();
  const numero = String(id).padStart(4, '0');
  return `DV-${anio}-${numero}`;
}

// ─── Seguimiento de pedidos ───────────────────────────────────────────────────

const STATUS_INFO = {
  pendiente:      { icon: '⏳', texto: 'Pedido recibido, en espera de confirmación' },
  confirmado:     { icon: '✅', texto: 'Confirmado — preparando tu pedido' },
  en_preparacion: { icon: '🔄', texto: 'Preparando tu pedido' },
  en_camino:      { icon: '🛵', texto: 'Tu domiciliario está en camino' },
  entregado:      { icon: '✅✅', texto: 'Entregado exitosamente' },
  cancelado:      { icon: '❌', texto: 'Cancelado' },
  // B2B
  cotizacion:     { icon: '📋', texto: 'Cotización generada' },
  pagada:         { icon: '💳', texto: 'Pago confirmado — preparando despacho' },
  enviada:        { icon: '🛵', texto: 'En camino a tu droguería' },
  pago_pendiente: { icon: '⏳', texto: 'Esperando comprobante de pago' },
};

function tiempoDesde(fechaISO) {
  if (!fechaISO) return null;
  const diff = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 1000);
  if (diff < 60)  return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)}h`;
}

function formatearEstado(numero, status, mensajero, esBB2 = false) {
  const info = STATUS_INFO[status] || { icon: '•', texto: status };
  const tipo = esBB2 ? '🏪 *Orden de Compra*' : '📦 *Pedido*';

  let msg = `${tipo} *${numero}*\n\n${info.icon} ${info.texto}\n`;

  if (mensajero && ['en_camino', 'enviada'].includes(status)) {
    msg += `\n👤 Domiciliario: *${mensajero.nombre}*\n`;
    msg += `📞 ${mensajero.telefono}\n`;

    if (mensajero.ultima_lat && mensajero.ultima_lng) {
      const hace = tiempoDesde(mensajero.ultima_ubicacion_at);
      msg += `\n📍 *Ubicación en tiempo real* (hace ${hace || '?'}):\n`;
      msg += `https://maps.google.com/?q=${mensajero.ultima_lat},${mensajero.ultima_lng}\n`;
      msg += `_(actualiza cuando el domiciliario comparte su ubicación)_\n`;
    } else {
      msg += `\n_El domiciliario no ha compartido su ubicación aún._\n`;
    }
  }

  if (status === 'entregado' || status === 'entregada') {
    msg += `\n¡Gracias por tu compra en *Droguería Virtual*! 💊`;
  }

  return msg;
}

/**
 * Detecta si el mensaje es una consulta de seguimiento.
 * Reconoce: "seguimiento", "donde esta", "estado", "mis pedidos",
 * número de pedido "DV-XXXX" o número de orden "DV-OC-XXXX".
 */
function esSeguimiento(msg) {
  const t = normalizarTexto(msg);
  if (['seguimiento', 'rastrear', 'rastreo', 'donde esta', 'dónde está',
       'estado pedido', 'estado del pedido', 'mis pedidos',
       'como va mi pedido', 'cómo va mi pedido'].some(k => t.includes(k))) return true;
  if (/^dv-\d{4}-\d+$/i.test(t.trim()))    return true;  // B2C: DV-2026-0001
  if (/^dv-oc-\d{4}-\d+$/i.test(t.trim())) return true;  // B2B: DV-OC-2026-0001
  return false;
}

/**
 * Busca mensajero por id y retorna datos de GPS (query separada para evitar
 * fallos de FK en PostgREST cuando mensajero_id es null o FK no está cacheada).
 */
async function getMensajeroParaSeguimiento(mensajeroId) {
  if (!mensajeroId) return null;
  const { data } = await supabase
    .from('mensajeros')
    .select('nombre, telefono, ultima_lat, ultima_lng, ultima_ubicacion_at')
    .eq('id', mensajeroId)
    .maybeSingle();
  return data || null;
}

/**
 * Maneja consultas de seguimiento para B2C y B2B.
 * Busca por número de pedido/orden específico, o por teléfono del cliente.
 */
async function manejarSeguimiento(telefono, mensaje) {
  const txt   = (mensaje || '').trim().toUpperCase();
  const upper = txt;

  // ── Número de orden B2B específico: DV-OC-XXXX ───────────────────────────
  if (/^DV-OC-\d{4}-\d+$/.test(upper)) {
    const { data: orden, error: errOrden } = await supabase
      .from('ordenes_compra')
      .select('numero_orden, status, total, created_at, enviada_at, entregada_at, mensajero_id')
      .eq('numero_orden', upper)
      .maybeSingle();

    if (errOrden) console.error('[Bot] seguimiento B2B error:', errOrden.message);
    if (!orden) return `❌ No encontré la orden *${upper}*. Verifica el número.`;
    const mensajero = await getMensajeroParaSeguimiento(orden.mensajero_id);
    return formatearEstado(orden.numero_orden, orden.status, mensajero, true);
  }

  // ── Número de pedido B2C específico: DV-XXXX ──────────────────────────────
  if (/^DV-\d{4}-\d+$/.test(upper)) {
    const { data: pedido, error: errPedido } = await supabase
      .from('pedidos')
      .select('numero_pedido, status, total, created_at, entregado_at, mensajero_id')
      .eq('numero_pedido', upper)
      .maybeSingle();

    if (errPedido) console.error('[Bot] seguimiento B2C error:', errPedido.message);
    if (!pedido) return `❌ No encontré el pedido *${upper}*. Verifica el número.`;
    const mensajero = await getMensajeroParaSeguimiento(pedido.mensajero_id);
    return formatearEstado(pedido.numero_pedido, pedido.status, mensajero, false);
  }

  // ── Buscar por teléfono: últimos pedidos B2C + B2B ────────────────────────
  // Intentar también con +57 prefijo por si el número fue guardado con código de país
  const telefonoAlt = telefono.startsWith('57') ? telefono.slice(2) : `57${telefono}`;

  const [{ data: pedidos }, { data: ordenes }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('numero_pedido, status, total, created_at, mensajero_id')
      .or(`cliente_telefono.eq.${telefono},cliente_telefono.eq.${telefonoAlt}`)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('ordenes_compra')
      .select('numero_orden, status, total, created_at, mensajero_id')
      .or(`compradora_telefono.eq.${telefono},compradora_telefono.eq.${telefonoAlt}`)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const todosPedidos = [
    ...(pedidos  || []).map(p => ({ ...p, tipo: 'b2c', numero: p.numero_pedido })),
    ...(ordenes  || []).map(o => ({ ...o, tipo: 'b2b', numero: o.numero_orden  })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (!todosPedidos.length) {
    return (
      `📭 No encontré pedidos para tu número.\n\n` +
      `Si tienes el número de pedido, escríbelo directamente:\n` +
      `Ej: *DV-2026-0001* o *DV-OC-2026-0001*`
    );
  }

  // Si hay un solo pedido activo, mostrar su detalle completo
  const activos = todosPedidos.filter(p =>
    !['entregado', 'entregada', 'cancelado'].includes(p.status)
  );

  if (activos.length === 1) {
    const p = activos[0];
    const mensajero = await getMensajeroParaSeguimiento(p.mensajero_id);
    return formatearEstado(p.numero, p.status, mensajero, p.tipo === 'b2b');
  }

  // Más de uno → listar todos
  const lista = todosPedidos.map(p => {
    const info = STATUS_INFO[p.status] || { icon: '•' };
    const tipo = p.tipo === 'b2b' ? '🏪' : '📦';
    const fecha = new Date(p.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    const total = p.total ? ` | $${Number(p.total).toLocaleString('es-CO')}` : '';
    return `${tipo} *${p.numero}* ${info.icon}${total} | ${fecha}`;
  }).join('\n');

  return (
    `📋 *Tus últimos pedidos:*\n\n${lista}\n\n` +
    `Escribe el número de pedido para ver el detalle y la ubicación del domiciliario.\n` +
    `Ej: *${todosPedidos[0].numero}*`
  );
}

// ─── Mensajes predefinidos ────────────────────────────────────────────────────

const MSG_BIENVENIDA = `💊 ¡Hola! Bienvenido a *Droguería Virtual* 🏥

¿Qué medicamento necesitas hoy?
Escríbeme el nombre y te digo si lo tenemos disponible 👇`;

const MSG_CANCELAR_REINICIAR = `✅ Listo, empezamos de cero.

💊 ¿Qué medicamento necesitas?
Escríbeme el nombre y te digo si lo tenemos disponible 👇`;

// ─── PASO 0: Bienvenida ────────────────────────────────────────────────────────

function manejarInicio(telefono) {
  const sesion = crearSesion(telefono);
  sesion.estado = ESTADOS.BUSCANDO;
  guardarSesion(telefono, sesion);
  return MSG_BIENVENIDA;
}

// ─── PASO 1: Búsqueda de medicamento ─────────────────────────────────────────

async function manejarBusqueda(telefono, mensaje, sesion) {
  const termino = securityService.sanitizeInput
    ? securityService.sanitizeInput(mensaje.trim())
    : mensaje.trim();

  if (termino.length < 2) {
    return '🤔 Escríbeme al menos 2 letras del medicamento que buscas:';
  }

  let resultados = [];
  try {
    const cacheKey = `busqueda:${termino.toLowerCase()}`;
    const cached   = cache.get(cacheKey);

    if (cached) {
      resultados = cached;
    } else {
      const { data } = await medicamentoService.buscarMedicamentosConPrecio(termino, { limit: 5 });
      resultados = data || [];
      if (resultados.length > 0) cache.set(cacheKey, resultados, 120);
    }
  } catch (err) {
    console.error('[Bot] Error búsqueda medicamento:', err.message);
    return '😕 Tuve un problema buscando ese medicamento. Intenta de nuevo o escribe otro nombre:';
  }

  if (resultados.length === 0) {
    return (
      `Lo siento, no tenemos *"${termino}"* disponible en este momento.\n\n` +
      '¿Deseas buscar otro medicamento? Escríbeme el nombre 👇'
    );
  }

  // Guardar resultados y cambiar estado
  sesion.resultados_busqueda = resultados.slice(0, 5);
  sesion.estado = ESTADOS.SELECCIONANDO;
  guardarSesion(telefono, sesion);

  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  let respuesta = '🔍 Encontré lo siguiente:\n\n';

  sesion.resultados_busqueda.forEach((med, i) => {
    const nombre = med.nombre || 'Medicamento';
    const conc   = med.concentracion ? ` ${med.concentracion}` : '';
    const pres   = med.presentacion  ? ` - ${med.presentacion}` : '';
    const precio = med.precio ? `\n   💰 ${formatearPrecio(med.precio)}` : '';
    const stock  = med.stock > 0 ? `   ✅ Disponible (${med.stock} uds)` : '   ✅ Disponible';

    respuesta += `${emojis[i]} *${nombre}${conc}${pres}*${precio}\n${stock}\n\n`;
  });

  respuesta += '¿Cuál necesitas? Responde con el número 👆\nO escribe *agregar otro* para buscar otro medicamento';
  return respuesta;
}

// ─── PASO 2: Selección y cantidad ────────────────────────────────────────────

async function manejarSeleccion(telefono, mensaje, sesion) {
  const limpio = normalizarTexto(mensaje);

  // Si quiere buscar otro medicamento
  if (limpio === 'agregar otro' || limpio === 'otro' || limpio === 'buscar otro') {
    sesion.estado = ESTADOS.BUSCANDO;
    guardarSesion(telefono, sesion);
    return '🔎 ¿Qué medicamento necesitas? Escríbeme el nombre:';
  }

  const idx = parseInt(mensaje.trim(), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= sesion.resultados_busqueda.length) {
    return `⚠️ Elige un número del 1 al ${sesion.resultados_busqueda.length}, o escribe *agregar otro* para buscar otro medicamento.`;
  }

  const med = sesion.resultados_busqueda[idx];
  sesion.medicamento_temp = med;
  sesion.estado = ESTADOS.CANTIDAD;
  guardarSesion(telefono, sesion);

  const nombre = med.nombre || 'Medicamento';
  const conc   = med.concentracion ? ` ${med.concentracion}` : '';
  const pres   = med.presentacion  ? ` - ${med.presentacion}` : '';

  return `✅ Seleccionaste: *${nombre}${conc}${pres}*\n\n¿Cuántas unidades necesitas?`;
}

// ─── PASO 2b: Recibir cantidad y agregar al carrito ──────────────────────────

async function manejarCantidad(telefono, mensaje, sesion) {
  const cantidad = parseInt(mensaje.trim(), 10);

  if (isNaN(cantidad) || cantidad < 1 || cantidad > 99) {
    return '⚠️ Dime cuántas unidades necesitas (número entre 1 y 99):';
  }

  const med      = sesion.medicamento_temp;
  const precio   = Number(med.precio) || 0;
  const subtotal = precio * cantidad;

  const nombre = med.nombre || 'Medicamento';
  const conc   = med.concentracion ? ` ${med.concentracion}` : '';
  const pres   = med.presentacion  ? ` - ${med.presentacion}` : '';
  const nombreCompleto = `${nombre}${conc}${pres}`;

  // Buscar si ya está en el carrito para actualizar cantidad
  const existente = sesion.carrito.find(
    item => item.medicamento_id === med.id
  );

  if (existente) {
    existente.cantidad += cantidad;
    existente.subtotal  = existente.precio_unitario * existente.cantidad;
  } else {
    sesion.carrito.push({
      nombre:          nombreCompleto,
      cantidad,
      precio_unitario: precio,
      subtotal,
      medicamento_id:  med.id,
      catalogo_id:     med.catalogo_id || null,
    });
  }

  sesion.medicamento_temp = null;
  sesion.estado = ESTADOS.CARRITO;
  guardarSesion(telefono, sesion);

  const total = totalCarrito(sesion.carrito);
  let respuesta = `✅ Agregado al carrito!\n\n${textoCarrito(sesion.carrito)}\n`;
  respuesta += `\nTotal provisional: ${formatearPrecio(total)}\n\n`;
  respuesta += '¿Deseas agregar otro medicamento? Responde:\n';
  respuesta += '*SI* - buscar otro medicamento\n';
  respuesta += '*NO* - continuar con el pedido';

  return respuesta;
}

// ─── PASO 3: ¿Agregar otro o continuar? ──────────────────────────────────────

function manejarCarrito(telefono, mensaje, sesion) {
  const limpio = normalizarTexto(mensaje);

  if (limpio === 'si' || limpio === 'sí' || limpio === 's') {
    sesion.estado = ESTADOS.BUSCANDO;
    guardarSesion(telefono, sesion);
    return '🔎 ¿Qué otro medicamento necesitas? Escríbeme el nombre:';
  }

  if (limpio === 'no' || limpio === 'n') {
    return mostrarResumenPedido(telefono, sesion);
  }

  return '⚠️ Responde *SI* para agregar otro medicamento o *NO* para continuar con el pedido.';
}

// ─── PASO 4: Resumen y confirmación ──────────────────────────────────────────

function mostrarResumenPedido(telefono, sesion) {
  sesion.estado = ESTADOS.CONFIRMACION;
  guardarSesion(telefono, sesion);

  const subtotal = totalCarrito(sesion.carrito);
  const total    = subtotal + COSTO_DOMICILIO;

  let texto = '📋 *Resumen de tu pedido:*\n\n';
  sesion.carrito.forEach(item => {
    texto += `• ${item.nombre} x${item.cantidad} - ${formatearPrecio(item.subtotal)}\n`;
  });

  texto += `\nSubtotal: ${formatearPrecio(subtotal)}\n`;
  texto += `🛵 Domicilio: ${formatearPrecio(COSTO_DOMICILIO)}\n`;
  texto += `━━━━━━━━━━━\n`;
  texto += `💰 *Total: ${formatearPrecio(total)}*\n\n`;
  texto += '¿Confirmamos el pedido? Responde *SI* o *NO*';

  return texto;
}

function manejarConfirmacion(telefono, mensaje, sesion) {
  const limpio = normalizarTexto(mensaje);

  if (limpio === 'si' || limpio === 'sí' || limpio === 's') {
    return solicitarUbicacion(telefono, sesion);
  }

  if (limpio === 'no' || limpio === 'n') {
    resetearSesion(telefono);
    return '❌ Pedido cancelado. Si quieres hacer uno nuevo, escríbeme el nombre del medicamento que necesitas 💊';
  }

  return '⚠️ Responde *SI* para confirmar el pedido o *NO* para cancelarlo.';
}

// ─── PASO 5: Solicitar ubicación GPS ─────────────────────────────────────────

function solicitarUbicacion(telefono, sesion) {
  sesion.estado = ESTADOS.UBICACION;
  guardarSesion(telefono, sesion);

  return (
    '📍 Perfecto! Ahora necesito tu ubicación para el domicilio.\n\n' +
    'Por favor comparte tu *ubicación en tiempo real* desde WhatsApp:\n' +
    '📌 Toca el clip (📎) > Ubicación > Compartir ubicación actual\n\n' +
    'Esto nos permite asignar el mensajero más rápido 🛵'
  );
}

function manejarUbicacion(telefono, sesion, contexto) {
  // Verificar si llegó ubicación GPS de Twilio (Latitude / Longitude en el body)
  const lat = contexto?.location?.latitude;
  const lng = contexto?.location?.longitude;

  if (!lat || !lng) {
    return (
      '📍 Aún no recibo tu ubicación.\n\n' +
      'Por favor comparte tu *ubicación en tiempo real* desde WhatsApp:\n' +
      '📌 Toca el clip (📎) > Ubicación > Compartir ubicación actual'
    );
  }

  sesion.datos.ubicacion = {
    lat,
    lng,
    label: contexto.location.label || contexto.location.address || null,
  };
  sesion.estado = ESTADOS.NOMBRE;
  guardarSesion(telefono, sesion);

  return (
    '✅ Ubicación recibida 📍\n\n' +
    'Ahora necesito tus datos para el pedido:\n\n' +
    '👤 ¿Cuál es tu *nombre completo*?'
  );
}

// ─── PASO 6: Nombre del cliente ───────────────────────────────────────────────

function manejarNombre(telefono, mensaje, sesion) {
  const nombre = (securityService.sanitizeInput
    ? securityService.sanitizeInput(mensaje.trim())
    : mensaje.trim());

  if (nombre.length < 2) {
    return '👤 Por favor escríbeme tu nombre completo:';
  }

  sesion.datos.nombre = nombre;
  sesion.estado = ESTADOS.CEDULA;
  guardarSesion(telefono, sesion);

  return '📋 ¿Cuál es tu número de *cédula*?';
}

// ─── PASO 7: Cédula ───────────────────────────────────────────────────────────

function manejarCedula(telefono, mensaje, sesion) {
  const cedula = mensaje.trim().replace(/\D/g, ''); // Solo dígitos

  if (cedula.length < 6 || cedula.length > 12) {
    return '📋 Por favor escribe un número de cédula válido (sin puntos ni espacios):';
  }

  sesion.datos.cedula = cedula;
  sesion.estado = ESTADOS.TC;
  guardarSesion(telefono, sesion);

  return (
    '📜 *Términos y Condiciones de Droguería Virtual*\n\n' +
    'Al confirmar este pedido aceptas:\n' +
    '✅ Los precios indicados incluyen IVA\n' +
    '✅ El domicilio tiene un costo de $4.000\n' +
    '✅ Los medicamentos con fórmula médica requieren presentarla al mensajero\n' +
    '✅ El tiempo de entrega estimado es 30-45 minutos\n' +
    '✅ El pago debe realizarse antes de confirmar el pedido\n' +
    '✅ No se aceptan devoluciones de medicamentos\n\n' +
    '¿Aceptas estos términos? Responde *ACEPTO* o *NO ACEPTO*'
  );
}

// ─── PASO 8: Términos y condiciones ───────────────────────────────────────────

async function manejarTC(telefono, mensaje, sesion) {
  const limpio = normalizarTexto(mensaje);

  if (limpio === 'acepto' || limpio === 'si' || limpio === 'sí' || limpio === 'aceptar') {
    return await mostrarInstruccionesPago(telefono, sesion);
  }

  if (limpio === 'no acepto' || limpio === 'no' || limpio === 'rechazar') {
    resetearSesion(telefono);
    return (
      '😔 Entendido. Sin aceptar los términos no podemos procesar el pedido.\n\n' +
      'Si cambias de opinión, escríbeme el nombre del medicamento que necesitas 💊'
    );
  }

  return '⚠️ Por favor responde *ACEPTO* o *NO ACEPTO* para continuar.';
}

// ─── PASO 9: Instrucciones de pago ───────────────────────────────────────────

/**
 * Si Wompi está configurado: crea el pedido en BD, genera link de pago y lo
 * envía al cliente. El webhook de Wompi se encarga del flujo post-pago.
 *
 * Si Wompi NO está configurado: cae al modo legacy (Nequi/Daviplata + screenshot).
 */
async function mostrarInstruccionesPago(telefono, sesion) {
  const subtotal = totalCarrito(sesion.carrito);
  const total    = subtotal + COSTO_DOMICILIO;
  const datos    = sesion.datos || {};

  // ── MODO WOMPI (recomendado): pago automatizado ──────────────────────────
  if (WOMPI_HABILITADO) {
    try {
      const numeroPedido = `DV-${new Date().getFullYear()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

      // Crear el pedido con status 'pendiente_pago'
      const { data: pedido, error } = await supabase
        .from('pedidos')
        .insert({
          numero_pedido:     numeroPedido,
          drogueria_id:      null,
          cliente_telefono:  telefono,
          cliente_nombre:    datos.nombre  || null,
          cliente_cedula:    datos.cedula  || null,
          cliente_direccion: datos.ubicacion?.label || 'Ubicación GPS',
          cliente_lat:       datos.ubicacion?.lat || null,
          cliente_lng:       datos.ubicacion?.lng || null,
          modalidad:         'domicilio',
          total:             total,
          costo_domicilio:   COSTO_DOMICILIO,
          metodo_pago:       'wompi',
          status:            'pendiente_pago',
          tc_aceptado:       true,
          tc_aceptado_at:    new Date().toISOString(),
          canal:             'whatsapp',
          es_b2c:            true,
        })
        .select()
        .single();

      if (error) throw error;

      // Insertar detalles
      const detalles = sesion.carrito.map(item => ({
        pedido_id:          pedido.id,
        medicamento_id:     item.medicamento_id || null,
        catalogo_id:        item.catalogo_id    || null,
        nombre_medicamento: item.nombre,
        cantidad:           item.cantidad,
        precio_unitario:    item.precio_unitario,
        subtotal:           item.subtotal,
        requiere_formula:   false,
      }));
      await supabase.from('detalle_pedidos').insert(detalles);

      // Generar link Wompi
      const linkResult = await wompiService.crearLinkPago({
        pedidoId:        pedido.id,
        numeroPedido:    pedido.numero_pedido,
        total:           total,
        clienteNombre:   datos.nombre,
        clienteTelefono: telefono,
      });

      if (!linkResult.success) {
        console.warn('[Bot] Wompi falló, fallback a Nequi/Daviplata');
        return mostrarInstruccionesPagoLegacy(telefono, sesion, total);
      }

      // El webhook se encarga de descontar stock + asignar mensajero
      resetearSesion(telefono);

      return (
        `💳 *¡Tu pedido está listo!*\n\n` +
        `📦 *${pedido.numero_pedido}*\n` +
        `💰 Total: ${formatearPrecio(total)}\n\n` +
        `🔗 *Paga aquí de forma segura:*\n${linkResult.urlPago}\n\n` +
        `Aceptamos:\n` +
        `💳 Tarjeta débito / crédito\n` +
        `🏦 PSE — Bancolombia / Daviplata / Nequi\n\n` +
        `_El link expira en 1 hora._\n\n` +
        `Cuando confirmemos tu pago te avisamos por aquí y asignamos tu domiciliario 🛵`
      );

    } catch (err) {
      console.error('[Bot] Error en flujo Wompi:', err.message);
      return mostrarInstruccionesPagoLegacy(telefono, sesion, total);
    }
  }

  // ── MODO LEGACY: Nequi/Daviplata manual ──────────────────────────────────
  return mostrarInstruccionesPagoLegacy(telefono, sesion, total);
}

/** Modo legacy: Nequi/Daviplata + screenshot manual. */
function mostrarInstruccionesPagoLegacy(telefono, sesion, total) {
  sesion.estado = ESTADOS.COMPROBANTE;
  guardarSesion(telefono, sesion);

  return (
    '💳 *Instrucciones de Pago*\n\n' +
    `Tu pedido: ${formatearPrecio(total)}\n\n` +
    'Por favor realiza la transferencia a:\n\n' +
    `📱 *Nequi:* ${NEQUI_NUMERO}\n` +
    `   Nombre: ${NOMBRE_CUENTA}\n\n` +
    `📱 *Daviplata:* ${DAVIPLATA_NUMERO}\n` +
    `   Nombre: ${NOMBRE_CUENTA}\n\n` +
    '⚠️ *Importante:* Después de pagar, envía el *comprobante de pago* (foto o captura) a este chat.\n\n' +
    '¡Te esperamos! 🕐'
  );
}

// ─── PASO 10: Recepción del comprobante ──────────────────────────────────────

async function manejarComprobante(telefono, sesion, contexto) {
  const mediaUrl = contexto?.mediaUrl;

  if (!mediaUrl) {
    return (
      '📸 Aún no recibo tu comprobante de pago.\n\n' +
      'Por favor envía una *foto o captura* del comprobante de transferencia en este chat.'
    );
  }

  sesion.datos.comprobante = mediaUrl;
  guardarSesion(telefono, sesion);

  // Notificar que estamos procesando
  // (la respuesta inmediata va primero)
  const procesando = '✅ *¡Comprobante recibido!*\n\nEstamos verificando tu pago... ⏳';

  // Crear el pedido en Supabase de forma asíncrona
  // Usamos setImmediate para responder rápido y luego procesar
  setImmediate(async () => {
    try {
      await procesarPedidoFinal(telefono, sesion);
    } catch (err) {
      console.error('[Bot] Error procesando pedido final:', err.message);
      try {
        await sendWhatsAppMessage(
          telefono,
          '😕 Tuve un problema procesando tu pedido. Un asesor te contactará pronto.'
        );
      } catch (e) {
        console.error('[Bot] Error enviando mensaje de error:', e.message);
      }
    }
  });

  return procesando;
}

// ─── PASO 11: Crear pedido y notificar ───────────────────────────────────────

async function procesarPedidoFinal(telefono, sesion) {
  const { carrito, datos } = sesion;
  const subtotal = totalCarrito(carrito);
  const total    = subtotal + COSTO_DOMICILIO;

  // Construir payload para PedidoService
  const datosPedido = {
    drogueriaId:      null,               // Bot único, sin droguería específica
    clienteTelefono:  telefono,
    clienteNombre:    datos.nombre        || null,
    clienteDireccion: datos.ubicacion?.label || 'Ubicación GPS compartida',
    clienteBarrio:    null,
    modalidad:        'domicilio',
    metodoPago:       'nequi_daviplata',
    notas:            `Cédula: ${datos.cedula || 'N/A'} | Lat: ${datos.ubicacion?.lat || 'N/A'} | Lng: ${datos.ubicacion?.lng || 'N/A'}`,
    formulaMedicaUrl: null,
    tieneFormula:     false,
    canal:            'whatsapp',
    items: carrito.map(item => ({
      catalogoId:        item.catalogo_id     || null,
      medicamentoId:     item.medicamento_id  || null,
      nombreMedicamento: item.nombre,
      cantidad:          item.cantidad,
      precioUnitario:    item.precio_unitario,
      requiereFormula:   false,
    })),
  };

  let pedido;
  try {
    pedido = await pedidoService.crearPedido(datosPedido);
  } catch (err) {
    // Si falla la creación por drogueriaId null, intentar sin validación estricta
    // insertando directamente en supabase como fallback
    console.error('[Bot] crearPedido falló, usando fallback directo:', err.message);

    const { data: pedidoRaw, error: errRaw } = await supabase
      .from('pedidos')
      .insert({
        drogueria_id:      null,
        cliente_telefono:  telefono,
        cliente_nombre:    datos.nombre    || null,
        cliente_cedula:    datos.cedula    || null,
        cliente_direccion: datos.ubicacion?.label || 'Ubicación GPS compartida',
        cliente_lat:       datos.ubicacion?.lat   || null,
        cliente_lng:       datos.ubicacion?.lng   || null,
        modalidad:         'domicilio',
        total:             total,
        costo_domicilio:   COSTO_DOMICILIO,
        metodo_pago:       'nequi_daviplata',
        notas:             `Cédula: ${datos.cedula || 'N/A'} | Lat: ${datos.ubicacion?.lat || 'N/A'} | Lng: ${datos.ubicacion?.lng || 'N/A'}`,
        comprobante_url:   datos.comprobante || null,
        tiene_formula:     false,
        tc_aceptado:       true,
        canal:             'whatsapp',
        es_b2c:            true,
        status:            'pendiente',
      })
      .select()
      .single();

    if (errRaw) throw errRaw;
    pedido = pedidoRaw;

    // Insertar detalles
    const detalles = carrito.map(item => ({
      pedido_id:          pedido.id,
      medicamento_id:     item.medicamento_id || null,
      catalogo_id:        item.catalogo_id    || null,
      nombre_medicamento: item.nombre,
      cantidad:           item.cantidad,
      precio_unitario:    item.precio_unitario,
      subtotal:           item.subtotal,
      requiere_formula:   false,
    }));

    await supabase.from('detalle_pedidos').insert(detalles);
  }

  const numeroPedido = pedido.numero_pedido || generarNumeroPedido(pedido.id);

  // ── Registrar fee B2C ────────────────────────────────────────────────────
  // Calcula y guarda el fee de plataforma sobre este pedido.
  try {
    await feeService.registrarFeeEnPedido(pedido.id || pedido, total);
  } catch (errFee) {
    console.warn(`[Bot] Fee no registrado (${numeroPedido}):`, errFee.message);
  }

  // ── Descontar inventario ──────────────────────────────────────────────────
  // Se ejecuta después de confirmar el pedido. Si el stock ya no alcanza
  // (race condition), se registra la advertencia pero no se cancela el pedido.
  try {
    const pedidoId = pedido.id || pedido;
    await inventarioService.descontarStock(pedidoId);
    console.log(`[Bot] Stock descontado para pedido ${numeroPedido}`);
  } catch (errInv) {
    // Stock insuficiente u otro error: loguear pero no abortar el flujo
    console.warn(`[Bot] Advertencia al descontar stock (${numeroPedido}):`, errInv.message);
  }

  // ── Asignación TURBO B2C (proximidad GPS + ETA real) ─────────────────────
  let etaTexto = '30-45 minutos';
  let mensajeroNombre   = null;
  let mensajeroTelefono = null;

  try {
    const resAsig = await asignacionService.asignarTurboB2C({
      pedidoId:      pedido.id,
      drogueriaId:   pedido.drogueria_id || null,
      clienteLat:    datos.ubicacion?.lat   || null,
      clienteLng:    datos.ubicacion?.lng   || null,
      clienteNombre: datos.nombre           || 'Cliente',
      clienteTel:    telefono,
    });

    if (resAsig.success && resAsig.mensajero) {
      mensajeroNombre   = resAsig.mensajero.nombre;
      mensajeroTelefono = resAsig.mensajero.telefono;
      etaTexto          = resAsig.etaTexto || etaTexto;

      if (resAsig.alerta_admin) {
        console.warn(`[Bot][Admin Alert] ${resAsig.alerta_admin}`);
      }
    } else {
      console.warn('[Bot] TURBO sin mensajero:', resAsig.error);
    }
  } catch (errAsig) {
    console.warn('[Bot] Error en asignación turbo:', errAsig.message);
  }

  // Limpiar sesión
  resetearSesion(telefono);

  // Mensaje final al cliente con ETA real
  let msgFinal = `🎉 *¡Pedido Confirmado!*\n\n📦 Número de pedido: *${numeroPedido}*\n\n`;

  if (mensajeroNombre) {
    msgFinal += `⚡ *Tu domiciliario* ya fue asignado:\n`;
    msgFinal += `👤 *${mensajeroNombre}*\n`;
    msgFinal += `📞 ${mensajeroTelefono}\n\n`;
    msgFinal += `⏱️ Tiempo estimado: *${etaTexto}*\n\n`;
    msgFinal += `📍 Escribe *seguimiento* en cualquier momento para rastrear tu pedido.`;
  } else {
    msgFinal += `Estamos asignando tu domiciliario 🛵\n\n`;
    msgFinal += `⏱️ Tiempo estimado: *${etaTexto}*\n\n`;
    msgFinal += `📍 Escribe *seguimiento* para ver el estado de tu pedido.`;
  }

  msgFinal += '\n\n¡Gracias por tu compra en Droguería Virtual! 💊';

  await sendWhatsAppMessage(telefono, msgFinal);
}

// ─── Flujo B2B: droguería comprando al por mayor ──────────────────────────────

/**
 * Maneja el flujo completo de compra B2B para una droguería registrada.
 *
 * Flujo:
 *   MENÚ       → opciones: cotizar / ver órdenes / estado envío
 *   BUSCANDO   → busca medicamento por nombre (precios mayoristas)
 *   SELECCIONANDO → elige de la lista de resultados
 *   CANTIDAD   → ingresa cantidad (mínimo según tabla)
 *   CARRITO    → revisa carrito, ¿agregar más? SI/NO
 *   COTIZACION → muestra cotización formal, ¿confirmar? SI/NO
 *   PAGO       → instrucciones de pago Nequi/Daviplata
 *   COMPROBANTE → recibe imagen, crea orden, descuenta stock, asigna mensajero
 */
async function manejarFlujoB2B(drogueria, telefono, mensaje, contexto) {
  const txt   = (mensaje || '').trim();
  const upper = txt.toUpperCase();
  const sesion = obtenerSesion(telefono);

  // Comandos globales B2B
  if (['CANCELAR', 'SALIR', '0', 'MENU', 'INICIO'].includes(upper)) {
    sesion.estado = ESTADOS.B2B_MENU;
    sesion.carrito = [];
    sesion.b2b = {};
    guardarSesion(telefono, sesion);
    return await b2bService.construirMenuB2B(drogueria);
  }

  // Si aún no tenemos sub-objeto b2b en la sesión, inicializarlo
  if (!sesion.b2b) sesion.b2b = {};

  // ── MENÚ / INICIO ─────────────────────────────────────────────────────────
  if (sesion.estado === ESTADOS.INICIO || sesion.estado === ESTADOS.B2B_MENU) {

    // Opción 2: ver mis órdenes
    if (txt === '2' || upper.includes('MIS ORDENES') || upper.includes('VER ORDENES')) {
      const ordenes = await b2bService.listarOrdenesCompra(drogueria.id, 5);
      if (!ordenes.length) {
        return `📭 *${drogueria.nombre}* aún no tiene órdenes de compra.\n\nEscribe *1* para cotizar medicamentos 💊`;
      }
      const lista = ordenes.map(o => {
        const statusIcon = { cotizacion:'📋', confirmada:'✅', pagada:'💳', en_preparacion:'🔄', enviada:'🛵', entregada:'✅✅', cancelada:'❌' }[o.status] || '•';
        const fecha = new Date(o.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
        return `${statusIcon} *${o.numero_orden}* | ${fecha} | $${Number(o.total).toLocaleString('es-CO')}`;
      }).join('\n');
      return `📦 *Tus últimas órdenes de compra:*\n\n${lista}\n\nEscribe *1* para nueva cotización.`;
    }

    // Opción 1 o cualquier otra cosa → cotizar
    sesion.estado = ESTADOS.B2B_BUSCANDO;
    sesion.carrito = [];
    sesion.b2b = { drogueria_id: drogueria.id };
    guardarSesion(telefono, sesion);
    return (
      `🏪 *${drogueria.nombre}* — Portal B2B\n\n` +
      `💊 ¿Qué medicamento deseas cotizar?\n\n` +
      `Escribe el nombre del medicamento (ej: *acetaminofen*, *ibuprofeno*).\n\n` +
      `_Precios especiales mayoristas aplican según volumen._`
    );
  }

  // ── BUSCANDO ──────────────────────────────────────────────────────────────
  if (sesion.estado === ESTADOS.B2B_BUSCANDO) {
    let resultados;
    try {
      resultados = await b2bService.buscarMedicamentosB2B(txt);
    } catch (err) {
      console.error('[Bot B2B] buscarMedicamentosB2B error:', err.message);
      return '⚠️ Error buscando medicamentos. Intenta de nuevo.';
    }

    if (!resultados || resultados.length === 0) {
      return (
        `😕 No encontré *"${txt}"* en el catálogo mayorista.\n\n` +
        `Intenta con otro nombre o escribe *menu* para volver.`
      );
    }

    sesion.b2b.resultados = resultados;
    sesion.estado = ESTADOS.B2B_SELECCIONANDO;
    guardarSesion(telefono, sesion);

    const lineas = resultados.slice(0, 6).map((r, i) => {
      const minimo = r.cantidad_minima || 10;
      return (
        `${i + 1}️⃣ *${r.nombre}* ${r.presentacion || ''}\n` +
        `   🏭 ${r.laboratorio || 'N/A'}\n` +
        `   💰 $${Number(r.precio_mayorista).toLocaleString('es-CO')}/und | Mín: ${minimo} und\n` +
        `   📦 Stock: ${r.stock} und`
      );
    }).join('\n\n');

    return `🔍 *Resultados para "${txt}":*\n\n${lineas}\n\n¿Cuál necesitas? Responde con el número 👆`;
  }

  // ── SELECCIONANDO ─────────────────────────────────────────────────────────
  if (sesion.estado === ESTADOS.B2B_SELECCIONANDO) {
    const idx = parseInt(txt, 10) - 1;
    const resultados = sesion.b2b.resultados || [];
    if (isNaN(idx) || idx < 0 || idx >= resultados.length) {
      return `Por favor responde con un número del 1 al ${resultados.length}.`;
    }
    sesion.b2b.itemSeleccionado = resultados[idx];
    sesion.estado = ESTADOS.B2B_CANTIDAD;
    guardarSesion(telefono, sesion);

    const item = resultados[idx];
    const minimo = item.cantidad_minima || 10;
    return (
      `✅ *${item.nombre}* seleccionado.\n\n` +
      `💰 Precio mayorista: *$${Number(item.precio_mayorista).toLocaleString('es-CO')}/und*\n` +
      `📦 Stock disponible: *${item.stock} unidades*\n\n` +
      `¿Cuántas unidades necesitas? (mínimo *${minimo}* unidades)`
    );
  }

  // ── CANTIDAD ──────────────────────────────────────────────────────────────
  if (sesion.estado === ESTADOS.B2B_CANTIDAD) {
    const cantidad = parseInt(txt, 10);
    const item = sesion.b2b.itemSeleccionado;
    const minimo = item?.cantidad_minima || 10;

    if (isNaN(cantidad) || cantidad <= 0) {
      return `Por favor escribe una cantidad válida. (mínimo ${minimo} unidades)`;
    }
    if (cantidad < minimo) {
      return `⚠️ La cantidad mínima para este producto es *${minimo} unidades*.\n¿Cuántas unidades necesitas?`;
    }
    if (item && item.stock < cantidad) {
      return `⚠️ Solo tenemos *${item.stock} unidades* disponibles.\n¿Cuántas unidades necesitas?`;
    }

    const subtotalItem = cantidad * item.precio_mayorista;
    sesion.carrito.push({
      catalogo_id:     item.catalogo_id,
      medicamento_id:  item.medicamento_id,
      nombre:          item.nombre,
      presentacion:    item.presentacion,
      laboratorio:     item.laboratorio,
      cantidad,
      precio_mayorista: item.precio_mayorista,
      subtotal:        subtotalItem,
    });
    sesion.estado = ESTADOS.B2B_CARRITO;
    guardarSesion(telefono, sesion);

    const totalCarritoActual = sesion.carrito.reduce((s, i) => s + i.subtotal, 0);
    const lineasCarrito = sesion.carrito.map(i =>
      `• ${i.nombre} x${i.cantidad} = $${Number(i.subtotal).toLocaleString('es-CO')}`
    ).join('\n');

    return (
      `✅ *Agregado al carrito:*\n\n${lineasCarrito}\n\n` +
      `💰 Total provisional: *$${Number(totalCarritoActual).toLocaleString('es-CO')}*\n\n` +
      `¿Deseas agregar otro medicamento?\n*SI* — buscar otro\n*NO* — ver cotización final`
    );
  }

  // ── CARRITO ───────────────────────────────────────────────────────────────
  if (sesion.estado === ESTADOS.B2B_CARRITO) {
    const resp = upper.trim();

    if (resp === 'SI' || resp === 'SÍ') {
      sesion.estado = ESTADOS.B2B_BUSCANDO;
      guardarSesion(telefono, sesion);
      return `💊 ¿Qué otro medicamento deseas cotizar?\nEscribe el nombre:`;
    }

    if (resp === 'NO') {
      // Generar cotización
      const subtotal = sesion.carrito.reduce((s, i) => s + i.subtotal, 0);
      const descInfo = b2bService.calcularDescuento ? await b2bService.calcularDescuento(subtotal)
        : { porcentaje: 0, monto: 0, total: subtotal };
      sesion.b2b.descuento = descInfo;
      sesion.b2b.subtotal  = subtotal;
      sesion.b2b.total     = descInfo.total || subtotal;
      sesion.estado = ESTADOS.B2B_COTIZACION;
      guardarSesion(telefono, sesion);

      const textoCot = await b2bService.generarTextoCotizacion(sesion.carrito, drogueria, descInfo);
      return textoCot + '\n\n¿Confirmas esta orden de compra?\nResponde *SI* para continuar o *NO* para cancelar.';
    }

    return `Por favor responde *SI* para agregar otro medicamento o *NO* para ver la cotización.`;
  }

  // ── COTIZACIÓN (confirmación) ─────────────────────────────────────────────
  if (sesion.estado === ESTADOS.B2B_COTIZACION) {
    const resp = upper.trim();

    if (resp === 'NO') {
      resetearSesion(telefono);
      return `❌ Orden cancelada. Escribe cuando quieras cotizar de nuevo 💊`;
    }

    if (resp === 'SI' || resp === 'SÍ') {
      sesion.estado = ESTADOS.B2B_PAGO;
      guardarSesion(telefono, sesion);

      const total = sesion.b2b.total || 0;
      const NEQUI    = process.env.NEQUI_NUMERO    || '3001234567';
      const DAVIPLATA = process.env.DAVIPLATA_NUMERO || '3001234567';
      const CUENTA   = process.env.NOMBRE_CUENTA   || 'Droguería Virtual SAS';

      return (
        `💳 *Instrucciones de Pago — Orden B2B*\n\n` +
        `💰 Total a pagar: *$${Number(total).toLocaleString('es-CO')}*\n\n` +
        `Realiza la transferencia a:\n\n` +
        `📱 *Nequi:* ${NEQUI}\n` +
        `   Nombre: ${CUENTA}\n\n` +
        `📱 *Daviplata:* ${DAVIPLATA}\n` +
        `   Nombre: ${CUENTA}\n\n` +
        `⚠️ *Importante:* Envía el *comprobante de pago* (foto o captura) a este chat.\n\n` +
        `La dirección de entrega registrada es:\n📍 ${drogueria.direccion || 'Sin dirección registrada'}\n\n` +
        `Si necesitas cambiar la dirección de entrega, escríbela ahora. Si es la misma, envía el comprobante.`
      );
    }

    return `Por favor responde *SI* para confirmar o *NO* para cancelar.`;
  }

  // ── PAGO: puede llegar dirección nueva o comprobante (imagen) ────────────
  if (sesion.estado === ESTADOS.B2B_PAGO) {
    // Si llega una imagen → es el comprobante
    if (contexto?.mediaUrl) {
      sesion.b2b.comprobante_url = contexto.mediaUrl;
      sesion.estado = ESTADOS.B2B_COMPROBANTE;
      guardarSesion(telefono, sesion);
      // Caer al bloque de COMPROBANTE a continuación
    } else {
      // Texto → podría ser dirección alternativa
      if (txt.length > 10) {
        sesion.b2b.direccion_entrega = txt;
        guardarSesion(telefono, sesion);
        return (
          `📍 Dirección de entrega actualizada:\n*${txt}*\n\n` +
          `Ahora envía el *comprobante de pago* 📸`
        );
      }
      return `Por favor envía la foto del comprobante de pago 📸`;
    }
  }

  // ── COMPROBANTE: crear orden, descontar stock, asignar mensajero ──────────
  if (sesion.estado === ESTADOS.B2B_COMPROBANTE || sesion.b2b?.comprobante_url) {
    await sendWhatsAppMessage(telefono, '✅ *¡Comprobante recibido!* Procesando tu orden... ⏳');

    let orden;
    try {
      const resultado = await b2bService.crearOrdenCompra({
        drogueriaCompradoraId: drogueria.id,
        compradoraTelefono:    telefono,
        compradoraNombre:      drogueria.nombre,
        compradoraDireccion:   sesion.b2b.direccion_entrega || drogueria.direccion,
        compradoraLat:         drogueria.lat,
        compradoraLng:         drogueria.lng,
        compradoraNit:         drogueria.nit,
        items:                 sesion.carrito,
        metodoPago:            'nequi_daviplata',
        comprobanteUrl:        sesion.b2b.comprobante_url || contexto?.mediaUrl,
        notas:                 `Descuento: ${sesion.b2b.descuento?.porcentaje || 0}%`,
      });

      if (!resultado.success) throw new Error(resultado.error || 'Error creando orden');
      orden = resultado.orden;
    } catch (err) {
      console.error('[Bot B2B] Error creando orden:', err.message);
      return (
        `😕 Hubo un problema al procesar tu orden. Por favor contáctanos directamente.\n\n` +
        `Error: ${err.message}`
      );
    }

    // Descontar stock
    try {
      await b2bService.descontarStockOrden(orden.id);
    } catch (errInv) {
      console.warn('[Bot B2B] Error descontando stock:', errInv.message);
    }

    // Asignar mensajero
    // ── Asignación NORMAL B2B (distribución justa, no urgente) ────────────
    let mensajeroNombre = null;
    let mensajeroTel    = null;
    try {
      const resAsig = await asignacionService.asignarNormalB2B({
        ordenId:          orden.id,
        ciudad:           drogueria.ciudad || null,
        compradoraLat:    drogueria.lat    || null,
        compradoraLng:    drogueria.lng    || null,
        compradoraNombre: drogueria.nombre,
        compradoraTel:    telefono,
      });
      if (resAsig.success && resAsig.mensajero) {
        mensajeroNombre = resAsig.mensajero.nombre;
        mensajeroTel    = resAsig.mensajero.telefono;
      }
    } catch (errM) {
      console.warn('[Bot B2B] Error en asignación normal:', errM.message);
    }

    resetearSesion(telefono);

    let msgFinal = (
      `🎉 *¡Orden de Compra Confirmada!*\n\n` +
      `📋 Número: *${orden.numero_orden}*\n` +
      `💰 Total: *$${Number(orden.total).toLocaleString('es-CO')}*\n\n`
    );

    if (mensajeroNombre) {
      msgFinal += `📦 Domiciliario asignado: *${mensajeroNombre}*\n📞 ${mensajeroTel}\n\n`;
    } else {
      msgFinal += `Estamos asignando el transporte de tu pedido 🛵\n\n`;
    }

    msgFinal += (
      `⏱️ Tiempo estimado: *2-4 horas* (pedido mayorista)\n\n` +
      `📍 Escribe *${orden.numero_orden}* para ver el estado en cualquier momento.\n` +
      `¡Gracias por comprar con *Droguería Virtual*! 💊`
    );

    return msgFinal;
  }

  // Fallback: mostrar menú B2B
  return await b2bService.construirMenuB2B(drogueria);
}

// ─── Flujo exclusivo para mensajeros ─────────────────────────────────────────

/**
 * Maneja todos los mensajes que vienen de un mensajero registrado.
 * El mensajero tiene su propio menú y comandos, separados del flujo del cliente.
 *
 * Comandos reconocidos:
 *   ENTREGADO DV-XXXX  → confirma entrega y se libera
 *   DISPONIBLE         → se activa para recibir pedidos
 *   NO DISPONIBLE      → pausa entregas
 *   MIS PEDIDOS        → historial reciente
 *   cualquier otro     → mostrar su menú/estado actual
 *
 * @param {object} mensajero  — fila completa de la tabla mensajeros
 * @param {string} mensaje    — texto limpio recibido
 * @returns {Promise<string>}
 */
async function manejarFlujoMensajero(mensajero, mensaje, contexto = {}, telefono = null) {
  const txt = (mensaje || '').trim().toUpperCase();
  const telefonoSesion = telefono || mensajero.telefono;
  const sesion = obtenerSesion(telefonoSesion);

  // ── GPS compartido: actualizar ubicación en tiempo real ───────────────────
  if (contexto?.location?.latitude && contexto?.location?.longitude) {
    await mensajeroService.actualizarUbicacion(
      mensajero.id,
      contexto.location.latitude,
      contexto.location.longitude
    );
    if (mensajero.pedido_actual_id) {
      // Look up numero_pedido for display
      const { data: pa } = await supabase.from('pedidos').select('numero_pedido').eq('id', mensajero.pedido_actual_id).maybeSingle();
      const numPedido = pa?.numero_pedido || mensajero.pedido_actual_id;
      return `📍 *Ubicación actualizada*\nTu posición fue registrada. Los clientes pueden verla en tiempo real.\n\nPara confirmar la entrega cuando llegues:\n*ENTREGADO ${numPedido}*`;
    }
    return `📍 Ubicación registrada correctamente ✅`;
  }

  // ── Entrega pendiente: esperando foto comprobante ─────────────────────────
  if (sesion.pendingDelivery) {
    const numeroPedido = sesion.pendingDelivery;

    if (!contexto.mediaUrl) {
      return (
        `📸 Aún espero la *foto de entrega* para el pedido *${numeroPedido}*.\n\n` +
        `Por favor toma una foto del producto entregado al cliente y envíala aquí.`
      );
    }

    // Foto recibida → confirmar entrega
    const resultado = await mensajeroService.confirmarEntrega(mensajero.telefono, numeroPedido, contexto.mediaUrl);
    delete sesion.pendingDelivery;
    guardarSesion(telefonoSesion, sesion);

    if (!resultado.success) {
      return `❌ No pude confirmar *${numeroPedido}*.\n${resultado.error || 'Verifica el número o contacta al administrador.'}`;
    }

    const pedido = resultado.pedido;
    if (pedido?.cliente_telefono) {
      await sendWhatsAppMessage(
        pedido.cliente_telefono,
        `✅ *¡Tu pedido llegó!*\n\nPedido *${numeroPedido}* entregado exitosamente.\n\n¡Gracias por comprar en Droguería Virtual! 💊`
      ).catch(() => {});
    }

    return (
      `✅ *Entrega confirmada: ${numeroPedido}*\n\n` +
      `¡Gracias ${mensajero.nombre}! Ya estás disponible para el próximo pedido 🛵`
    );
  }

  // ── ENTREGADO DV-XXXX (o solo ENTREGADO con pedido activo) ────────────────
  const matchEntrega = txt.match(/^ENTREGADO\s+(DV-[\d-]+)/);
  let numeroPedidoEntrega = matchEntrega ? matchEntrega[1] : null;

  // Sin número de pedido → buscar el pedido activo del mensajero
  if (!numeroPedidoEntrega && txt === 'ENTREGADO' && mensajero.pedido_actual_id) {
    const { data: pa } = await supabase
      .from('pedidos')
      .select('numero_pedido')
      .eq('id', mensajero.pedido_actual_id)
      .maybeSingle();
    numeroPedidoEntrega = pa?.numero_pedido || null;
  }

  if (numeroPedidoEntrega) {
    sesion.pendingDelivery = numeroPedidoEntrega;
    guardarSesion(telefonoSesion, sesion);
    return (
      `📸 *Confirmación de entrega: ${numeroPedidoEntrega}*\n\n` +
      `Para completar la entrega, por favor toma una *foto del producto entregado* al cliente y envíala aquí.\n\n` +
      `La foto quedará como comprobante en el sistema. ✅`
    );
  }

  // ── DISPONIBLE ─────────────────────────────────────────────────────────────
  if (txt === 'DISPONIBLE') {
    await mensajeroService.setDisponible(mensajero.id, true);
    return `🟢 *¡Listo ${mensajero.nombre}!*\n\nYa estás disponible para recibir pedidos 🛵`;
  }

  // ── NO DISPONIBLE ──────────────────────────────────────────────────────────
  if (txt === 'NO DISPONIBLE') {
    await mensajeroService.setDisponible(mensajero.id, false);
    return `🔴 *Pausado ${mensajero.nombre}.*\n\nNo recibirás pedidos hasta que escribas *DISPONIBLE*.`;
  }

  // ── MIS PEDIDOS ────────────────────────────────────────────────────────────
  if (txt === 'MIS PEDIDOS') {
    const historial = await mensajeroService.historialPedidos(mensajero.id, 5);
    if (!historial.length) {
      return '📭 Aún no tienes pedidos completados.';
    }
    const lista = historial
      .map(p => {
        const fecha = p.entregado_at
          ? new Date(p.entregado_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
          : '—';
        const total = p.total ? `$${Number(p.total).toLocaleString('es-CO')}` : '';
        return `• ${p.numero_pedido} | ${fecha} | ${total}`;
      })
      .join('\n');
    return `📦 *Tus últimos pedidos:*\n\n${lista}\n\nTotal completados: ${mensajero.pedidos_completados || 0}`;
  }

  // ── Cualquier otro mensaje → mostrar menú ─────────────────────────────────
  return await mensajeroService.construirMenuMensajero(mensajero);
}

// ─── Manejador principal ──────────────────────────────────────────────────────

/**
 * Punto de entrada del bot.
 *
 * @param {string} telefono   Número del cliente (ya normalizado, sin prefijo whatsapp:)
 * @param {string} mensaje    Texto recibido
 * @param {object} contexto   Datos extra del webhook Twilio:
 *                            - location: { latitude, longitude, label, address }
 *                            - mediaUrl: string (URL del comprobante/imagen)
 *                            - mediaType: string (ej: 'image/jpeg')
 * @returns {Promise<string>} Texto de respuesta para enviar al cliente
 */
async function manejarMensaje(telefono, mensaje, contexto = {}) {
  // Validar teléfono
  if (!telefono) {
    console.warn('[Bot] Teléfono inválido recibido');
    return '⚠️ No pudimos identificar tu número. Intenta de nuevo.';
  }

  const mensajeLimpio = (mensaje || '').trim();

  // ── Reconocimiento de mensajero (patrón DistribuidorService de Speady) ──────
  // Antes de cualquier otra lógica: si el número es un mensajero registrado,
  // enrutarlo a su propio flujo. Los clientes nunca llegan a este bloque.
  try {
    const mensajero = await mensajeroService.getByPhone(telefono);
    if (mensajero) {
      return await manejarFlujoMensajero(mensajero, mensajeLimpio, contexto, telefono);
    }
  } catch (errMens) {
    // Si falla el lookup, continuar como cliente normal (no bloquear)
    console.warn('[Bot] Error verificando mensajero, continuando como cliente:', errMens.message);
  }

  // ── Reconocimiento B2B: droguería compradora registrada ───────────────────
  // Si el número pertenece a una droguería activa, enrutar al flujo B2B.
  try {
    const drogueriaB2B = await b2bService.getDrogueriaByPhone(telefono);
    if (drogueriaB2B) {
      return await manejarFlujoB2B(drogueriaB2B, telefono, mensajeLimpio, contexto, sesiones);
    }
  } catch (errB2B) {
    console.warn('[Bot] Error verificando droguería B2B, continuando como cliente:', errB2B.message);
  }

  // ── Detección de calificación 1-5 (después de pedido entregado) ──────────
  // Si el cliente recibió en los últimos 30 min una solicitud de calificación
  // y ahora responde con "1", "2", "3", "4" o "5", la registramos.
  if (/^[1-5]$/.test(mensajeLimpio.trim())) {
    try {
      const { data: pedidoPendiente } = await supabase
        .from('pedidos')
        .select('id, mensajero_id, calificacion_solicitada_at')
        .eq('cliente_telefono', telefono)
        .eq('status', 'entregado')
        .not('calificacion_solicitada_at', 'is', null)
        .order('entregado_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pedidoPendiente?.calificacion_solicitada_at) {
        const minutos = (Date.now() - new Date(pedidoPendiente.calificacion_solicitada_at).getTime()) / 60000;
        if (minutos < 30) {
          const { data: yaExiste } = await supabase
            .from('calificaciones')
            .select('id')
            .eq('pedido_id', pedidoPendiente.id)
            .maybeSingle();
          if (!yaExiste) {
            await calificacionService.registrarCalificacion(
              pedidoPendiente.id, telefono, parseInt(mensajeLimpio, 10), null
            );
            return `🙏 *¡Gracias por tu calificación!*\n\nTu opinión nos ayuda a mejorar 💊\n\n¿Quieres seguir comprando? Solo escríbeme el nombre del medicamento que necesitas.`;
          }
        }
      }
    } catch (e) {
      console.warn('[Bot] Error procesando calificación:', e.message);
    }
  }

  // ── Consulta de puntos / lealtad ─────────────────────────────────────────
  if (['puntos', 'mis puntos', 'saldo', 'lealtad', 'mis pts', 'pts'].includes(mensajeLimpio.toLowerCase())) {
    try {
      const datos = await lealtadService.consultarPuntos(telefono);
      return (
        `🎁 *Tu programa de lealtad*\n\n` +
        `⭐ Puntos disponibles: *${datos.puntos_actuales}*\n` +
        `💰 Equivalen a: $${(datos.puntos_actuales * 1000).toLocaleString('es-CO')}\n` +
        `🛒 Pedidos completados: *${datos.pedidos_completados}*\n` +
        `🏆 Total ganado: ${datos.puntos_totales_ganados} pts\n\n` +
        (datos.codigo_referido
          ? `🎟️ *Tu código de referido:*\n*${datos.codigo_referido}*\n\nCompártelo con amigos. Ganas *50 puntos* cuando un amigo hace su primera compra usando tu código 🎉\n\n`
          : '') +
        (datos.puede_canjear
          ? `✅ Puedes canjear tus puntos en tu próxima compra (mín. 10 pts).`
          : `Necesitas mínimo 10 puntos para canjear.`)
      );
    } catch (e) {
      console.warn('[Bot] Error consultando puntos:', e.message);
    }
  }

  // ── Aplicar código de referido (DV-XXXXXX) ────────────────────────────────
  // Si el cliente escribe un código de referido, lo asociamos a su cuenta.
  const matchReferido = mensajeLimpio.toUpperCase().match(/^DV-([A-Z0-9]{6})$/);
  if (matchReferido) {
    try {
      const codigoRef = mensajeLimpio.toUpperCase().trim();
      const referidor = await lealtadService.buscarPorCodigoReferido(codigoRef);
      if (referidor && referidor.telefono !== telefono) {
        await lealtadService.obtenerOCrearCliente(telefono, null, referidor.telefono);
        return (
          `🎉 *¡Código de referido aplicado!*\n\n` +
          `Te invitó *${referidor.nombre || 'un amigo'}*.\n\n` +
          `Cuando completes tu primera compra, *${referidor.nombre || 'tu amigo'}* recibirá 50 puntos de regalo 🎁\n\n` +
          `Ahora cuéntame, ¿qué medicamento necesitas?`
        );
      }
    } catch (e) {
      console.warn('[Bot] Error procesando referido:', e.message);
    }
  }

  // ── Seguimiento de pedidos (disponible para cualquier cliente) ───────────────
  // Detecta "seguimiento", "mis pedidos", "DV-XXXX", "DV-OC-XXXX"
  if (esSeguimiento(mensajeLimpio)) {
    try {
      return await manejarSeguimiento(telefono, mensajeLimpio);
    } catch (errSeg) {
      console.error('[Bot] Error en seguimiento:', errSeg.message);
      return '⚠️ No pude consultar el estado ahora. Intenta en un momento.';
    }
  }

  // ── Comandos globales (en cualquier estado) ────────────────────────────────

  // Cancelar → reset total
  if (esCancelar(mensajeLimpio)) {
    resetearSesion(telefono);
    return MSG_CANCELAR_REINICIAR;
  }

  // Ver carrito en cualquier momento
  if (esVerCarrito(mensajeLimpio)) {
    const sesion = obtenerSesion(telefono);
    if (sesion.carrito.length === 0) {
      return '🛒 Tu carrito está vacío. Escríbeme el nombre del medicamento que necesitas 💊';
    }
    const total = totalCarrito(sesion.carrito);
    return `${textoCarrito(sesion.carrito)}\n\n💰 Total: ${formatearPrecio(total)}\n\nEscribe *NO* para continuar con el pedido o sigue buscando medicamentos.`;
  }

  // Menú → reset
  if (esMenu(mensajeLimpio)) {
    return manejarInicio(telefono);
  }

  // ── Obtener sesión activa ──────────────────────────────────────────────────

  const sesion = obtenerSesion(telefono);

  // ── Enrutar según estado ───────────────────────────────────────────────────

  try {
    switch (sesion.estado) {

      // INICIO: cualquier mensaje → bienvenida + pedir medicamento
      case ESTADOS.INICIO:
        return manejarInicio(telefono);

      // BUSCANDO: cliente escribe nombre del medicamento
      case ESTADOS.BUSCANDO:
        return await manejarBusqueda(telefono, mensajeLimpio, sesion);

      // SELECCIONANDO: cliente elige número de resultado
      case ESTADOS.SELECCIONANDO:
        return await manejarSeleccion(telefono, mensajeLimpio, sesion);

      // CANTIDAD: cliente dice cuántas unidades
      case ESTADOS.CANTIDAD:
        return await manejarCantidad(telefono, mensajeLimpio, sesion);

      // CARRITO: ¿agregar otro? SI/NO
      case ESTADOS.CARRITO:
        return manejarCarrito(telefono, mensajeLimpio, sesion);

      // CONFIRMACION: ¿confirmar pedido? SI/NO
      case ESTADOS.CONFIRMACION:
        return manejarConfirmacion(telefono, mensajeLimpio, sesion);

      // UBICACION: esperar mensaje de ubicación GPS
      case ESTADOS.UBICACION:
        return manejarUbicacion(telefono, sesion, contexto);

      // NOMBRE: nombre completo del cliente
      case ESTADOS.NOMBRE:
        return manejarNombre(telefono, mensajeLimpio, sesion);

      // CEDULA: número de cédula
      case ESTADOS.CEDULA:
        return manejarCedula(telefono, mensajeLimpio, sesion);

      // TC: aceptar términos y condiciones
      case ESTADOS.TC:
        return await manejarTC(telefono, mensajeLimpio, sesion);

      // COMPROBANTE: esperar imagen del comprobante de pago
      case ESTADOS.COMPROBANTE:
        return await manejarComprobante(telefono, sesion, contexto);

      // FINALIZADO: sesión terminada → reiniciar
      case ESTADOS.FINALIZADO:
        return manejarInicio(telefono);

      default:
        return manejarInicio(telefono);
    }
  } catch (err) {
    console.error('[Bot] Error inesperado en manejarMensaje:', err.message, err.stack);
    return (
      '😕 *Algo salió mal de nuestro lado.* Perdona las molestias.\n\n' +
      'Por favor intenta de nuevo. Escribe el nombre del medicamento que necesitas 💊'
    );
  }
}

// ─── Limpieza automática de sesiones expiradas ───────────────────────────────

function limpiarSesionesExpiradas() {
  const ahora = Date.now();
  let eliminadas = 0;
  for (const [tel, sesion] of sesiones.entries()) {
    if (ahora - sesion.timestamp > SESION_TTL_MS) {
      sesiones.delete(tel);
      eliminadas++;
    }
  }
  if (eliminadas > 0) {
    console.log(`[Bot] Sesiones expiradas eliminadas: ${eliminadas}`);
  }
  return eliminadas;
}

// Ejecutar limpieza cada 10 minutos
setInterval(limpiarSesionesExpiradas, 10 * 60 * 1000).unref?.();

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { manejarMensaje };
