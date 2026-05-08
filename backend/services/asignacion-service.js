'use strict';

/**
 * AsignacionService — Motor de asignación óptima de mensajeros
 *
 * B2C TURBO (similar a Rappi Turbo):
 *   Minimiza el tiempo total de entrega usando distancias reales (Haversine).
 *   Promesa: 30-45 minutos al cliente.
 *   Score = dist(mensajero → farmacia) × 2 + dist(farmacia → cliente)
 *   (Se pondera ×2 el tramo de recogida porque es el cuello de botella.)
 *
 * B2B NORMAL:
 *   Distribución justa por carga de trabajo.
 *   Sin dependencia de GPS — asigna al mensajero más "descansado" en la ciudad.
 *   Promesa: 2-4 horas.
 *
 * Velocidades urbanas promedio Colombia:
 *   moto      → 25 km/h
 *   bicicleta → 12 km/h
 *   pie       →  4 km/h
 */

const { sendWhatsAppMessage } = require('./whatsapp-service');
const monitor = require('./monitor-service');

// ─── Constantes ───────────────────────────────────────────────────────────────

const VELOCIDADES_KMH = { moto: 25, bicicleta: 12, pie: 4 };
const TIEMPO_PREPARACION_MIN = 10;     // tiempo en farmacia preparando el pedido
const RADIO_MAXIMO_KM        = 15;     // radio máximo para buscar mensajero cercano
const STALE_GPS_MIN          = 45;     // GPS > 45 min → considerar posición desactualizada
const ETA_ALERTA_MIN         = 50;     // Si ETA > 50 min → alerta al admin

// ─── Clase ───────────────────────────────────────────────────────────────────

