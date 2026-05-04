'use strict';

/**
 * WompiService — Pasarela de pago Wompi (Bancolombia)
 *
 * Reemplaza el flujo manual de Nequi/Daviplata + screenshot.
 * Genera un link de pago único por pedido y recibe la confirmación
 * automática vía webhook cuando el cliente paga.
 *
 * Documentación oficial:
 *   https://docs.wompi.co/docs/colombia/inicio
 *
 * Flujo:
 *   1. Bot crea el pedido con status='pendiente_pago'.
 *   2. crearLinkPago() devuelve URL única → bot la envía al cliente.
 *   3. Cliente paga con tarjeta, PSE, Nequi, Bancolombia Botón, Daviplata.
 *   4. Wompi llama nuestro webhook /webhook/wompi.
 *   5. validarFirmaWebhook() verifica autenticidad (HMAC SHA256).
 *   6. procesarEvento() actualiza el pedido y dispara asignación de mensajero.
 */

const crypto = require('crypto');
const axios  = require('axios');

// ─── Constantes ───────────────────────────────────────────────────────────────

const WOMPI_API_URL = process.env.WOMPI_API_URL || 'https://production.wompi.co/v1';
// Para sandbox: https://sandbox.wompi.co/v1

const WOMPI_PUBLIC_KEY    = process.env.WOMPI_PUBLIC_KEY;     // pub_prod_xxx
const WOMPI_PRIVATE_KEY   = process.env.WOMPI_PRIVATE_KEY;    // prv_prod_xxx
const WOMPI_INTEGRITY_KEY = process.env.WOMPI_INTEGRITY_KEY;  // para firmar la transacción
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET;  // para validar webhooks

// ─── Clase ────────────────────────────────────────────────────────────────────

