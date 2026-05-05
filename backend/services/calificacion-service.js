'use strict';

/**
 * CalificacionService — Sistema de calificaciones de mensajeros (B2C + B2B)
 *
 * Flujo:
 *   1. Pedido se marca como entregado (status = 'entregado', entregado_at = NOW()).
 *   2. Cron cada 5 min llama a procesarCalificacionesAutomatico():
 *      - Busca pedidos entregados hace > 5 min sin calificacion_solicitada_at.
 *      - Envía mensaje WhatsApp pidiendo rating 1-5.
 *      - Marca calificacion_solicitada_at = NOW() para no volver a pedir.
 *   3. Cliente responde con un número 1-5 (manejado en bot.js).
 *   4. registrarCalificacion() inserta en `calificaciones`.
 *   5. Trigger SQL `calificacion_actualiza_promedio` recalcula
 *      mensajeros.calificacion_promedio automáticamente.
 */

const { sendWhatsAppMessage } = require('./whatsapp-service');

class CalificacionService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SOLICITUD DE CALIFICACIÓN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Envía un mensaje al cliente solicitando que califique al mensajero.
   * Marca pedidos.calificacion_solicitada_at para evitar re-envíos.
   *
   * @param {string} pedidoId
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async pedirCalificacion(pedidoId) {
    try {
      const { data: pedido, error } = await this.supabase
        .from('pedidos')
        .select(`
          id, numero_pedido, cliente_telefono, cliente_nombre,
          status, entregado_at, calificacion_solicitada_at,
          mensajero_id, mensajeros ( nombre )
        `)
        .eq('id', pedidoId)
        .maybeSingle();

      if (error) throw error;
      if (!pedido) {
        return { success: false, error: 'Pedido no encontrado' };
      }

      if (pedido.status !== 'entregado') {
        return { success: false, error: 'Pedido no está entregado' };
      }

      if (pedido.calificacion_solicitada_at) {
        return { success: false, error: 'Ya se solicitó calificación' };
      }

      // Verificar si ya existe calificación
      const { data: existente } = await this.supabase
        .from('calificaciones')
        .select('id')
        .eq('pedido_id', pedidoId)
        .maybeSingle();

      if (existente) {
        return { success: false, error: 'Pedido ya calificado' };
      }

      const nombreMensajero = pedido.mensajeros?.nombre || 'tu domiciliario';
      const cliente = (pedido.cliente_nombre || '').split(' ')[0] || '';

      const mensaje =
        `${cliente ? `Hola ${cliente}, ` : ''}` +
        `🌟 *¿Cómo estuvo tu entrega?*\n\n` +
        `Tu pedido *${pedido.numero_pedido}* fue entregado por *${nombreMensajero}*.\n\n` +
        `Por favor califica el servicio respondiendo con un número del *1 al 5*:\n\n` +
        `5️⃣ Excelente\n` +
        `4️⃣ Muy bueno\n` +
        `3️⃣ Bueno\n` +
        `2️⃣ Regular\n` +
        `1️⃣ Malo\n\n` +
        `_Tu opinión nos ayuda a mejorar el servicio_ 💊`;

      try {
        await sendWhatsAppMessage(pedido.cliente_telefono, mensaje);
      } catch (errMsg) {
        console.warn(
          `[CalificacionService] No se pudo enviar mensaje a ${pedido.cliente_telefono}:`,
          errMsg.message
        );
        return { success: false, error: errMsg.message };
      }

      // Marcar como solicitada
      const { error: errUpd } = await this.supabase
        .from('pedidos')
        .update({ calificacion_solicitada_at: new Date().toISOString() })
        .eq('id', pedidoId);

      if (errUpd) throw errUpd;

      console.log(
        `[CalificacionService] Calificación solicitada para pedido ${pedido.numero_pedido}`
      );
      return { success: true };
    } catch (err) {
      console.error('[CalificacionService] pedirCalificacion error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REGISTRO DE CALIFICACIÓN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Guarda la calificación recibida del cliente.
   * El trigger SQL actualiza automáticamente el promedio del mensajero.
   *
   * @param {string} pedidoId
   * @param {string} telefono
   * @param {number} estrellas  1..5
   * @param {string|null} comentario
   * @returns {Promise<object>}
   */
  async registrarCalificacion(pedidoId, telefono, estrellas, comentario = null) {
    try {
      const stars = parseInt(estrellas, 10);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        throw new Error('Las estrellas deben ser un entero entre 1 y 5');
      }

      // Obtener mensajero_id del pedido
      const { data: pedido, error: errPed } = await this.supabase
        .from('pedidos')
        .select('id, mensajero_id, calificacion_solicitada_at')
        .eq('id', pedidoId)
        .maybeSingle();

      if (errPed) throw errPed;
      if (!pedido) throw new Error('Pedido no encontrado');

      const { data, error } = await this.supabase
        .from('calificaciones')
        .insert({
          pedido_id:             pedidoId,
          mensajero_id:          pedido.mensajero_id || null,
          cliente_telefono:      telefono,
          estrellas:             stars,
          comentario:            comentario || null,
          pedido_solicitado_at:  pedido.calificacion_solicitada_at || null,
        })
        .select()
        .single();

      if (error) {
        // Si hay UNIQUE violation, no es error fatal — ya existía
        if (error.code === '23505') {
          console.warn(`[CalificacionService] Pedido ${pedidoId} ya estaba calificado`);
          return { yaExistia: true };
        }
        throw error;
      }

      console.log(
        `[CalificacionService] Calificación ${stars}⭐ registrada para pedido ${pedidoId}`
      );
      return data;
    } catch (err) {
      console.error('[CalificacionService] registrarCalificacion error:', err.message);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Top mensajeros por calificación promedio.
   * Solo considera mensajeros con al menos 1 calificación.
   *
   * @param {number} limite
   * @returns {Promise<Array>}
   */
  async mensajerosTopRated(limite = 10) {
    try {
      const { data: mensajeros, error } = await this.supabase
        .from('mensajeros')
        .select('id, nombre, telefono, ciudad, zona, vehiculo, calificacion_promedio, pedidos_completados')
        .eq('status', 'activo')
        .order('calificacion_promedio', { ascending: false })
        .order('pedidos_completados', { ascending: false })
        .limit(limite);

      if (error) throw error;

      // Enriquecer con conteo de calificaciones reales
      const ids = (mensajeros || []).map((m) => m.id);
      let conteos = {};

      if (ids.length > 0) {
        const { data: califs } = await this.supabase
          .from('calificaciones')
          .select('mensajero_id, estrellas')
          .in('mensajero_id', ids);

        (califs || []).forEach((c) => {
          if (!conteos[c.mensajero_id]) {
            conteos[c.mensajero_id] = { total: 0, suma: 0 };
          }
          conteos[c.mensajero_id].total += 1;
          conteos[c.mensajero_id].suma += c.estrellas;
        });
      }

      return (mensajeros || []).map((m) => ({
        ...m,
        total_calificaciones: conteos[m.id]?.total || 0,
      }));
    } catch (err) {
      console.error('[CalificacionService] mensajerosTopRated error:', err.message);
      throw err;
    }
  }

  /**
   * Pedidos entregados hace > 5 min a los que aún no se les ha pedido calificación.
   *
   * @returns {Promise<Array>}
   */
  async pedidosPendientesRating() {
    try {
      const hace5Min = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Pedidos entregados, sin solicitud de calificación, sin calificación previa
      const { data: pedidos, error } = await this.supabase
        .from('pedidos')
        .select('id, numero_pedido, cliente_telefono, cliente_nombre, mensajero_id, entregado_at, calificacion_solicitada_at, status')
        .eq('status', 'entregado')
        .is('calificacion_solicitada_at', null)
        .lte('entregado_at', hace5Min)
        .not('entregado_at', 'is', null)
        .not('mensajero_id', 'is', null)
        .order('entregado_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      if (!pedidos || pedidos.length === 0) return [];

      // Filtrar los que ya tienen calificación registrada
      const ids = pedidos.map((p) => p.id);
      const { data: yaCalificados } = await this.supabase
        .from('calificaciones')
        .select('pedido_id')
        .in('pedido_id', ids);

      const setCalificados = new Set((yaCalificados || []).map((c) => c.pedido_id));

      return pedidos.filter((p) => !setCalificados.has(p.id));
    } catch (err) {
      console.error('[CalificacionService] pedidosPendientesRating error:', err.message);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CRON: Procesar pendientes
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Llama por cron cada 5 min: pide calificación a todos los pedidos
   * entregados hace > 5 min sin solicitud previa.
   *
   * @returns {Promise<{procesados:number, solicitadas:number, errores:number}>}
   */
  async procesarCalificacionesAutomatico() {
    const resumen = { procesados: 0, solicitadas: 0, errores: 0 };

    try {
      const pendientes = await this.pedidosPendientesRating();
      resumen.procesados = pendientes.length;

      for (const pedido of pendientes) {
        const r = await this.pedirCalificacion(pedido.id);
        if (r.success) {
          resumen.solicitadas += 1;
        } else {
          resumen.errores += 1;
        }
      }

      if (resumen.solicitadas > 0) {
        console.log(
          `[CalificacionService] Procesadas ${resumen.procesados} | Solicitadas ${resumen.solicitadas} | Errores ${resumen.errores}`
        );
      }
    } catch (err) {
      console.error('[CalificacionService] procesarCalificacionesAutomatico error:', err.message);
      resumen.errores += 1;
    }

    return resumen;
  }
}

module.exports = CalificacionService;
