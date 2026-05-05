'use strict';

/**
 * EmailService — Notificaciones transaccionales vía Resend
 *
 * Plantillas:
 *   • confirmacionPedido    — al cliente cuando su pago es confirmado
 *   • reciboEntrega         — al cliente cuando su pedido es entregado
 *   • alertaPedidoNuevo     — al admin cuando llega un pedido B2C
 *   • liquidacionMensual    — al socio distribuidor con el corte de fees
 *   • bienvenidaDrogueria   — a una droguería B2B recién aprobada
 *
 * Si RESEND_API_KEY no está configurada, los métodos solo loguean
 * sin enviar nada (útil en desarrollo).
 */

const FROM_EMAIL    = process.env.FROM_EMAIL    || 'no-reply@drogueriavirtual.co';
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL   || '';
const SOCIO_EMAIL   = process.env.SOCIO_EMAIL   || ''; // email del distribuidor
const RESEND_KEY    = process.env.RESEND_API_KEY;

let resend = null;
if (RESEND_KEY) {
  try {
    const { Resend } = require('resend');
    resend = new Resend(RESEND_KEY);
    console.log('[EmailService] Resend inicializado');
  } catch (err) {
    console.warn('[EmailService] Resend no disponible:', err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatearCOP(n) {
  return `$${Number(n || 0).toLocaleString('es-CO')}`;
}

function htmlBase(titulo, contenido) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
    <div style="background:#10b981;padding:24px;text-align:center;color:#fff;">
      <h1 style="margin:0;font-size:24px;">💊 Droguería Virtual</h1>
    </div>
    <div style="padding:32px 24px;color:#1f2937;line-height:1.6;">
      ${contenido}
    </div>
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;">
      Droguería Virtual • Cartagena, Colombia<br>
      ¿Preguntas? Responde a este correo.
    </div>
  </div>
</body>
</html>`;
}

// ── Clase ─────────────────────────────────────────────────────────────────────

class EmailService {
  /**
   * Envío genérico — ignora silenciosamente si Resend no está configurado.
   */
  async enviar({ to, subject, html, replyTo }) {
    if (!resend) {
      console.log(`[EmailService] (no-op) Email a ${to}: ${subject}`);
      return { success: false, reason: 'resend_no_configurado' };
    }
    if (!to) return { success: false, reason: 'sin_destinatario' };

    try {
      const { data, error } = await resend.emails.send({
        from:     FROM_EMAIL,
        to:       Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo && { reply_to: replyTo }),
      });
      if (error) throw error;
      console.log(`[EmailService] ✅ Enviado a ${to}: ${subject}`);
      return { success: true, id: data?.id };
    } catch (err) {
      console.error('[EmailService] Error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLANTILLAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Confirmación al cliente: pago recibido + ETA + datos del mensajero.
   */
  async confirmacionPedido({ email, nombre, numeroPedido, total, items = [], etaTexto, mensajero }) {
    if (!email) return { success: false, reason: 'sin_email' };

    const itemsHtml = items.map(i =>
      `<tr><td style="padding:8px 0;">${i.nombre} x${i.cantidad}</td><td style="padding:8px 0;text-align:right;">${formatearCOP(i.subtotal)}</td></tr>`
    ).join('');

    const mensajeroHtml = mensajero ? `
      <div style="margin-top:24px;padding:16px;background:#ecfdf5;border-radius:8px;">
        <strong>🛵 Tu domiciliario</strong><br>
        ${mensajero.nombre} — ${mensajero.telefono}<br>
        <small>Llegará en aprox. ${etaTexto || '30-45 min'}</small>
      </div>` : '';

    const html = htmlBase('Pedido confirmado', `
      <h2 style="margin:0 0 16px;color:#10b981;">✅ ¡Pago recibido!</h2>
      <p>Hola ${nombre || 'cliente'},</p>
      <p>Confirmamos tu pedido <strong>${numeroPedido}</strong>:</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${itemsHtml}
        <tr style="border-top:2px solid #10b981;">
          <td style="padding:12px 0;font-weight:bold;">Total</td>
          <td style="padding:12px 0;text-align:right;font-weight:bold;font-size:18px;color:#10b981;">${formatearCOP(total)}</td>
        </tr>
      </table>

      ${mensajeroHtml}

      <p style="margin-top:24px;color:#6b7280;font-size:14px;">
        Puedes seguir el estado de tu pedido escribiéndonos por WhatsApp:
        envía <strong>"seguimiento"</strong> o <strong>${numeroPedido}</strong>.
      </p>
    `);

    return this.enviar({ to: email, subject: `Pedido confirmado — ${numeroPedido}`, html });
  }

  /**
   * Recibo al cliente cuando su pedido es entregado.
   */
  async reciboEntrega({ email, nombre, numeroPedido, total, items = [] }) {
    if (!email) return { success: false, reason: 'sin_email' };

    const itemsHtml = items.map(i =>
      `<tr><td style="padding:6px 0;">${i.nombre} x${i.cantidad}</td><td style="padding:6px 0;text-align:right;">${formatearCOP(i.subtotal)}</td></tr>`
    ).join('');

    const html = htmlBase('Pedido entregado', `
      <h2 style="margin:0 0 16px;color:#10b981;">📦 Pedido entregado</h2>
      <p>Hola ${nombre || 'cliente'},</p>
      <p>Tu pedido <strong>${numeroPedido}</strong> fue entregado exitosamente.</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${itemsHtml}
        <tr style="border-top:2px solid #e5e7eb;">
          <td style="padding:12px 0;font-weight:bold;">Total pagado</td>
          <td style="padding:12px 0;text-align:right;font-weight:bold;">${formatearCOP(total)}</td>
        </tr>
      </table>

      <p>Gracias por tu compra 💊</p>
      <p style="font-size:14px;color:#6b7280;">Si necesitas factura electrónica, responde este correo con tu NIT.</p>
    `);

    return this.enviar({ to: email, subject: `Recibo — ${numeroPedido}`, html });
  }

  /**
   * Alerta interna al admin: llegó un pedido B2C nuevo.
   */
  async alertaPedidoNuevo({ numeroPedido, total, clienteNombre, clienteTelefono }) {
    if (!ADMIN_EMAIL) return { success: false, reason: 'sin_admin_email' };

    const html = htmlBase('Pedido B2C nuevo', `
      <h2 style="color:#f59e0b;">🔔 Nuevo pedido</h2>
      <p><strong>${numeroPedido}</strong></p>
      <ul>
        <li>Cliente: ${clienteNombre || 'N/A'}</li>
        <li>Teléfono: ${clienteTelefono}</li>
        <li>Total: <strong>${formatearCOP(total)}</strong></li>
      </ul>
      <p>Revisa el panel de admin para más detalles.</p>
    `);

    return this.enviar({ to: ADMIN_EMAIL, subject: `🔔 ${numeroPedido} — ${formatearCOP(total)}`, html });
  }

  /**
   * Reporte mensual de liquidación al socio distribuidor.
   */
  async liquidacionMensual({ liquidacion, pedidos }) {
    if (!SOCIO_EMAIL) return { success: false, reason: 'sin_socio_email' };

    const filas = (pedidos || []).slice(0, 50).map(p =>
      `<tr><td style="padding:6px 0;">${p.numero_pedido}</td><td style="padding:6px 0;text-align:right;">${formatearCOP(p.total)}</td><td style="padding:6px 0;text-align:right;color:#10b981;">${formatearCOP(p.fee_monto)}</td></tr>`
    ).join('');

    const html = htmlBase('Liquidación mensual', `
      <h2 style="color:#10b981;">📊 Liquidación B2C</h2>
      <p><strong>Período:</strong> ${liquidacion.periodo_inicio} → ${liquidacion.periodo_fin}</p>

      <table style="width:100%;background:#f9fafb;padding:16px;border-radius:8px;margin:16px 0;">
        <tr><td>Pedidos despachados</td><td style="text-align:right;"><strong>${liquidacion.total_pedidos}</strong></td></tr>
        <tr><td>Valor bruto</td><td style="text-align:right;">${formatearCOP(liquidacion.valor_bruto)}</td></tr>
        <tr><td>Fee plataforma</td><td style="text-align:right;color:#10b981;"><strong>${formatearCOP(liquidacion.total_fee)}</strong></td></tr>
        <tr><td>Neto distribuidor</td><td style="text-align:right;font-weight:bold;">${formatearCOP(liquidacion.total_neto)}</td></tr>
      </table>

      <h3>Detalle (primeros 50)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="border-bottom:2px solid #e5e7eb;">
            <th style="text-align:left;padding:8px 0;">Pedido</th>
            <th style="text-align:right;padding:8px 0;">Total</th>
            <th style="text-align:right;padding:8px 0;">Fee</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `);

    return this.enviar({
      to: SOCIO_EMAIL,
      subject: `Liquidación ${liquidacion.periodo_inicio} → ${liquidacion.periodo_fin}`,
      html
    });
  }

  /**
   * Bienvenida a una droguería B2B recién aprobada.
   */
  async bienvenidaDrogueria({ email, nombre }) {
    if (!email) return { success: false, reason: 'sin_email' };

    const html = htmlBase('Bienvenido', `
      <h2 style="color:#10b981;">¡Bienvenido a Droguería Virtual!</h2>
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Tu droguería ya está activa en nuestra plataforma B2B.</p>
      <p>Ahora puedes hacer tus pedidos al por mayor escribiendo a nuestro WhatsApp.
      Solo envía el nombre del medicamento que necesitas y te enviaremos cotización inmediata
      con los precios mayoristas y descuentos por volumen.</p>
      <p>Beneficios:</p>
      <ul>
        <li>✅ Cotización inmediata por WhatsApp</li>
        <li>✅ Descuento 3% en compras desde $200.000</li>
        <li>✅ Descuento 5% en compras desde $500.000</li>
        <li>✅ Despacho en 2-4 horas</li>
      </ul>
    `);

    return this.enviar({ to: email, subject: '¡Bienvenido a Droguería Virtual!', html });
  }
}

module.exports = new EmailService();
