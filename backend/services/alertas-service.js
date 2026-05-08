'use strict';

const { sendWhatsAppMessage } = require('./whatsapp-service');

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '';

// Umbrales de retraso
const UMBRAL_B2B_HORAS    = 4;    // orden B2B enviada sin entregar → alerta
const UMBRAL_B2C_MIN      = 45;   // pedido B2C en_camino sin entregar → alerta
const UMBRAL_SIN_MENS_MIN = 15;   // orden pagada sin mensajero asignado → alerta
const UMBRAL_SIN_GPS_MIN  = 30;   // mensajero en entrega sin actualizar GPS → alerta

// Ventana de deduplicación: no re-alertar el mismo recurso antes de 2h
const DEDUP_HORAS = 2;

class AlertasService {
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ── Verificar si ya existe una alerta reciente para esta referencia ─────────
  async yaAlertado(referenciaId, tipo) {
    const desde = new Date(Date.now() - DEDUP_HORAS * 3600 * 1000).toISOString();
    const { data } = await this.supabase
      .from('alertas')
      .select('id')
      .eq('referencia_id', referenciaId)
      .eq('tipo', tipo)
      .eq('resuelta', false)
      .gte('created_at', desde)
      .limit(1)
      .maybeSingle();
    return !!data;
  }

  // ── Crear alerta en DB y notificar al admin ─────────────────────────────────
  async crearAlerta({ tipo, severidad, referenciaId, referenciaTipo, numeroRef, mensaje }) {
    await this.supabase.from('alertas').insert({
      tipo, severidad,
      referencia_id:   referenciaId,
      referencia_tipo: referenciaTipo,
      numero_ref:      numeroRef,
      mensaje,
    });

    if (ADMIN_WHATSAPP) {
      const icono = severidad === 'critical' ? '🚨' : '⚠️';
      sendWhatsAppMessage(ADMIN_WHATSAPP, `${icono} *Alerta Droguería Virtual*\n\n${mensaje}`)
        .catch(err => console.error('[Alertas] WhatsApp admin error:', err.message));
    }

    console.log(`[Alertas] ${severidad.toUpperCase()} — ${tipo}: ${mensaje}`);
  }

  // ── Marcar alerta como resuelta ────────────────────────────────────────────
  async resolverAlerta(referenciaId, tipo) {
    await this.supabase
      .from('alertas')
      .update({ resuelta: true, resuelta_at: new Date().toISOString() })
      .eq('referencia_id', referenciaId)
      .eq('tipo', tipo)
      .eq('resuelta', false);
  }

  // ── CHECK 1: Órdenes B2B enviadas hace más de UMBRAL_B2B_HORAS ─────────────
  async checkOrdenesAtascadasB2B() {
    const limite = new Date(Date.now() - UMBRAL_B2B_HORAS * 3600 * 1000).toISOString();
    const { data: ordenes } = await this.supabase
      .from('ordenes_compra')
      .select('id, numero_orden, compradora_nombre, enviada_at, mensajeros!mensajero_id(nombre)')
      .eq('status', 'enviada')
      .lt('enviada_at', limite)
      .not('enviada_at', 'is', null);

    for (const o of ordenes || []) {
      if (await this.yaAlertado(o.id, 'orden_atascada_b2b')) continue;
      const horas = Math.round((Date.now() - new Date(o.enviada_at).getTime()) / 3600000);
      const mens = o.mensajeros?.nombre || 'sin mensajero';
      await this.crearAlerta({
        tipo:           'orden_atascada_b2b',
        severidad:      'critical',
        referenciaId:   o.id,
        referenciaTipo: 'orden_compra',
        numeroRef:      o.numero_orden,
        mensaje:        `Orden B2B *${o.numero_orden}* (${o.compradora_nombre}) lleva *${horas}h* en tránsito con ${mens} sin confirmar entrega.`,
      });
    }
  }

  // ── CHECK 2: Pedidos B2C en_camino hace más de UMBRAL_B2C_MIN ──────────────
  async checkPedidosAtascadosB2C() {
    const limite = new Date(Date.now() - UMBRAL_B2C_MIN * 60 * 1000).toISOString();
    const { data: pedidos } = await this.supabase
      .from('pedidos')
      .select('id, numero_pedido, cliente_nombre, updated_at, mensajeros!mensajero_id(nombre)')
      .eq('status', 'en_camino')
      .lt('updated_at', limite);

    for (const p of pedidos || []) {
      if (await this.yaAlertado(p.id, 'orden_atascada_b2c')) continue;
      const min = Math.round((Date.now() - new Date(p.updated_at).getTime()) / 60000);
      const mens = p.mensajeros?.nombre || 'sin mensajero';
      await this.crearAlerta({
        tipo:           'orden_atascada_b2c',
        severidad:      'critical',
        referenciaId:   p.id,
        referenciaTipo: 'pedido',
        numeroRef:      p.numero_pedido,
        mensaje:        `Pedido B2C *${p.numero_pedido}* (${p.cliente_nombre}) lleva *${min} min* en camino con ${mens} sin confirmar entrega.`,
      });
    }
  }