class WompiService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GENERACIÓN DE LINK DE PAGO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Genera un link de pago único para un pedido.
   * Wompi devuelve una URL hosted donde el cliente paga con tarjeta, PSE,
   * Nequi, Bancolombia Botón o Daviplata.
   *
   * @param {{
   *   pedidoId:        string,
   *   numeroPedido:    string,
   *   total:           number,    -- en COP enteros (sin decimales)
   *   clienteEmail?:   string,
   *   clienteNombre?:  string,
   *   clienteTelefono?: string,
   *   redirectUrl?:    string,    -- a dónde regresar después del pago
   * }} params
   * @returns {Promise<{ success, urlPago, referencia, error? }>}
   */
  async crearLinkPago({ pedidoId, numeroPedido, total, clienteEmail, clienteNombre, clienteTelefono, redirectUrl }) {
    if (!WOMPI_PRIVATE_KEY) {
      console.error('[Wompi] Falta WOMPI_PRIVATE_KEY en variables de entorno');
      return { success: false, error: 'Wompi no configurado' };
    }

    try {
      // Wompi requiere monto en centavos
      const amountInCents = Math.round(total * 100);

      // Referencia única — usa el número de pedido para trazabilidad
      const referencia = `${numeroPedido}-${Date.now()}`;

      // Firma de integridad (anti-tampering)
      const firma = this._calcularFirmaIntegridad(referencia, amountInCents, 'COP');

      const payload = {
        name:                `Pedido ${numeroPedido}`,
        description:         `Droguería Virtual — ${numeroPedido}`,
        single_use:          true,
        collect_shipping:    false,
        currency:            'COP',
        amount_in_cents:     amountInCents,
        expires_at:          new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h
        redirect_url:        redirectUrl || process.env.API_URL,
        customer_data: {
          email:      clienteEmail    || `${(clienteTelefono || 'cliente').replace(/\D/g, '')}@drogueriavirtual.co`,
          full_name:  clienteNombre   || 'Cliente Droguería Virtual',
          phone_number: clienteTelefono ? `+57${clienteTelefono.replace(/\D/g, '').slice(-10)}` : undefined,
        },
        // Metadata para reconocer el pedido en el webhook
        reference:  referencia,
      };

      const { data } = await axios.post(
        `${WOMPI_API_URL}/payment_links`,
        payload,
        { headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` } }
      );

      const idLink  = data?.data?.id;
      const urlPago = idLink ? `https://checkout.wompi.co/l/${idLink}` : null;

      if (!urlPago) {
        return { success: false, error: 'Wompi no devolvió URL de pago' };
      }

      // Guardar la referencia en el pedido para reconciliación posterior
      await this.supabase
        .from('pedidos')
        .update({
          wompi_referencia:  referencia,
          wompi_link_id:     idLink,
          wompi_link_url:    urlPago,
          metodo_pago:       'wompi',
          status:            'pendiente_pago',
        })
        .eq('id', pedidoId);

      console.log(`[Wompi] Link generado — pedido ${numeroPedido} | $${total} | ${urlPago}`);
      return { success: true, urlPago, referencia, idLink };

    } catch (err) {
      const detalle = err.response?.data || err.message;
      console.error('[Wompi] crearLinkPago error:', JSON.stringify(detalle));
      return { success: false, error: 'Error al crear el link de pago' };
    }
  }

  /**
   * Firma de integridad requerida por Wompi (anti-tampering).
   * Formato: SHA256(referencia + amount_in_cents + currency + integrity_key)
   */
  _calcularFirmaIntegridad(referencia, amountInCents, currency) {
    const cadena = `${referencia}${amountInCents}${currency}${WOMPI_INTEGRITY_KEY}`;
    return crypto.createHash('sha256').update(cadena).digest('hex');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WEBHOOK DE EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Valida la firma HMAC del webhook de Wompi.
   * Sin esto, cualquiera podría falsificar pagos llamando nuestro endpoint.
   *
   * @param {object} body — payload completo del webhook
   * @returns {boolean}
   */
  validarFirmaWebhook(body) {
    if (!WOMPI_EVENTS_SECRET) {
      console.error('[Wompi] Falta WOMPI_EVENTS_SECRET — no se puede validar webhook');
      return false;
    }

    try {
      const props = body?.signature?.properties || [];
      const checksum = body?.signature?.checksum;
      const timestamp = body?.timestamp;

      // Construir la cadena de firma según el protocolo de Wompi
      let cadena = '';
      for (const prop of props) {
        const valor = this._obtenerPropiedadAnidada(body.data, prop);
        cadena += valor;
      }
      cadena += timestamp + WOMPI_EVENTS_SECRET;

      const firmaCalculada = crypto.createHash('sha256').update(cadena).digest('hex');

      const valido = firmaCalculada === checksum;
      if (!valido) {
        console.warn('[Wompi] Firma de webhook inválida — posible fraude');
      }
      return valido;

    } catch (err) {
      console.error('[Wompi] Error validando firma:', err.message);
      return false;
    }
  }

  /**
   * Obtiene una propiedad anidada de un objeto: "transaction.amount_in_cents" → obj.transaction.amount_in_cents
   */
  _obtenerPropiedadAnidada(obj, path) {
    return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? '';
  }

  /**
   * Procesa un evento de Wompi (transaction.updated).
   * Cuando el pago es APPROVED, marca el pedido como pagado y dispara
   * el flujo de descuento de inventario y asignación de mensajero.
   *
   * @param {object} body — payload completo del webhook
   * @param {object} hooks — funciones a ejecutar después del pago aprobado:
   *   { onPagoAprobado: async (pedidoId, transaccion) => {...} }
   * @returns {Promise<{ procesado, pedidoId?, status? }>}
   */
  async procesarEvento(body, hooks = {}) {
    const evento     = body?.event;
    const transaccion = body?.data?.transaction;
    if (!evento || !transaccion) {
      return { procesado: false, error: 'Payload inválido' };
    }

    const referencia    = transaccion.reference;
    const status        = transaccion.status;            // APPROVED | DECLINED | VOIDED | ERROR | PENDING
    const transactionId = transaccion.id;
    const amountCop     = transaccion.amount_in_cents / 100;

    console.log(`[Wompi] Evento ${evento} — ref: ${referencia} | status: ${status} | $${amountCop}`);

    // Buscar el pedido por referencia
    const { data: pedido } = await this.supabase
      .from('pedidos')
      .select('id, numero_pedido, total, status')
      .eq('wompi_referencia', referencia)
      .maybeSingle();

    if (!pedido) {
      console.warn(`[Wompi] Pedido no encontrado para referencia ${referencia}`);
      return { procesado: false, error: 'Pedido no encontrado' };
    }

    // Actualizar el pedido con el resultado del pago
    const updates = {
      wompi_transaction_id: transactionId,
      wompi_status:         status,
      wompi_evento_at:      new Date().toISOString(),
    };

    if (status === 'APPROVED') {
      updates.status        = 'confirmado';
      updates.pagado_at     = new Date().toISOString();
      updates.fee_estado    = 'pendiente';

      await this.supabase.from('pedidos').update(updates).eq('id', pedido.id);

      // Disparar hook (descontar stock + asignar mensajero)
      if (hooks.onPagoAprobado) {
        try {
          await hooks.onPagoAprobado(pedido.id, transaccion);
        } catch (err) {
          console.error('[Wompi] Error en hook onPagoAprobado:', err.message);
        }
      }

      console.log(`[Wompi] ✅ Pago APROBADO — pedido ${pedido.numero_pedido}`);
      return { procesado: true, pedidoId: pedido.id, numeroPedido: pedido.numero_pedido, status: 'APPROVED' };

    } else if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') {
      updates.status = 'cancelado';
      await this.supabase.from('pedidos').update(updates).eq('id', pedido.id);

      console.log(`[Wompi] ❌ Pago RECHAZADO/CANCELADO — pedido ${pedido.numero_pedido}: ${status}`);
      return { procesado: true, pedidoId: pedido.id, numeroPedido: pedido.numero_pedido, status };
    }

    // PENDING u otros: solo guardar el estado
    await this.supabase.from('pedidos').update(updates).eq('id', pedido.id);
    return { procesado: true, pedidoId: pedido.id, status };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSULTA DE TRANSACCIÓN (fallback / reconciliación)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Consulta el estado de una transacción directamente en Wompi.
   * Útil para reconciliación si el webhook falla.
   */
  async consultarTransaccion(transactionId) {
    try {
      const { data } = await axios.get(
        `${WOMPI_API_URL}/transactions/${transactionId}`,
        { headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` } }
      );
      return data?.data;
    } catch (err) {
      console.error('[Wompi] consultarTransaccion error:', err.message);
      return null;
    }
  }
}

module.exports = WompiService;
