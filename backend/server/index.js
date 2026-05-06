'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { applySecurityMiddleware } = require('../middleware/security');
const { manejarMensaje } = require('./bot');
const { sendWhatsAppMessage } = require('../services/whatsapp-service');

// ─── Servicios ────────────────────────────────────────────────────────────────

const MedicamentoService = require('../services/medicamento-service');
const CatalogoService = require('../services/catalogo-service');
const PedidoService = require('../services/pedido-service');
const InventarioService = require('../services/inventario-service');
const MensajeroService = require('../services/mensajero-service');
const FeeService = require('../services/fee-service');
const WompiService = require('../services/wompi-service');
const AsignacionService = require('../services/asignacion-service');
const monitor = require('../services/monitor-service');
const emailService = require('../services/email-service');
const CacheService = require('../services/cache-service');
const MetricasService = require('../services/metricas-service');
const CalificacionService = require('../services/calificacion-service');
const LealtadService = require('../services/lealtad-service');

// ─── Inicialización ───────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Server] ERROR: SUPABASE_URL y una key de Supabase no configurados.');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('[Server] ADVERTENCIA: usando SUPABASE_ANON_KEY. Para rutas admin usa SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('[Server] Conexión a Supabase inicializada.');

// ─── Instancias de servicios ──────────────────────────────────────────────────

const medicamentoService = new MedicamentoService(supabase);
const cataloService = new CatalogoService(supabase);
const pedidoService = new PedidoService(supabase);
const inventarioService = new InventarioService(supabase);
const mensajeroService = new MensajeroService(supabase);
const feeService = new FeeService(supabase);
const wompiService = new WompiService(supabase);
const asignacionService = new AsignacionService(supabase);
const cacheService = new CacheService();
const metricasService = new MetricasService(supabase);
const calificacionService = new CalificacionService(supabase);
const lealtadService = new LealtadService(supabase);

// ─── Middleware de seguridad ──────────────────────────────────────────────────

applySecurityMiddleware(app);

// ─── Body parsers ─────────────────────────────────────────────────────────────

// El webhook de Twilio envía application/x-www-form-urlencoded
app.use('/webhook/whatsapp', express.urlencoded({ extended: false }));

// El resto de rutas usan JSON
app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK DE WHATSAPP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /webhook/whatsapp
 * Verificación del webhook por Twilio (challenge response).
 */
app.get('/webhook/whatsapp', (req, res) => {
  const challenge = req.query['hub.challenge'];
  if (challenge) {
    console.log('[Webhook] Verificación de Twilio recibida.');
    return res.status(200).send(challenge);
  }
  res.status(200).json({ status: 'ok', message: 'Webhook de WhatsApp activo' });
});

/**
 * POST /webhook/whatsapp
 * Recibe mensajes entrantes de Twilio y los procesa con el bot.
 */