class AsignacionService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GEOMETRÍA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Distancia entre dos puntos GPS en kilómetros (fórmula de Haversine).
   */
  calcularDistanciaKm(lat1, lng1, lat2, lng2) {
    const R    = 6371;
    const dLat = this._rad(lat2 - lat1);
    const dLng = this._rad(lng2 - lng1);
    const a    =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this._rad(lat1)) * Math.cos(this._rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _rad(deg) { return (deg * Math.PI) / 180; }

  /**
   * ETA en minutos para un tramo, dado el tipo de vehículo.
   */
  calcularEtaMinutos(distanciaKm, vehiculo = 'moto') {
    const vel = VELOCIDADES_KMH[vehiculo] || VELOCIDADES_KMH.moto;
    return Math.ceil((distanciaKm / vel) * 60);
  }

  /**
   * ¿El GPS del mensajero está actualizado (no más de STALE_GPS_MIN minutos)?
   */
  _gpsVigente(mensajero) {
    if (!mensajero.ultima_lat || !mensajero.ultima_ubicacion_at) return false;
    const diffMin = (Date.now() - new Date(mensajero.ultima_ubicacion_at).getTime()) / 60000;
    return diffMin <= STALE_GPS_MIN;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B2C TURBO — Asignación por proximidad GPS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Asigna el mensajero óptimo para un pedido B2C.
   *
   * Algoritmo:
   *   1. Obtiene todos los mensajeros activos y disponibles.
   *   2. Para cada uno con GPS vigente calcula:
   *        score = dist(mensajero→farmacia)×2 + dist(farmacia→cliente)
   *   3. Elige el menor score.
   *   4. Fallback si ninguno tiene GPS: mensajero con zona coincidente o más descansado.
   *   5. Actualiza pedido + mensajero en BD.
   *   6. Notifica al mensajero con ruta y ETA.
   *   7. Retorna resultado con ETA para informar al cliente.
   *
   * @param {{
   *   pedidoId:      string,
   *   drogueriaId:   string|null,
   *   clienteLat:    number,
   *   clienteLng:    number,
   *   clienteNombre: string,
   *   clienteTel:    string,
   * }} params
   * @returns {Promise<{
   *   success:    boolean,
   *   mensajero?: object,
   *   etaMinutos?: number,
   *   etaTexto?:  string,
   *   modo?:      'gps'|'zona'|'cualquiera',
   *   alerta_admin?: string,
   *   error?:     string,
   * }>}
   */
  async asignarTurboB2C({ pedidoId, drogueriaId, clienteLat, clienteLng, clienteNombre, clienteTel }) {
    console.log(`[Asignacion] TURBO B2C — pedido ${pedidoId}`);

    try {
      // 1. Ubicación de la farmacia (o coordenadas nulas si sin droguería asignada)
      let drogLat = null, drogLng = null, drogNombre = 'Droguería Virtual', drogDireccion = '';
      if (drogueriaId) {
        const { data: drog } = await this.supabase
          .from('droguerias')
          .select('nombre, direccion, lat, lng')
          .eq('id', drogueriaId)
          .maybeSingle();
        if (drog) {
          drogLat      = drog.lat;
          drogLng      = drog.lng;
          drogNombre   = drog.nombre;
          drogDireccion = drog.direccion || '';
        }
      }

      // 2. Obtener todos los mensajeros disponibles
      const { data: mensajeros, error } = await this.supabase
        .from('mensajeros')
        .select('id, nombre, telefono, vehiculo, zona, ciudad, ultima_lat, ultima_lng, ultima_ubicacion_at, ultimo_pedido_at')
        .eq('status', 'activo')
        .eq('disponible', true)
        .is('pedido_actual_id', null);

      if (error) throw error;
      if (!mensajeros || mensajeros.length === 0) {
        // Alerta al admin
        await monitor.alertarSinMensajeros(pedidoId, 'Cartagena');
        return { success: false, error: 'Sin mensajeros disponibles', alerta_admin: 'No hay mensajeros disponibles para asignar.' };
      }

      // 3. Puntuar mensajeros
      const conGPS    = [];
      const sinGPS    = [];

      for (const m of mensajeros) {
        if (this._gpsVigente(m)) {
          const score = this._scoreB2C(m, drogLat, drogLng, clienteLat, clienteLng);
          conGPS.push({ mensajero: m, ...score });
        } else {
          sinGPS.push(m);
        }
      }

      let elegido    = null;
      let etaMinutos = null;
      let modo       = 'cualquiera';

      // 4a. Mejor candidato con GPS
      if (conGPS.length > 0) {
        conGPS.sort((a, b) => a.scorePonderado - b.scorePonderado);
        const mejor = conGPS[0];

        // Validar que esté dentro del radio máximo
        if (mejor.distMensajeroFarmaciaKm <= RADIO_MAXIMO_KM) {
          elegido    = mejor.mensajero;
          etaMinutos = mejor.etaTotal;
          modo       = 'gps';
          console.log(
            `[Asignacion] GPS match: ${elegido.nombre} | ` +
            `dist→farmacia=${mejor.distMensajeroFarmaciaKm.toFixed(2)}km | ` +
            `ETA=${etaMinutos}min`
          );
        }
      }

      // 4b. Fallback: sin GPS o fuera de radio → zona o más descansado
      if (!elegido) {
        elegido = this._fallbackSinGPS(sinGPS.concat(mensajeros), null);
        modo    = 'cualquiera';
        // ETA estimada sin GPS: distancia media urbana ~5 km
        etaMinutos = TIEMPO_PREPARACION_MIN + this.calcularEtaMinutos(5, 'moto') + this.calcularEtaMinutos(3, 'moto');
        console.log(`[Asignacion] Fallback sin GPS: ${elegido?.nombre || 'ninguno'}`);
      }

      if (!elegido) {
        return { success: false, error: 'Sin mensajeros disponibles', alerta_admin: 'No hay mensajeros en radio disponible.' };
      }

      const etaTexto = this._textoETA(etaMinutos);
      const alerta   = etaMinutos >= ETA_ALERTA_MIN
        ? `⚠️ ETA elevado: ${etaMinutos} min para pedido ${pedidoId}` : null;

      // 5. Persistir asignación
      await this._persistirAsignacion(pedidoId, elegido.id, 'pedidos');

      // 6. Notificar al mensajero
      await this._notificarMensajeroTurbo(elegido, pedidoId, {
        drogNombre, drogDireccion, drogLat, drogLng,
        clienteNombre, clienteTel, clienteLat, clienteLng, etaMinutos,
      });

      // 7. Notificar al cliente que su mensajero está en camino
      await this._notificarClienteEnCaminoB2C(pedidoId, elegido, etaMinutos);

      return { success: true, mensajero: elegido, etaMinutos, etaTexto, modo, alerta_admin: alerta };

    } catch (err) {
      console.error('[Asignacion] asignarTurboB2C error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Score de un mensajero para B2C Turbo.
   * Retorna distancias y ETA totales.
   */
  _scoreB2C(mensajero, drogLat, drogLng, clienteLat, clienteLng) {
    let distMensajeroFarmaciaKm = 0;
    let distFarmaciaClienteKm   = 0;

    if (drogLat && drogLng) {
      distMensajeroFarmaciaKm = this.calcularDistanciaKm(
        mensajero.ultima_lat, mensajero.ultima_lng, drogLat, drogLng
      );
    }
    if (drogLat && drogLng && clienteLat && clienteLng) {
      distFarmaciaClienteKm = this.calcularDistanciaKm(drogLat, drogLng, clienteLat, clienteLng);
    } else if (clienteLat && clienteLng) {
      distFarmaciaClienteKm = this.calcularDistanciaKm(
        mensajero.ultima_lat, mensajero.ultima_lng, clienteLat, clienteLng
      );
    }

    const vehiculo       = mensajero.vehiculo || 'moto';
    const etaFarmaciaMin = this.calcularEtaMinutos(distMensajeroFarmaciaKm, vehiculo);
    const etaEntregaMin  = this.calcularEtaMinutos(distFarmaciaClienteKm, vehiculo);
    const etaTotal       = etaFarmaciaMin + TIEMPO_PREPARACION_MIN + etaEntregaMin;

    // Score ponderado: recogida tiene mayor peso (cuello de botella)
    const scorePonderado = distMensajeroFarmaciaKm * 2 + distFarmaciaClienteKm;

    return { distMensajeroFarmaciaKm, distFarmaciaClienteKm, etaFarmaciaMin, etaEntregaMin, etaTotal, scorePonderado };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B2B NORMAL — Asignación por distribución justa
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Asigna el mensajero para una orden B2B usando distribución justa.
   *
   * Criterios de selección (en orden de prioridad):
   *   1. Mensajero activo, disponible, sin pedido activo.
   *   2. En la misma ciudad que la droguería compradora.
   *   3. El que lleva más tiempo sin recibir un pedido (equidad).
   *
   * @param {{
   *   ordenId:        string,
   *   ciudad:         string|null,
   *   compradoraLat:  number|null,
   *   compradoraLng:  number|null,
   *   compradoraNombre: string,
   *   compradoraTel:  string,
   * }} params
   */
  async asignarNormalB2B({ ordenId, ciudad, compradoraLat, compradoraLng, compradoraNombre, compradoraTel }) {
    console.log(`[Asignacion] NORMAL B2B — orden ${ordenId}, ciudad: ${ciudad || 'cualquiera'}`);

    try {
      // 1. Candidatos disponibles con canal b2b o ambos, preferir la misma ciudad
      let query = this.supabase
        .from('mensajeros')
        .select('id, nombre, telefono, vehiculo, zona, ciudad, ultimo_pedido_at, canal')
        .eq('status', 'activo')
        .eq('disponible', true)
        .is('pedido_actual_id', null)
        .in('canal', ['b2b', 'ambos'])
        .order('ultimo_pedido_at', { ascending: true, nullsFirst: true });

      const { data: todos, error } = await query;
      if (error) throw error;
      if (!todos || todos.length === 0) {
        return { success: false, error: 'Sin mensajeros disponibles', alerta_admin: 'No hay mensajeros para la orden B2B.' };
      }

      // 2. Preferir misma ciudad
      const mismaCiudad = ciudad
        ? todos.filter(m => m.ciudad?.toLowerCase() === ciudad.toLowerCase())
        : [];

      const elegido = mismaCiudad.length > 0 ? mismaCiudad[0] : todos[0];

      // 3. ETA estimada B2B (no en tiempo real, es un rango)
      const etaTexto = '2-4 horas';

      // 4. Persistir asignación
      await this._persistirAsignacion(ordenId, elegido.id, 'ordenes_compra');

      // 5. Notificar al mensajero
      await this._notificarMensajeroNormal(elegido, ordenId, { compradoraNombre, compradoraTel, compradoraLat, compradoraLng });

      // 6. Notificar a la droguería compradora que su mensajero está en camino
      await this._notificarCompradoreEnCaminoB2B(ordenId, elegido);

      console.log(`[Asignacion] B2B asignado: ${elegido.nombre} → orden ${ordenId}`);
      return { success: true, mensajero: elegido, etaTexto };

    } catch (err) {
      console.error('[Asignacion] asignarNormalB2B error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PERSISTENCIA
  // ══════════════════════════════════════════════════════════════════════════

  async _persistirAsignacion(documentoId, mensajeroId, tabla) {
    const ahora = new Date().toISOString();

    // Actualizar el pedido/orden
    await this.supabase
      .from(tabla)
      .update({ mensajero_id: mensajeroId, status: tabla === 'pedidos' ? 'en_camino' : 'enviada', updated_at: ahora })
      .eq('id', documentoId);

    // Marcar mensajero como ocupado
    await this.supabase
      .from('mensajeros')
      .update({ disponible: false, pedido_actual_id: documentoId, updated_at: ahora })
      .eq('id', mensajeroId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NOTIFICACIONES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Mensaje al mensajero B2C Turbo: incluye ruta completa y ETA comprometido.
   */
  async _notificarMensajeroTurbo(mensajero, pedidoId, ctx) {
    // Obtener detalle del pedido para la notificación
    const { data: pedido } = await this.supabase
      .from('pedidos')
      .select('numero_pedido, total, cliente_nombre, cliente_telefono, cliente_direccion, cliente_lat, cliente_lng, detalle_pedidos(nombre_medicamento, cantidad)')
      .eq('id', pedidoId)
      .maybeSingle();

    const numeroPedido = pedido?.numero_pedido || pedidoId;
    const items = (pedido?.detalle_pedidos || [])
      .map(i => `  • ${i.nombre_medicamento} x${i.cantidad}`).join('\n') || '  • (sin detalle)';

    let mapsCliente = '';
    if (ctx.clienteLat && ctx.clienteLng) {
      mapsCliente = `\n   🗺️ https://maps.google.com/?q=${ctx.clienteLat},${ctx.clienteLng}`;
    }

    const msg = [
      `⚡ *TURBO — NUEVO PEDIDO*`,
      ``,
      `📦 *${numeroPedido}*`,
      `⏱️ ETA comprometido: *${ctx.etaMinutos} min*`,
      ``,
      `🏪 *PASO 1 — Recoger en:*`,
      `   ${ctx.drogNombre}`,
      `   📍 ${ctx.drogDireccion || 'Sin dirección registrada'}`,
      ctx.drogLat ? `   🗺️ https://maps.google.com/?q=${ctx.drogLat},${ctx.drogLng}` : '',
      ``,
      `👤 *PASO 2 — Entregar a:*`,
      `   ${ctx.clienteNombre || 'Cliente'}`,
      `   📞 ${ctx.clienteTel}`,
      `   📍 ${pedido?.cliente_direccion || 'Ubicación GPS'}${mapsCliente}`,
      ``,
      `🛒 Items:`,
      items,
      ``,
      `💰 Total: $${Number(pedido?.total || 0).toLocaleString('es-CO')} *(YA PAGADO — no cobrar)*`,
      ``,
      `📍 Cuando llegues al destino avisa: *LLEGUE*`,
      `✅ Para confirmar entrega envía la foto: *ENTREGADO ${numeroPedido}*`,
      `📍 Comparte tu ubicación en vivo para que el cliente te rastree.`,
    ].filter(l => l !== null && l !== undefined).join('\n');

    await sendWhatsAppMessage(mensajero.telefono, msg).catch(err =>
      console.error('[Asignacion] Error notificando mensajero turbo:', err.message)
    );
  }

  /**
   * Mensaje al mensajero B2B Normal: entrega no urgente, ruta a la droguería compradora.
   */
  async _notificarMensajeroNormal(mensajero, ordenId, ctx) {
    const { data: orden } = await this.supabase
      .from('ordenes_compra')
      .select('numero_orden, total, compradora_nombre, compradora_telefono, compradora_direccion, compradora_lat, compradora_lng, detalle_ordenes_compra(nombre_medicamento, cantidad)')
      .eq('id', ordenId)
      .maybeSingle();

    const numeroOrden = orden?.numero_orden || ordenId;
    const items = (orden?.detalle_ordenes_compra || [])
      .map(i => `  • ${i.nombre_medicamento} x${i.cantidad}`).join('\n') || '  • (sin detalle)';

    let mapsDestino = '';
    if (ctx.compradoraLat && ctx.compradoraLng) {
      mapsDestino = `\n   🗺️ https://maps.google.com/?q=${ctx.compradoraLat},${ctx.compradoraLng}`;
    }

    const msg = [
      `📦 *PEDIDO MAYORISTA B2B*`,
      ``,
      `🏷️ *${numeroOrden}*`,
      `⏱️ Entrega: *sin urgencia (2-4 horas)*`,
      ``,
      `📍 *Entregar en:*`,
      `   ${ctx.compradoraNombre}`,
      `   ${orden?.compradora_direccion || 'Ver coordenadas'}${mapsDestino}`,
      `   📞 ${ctx.compradoraTel}`,
      ``,
      `📦 Items del pedido:`,
      items,
      ``,
      `💰 Total: $${Number(orden?.total || 0).toLocaleString('es-CO')} *(PAGADO)*`,
      ``,
      `📍 Cuando llegues avisa: *LLEGUE*`,
      `✅ Confirmar entrega envía la foto: *ENTREGADO ${numeroOrden}*`,
    ].join('\n');

    await sendWhatsAppMessage(mensajero.telefono, msg).catch(err =>
      console.error('[Asignacion] Error notificando mensajero B2B:', err.message)
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NOTIFICACIONES AL CLIENTE / COMPRADORA
  // ══════════════════════════════════════════════════════════════════════════

  async _notificarClienteEnCaminoB2C(pedidoId, mensajero, etaMinutos) {
    const { data: pedido } = await this.supabase
      .from('pedidos')
      .select('numero_pedido, cliente_telefono, cliente_nombre')
      .eq('id', pedidoId)
      .maybeSingle();
    if (!pedido?.cliente_telefono) return;

    const eta = etaMinutos ? `⏱️ Tiempo estimado: *${etaMinutos} min*\n\n` : '';
    const msg = [
      `🛵 *¡Tu domiciliario está en camino!*`,
      ``,
      `*${mensajero.nombre}* ya recogió tu pedido *${pedido.numero_pedido}* y va hacia ti.`,
      ``,
      `${eta}Cuando llegue te avisaremos. 📦`,
    ].join('\n');

    sendWhatsAppMessage(pedido.cliente_telefono, msg).catch(err =>
      console.error('[Asignacion] Error notificando cliente en camino:', err.message)
    );
  }

  async _notificarCompradoreEnCaminoB2B(ordenId, mensajero) {
    const { data: orden } = await this.supabase
      .from('ordenes_compra')
      .select('numero_orden, compradora_telefono, compradora_nombre')
      .eq('id', ordenId)
      .maybeSingle();
    if (!orden?.compradora_telefono) return;

    const msg = [
      `📦 *Tu orden mayorista está en camino*`,
      ``,
      `El domiciliario *${mensajero.nombre}* ya tiene tu orden *${orden.numero_orden}* y se dirige a tu establecimiento.`,
      ``,
      `⏱️ Entrega estimada: *2-4 horas*`,
      ``,
      `Te avisaremos cuando llegue. ✅`,
    ].join('\n');

    sendWhatsAppMessage(orden.compradora_telefono, msg).catch(err =>
      console.error('[Asignacion] Error notificando compradora en camino:', err.message)
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILIDADES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Fallback cuando no hay mensajeros con GPS vigente.
   * Selecciona el más descansado (menor fecha de último pedido).
   */
  _fallbackSinGPS(mensajeros) {
    if (!mensajeros || mensajeros.length === 0) return null;
    return mensajeros.sort((a, b) => {
      if (!a.ultimo_pedido_at) return -1;
      if (!b.ultimo_pedido_at) return 1;
      return new Date(a.ultimo_pedido_at) - new Date(b.ultimo_pedido_at);
    })[0];
  }

  /**
   * Convierte minutos a texto amigable para el cliente.
   */
  _textoETA(minutos) {
    if (!minutos) return '30-45 minutos';
    if (minutos <= 20) return `${minutos} minutos ⚡`;
    if (minutos <= 35) return `${minutos} minutos`;
    if (minutos <= 50) return `${minutos} minutos (tráfico incluido)`;
    return `${Math.ceil(minutos / 60 * 10) / 10} hora(s) aprox.`;
  }

  /**
   * Dashboard de asignación: cuántos mensajeros disponibles por ciudad y modo.
   * Útil para el panel de admin.
   */
  async resumenDisponibilidad() {
    const { data: mens } = await this.supabase
      .from('mensajeros')
      .select('ciudad, disponible, status, ultima_ubicacion_at')
      .eq('status', 'activo');

    if (!mens) return {};

    const resumen = {};
    for (const m of mens) {
      const ciudad = m.ciudad || 'sin_ciudad';
      if (!resumen[ciudad]) resumen[ciudad] = { disponibles: 0, ocupados: 0, conGPS: 0, sinGPS: 0 };
      if (m.disponible) {
        resumen[ciudad].disponibles++;
        if (this._gpsVigente(m)) resumen[ciudad].conGPS++;
        else resumen[ciudad].sinGPS++;
      } else {
        resumen[ciudad].ocupados++;
      }
    }
    return resumen;
  }
}

module.exports = AsignacionService;
