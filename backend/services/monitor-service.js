'use strict';

/**
 * MonitorService — Captura de errores + alertas operativas
 *
 * Dos capas de observabilidad:
 *
 *   1. Sentry — captura de excepciones, breadcrumbs, performance.
 *      Solo se activa si está SENTRY_DSN configurado en el .env.
 *
 *   2. Alertas WhatsApp al admin — para eventos críticos del negocio:
 *        • Sin mensajeros disponibles cuando llega un pedido
 *        • Stock crítico (< umbral) en un medicamento popular
 *        • Pago Wompi rechazado / error en pasarela
 *        • Error 500 en webhook de WhatsApp
 *        • Pedido pendiente_pago por más de 1 hora (no pagaron)
 *
 * Para evitar spam, cada tipo de alerta tiene un cooldown:
 *   no se manda la misma alerta dos veces en menos de N minutos.
 */

const { sendWhatsAppMessage } = require('./whatsapp-service');

// Cooldowns por tipo de alerta (en milisegundos)
const COOLDOWNS = {
  sin_mensajeros:   15 * 60 * 1000,   // 15 min
  stock_critico:    60 * 60 * 1000,   //  1 hora
  pago_fallido:      5 * 60 * 1000,   //  5 min
  webhook_error:    10 * 60 * 1000,   // 10 min
  pago_abandonado:  30 * 60 * 1000,   // 30 min
  generico:          5 * 60 * 1000,
};

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || ''; // ej: 3001234567
const SENTRY_DSN     = process.env.SENTRY_DSN || '';

let Sentry = null;
if (SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,  // 10% de las transacciones
    });
    console.log('[Monitor] Sentry inicializado correctamente');
  } catch (err) {
    console.warn('[Monitor] Sentry no disponible (falta @sentry/node):', err.message);
    Sentry = null;
  }
}

class MonitorService {
  constructor() {
    /** @type {Map<string, number>} última vez (ms) que se envió cada tipo */
    this.ultimasAlertas = new Map();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAPTURA DE ERRORES (Sentry)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Captura una excepción para análisis posterior en Sentry.
   * Si Sentry no está configurado, solo loguea en consola.
   */
  capturarError(error, contexto = {}) {
    console.error('[Monitor] Error capturado:', error.message, contexto);
    if (Sentry) {
      Sentry.withScope(scope => {
        Object.entries(contexto).forEach(([k, v]) => scope.setExtra(k, v));
        Sentry.captureException(error);
      });
    }
  }

  /**
   * Registra un evento puntual (no error) para Sentry/logs.
   */
  capturarEvento(mensaje, nivel = 'info', extra = {}) {
    if (Sentry) {
      Sentry.withScope(scope => {
        Object.entries(extra).forEach(([k, v]) => scope.setExtra(k, v));
        Sentry.captureMessage(mensaje, nivel);
      });
    }
    if (nivel === 'warning' || nivel === 'error') {
      console.warn(`[Monitor] ${mensaje}`, extra);
    }
  }

  /**
   * Middleware Express para capturar errores no manejados.
   */
  middleware() {
    return (err, req, res, next) => {
      this.capturarError(err, {
        url:     req.url,
        method:  req.method,
        body:    req.body,
        headers: { 'user-agent': req.get('user-agent') },
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error interno del servidor' });
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ALERTAS OPERATIVAS (WhatsApp al admin)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Envía una alerta al admin por WhatsApp, respetando cooldown.
   * @param {string} tipo  - clave del cooldown (ej: 'sin_mensajeros')
   * @param {string} mensaje
   * @returns {Promise<boolean>} true si se envió, false si está en cooldown
   */
  async alertarAdmin(tipo, mensaje) {
    if (!ADMIN_WHATSAPP) {
      console.warn('[Monitor] ADMIN_WHATSAPP no configurado — alerta no enviada');
      return false;
    }

    const ahora    = Date.now();
    const ultima   = this.ultimasAlertas.get(tipo) || 0;
    const cooldown = COOLDOWNS[tipo] || COOLDOWNS.generico;

    if (ahora - ultima < cooldown) {
      console.log(`[Monitor] Alerta '${tipo}' en cooldown (${Math.round((cooldown - (ahora - ultima)) / 60000)}min restantes)`);
      return false;
    }

    try {
      await sendWhatsAppMessage(ADMIN_WHATSAPP, mensaje);
      this.ultimasAlertas.set(tipo, ahora);
      console.log(`[Monitor] Alerta enviada: ${tipo}`);
      return true;
    } catch (err) {
      console.error('[Monitor] Error enviando alerta:', err.message);
      return false;
    }
  }

  // ── Alertas predefinidas ──────────────────────────────────────────────────

  async alertarSinMensajeros(numeroPedido, ciudad) {
    return this.alertarAdmin('sin_mensajeros',
      `🚨 *ALERTA OPERATIVA*\n\n` +
      `📦 Pedido *${numeroPedido}* sin mensajero disponible.\n` +
      `📍 Ciudad: ${ciudad || 'desconocida'}\n\n` +
      `Acción: registrar más mensajeros o reactivar los inactivos en el panel.`
    );
  }

  async alertarStockCritico(medicamento, stockActual, drogueriaNombre) {
    return this.alertarAdmin('stock_critico',
      `⚠️ *STOCK CRÍTICO*\n\n` +
      `💊 ${medicamento}\n` +
      `📦 Stock actual: *${stockActual} unidades*\n` +
      `🏪 ${drogueriaNombre}\n\n` +
      `Reabastecer pronto o el pedido fallará.`
    );
  }

  async alertarPagoFallido(numeroPedido, motivo) {
    return this.alertarAdmin('pago_fallido',
      `💳 *PAGO FALLIDO*\n\n` +
      `📦 Pedido: ${numeroPedido}\n` +
      `❌ Motivo: ${motivo}\n\n` +
      `Verifica configuración Wompi o contacta al cliente.`
    );
  }

  async alertarPagoAbandonado(numeroPedido, total, telefono) {
    return this.alertarAdmin('pago_abandonado',
      `⏰ *PAGO ABANDONADO*\n\n` +
      `📦 ${numeroPedido} | $${Number(total).toLocaleString('es-CO')}\n` +
      `📞 Cliente: ${telefono}\n\n` +
      `El cliente generó link de pago hace +1h y no pagó.\n` +
      `Considera contactarlo o liberar el stock reservado.`
    );
  }

  async alertarWebhookError(servicio, error) {
    return this.alertarAdmin('webhook_error',
      `🔥 *WEBHOOK ERROR*\n\n` +
      `Servicio: ${servicio}\n` +
      `Error: ${error.substring(0, 200)}\n\n` +
      `Revisa los logs en Render.`
    );
  }
}

// Singleton — todo el backend usa la misma instancia
module.exports = new MonitorService();