app.post('/webhook/whatsapp', async (req, res) => {
  // Responder 200 inmediatamente a Twilio para evitar reintentos
  res.sendStatus(200);

  try {
    const {
      Body: rawBody,
      From: rawFrom,
      // Ubicación GPS compartida en WhatsApp (Twilio la envía como campos planos)
      Latitude,
      Longitude,
      Label: LocationLabel,
      Address: LocationAddress,
      // Archivos adjuntos (comprobante de pago, etc.)
      MediaUrl0: mediaUrl,
      MediaContentType0: mediaType,
      NumMedia,
    } = req.body;

    if (!rawFrom) {
      console.warn('[Webhook] Mensaje sin From. Ignorando.');
      return;
    }

    // Normalizar número: "whatsapp:+573001234567" → "3001234567"
    const telefono = rawFrom
      .replace(/^whatsapp:/i, '')
      .replace(/^\+57/, '')
      .trim();

    const mensaje = (rawBody || '').trim();

    console.log(
      `[Webhook] Mensaje entrante | Tel: ${telefono} | Msg: "${mensaje}"` +
      (Latitude ? ` | Lat: ${Latitude}, Lng: ${Longitude}` : '') +
      (mediaUrl  ? ` | Media: ${mediaType}` : '')
    );

    // Contexto enriquecido con ubicación GPS y media del webhook de Twilio
    const contexto = {
      // Ubicación GPS (cuando el cliente comparte su ubicación en WhatsApp)
      location: (Latitude && Longitude)
        ? {
            latitude:  parseFloat(Latitude),
            longitude: parseFloat(Longitude),
            label:     LocationLabel   || null,
            address:   LocationAddress || null,
          }
        : null,
      // Imagen adjunta (comprobante de pago, fórmula médica, etc.)
      mediaUrl:  mediaUrl  || null,
      mediaType: mediaType || null,
      numMedia:  parseInt(NumMedia, 10) || 0,
    };

    // ── Detección de confirmación de entrega del mensajero ──────────────────
    // Los mensajeros responden: "ENTREGADO DV-2026-0001"
    const entregaMatch = mensaje.toUpperCase().match(/^ENTREGADO\s+(DV-[\d-]+)/);
    if (entregaMatch) {
      const numeroPedido = entregaMatch[1].toUpperCase();
      console.log(`[Webhook] Confirmación de entrega de mensajero ${telefono}: ${numeroPedido}`);
      try {
        const resultado = await mensajeroService.confirmarEntrega(telefono, numeroPedido);
        if (resultado.success) {
          const pedido = resultado.pedido;
          // Notificar al mensajero
          await sendWhatsAppMessage(telefono,
            `✅ *Entrega confirmada*\n\nPedido *${numeroPedido}* marcado como entregado.\n¡Gracias! Ya estás disponible para el próximo pedido 🛵`
          );
          // Notificar al cliente que su pedido fue entregado
          if (pedido?.cliente_telefono) {
            await sendWhatsAppMessage(pedido.cliente_telefono,
              `✅ *¡Tu pedido fue entregado!*\n\nPedido *${numeroPedido}* entregado exitosamente.\n\n¡Gracias por comprar en Droguería Virtual! 💊`
            );
          }
        } else {
          await sendWhatsAppMessage(telefono,
            `❌ No pude confirmar el pedido *${numeroPedido}*. Verifica el número o contacta al administrador.`
          );
        }
      } catch (err) {
        console.error('[Webhook] Error al confirmar entrega:', err.message);
      }
      return; // No procesar con el bot
    }

    // ── Procesar el mensaje con el bot (clientes) ────────────────────────────
    const respuesta = await manejarMensaje(telefono, mensaje, contexto);

    if (respuesta) {
      await sendWhatsAppMessage(telefono, respuesta);
      console.log(`[Webhook] Respuesta enviada a ${telefono}`);
    }
  } catch (error) {
    console.error('[Webhook] Error al procesar mensaje de WhatsApp:', error.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API ADMIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Estadísticas globales del sistema.
 */
app.get('/api/admin/stats', async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const [{ count: totalDroguerias }, { count: totalPedidosHoy }, { count: totalMedicamentos }] =
      await Promise.all([
        supabase.from('droguerias').select('*', { count: 'exact', head: true }),
        supabase
          .from('pedidos')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', `${hoy}T00:00:00`)
          .lte('created_at', `${hoy}T23:59:59`),
        supabase.from('medicamentos').select('*', { count: 'exact', head: true }),
      ]);

    res.json({
      total_droguerias: totalDroguerias || 0,
      total_pedidos_hoy: totalPedidosHoy || 0,
      total_medicamentos: totalMedicamentos || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Error al obtener estadísticas:', error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas globales.' });
  }
});

/**
 * GET /api/admin/droguerias
 * Lista todas las droguerías con paginación y filtros opcionales.
 * Query params: page, limit, status, ciudad
 */
app.get('/api/admin/droguerias', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, ciudad } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('droguerias')
      .select('*', { count: 'exact' })
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (ciudad) query = query.ilike('ciudad', `%${ciudad}%`);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      droguerias: data,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (error) {
    console.error('[Admin] Error al listar droguerías:', error.message);
    res.status(500).json({ error: 'Error al obtener droguerías.' });
  }
});

/**
 * POST /api/admin/droguerias
 * Registrar una nueva droguería.
 */