  // ── CHECK 3: Órdenes/pedidos pagados sin mensajero asignado ────────────────
  async checkSinMensajero() {
    const limite = new Date(Date.now() - UMBRAL_SIN_MENS_MIN * 60 * 1000).toISOString();

    // B2B: pagada sin mensajero
    const { data: b2b } = await this.supabase
      .from('ordenes_compra')
      .select('id, numero_orden, compradora_nombre, pagada_at')
      .eq('status', 'pagada')
      .is('mensajero_id', null)
      .lt('pagada_at', limite)
      .not('pagada_at', 'is', null);

    for (const o of b2b || []) {
      if (await this.yaAlertado(o.id, 'sin_mensajero')) continue;
      const min = Math.round((Date.now() - new Date(o.pagada_at).getTime()) / 60000);
      await this.crearAlerta({
        tipo:           'sin_mensajero',
        severidad:      'warning',
        referenciaId:   o.id,
        referenciaTipo: 'orden_compra',
        numeroRef:      o.numero_orden,
        mensaje:        `Orden B2B *${o.numero_orden}* (${o.compradora_nombre}) lleva *${min} min* pagada sin mensajero asignado.`,
      });
    }

    // B2C: pagado sin mensajero (status en_preparacion sin mensajero_id)
    const { data: b2c } = await this.supabase
      .from('pedidos')
      .select('id, numero_pedido, cliente_nombre, updated_at')
      .in('status', ['pagado', 'en_preparacion'])
      .is('mensajero_id', null)
      .lt('updated_at', limite);

    for (const p of b2c || []) {
      if (await this.yaAlertado(p.id, 'sin_mensajero')) continue;
      const min = Math.round((Date.now() - new Date(p.updated_at).getTime()) / 60000);
      await this.crearAlerta({
        tipo:           'sin_mensajero',
        severidad:      'warning',
        referenciaId:   p.id,
        referenciaTipo: 'pedido',
        numeroRef:      p.numero_pedido,
        mensaje:        `Pedido B2C *${p.numero_pedido}* (${p.cliente_nombre}) lleva *${min} min* sin mensajero asignado.`,
      });
    }
  }

  // ── CHECK 4: Mensajero en entrega sin actualizar GPS ───────────────────────
  async checkSinGPS() {
    const limite = new Date(Date.now() - UMBRAL_SIN_GPS_MIN * 60 * 1000).toISOString();
    const { data: mensajeros } = await this.supabase
      .from('mensajeros')
      .select('id, nombre, telefono, ultima_ubicacion_at')
      .eq('disponible', false)
      .not('pedido_actual_id', 'is', null)
      .or(`ultima_ubicacion_at.is.null,ultima_ubicacion_at.lt.${limite}`);

    for (const m of mensajeros || []) {
      if (await this.yaAlertado(m.id, 'sin_gps')) continue;
      const min = m.ultima_ubicacion_at
        ? Math.round((Date.now() - new Date(m.ultima_ubicacion_at).getTime()) / 60000)
        : null;
      const tiempoStr = min ? `*${min} min*` : '*nunca*';
      await this.crearAlerta({
        tipo:           'sin_gps',
        severidad:      'warning',
        referenciaId:   m.id,
        referenciaTipo: 'mensajero',
        numeroRef:      m.telefono,
        mensaje:        `Mensajero *${m.nombre}* lleva ${tiempoStr} sin actualizar GPS estando en una entrega.`,
      });
    }
  }

  // ── Resolver alertas de órdenes ya entregadas ──────────────────────────────
  async resolverAlertasEntregadas() {
    const { data: resueltas } = await this.supabase
      .from('alertas')
      .select('referencia_id, tipo, referencia_tipo')
      .eq('resuelta', false)
      .in('tipo', ['orden_atascada_b2b', 'orden_atascada_b2c', 'sin_mensajero']);

    for (const a of resueltas || []) {
      const tabla = a.referencia_tipo === 'orden_compra' ? 'ordenes_compra' : 'pedidos';
      const campo = a.referencia_tipo === 'orden_compra' ? 'entregada' : 'entregado';
      const { data } = await this.supabase
        .from(tabla).select('status').eq('id', a.referencia_id).maybeSingle();
      if (data?.status === campo || data?.status === 'cancelada') {
        await this.resolverAlerta(a.referencia_id, a.tipo);
      }
    }
  }

  // ── Punto de entrada del cron ──────────────────────────────────────────────
  async ejecutarChecks() {
    await Promise.allSettled([
      this.checkOrdenesAtascadasB2B(),
      this.checkPedidosAtascadosB2C(),
      this.checkSinMensajero(),
      this.checkSinGPS(),
      this.resolverAlertasEntregadas(),
    ]);
  }

  // ── API: obtener alertas activas ───────────────────────────────────────────
  async getAlertasActivas(limit = 20) {
    const { data } = await this.supabase
      .from('alertas')
      .select('*')
      .eq('resuelta', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  }
}

module.exports = AlertasService;