app.post('/api/admin/droguerias', async (req, res) => {
  try {
    const { nombre, email, telefono, whatsapp_numero, ciudad, direccion, barrio, nit } = req.body;
    if (!nombre || !telefono || !ciudad) {
      return res.status(400).json({ error: 'nombre, telefono y ciudad son requeridos.' });
    }
    const { data, error } = await supabase
      .from('droguerias')
      .insert({
        nombre:          nombre.trim(),
        email:           email?.trim() || null,
        telefono:        telefono.trim().replace(/\D/g,'').slice(-10),
        whatsapp_numero: (whatsapp_numero || telefono).trim().replace(/\D/g,'').slice(-10),
        ciudad:          ciudad.trim(),
        direccion:       direccion?.trim() || null,
        barrio:          barrio?.trim() || null,
        nit:             nit?.trim() || null,
        status:          'pendiente',
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, drogueria: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/droguerias/:id/status
 * Aprobar o suspender una droguería.
 * Body: { status: 'activo' | 'suspendido' | 'pendiente' }
 */
app.put('/api/admin/droguerias/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const statusPermitidos = ['activo', 'suspendido', 'pendiente', 'rechazado'];
    if (!status || !statusPermitidos.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Valores permitidos: ${statusPermitidos.join(', ')}`,
      });
    }

    const { data, error } = await supabase
      .from('droguerias')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Droguería no encontrada.' });

    console.log(`[Admin] Droguería ${id} actualizada a status: ${status}`);
    res.json({ message: 'Status actualizado correctamente.', drogueria: data });
  } catch (error) {
    console.error('[Admin] Error al actualizar status de droguería:', error.message);
    res.status(500).json({ error: 'Error al actualizar status.' });
  }
});

/**
 * GET /api/admin/pedidos
 * Todos los pedidos con filtros opcionales.
 * Query params: page, limit, status, drogueriaId, fecha_desde, fecha_hasta
 */
app.get('/api/admin/pedidos', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, drogueriaId, fecha_desde, fecha_hasta } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('pedidos')
      .select('*, droguerias(nombre, ciudad)', { count: 'exact' })
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (drogueriaId) query = query.eq('drogueria_id', drogueriaId);
    if (fecha_desde) query = query.gte('created_at', fecha_desde);
    if (fecha_hasta) query = query.lte('created_at', fecha_hasta);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      pedidos: data,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (error) {
    console.error('[Admin] Error al listar pedidos:', error.message);
    res.status(500).json({ error: 'Error al obtener pedidos.' });
  }
});

/** GET /api/admin/pedidos/:id — Detalle completo de un pedido */
app.get('/api/admin/pedidos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        droguerias(nombre, ciudad, telefono, direccion),
        mensajeros!mensajero_id(nombre, telefono),
        detalle_pedidos(nombre_medicamento, cantidad, precio_unitario, subtotal)
      `)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/admin/pedidos/:id/mensajero — Reasignar mensajero */
app.patch('/api/admin/pedidos/:id/mensajero', async (req, res) => {
  try {
    const { mensajeroId } = req.body;
    if (!mensajeroId) return res.status(400).json({ error: 'mensajeroId requerido.' });

    // Verificar que el mensajero existe
    const { data: mens, error: errMens } = await supabase
      .from('mensajeros').select('id, nombre, telefono').eq('id', mensajeroId).single();
    if (errMens || !mens) return res.status(404).json({ error: 'Mensajero no encontrado.' });

    const { data, error } = await supabase
      .from('pedidos')
      .update({ mensajero_id: mensajeroId, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, numero_pedido, status, cliente_telefono, cliente_nombre')
      .single();
    if (error) throw error;

    // Notificar al mensajero por WhatsApp
    try {
      await mensajeroService.notificarMensajero(mensajeroId, data.id);
    } catch (e) { console.warn('[Admin] No se pudo notificar al mensajero:', e.message); }

    res.json({ success: true, pedido: data, mensajero: mens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/admin/pedidos/:id/status — Cambiar status */
app.patch('/api/admin/pedidos/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const permitidos = ['pendiente','confirmado','en_preparacion','en_camino','entregado','cancelado'];
    if (!permitidos.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

    const { data, error } = await supabase
      .from('pedidos')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, numero_pedido, status, cliente_telefono')
      .single();
    if (error) throw error;
    res.json({ success: true, pedido: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/medicamentos
 * Catálogo maestro de medicamentos.
 * Query params: page, limit, q (búsqueda), categoria
 */
app.get('/api/admin/medicamentos', async (req, res) => {
  try {
    const { page = 1, limit = 20, q, categoria } = req.query;

    if (q) {
      const resultados = await medicamentoService.buscarMedicamentos(q, {
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
      });
      return res.json(resultados);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = supabase
      .from('medicamentos')
      .select('*', { count: 'exact' })
      .range(offset, offset + parseInt(limit) - 1)
      .order('nombre', { ascending: true });

    if (categoria) query = query.eq('categoria', categoria);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      medicamentos: data,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (error) {
    console.error('[Admin] Error al obtener catálogo maestro:', error.message);
    res.status(500).json({ error: 'Error al obtener medicamentos.' });
  }
});

/**
 * POST /api/admin/medicamentos
 * Crear un nuevo medicamento en el catálogo maestro.
 */
app.post('/api/admin/medicamentos', async (req, res) => {
  try {
    const datos = req.body;

    if (!datos.nombre) {
      return res.status(400).json({ error: 'El campo "nombre" es obligatorio.' });
    }

    const resultado = await medicamentoService.crearMedicamento(datos);
    console.log(`[Admin] Medicamento creado: ${datos.nombre}`);
    res.status(201).json(resultado);
  } catch (error) {
    console.error('[Admin] Error al crear medicamento:', error.message);
    res.status(500).json({ error: 'Error al crear medicamento.' });
  }
});

/**
 * PUT /api/admin/medicamentos/:id
 * Actualizar un medicamento del catálogo maestro.
 */
app.put('/api/admin/medicamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const datos = req.body;

    const resultado = await medicamentoService.actualizarMedicamento(id, datos);
    console.log(`[Admin] Medicamento ${id} actualizado.`);
    res.json(resultado);
  } catch (error) {
    console.error('[Admin] Error al actualizar medicamento:', error.message);
    res.status(500).json({ error: 'Error al actualizar medicamento.' });
  }
});

// ─── Admin: Mensajeros ────────────────────────────────────────────────────────

/** GET /api/admin/mensajeros — Lista todos los mensajeros */
app.get('/api/admin/mensajeros', async (req, res) => {
  try {
    const { ciudad, disponible, status, page = 1, limit = 20 } = req.query;
    const resultado = await mensajeroService.listarMensajeros({ ciudad, disponible, status, page: Number(page), limit: Number(limit) });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/mensajeros — Registrar nuevo mensajero */
app.post('/api/admin/mensajeros', async (req, res) => {
  try {
    const resultado = await mensajeroService.registrarMensajero(req.body);
    res.status(201).json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/admin/mensajeros/:id/disponible — Toggle disponibilidad */
app.put('/api/admin/mensajeros/:id/disponible', async (req, res) => {
  try {
    const { disponible } = req.body;
    const { error } = await supabase.from('mensajeros').update({ disponible }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API DROGUERÍA (autenticada)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/drogueria/:id/stats
 * Estadísticas de una droguería específica.
 */
app.get('/api/drogueria/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const hoy = new Date().toISOString().split('T')[0];

    const [
      { count: pedidosHoy },
      { count: pedidosPendientes },
      { count: productosEnCatalogo },
    ] = await Promise.all([
      supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('drogueria_id', id)
        .gte('created_at', `${hoy}T00:00:00`),
      supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('drogueria_id', id)
        .eq('status', 'pendiente'),
      supabase
        .from('catalogo_droguerias')
        .select('*', { count: 'exact', head: true })
        .eq('drogueria_id', id)
        .eq('disponible', true),
    ]);

    res.json({
      drogueria_id: id,
      pedidos_hoy: pedidosHoy || 0,
      pedidos_pendientes: pedidosPendientes || 0,
      productos_en_catalogo: productosEnCatalogo || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[Drogueria] Error al obtener stats de ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

/**
 * GET /api/drogueria/:id/pedidos
 * Pedidos de una droguería con paginación.
 * Query params: page, limit, status
 */
app.get('/api/drogueria/:id/pedidos', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('pedidos')
      .select('*, detalle_pedidos(*)', { count: 'exact' })
      .eq('drogueria_id', id)
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      pedidos: data,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (error) {
    console.error(`[Drogueria] Error al obtener pedidos de ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Error al obtener pedidos.' });
  }
});

/**
 * PUT /api/drogueria/pedidos/:pedidoId/status
 * Cambiar el status de un pedido.
 * Body: { status, notas }
 */
app.put('/api/drogueria/pedidos/:pedidoId/status', async (req, res) => {
  try {
    const { pedidoId } = req.params;
    const { status, notas } = req.body;

    const statusPermitidos = [
      'pendiente',
      'confirmado',
      'en_preparacion',
      'listo',
      'en_camino',
      'entregado',
      'cancelado',
    ];

    if (!status || !statusPermitidos.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Valores permitidos: ${statusPermitidos.join(', ')}`,
      });
    }

    const resultado = await pedidoService.actualizarStatusPedido(pedidoId, status, notas);
    console.log(`[Drogueria] Pedido ${pedidoId} actualizado a: ${status}`);
    res.json(resultado);
  } catch (error) {
    console.error('[Drogueria] Error al actualizar status del pedido:', error.message);
    res.status(500).json({ error: 'Error al actualizar pedido.' });
  }
});

/**
 * GET /api/drogueria/:id/catalogo
 * Catálogo de medicamentos de una droguería.
 * Query params: page, limit, disponible, categoriaId
 */
app.get('/api/drogueria/:id/catalogo', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, disponible, categoriaId } = req.query;

    const filtros = {
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    };

    if (disponible !== undefined) filtros.disponible = disponible === 'true';
    if (categoriaId) filtros.categoriaId = categoriaId;

    const resultado = await cataloService.obtenerCatalogoDrogueria(id, filtros);
    res.json(resultado);
  } catch (error) {
    console.error(`[Drogueria] Error al obtener catálogo de ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Error al obtener catálogo.' });
  }
});

/**
 * POST /api/drogueria/:id/catalogo
 * Agregar un medicamento al catálogo de la droguería.
 * Body: { medicamentoId, precio, stock, disponible }
 */
app.post('/api/drogueria/:id/catalogo', async (req, res) => {
  try {
    const { id } = req.params;
    const datos = { ...req.body, drogueriaId: id };

    if (!datos.medicamentoId) {
      return res.status(400).json({ error: 'El campo "medicamentoId" es obligatorio.' });
    }

    const resultado = await cataloService.agregarMedicamentoCatalogo(datos);
    console.log(`[Drogueria] Medicamento agregado al catálogo de droguería ${id}`);
    res.status(201).json(resultado);
  } catch (error) {
    console.error('[Drogueria] Error al agregar medicamento al catálogo:', error.message);
    res.status(500).json({ error: 'Error al agregar al catálogo.' });
  }
});

/**
 * PUT /api/drogueria/catalogo/:catalogoId
 * Actualizar precio o stock de un ítem del catálogo.
 * Body: { precio, stock, disponible }
 */
app.put('/api/drogueria/catalogo/:catalogoId', async (req, res) => {
  try {
    const { catalogoId } = req.params;
    const datos = req.body;

    const resultado = await cataloService.actualizarItemCatalogo(catalogoId, datos);
    console.log(`[Drogueria] Catálogo item ${catalogoId} actualizado.`);
    res.json(resultado);
  } catch (error) {
    console.error('[Drogueria] Error al actualizar ítem del catálogo:', error.message);
    res.status(500).json({ error: 'Error al actualizar catálogo.' });
  }
});

/**
 * DELETE /api/drogueria/catalogo/:catalogoId
 * Eliminar un ítem del catálogo de la droguería.
 */
app.delete('/api/drogueria/catalogo/:catalogoId', async (req, res) => {
  try {
    const { catalogoId } = req.params;

    const resultado = await cataloService.eliminarItemCatalogo(catalogoId);
    console.log(`[Drogueria] Catálogo item ${catalogoId} eliminado.`);
    res.json(resultado);
  } catch (error) {
    console.error('[Drogueria] Error al eliminar ítem del catálogo:', error.message);
    res.status(500).json({ error: 'Error al eliminar del catálogo.' });
  }
});

/**
 * GET /api/drogueria/:id/inventario
 * Reporte de inventario de la droguería.
 */
app.get('/api/drogueria/:id/inventario', async (req, res) => {
  try {
    const { id } = req.params;
    const reporte = await inventarioService.generarReporteInventario(id);
    res.json(reporte);
  } catch (error) {
    console.error(`[Drogueria] Error al generar reporte de inventario de ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Error al generar reporte de inventario.' });
  }
});

/**
 * GET /api/drogueria/:id/alertas-stock
 * Alertas de stock bajo para una droguería.
 * Query params: umbral (por defecto 5)
 */
app.get('/api/drogueria/:id/alertas-stock', async (req, res) => {
  try {
    const { id } = req.params;
    const umbral = parseInt(req.query.umbral) || 5;

    const alertas = await inventarioService.obtenerAlertasStockBajo(id, umbral);
    res.json({ drogueria_id: id, umbral, alertas });
  } catch (error) {
    console.error(`[Drogueria] Error al obtener alertas de stock de ${req.params.id}:`, error.message);
    res.status(500).json({ error: 'Error al obtener alertas de stock.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS PÚBLICOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/medicamentos/buscar?q=acetaminofen
 * Buscar medicamentos por nombre (usado por el bot y el portal).
 */
app.get('/api/medicamentos/buscar', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'El parámetro "q" debe tener al menos 2 caracteres.' });
    }

    const resultado = await medicamentoService.buscarMedicamentos(q.trim(), {
      limit: parseInt(limit),
    });

    res.json(resultado);
  } catch (error) {
    console.error('[Publico] Error al buscar medicamentos:', error.message);
    res.status(500).json({ error: 'Error al buscar medicamentos.' });
  }
});

/**
 * GET /api/medicamentos/categorias
 * Listar todas las categorías de medicamentos disponibles.
 */
app.get('/api/medicamentos/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicamentos')
      .select('categoria')
      .not('categoria', 'is', null)
      .order('categoria', { ascending: true });

    if (error) throw error;

    // Extraer categorías únicas
    const categorias = [...new Set(data.map((m) => m.categoria).filter(Boolean))];

    res.json({ categorias });
  } catch (error) {
    console.error('[Publico] Error al obtener categorías:', error.message);
    res.status(500).json({ error: 'Error al obtener categorías.' });
  }
});

/**
 * GET /api/droguerias
 * Listar droguerías activas (usado por el bot para mostrar opciones al cliente).
 * Query params: ciudad, limit
 */
app.get('/api/droguerias', async (req, res) => {
  try {
    const { ciudad, limit = 10 } = req.query;

    let query = supabase
      .from('droguerias')
      .select('id, nombre, direccion, ciudad, barrio, telefono, horario_apertura, horario_cierre')
      .eq('status', 'activo')
      .limit(parseInt(limit))
      .order('nombre', { ascending: true });

    if (ciudad) query = query.ilike('ciudad', `%${ciudad}%`);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ droguerias: data, total: data.length });
  } catch (error) {
    console.error('[Publico] Error al listar droguerías activas:', error.message);
    res.status(500).json({ error: 'Error al obtener droguerías.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK WOMPI — Confirmación automática de pagos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /webhook/wompi
 * Wompi llama este endpoint cuando una transacción cambia de estado.
 * Si el pago es APPROVED, se descuenta inventario y se asigna mensajero
 * automáticamente — sin intervención manual.
 */
app.post('/webhook/wompi', async (req, res) => {
  // Responder 200 inmediatamente para evitar reintentos
  res.sendStatus(200);

  try {
    // 1. Validar firma HMAC del webhook
    if (!wompiService.validarFirmaWebhook(req.body)) {
      console.warn('[Wompi Webhook] Firma inválida — ignorando');
      return;
    }

    // 2. Procesar el evento con hook de pago aprobado
    await wompiService.procesarEvento(req.body, {
      onPagoAprobado: async (pedidoId, transaccion) => {
        console.log(`[Wompi Webhook] Activando flujo post-pago para pedido ${pedidoId}`);

        // ── Descontar inventario ──
        try {
          await inventarioService.descontarStock(pedidoId);
        } catch (err) {
          console.warn('[Wompi Webhook] Error descontando stock:', err.message);
        }

        // ── Registrar fee de plataforma ──
        try {
          await feeService.registrarFeeEnPedido(pedidoId, transaccion.amount_in_cents / 100);
        } catch (err) {
          console.warn('[Wompi Webhook] Error registrando fee:', err.message);
        }

        // ── Otorgar puntos de lealtad al cliente ──
        try {
          await lealtadService.otorgarPuntosCompra(pedidoId);
        } catch (err) {
          console.warn('[Wompi Webhook] Error otorgando puntos:', err.message);
        }

        // ── Obtener datos del pedido para asignar mensajero ──
        const { data: pedido } = await supabase
          .from('pedidos')
          .select('id, numero_pedido, drogueria_id, cliente_telefono, cliente_nombre, cliente_lat, cliente_lng')
          .eq('id', pedidoId)
          .maybeSingle();

        if (!pedido) return;

        // ── Asignación TURBO ──
        try {
          const resAsig = await asignacionService.asignarTurboB2C({
            pedidoId:      pedido.id,
            drogueriaId:   pedido.drogueria_id,
            clienteLat:    pedido.cliente_lat,
            clienteLng:    pedido.cliente_lng,
            clienteNombre: pedido.cliente_nombre,
            clienteTel:    pedido.cliente_telefono,
          });

          // ── Notificar al cliente: WhatsApp + email + alerta interna ──
          if (pedido.cliente_telefono) {
            const { sendWhatsAppMessage } = require('../services/whatsapp-service');
            const mensajeroNombre   = resAsig?.mensajero?.nombre;
            const mensajeroTelefono = resAsig?.mensajero?.telefono;
            const etaTexto          = resAsig?.etaTexto || '30-45 minutos';

            // WhatsApp al cliente
            let msg = `✅ *¡Pago confirmado!*\n\n📦 Pedido: *${pedido.numero_pedido}*\n\n`;
            if (mensajeroNombre) {
              msg += `🛵 Tu domiciliario: *${mensajeroNombre}*\n📞 ${mensajeroTelefono}\n\n`;
            }
            msg += `⏱️ Llega en *${etaTexto}*\n\n📍 Escribe *seguimiento* para rastrear en tiempo real.`;
            await sendWhatsAppMessage(pedido.cliente_telefono, msg).catch(() => {});

            // Email de confirmación (si tenemos email del cliente)
            const { data: pedidoCompleto } = await supabase
              .from('pedidos')
              .select('cliente_nombre, cliente_telefono, total, detalle_pedidos(nombre_medicamento, cantidad, subtotal)')
              .eq('id', pedido.id)
              .maybeSingle();

            const emailCliente = transaccion?.customer_email
              || `${(pedido.cliente_telefono || '').replace(/\D/g, '')}@drogueriavirtual.co`;

            await emailService.confirmacionPedido({
              email:        emailCliente,
              nombre:       pedido.cliente_nombre,
              numeroPedido: pedido.numero_pedido,
              total:        pedidoCompleto?.total,
              items:        (pedidoCompleto?.detalle_pedidos || []).map(d => ({
                nombre:   d.nombre_medicamento,
                cantidad: d.cantidad,
                subtotal: d.subtotal,
              })),
              etaTexto,
              mensajero: mensajeroNombre ? { nombre: mensajeroNombre, telefono: mensajeroTelefono } : null,
            }).catch(() => {});

            // Alerta interna al admin
            await emailService.alertaPedidoNuevo({
              numeroPedido:    pedido.numero_pedido,
              total:           pedidoCompleto?.total,
              clienteNombre:   pedido.cliente_nombre,
              clienteTelefono: pedido.cliente_telefono,
            }).catch(() => {});
          }
        } catch (err) {
          console.warn('[Wompi Webhook] Error en asignación turbo:', err.message);
        }
      },
    });

  } catch (err) {
    console.error('[Wompi Webhook] Error inesperado:', err.message);
  }
});

/**
 * GET /api/wompi/link/:pedidoId — Generar/recuperar link de pago para un pedido
 * Usado por el frontend o por el bot si necesita reenviar el link.
 */
app.get('/api/wompi/link/:pedidoId', async (req, res) => {
  try {
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, total, cliente_nombre, cliente_telefono, wompi_link_url')
      .eq('id', req.params.pedidoId)
      .maybeSingle();

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Si ya tiene link válido, devolverlo
    if (pedido.wompi_link_url) {
      return res.json({ success: true, urlPago: pedido.wompi_link_url, cached: true });
    }

    // Generar uno nuevo
    const result = await wompiService.crearLinkPago({
      pedidoId:        pedido.id,
      numeroPedido:    pedido.numero_pedido,
      total:           pedido.total,
      clienteNombre:   pedido.cliente_nombre,
      clienteTelefono: pedido.cliente_telefono,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API FEE B2C (panel de la plataforma — socio operador)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/fee/config — Fee activo actual */
app.get('/api/fee/config', async (req, res) => {
  try {
    const pct = await feeService.obtenerPorcentajeActivo();
    res.json({ success: true, porcentaje: pct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/fee/config — Actualizar porcentaje de fee */
app.put('/api/fee/config', async (req, res) => {
  try {
    const { porcentaje, descripcion } = req.body;
    if (!porcentaje || porcentaje <= 0 || porcentaje > 50) {
      return res.status(400).json({ error: 'Porcentaje inválido (0-50)' });
    }
    const data = await feeService.actualizarPorcentaje(porcentaje, descripcion);
    res.json({ success: true, config: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/fee/resumen — Resumen del período (mes actual por defecto) */
app.get('/api/fee/resumen', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const resumen = await feeService.resumenPeriodo({ desde, hasta });
    res.json({ success: true, resumen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/fee/pendientes — Pedidos entregados sin liquidar */
app.get('/api/fee/pendientes', async (req, res) => {
  try {
    const pedidos = await feeService.pedidosPendientesLiquidar();
    const totalFee = pedidos.reduce((s, p) => s + Number(p.fee_monto || 0), 0);
    res.json({ success: true, pedidos, total_fee_pendiente: totalFee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/fee/liquidaciones — Generar corte del período */
app.post('/api/fee/liquidaciones', async (req, res) => {
  try {
    const { desde, hasta, notas } = req.body;
    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Se requieren desde y hasta (ISO date)' });
    }
    const resultado = await feeService.generarLiquidacion({ desde, hasta, notas });
    if (!resultado.liquidacion) {
      return res.json({ success: false, mensaje: resultado.mensaje });
    }
    res.status(201).json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/fee/liquidaciones — Historial de liquidaciones */
app.get('/api/fee/liquidaciones', async (req, res) => {
  try {
    const data = await feeService.listarLiquidaciones(24);
    res.json({ success: true, liquidaciones: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/fee/liquidaciones/:id/pagar — Marcar liquidación como pagada */
app.put('/api/fee/liquidaciones/:id/pagar', async (req, res) => {
  try {
    const liq = await feeService.marcarLiquidacionPagada(req.params.id);
    res.json({ success: true, liquidacion: liq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API MÉTRICAS — Dashboard en tiempo real
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/metricas/realtime — KPIs en vivo */
app.get('/api/metricas/realtime', async (req, res) => {
  try {
    const stats = await metricasService.realtimeStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/metricas/pedidos-horas?horas=12 — Serie horaria */
app.get('/api/metricas/pedidos-horas', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 12;
    const data = await metricasService.pedidosUltimasHoras(horas);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/metricas/top-medicamentos?limite=10 — Top vendidos */
app.get('/api/metricas/top-medicamentos', async (req, res) => {
  try {
    const data = await metricasService.topMedicamentos(parseInt(req.query.limite) || 10);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/metricas/embudo — Embudo de conversión del bot */
app.get('/api/metricas/embudo', async (req, res) => {
  try {
    const data = await metricasService.embudoConversion();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/metricas/socio — Resumen del mes para el socio */
app.get('/api/metricas/socio', async (req, res) => {
  try {
    const data = await metricasService.resumenSocio();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API OPERACIÓN EN VIVO (admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/mensajeros/live
 * Lista todos los mensajeros con su estado en vivo:
 *   - GPS actual + tiempo desde última actualización
 *   - Pedido activo si tienen uno (con cliente y dirección)
 *   - Stats: pedidos completados, calificación promedio
 */
app.get('/api/admin/mensajeros/live', async (req, res) => {
  try {
    const { data: mensajeros, error } = await supabase
      .from('mensajeros')
      .select(`
        id, nombre, telefono, ciudad, zona, vehiculo, placa,
        status, disponible, pedidos_completados, calificacion_promedio,
        ultima_lat, ultima_lng, ultima_ubicacion_at, pedido_actual_id
      `)
      .order('disponible', { ascending: false });

    if (error) throw error;

    // Para cada mensajero con pedido activo, traer datos del pedido
    const enriquecidos = await Promise.all((mensajeros || []).map(async m => {
      let pedidoActivo = null;
      if (m.pedido_actual_id) {
        const { data: p } = await supabase
          .from('pedidos')
          .select('numero_pedido, cliente_nombre, cliente_telefono, cliente_direccion, status, total, created_at')
          .eq('id', m.pedido_actual_id)
          .maybeSingle();
        pedidoActivo = p;
      }

      // Calcular minutos desde última actualización GPS
      const minSinGPS = m.ultima_ubicacion_at
        ? Math.round((Date.now() - new Date(m.ultima_ubicacion_at).getTime()) / 60000)
        : null;

      return { ...m, pedido_activo: pedidoActivo, min_sin_gps: minSinGPS };
    }));

    // Resumen
    const resumen = {
      total:        enriquecidos.length,
      activos:      enriquecidos.filter(m => m.status === 'activo').length,
      disponibles:  enriquecidos.filter(m => m.disponible && !m.pedido_actual_id).length,
      ocupados:     enriquecidos.filter(m => m.pedido_actual_id).length,
      con_gps_vivo: enriquecidos.filter(m => m.min_sin_gps !== null && m.min_sin_gps < 45).length,
    };

    res.json({ success: true, mensajeros: enriquecidos, resumen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/conversaciones-activas
 * Conversaciones del bot que están en algún paso del flujo (sesiones activas).
 * Filtra por last_activity en últimos 30 min.
 */
app.get('/api/admin/conversaciones-activas', async (req, res) => {
  try {
    const treintaMinAtras = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('bot_sessions')
      .select('telefono, estado, flujo, datos, drogueria_contexto_id, ultimo_pedido_id, created_at, updated_at')
      .gte('updated_at', treintaMinAtras)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      total:           data?.length || 0,
      conversaciones: data || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/inventario/global
 * Vista admin del inventario completo de todas las droguerías:
 *   - Total ítems en catálogo
 *   - Valor total del inventario
 *   - Alertas críticas (stock < 5)
 *   - Sin stock
 */
app.get('/api/admin/inventario/global', async (req, res) => {
  try {
    const { data: catalogos, error } = await supabase
      .from('catalogos')
      .select(`
        id, stock, precio, disponible, drogueria_id,
        medicamentos(nombre, presentacion, categoria_id),
        droguerias(nombre, ciudad)
      `);

    if (error) throw error;

    const items = catalogos || [];
    const valor_total = items.reduce((s, i) => s + (Number(i.stock) * Number(i.precio || 0)), 0);
    const sin_stock   = items.filter(i => i.stock === 0);
    const stock_bajo  = items.filter(i => i.stock > 0 && i.stock < 5);
    const stock_normal = items.filter(i => i.stock >= 5);

    // Top 10 críticos para acción
    const criticos = sin_stock
      .concat(stock_bajo)
      .slice(0, 20)
      .map(i => ({
        nombre:      i.medicamentos?.nombre,
        presentacion: i.medicamentos?.presentacion,
        droguerias:  i.droguerias?.nombre,
        ciudad:      i.droguerias?.ciudad,
        stock:       i.stock,
        precio:      i.precio,
      }));

    res.json({
      success: true,
      resumen: {
        total_items:    items.length,
        valor_total,
        sin_stock_count:  sin_stock.length,
        stock_bajo_count: stock_bajo.length,
        stock_ok_count:   stock_normal.length,
      },
      criticos,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API CALIFICACIONES (rating de mensajeros)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/calificaciones/top-mensajeros — Top mensajeros por rating */
app.get('/api/calificaciones/top-mensajeros', async (req, res) => {
  try {
    const data = await calificacionService.mensajerosTopRated(parseInt(req.query.limite) || 10);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/calificaciones/procesar-pendientes — Manual trigger del cron */
app.post('/api/calificaciones/procesar-pendientes', async (req, res) => {
  try {
    const r = await calificacionService.procesarCalificacionesAutomatico();
    res.json({ success: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/calificaciones/recientes — Últimas calificaciones */
app.get('/api/calificaciones/recientes', async (req, res) => {
  try {
    const { data } = await supabase
      .from('calificaciones')
      .select('*, mensajeros(nombre), pedidos(numero_pedido)')
      .order('created_at', { ascending: false })
      .limit(parseInt(req.query.limite) || 20);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API LEALTAD (puntos, referidos, cupones)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/lealtad/cliente/:telefono — Saldo y datos del cliente */
app.get('/api/lealtad/cliente/:telefono', async (req, res) => {
  try {
    const data = await lealtadService.consultarPuntos(req.params.telefono);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/lealtad/top-clientes — Ranking de clientes por puntos */
app.get('/api/lealtad/top-clientes', async (req, res) => {
  try {
    const data = await lealtadService.topClientesLealtad(parseInt(req.query.limite) || 10);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/lealtad/cupones — Crear cupón */
app.post('/api/lealtad/cupones', async (req, res) => {
  try {
    const data = await lealtadService.crearCupon(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/lealtad/cupones — Listar cupones */
app.get('/api/lealtad/cupones', async (req, res) => {
  try {
    const data = await lealtadService.listarCupones();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/lealtad/validar-cupon — Validar cupón antes de aplicar */
app.post('/api/lealtad/validar-cupon', async (req, res) => {
  try {
    const { codigo, telefono, total, costoDomicilio } = req.body;
    const r = await lealtadService.aplicarCupon(codigo, telefono, total, costoDomicilio);
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK E INFO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Health check del servidor.
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'drogueria-virtual',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * GET /
 * Información básica del API.
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Droguería Virtual API',
    description: 'Sistema de farmacias colombianas con WhatsApp Bot',
    version: '1.0.0',
    docs: '/health',
    endpoints: {
      webhook: '/webhook/whatsapp',
      admin: '/api/admin/*',
      drogueria: '/api/drogueria/*',
      publico: ['/api/medicamentos/buscar', '/api/medicamentos/categorias', '/api/droguerias'],
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MANEJO DE ERRORES GLOBAL
// ─────────────────────────────────────────────────────────────────────────────

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada.',
    path: req.path,
    method: req.method,
  });
});

// Error handler global con captura en Sentry
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server] Error no manejado:', err.message, err.stack);

  // Capturar en monitor (Sentry + alertas)
  monitor.capturarError(err, {
    url:    req.url,
    method: req.method,
    body:   req.body,
  });

  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CRONS PROGRAMADOS
// ─────────────────────────────────────────────────────────────────────────────

const cron = require('node-cron');

// Cada 5 minutos: pedir calificación a pedidos entregados hace +5 min
cron.schedule('*/5 * * * *', async () => {
  try {
    const r = await calificacionService.procesarCalificacionesAutomatico();
    if (r?.solicitadas > 0) {
      console.log(`[Cron] Calificaciones solicitadas: ${r.solicitadas}`);
    }
  } catch (err) {
    console.error('[Cron] Error procesando calificaciones:', err.message);
  }
});

console.log('[Server] Cron de calificaciones programado (cada 5 min)');

// ─────────────────────────────────────────────────────────────────────────────
// ARRANQUE DEL SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log(`[Server] Drogueria Virtual API corriendo en ${HOST}:${PORT}`);
  console.log(`[Server] Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Webhook WhatsApp: POST http://localhost:${PORT}/webhook/whatsapp`);
  console.log('='.repeat(60));
});

module.exports = app;
