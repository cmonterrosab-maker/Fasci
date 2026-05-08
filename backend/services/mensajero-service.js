'use strict';

const { sendWhatsAppMessage } = require('../services/whatsapp-service');

// ─── Validación ───────────────────────────────────────────────────────────────

/**
 * Valida que el teléfono sea colombiano (10 dígitos, empieza en 3).
 * @param {string} telefono
 * @returns {boolean}
 */
function esTelefonoColombianoValido(telefono) {
  const limpio = String(telefono).replace(/\s+/g, '').replace(/[^0-9]/g, '');
  return /^3\d{9}$/.test(limpio);
}

// ─── Helpers de mensaje ───────────────────────────────────────────────────────

/**
 * Construye el mensaje WhatsApp que se envía al mensajero cuando se le asigna
 * un pedido nuevo.
 * @param {object} pedido  - Fila de pedidos con joins: drogueria, detalle_pedidos
 * @returns {string}
 */
function construirMensajeMensajero(pedido) {
  const drogueria = pedido.droguerias || {};
  const items = pedido.detalle_pedidos || [];

  // Ubicación del cliente
  let ubicacionCliente = pedido.cliente_direccion || pedido.cliente_barrio || 'No especificada';
  let mapsLink = '';
  if (pedido.cliente_lat && pedido.cliente_lng) {
    mapsLink = `\n   🗺️ Maps: https://www.google.com/maps?q=${pedido.cliente_lat},${pedido.cliente_lng}`;
  }

  // Lista de items
  const listaItems = items.length
    ? items
        .map((i) => `• ${i.nombre_medicamento} x${i.cantidad}`)
        .join('\n')
    : '• (sin detalle disponible)';

  // Total y estado de pago
  const total = pedido.total ? `$${Number(pedido.total).toLocaleString('es-CO')}` : 'N/A';
  const metodoPago = pedido.metodo_pago || '';
  const yaPago = metodoPago && metodoPago !== 'efectivo';
  const lineaPago = yaPago
    ? `💰 Total cobrar: ${total} (YA PAGADO - no cobrar)`
    : `💰 Total a cobrar en efectivo: ${total}`;

  const aviso = yaPago
    ? '\n⚠️ El cliente ya pagó online. Solo entregar y confirmar.'
    : '\n⚠️ Cobrar en efectivo al momento de la entrega.';

  return [
    '🛵 *NUEVO PEDIDO ASIGNADO*',
    '',
    `📦 Pedido: ${pedido.numero_pedido}`,
    `🏪 Recoger en: ${drogueria.nombre || 'Droguería'}`,
    `   📍 ${drogueria.direccion || 'Sin dirección registrada'}`,
    '',
    `👤 Cliente: ${pedido.cliente_nombre || 'Sin nombre'}`,
    `   📍 ${ubicacionCliente}${mapsLink}`,
    `   📞 ${pedido.cliente_telefono}`,
    '',
    '🛒 Items:',
    listaItems,
    '',
    lineaPago,
    aviso,
    '',
    `Para confirmar entrega responde: ENTREGADO ${pedido.numero_pedido}`,
  ].join('\n');
}

// ─── Clase principal ──────────────────────────────────────────────────────────

class MensajeroService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ─── 0. Reconocimiento por teléfono ─────────────────────────────────────────

  /**
   * Busca un mensajero registrado por su número de teléfono.
   * Retorna null si no existe. Patrón idéntico al DistribuidorService de Speady.
   *
   * @param {string} telefono — número normalizado (10 dígitos colombianos)
   * @returns {Promise<object|null>}
   */
  async getByPhone(telefono) {
    try {
      const limpio = String(telefono || '').replace(/\D/g, '').slice(-10);
      const { data, error } = await this.supabase
        .from('mensajeros')
        .select('*')
        .eq('telefono', limpio)
        .maybeSingle();

      if (error) {
        console.error('[MensajeroService] getByPhone error:', error.message);
        return null;
      }
      return data || null;
    } catch (err) {
      console.error('[MensajeroService] getByPhone excepción:', err.message);
      return null;
    }
  }

  /**
   * Construye el menú de WhatsApp para el mensajero activo.
   * Muestra su pedido activo (si tiene uno) o indica que está libre.
   *
   * @param {object} mensajero — fila de la tabla mensajeros
   * @returns {Promise<string>}
   */
  async construirMenuMensajero(mensajero) {
    const saludo = `🛵 *Hola ${mensajero.nombre}!*\n`;
    const dispIcon = mensajero.disponible ? '🟢 Disponible' : '🔴 No disponible';

    // Si tiene pedido activo, mostrarlo
    if (mensajero.pedido_actual_id) {
      try {
        const { data: pedido } = await this.supabase
          .from('pedidos')
          .select(`
            numero_pedido, cliente_nombre, cliente_telefono,
            cliente_direccion, cliente_lat, cliente_lng, total,
            detalle_pedidos ( nombre_medicamento, cantidad )
          `)
          .eq('id', mensajero.pedido_actual_id)
          .maybeSingle();

        if (pedido) {
          const items = (pedido.detalle_pedidos || [])
            .map(i => `  • ${i.nombre_medicamento} x${i.cantidad}`)
            .join('\n');

          let lineasUbicacion = pedido.cliente_direccion || 'Sin dirección';
          if (pedido.cliente_lat && pedido.cliente_lng) {
            lineasUbicacion += `\n   🗺️ https://www.google.com/maps?q=${pedido.cliente_lat},${pedido.cliente_lng}`;
          }

          return [
            saludo,
            `Estado: ${dispIcon}`,
            '',
            `📦 *Pedido activo: ${pedido.numero_pedido}*`,
            `👤 Cliente: ${pedido.cliente_nombre || 'N/A'}`,
            `   📞 ${pedido.cliente_telefono}`,
            `   📍 ${lineasUbicacion}`,
            '',
            '🛒 Items:',
            items || '  (sin detalle)',
            `💰 Total: $${Number(pedido.total || 0).toLocaleString('es-CO')} (YA PAGADO ✅)`,
            '',
            `Para confirmar entrega responde:\n*ENTREGADO ${pedido.numero_pedido}*`,
            '',
            'Otros comandos: *DISPONIBLE* | *NO DISPONIBLE* | *MIS PEDIDOS*',
          ].join('\n');
        }
      } catch (err) {
        console.error('[MensajeroService] construirMenuMensajero error pedido:', err.message);
      }
    }

    // Sin pedido activo
    return [
      saludo,
      `Estado: ${dispIcon}`,
      '',
      '📭 No tienes pedidos activos en este momento.',
      '',
      'Comandos disponibles:',
      '*DISPONIBLE*     — activarme para recibir pedidos',
      '*NO DISPONIBLE*  — pausar entregas',
      '*MIS PEDIDOS*    — ver historial reciente',
    ].join('\n');
  }

  // ─── 1. Obtener mensajero disponible ────────────────────────────────────────

  /**
   * Busca el mensajero activo y disponible más adecuado para una ciudad.
   * Prioriza la ciudad indicada; si no hay, amplía a cualquier ciudad.
   * Dentro de cada grupo, elige el que lleva más tiempo sin pedido (fairness).
   *
   * @param {string} [ciudad]
   * @returns {Promise<{success: boolean, mensajero?: object, error?: string}>}
   */
  async obtenerMensajeroDisponible(ciudad) {
    try {
      console.log(`[MensajeroService] Buscando mensajero disponible. Ciudad: ${ciudad || 'cualquiera'}`);

      const base = this.supabase
        .from('mensajeros')
        .select('*')
        .eq('status', 'activo')
        .eq('disponible', true)
        .is('pedido_actual_id', null)
        .order('ultimo_pedido_at', { ascending: true, nullsFirst: true });

      // Intentar primero en la ciudad indicada
      if (ciudad) {
        const { data: enCiudad, error } = await base.eq('ciudad', ciudad).limit(1);
        if (error) throw error;
        if (enCiudad && enCiudad.length > 0) {
          console.log(`[MensajeroService] Mensajero encontrado en ${ciudad}: ${enCiudad[0].nombre}`);
          return { success: true, mensajero: enCiudad[0] };
        }
        console.log(`[MensajeroService] Sin mensajero en ${ciudad}. Buscando en cualquier ciudad...`);
      }

      // Fallback: cualquier ciudad
      const { data: cualquiera, error: err2 } = await this.supabase
        .from('mensajeros')
        .select('*')
        .eq('status', 'activo')
        .eq('disponible', true)
        .is('pedido_actual_id', null)
        .order('ultimo_pedido_at', { ascending: true, nullsFirst: true })
        .limit(1);

      if (err2) throw err2;

      if (!cualquiera || cualquiera.length === 0) {
        console.warn('[MensajeroService] No hay mensajeros disponibles en este momento.');
        return { success: false, error: 'No hay mensajeros disponibles en este momento.' };
      }

      console.log(`[MensajeroService] Mensajero encontrado (otra ciudad): ${cualquiera[0].nombre}`);
      return { success: true, mensajero: cualquiera[0] };
    } catch (err) {
      console.error('[MensajeroService] obtenerMensajeroDisponible error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 2. Asignar mensajero a pedido ──────────────────────────────────────────

  /**
   * Vincula un mensajero con un pedido y marca ambas filas como ocupadas.
   *
   * @param {string} pedidoId
   * @param {string} mensajeroId
   * @returns {Promise<{success: boolean, mensajero?: object, pedido?: object, error?: string}>}
   */
  async asignarMensajero(pedidoId, mensajeroId) {
    try {
      console.log(`[MensajeroService] Asignando mensajero ${mensajeroId} al pedido ${pedidoId}`);

      // Actualizar pedido
      const { data: pedido, error: errPedido } = await this.supabase
        .from('pedidos')
        .update({ mensajero_id: mensajeroId, status: 'en_preparacion', updated_at: new Date().toISOString() })
        .eq('id', pedidoId)
        .select()
        .single();

      if (errPedido) throw errPedido;

      // Actualizar mensajero
      const { data: mensajero, error: errMensajero } = await this.supabase
        .from('mensajeros')
        .update({ pedido_actual_id: pedidoId, disponible: false, updated_at: new Date().toISOString() })
        .eq('id', mensajeroId)
        .select()
        .single();

      if (errMensajero) throw errMensajero;

      console.log(`[MensajeroService] Asignacion exitosa. Pedido: ${pedido.numero_pedido}, Mensajero: ${mensajero.nombre}`);
      return { success: true, mensajero, pedido };
    } catch (err) {
      console.error('[MensajeroService] asignarMensajero error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 3. Notificar mensajero por WhatsApp ────────────────────────────────────

  /**
   * Obtiene el pedido completo y envía un mensaje de WhatsApp al mensajero.
   *
   * @param {string} mensajeroId
   * @param {string} pedidoId
   * @returns {Promise<{success: boolean, mensaje?: string, error?: string}>}
   */
  async notificarMensajero(mensajeroId, pedidoId) {
    try {
      console.log(`[MensajeroService] Notificando mensajero ${mensajeroId} sobre pedido ${pedidoId}`);

      // Obtener datos del mensajero
      const { data: mensajero, error: errMensajero } = await this.supabase
        .from('mensajeros')
        .select('*')
        .eq('id', mensajeroId)
        .single();

      if (errMensajero) throw errMensajero;
      if (!mensajero) throw new Error(`Mensajero ${mensajeroId} no encontrado`);

      // Obtener pedido con joins
      const { data: pedido, error: errPedido } = await this.supabase
        .from('pedidos')
        .select(`
          *,
          droguerias ( nombre, direccion, telefono, ciudad, barrio ),
          detalle_pedidos ( nombre_medicamento, cantidad, precio_unitario, subtotal )
        `)
        .eq('id', pedidoId)
        .single();

      if (errPedido) throw errPedido;
      if (!pedido) throw new Error(`Pedido ${pedidoId} no encontrado`);

      const mensaje = construirMensajeMensajero(pedido);

      await sendWhatsAppMessage(mensajero.telefono, mensaje);

      console.log(`[MensajeroService] Mensaje enviado a ${mensajero.nombre} (${mensajero.telefono})`);
      return { success: true, mensaje };
    } catch (err) {
      console.error('[MensajeroService] notificarMensajero error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 4. Liberar mensajero ────────────────────────────────────────────────────

  /**
   * Marca al mensajero como disponible nuevamente e incrementa sus estadísticas.
   *
   * @param {string} mensajeroId
   * @returns {Promise<{success: boolean, mensajero?: object, error?: string}>}
   */
  async liberarMensajero(mensajeroId) {
    try {
      console.log(`[MensajeroService] Liberando mensajero ${mensajeroId}`);

      // Obtener stats actuales para incrementar
      const { data: actual, error: errGet } = await this.supabase
        .from('mensajeros')
        .select('pedidos_completados')
        .eq('id', mensajeroId)
        .single();

      if (errGet) throw errGet;

      const { data: mensajero, error: errUpdate } = await this.supabase
        .from('mensajeros')
        .update({
          disponible: true,
          pedido_actual_id: null,
          pedidos_completados: (actual.pedidos_completados || 0) + 1,
          ultimo_pedido_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', mensajeroId)
        .select()
        .single();

      if (errUpdate) throw errUpdate;

      console.log(`[MensajeroService] Mensajero ${mensajero.nombre} liberado. Pedidos completados: ${mensajero.pedidos_completados}`);
      return { success: true, mensajero };
    } catch (err) {
      console.error('[MensajeroService] liberarMensajero error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 5. Confirmar entrega (mensaje entrante del mensajero) ──────────────────

  /**
   * Procesa el texto "ENTREGADO DV-XXXX" enviado por el mensajero.
   * Actualiza el pedido a 'entregado' y libera al mensajero.
   *
   * @param {string} numeroWhatsapp  - Número del mensajero (sin prefijo whatsapp:)
   * @param {string} numeroPedido    - Ej: "DV-2026-0001"
   * @returns {Promise<{success: boolean, pedido?: object, error?: string}>}
   */
  async confirmarEntrega(numeroWhatsapp, numeroPedido, fotoUrl = null, fotoMeta = null) {
    try {
      console.log(`[MensajeroService] Confirmando entrega. Mensajero: ${numeroWhatsapp}, Pedido: ${numeroPedido}`);

      // Buscar el mensajero por teléfono
      const telefonoLimpio = String(numeroWhatsapp)
        .replace('whatsapp:', '')
        .replace('+57', '')
        .replace(/\D/g, '');

      const { data: mensajeros, error: errMensajero } = await this.supabase
        .from('mensajeros')
        .select('id, nombre, telefono')
        .ilike('telefono', `%${telefonoLimpio}`);

      if (errMensajero) throw errMensajero;
      if (!mensajeros || mensajeros.length === 0) {
        return { success: false, error: `No se encontró mensajero con teléfono ${numeroWhatsapp}` };
      }

      const mensajero = mensajeros[0];
      const numeroNorm = numeroPedido.toUpperCase().trim();

      // ── B2C: buscar en pedidos ────────────────────────────────────────────────
      const { data: pedido } = await this.supabase
        .from('pedidos')
        .select('id, numero_pedido, status, mensajero_id, cliente_telefono')
        .eq('numero_pedido', numeroNorm)
        .maybeSingle();

      if (pedido) {
        if (pedido.status === 'entregado') {
          return { success: false, error: `El pedido ${numeroNorm} ya fue marcado como entregado.` };
        }
        if (pedido.mensajero_id && pedido.mensajero_id !== mensajero.id) {
          console.warn(`[MensajeroService] Mensajero ${mensajero.nombre} intentó confirmar pedido que no le pertenece.`);
          return { success: false, error: 'Este pedido no está asignado a tu cuenta.' };
        }
        const updateData = {
          status: 'entregado',
          entregado_at: new Date().toISOString(),
          calificacion_solicitada_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (fotoUrl)  updateData.foto_entrega_url  = fotoUrl;
        if (fotoMeta) updateData.foto_entrega_meta  = fotoMeta;

        const { data: pedidoActualizado, error: errUpdate } = await this.supabase
          .from('pedidos')
          .update(updateData)
          .eq('id', pedido.id)
          .select()
          .single();

        if (errUpdate) throw errUpdate;
        await this.liberarMensajero(mensajero.id);
        console.log(`[MensajeroService] Entrega B2C confirmada. Pedido: ${numeroNorm}, Mensajero: ${mensajero.nombre}`);
        return { success: true, pedido: pedidoActualizado };
      }

      // ── B2B: buscar en ordenes_compra ─────────────────────────────────────────
      const { data: orden } = await this.supabase
        .from('ordenes_compra')
        .select('id, numero_orden, status, mensajero_id, compradora_telefono')
        .eq('numero_orden', numeroNorm)
        .maybeSingle();

      if (orden) {
        if (orden.status === 'entregada') {
          return { success: false, error: `La orden ${numeroNorm} ya fue marcada como entregada.` };
        }
        if (orden.mensajero_id && orden.mensajero_id !== mensajero.id) {
          console.warn(`[MensajeroService] Mensajero ${mensajero.nombre} intentó confirmar orden B2B que no le pertenece.`);
          return { success: false, error: 'Esta orden no está asignada a tu cuenta.' };
        }
        const updateDataB2B = {
          status: 'entregada',
          entregada_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (fotoUrl)  updateDataB2B.foto_entrega_url  = fotoUrl;
        if (fotoMeta) updateDataB2B.foto_entrega_meta  = fotoMeta;

        const { data: ordenActualizada, error: errUpdateB2B } = await this.supabase
          .from('ordenes_compra')
          .update(updateDataB2B)
          .eq('id', orden.id)
          .select()
          .single();

        if (errUpdateB2B) throw errUpdateB2B;
        await this.liberarMensajero(mensajero.id);
        console.log(`[MensajeroService] Entrega B2B confirmada. Orden: ${numeroNorm}, Mensajero: ${mensajero.nombre}`);
        // Devolver en formato compatible: cliente_telefono apunta a compradora
        return {
          success: true,
          pedido: { ...ordenActualizada, cliente_telefono: ordenActualizada.compradora_telefono },
          esB2B: true,
        };
      }

      return { success: false, error: `Pedido/Orden ${numeroNorm} no encontrado` };
    } catch (err) {
      console.error('[MensajeroService] confirmarEntrega error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 6. Listar mensajeros ────────────────────────────────────────────────────

  /**
   * Lista mensajeros con filtros opcionales y paginación.
   *
   * @param {object} [filtros]
   * @param {string}  [filtros.ciudad]
   * @param {boolean} [filtros.disponible]
   * @param {string}  [filtros.status]
   * @param {number}  [filtros.pagina=1]
   * @param {number}  [filtros.porPagina=20]
   * @returns {Promise<{success: boolean, mensajeros?: object[], total?: number, error?: string}>}
   */
  async listarMensajeros(filtros = {}) {
    try {
      const { ciudad, disponible, status, pagina = 1, porPagina = 20 } = filtros;
      const desde = (pagina - 1) * porPagina;
      const hasta = desde + porPagina - 1;

      let query = this.supabase
        .from('mensajeros')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(desde, hasta);

      if (ciudad) query = query.eq('ciudad', ciudad);
      if (disponible !== undefined) query = query.eq('disponible', disponible);
      if (status) query = query.eq('status', status);

      const { data, error, count } = await query;
      if (error) throw error;

      console.log(`[MensajeroService] listarMensajeros: ${data.length} resultados (total: ${count})`);
      return { success: true, mensajeros: data, total: count };
    } catch (err) {
      console.error('[MensajeroService] listarMensajeros error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 7. Registrar nuevo mensajero ────────────────────────────────────────────

  /**
   * Crea un nuevo mensajero en la base de datos.
   *
   * @param {object} datos
   * @param {string} datos.nombre
   * @param {string} datos.telefono   - Teléfono colombiano (10 dígitos, empieza en 3)
   * @param {string} [datos.cedula]
   * @param {string} [datos.ciudad]
   * @param {string} [datos.zona]
   * @param {string} [datos.vehiculo] - 'moto' | 'bicicleta' | 'pie'
   * @param {string} [datos.placa]
   * @returns {Promise<{success: boolean, mensajero?: object, error?: string}>}
   */
  async registrarMensajero(datos) {
    try {
      const { nombre, telefono, cedula, ciudad, zona, vehiculo = 'moto', placa, canal = 'b2c' } = datos;

      if (!nombre || !nombre.trim()) {
        return { success: false, error: 'El nombre del mensajero es obligatorio.' };
      }

      if (!telefono) {
        return { success: false, error: 'El teléfono del mensajero es obligatorio.' };
      }

      const telefonoLimpio = String(telefono).replace(/\s+/g, '').replace(/[^0-9]/g, '');
      if (!esTelefonoColombianoValido(telefonoLimpio)) {
        return {
          success: false,
          error: `Teléfono inválido: "${telefono}". Debe ser un número colombiano de 10 dígitos que empiece en 3.`,
        };
      }

      const vehiculosValidos = ['moto', 'bicicleta', 'pie', 'carro'];
      if (vehiculo && !vehiculosValidos.includes(vehiculo)) {
        return { success: false, error: `Vehículo inválido. Valores permitidos: ${vehiculosValidos.join(', ')}` };
      }

      const canalesValidos = ['b2b', 'b2c', 'ambos'];
      if (!canalesValidos.includes(canal)) {
        return { success: false, error: `Canal inválido. Valores permitidos: ${canalesValidos.join(', ')}` };
      }

      const nuevaMensajero = {
        nombre: nombre.trim(),
        telefono: telefonoLimpio,
        cedula: cedula || null,
        ciudad: ciudad || null,
        zona: zona || null,
        vehiculo,
        placa: placa || null,
        canal,
      };

      const { data: mensajero, error } = await this.supabase
        .from('mensajeros')
        .insert(nuevaMensajero)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: `Ya existe un mensajero con el teléfono ${telefonoLimpio}.` };
        }
        throw error;
      }

      console.log(`[MensajeroService] Mensajero registrado: ${mensajero.nombre} (${mensajero.telefono})`);
      return { success: true, mensajero };
    } catch (err) {
      console.error('[MensajeroService] registrarMensajero error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 8. Asignar y notificar (método conveniente) ─────────────────────────────

  /**
   * Flujo completo: buscar mensajero → asignar → notificar por WhatsApp.
   * Si no hay mensajero disponible, deja el pedido en 'en_preparacion' y
   * devuelve una alerta para que el admin lo gestione manualmente.
   *
   * @param {string} pedidoId
   * @param {string} [ciudad]
   * @returns {Promise<{success: boolean, mensajero?: object, mensaje_enviado?: boolean, alerta_admin?: string, error?: string}>}
   */
  async asignarYNotificar(pedidoId, ciudad) {
    try {
      console.log(`[MensajeroService] asignarYNotificar. Pedido: ${pedidoId}, Ciudad: ${ciudad || 'cualquiera'}`);

      // 1. Buscar mensajero disponible
      const resultBusqueda = await this.obtenerMensajeroDisponible(ciudad);

      if (!resultBusqueda.success) {
        // Sin mensajero disponible: dejar pedido en 'en_preparacion' y alertar admin
        await this.supabase
          .from('pedidos')
          .update({ status: 'en_preparacion', updated_at: new Date().toISOString() })
          .eq('id', pedidoId);

        const alerta = `ALERTA: No hay mensajeros disponibles para el pedido ${pedidoId}. Asignación manual requerida.`;
        console.warn(`[MensajeroService] ${alerta}`);

        return {
          success: false,
          alerta_admin: alerta,
          error: resultBusqueda.error,
        };
      }

      const { mensajero } = resultBusqueda;

      // 2. Asignar mensajero
      const resultAsignacion = await this.asignarMensajero(pedidoId, mensajero.id);
      if (!resultAsignacion.success) {
        return { success: false, error: resultAsignacion.error };
      }

      // 3. Notificar al mensajero por WhatsApp
      const resultNotificacion = await this.notificarMensajero(mensajero.id, pedidoId);

      if (!resultNotificacion.success) {
        // La asignación fue exitosa pero falló el WhatsApp; informar pero no revertir
        console.warn(`[MensajeroService] Asignación OK pero fallo en WhatsApp: ${resultNotificacion.error}`);
        return {
          success: true,
          mensajero,
          mensaje_enviado: false,
          alerta_admin: `Mensajero asignado pero no se pudo enviar WhatsApp: ${resultNotificacion.error}`,
        };
      }

      console.log(`[MensajeroService] asignarYNotificar completado. Mensajero: ${mensajero.nombre}`);
      return {
        success: true,
        mensajero,
        mensaje_enviado: true,
      };
    } catch (err) {
      console.error('[MensajeroService] asignarYNotificar error:', err.message);
      return { success: false, error: err.message };
    }
  }
  // ─── 9. Toggle disponibilidad desde WhatsApp ────────────────────────────────

  /**
   * Cambia el estado de disponibilidad de un mensajero por su ID.
   * Usado cuando el mensajero escribe DISPONIBLE / NO DISPONIBLE.
   *
   * @param {string} mensajeroId
   * @param {boolean} disponible
   * @returns {Promise<{success: boolean, mensajero?: object, error?: string}>}
   */
  // ─── 10. Actualizar ubicación en tiempo real ─────────────────────────────────

  /**
   * Actualiza las coordenadas GPS del mensajero cuando comparte su ubicación
   * por WhatsApp. También sincroniza el snapshot en el pedido/orden activa.
   *
   * @param {string} mensajeroId
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<{success: boolean}>}
   */
  async actualizarUbicacion(mensajeroId, lat, lng) {
    try {
      const ahora = new Date().toISOString();

      // 1. Actualizar tabla mensajeros
      await this.supabase
        .from('mensajeros')
        .update({ ultima_lat: lat, ultima_lng: lng, ultima_ubicacion_at: ahora })
        .eq('id', mensajeroId);

      // 2. Sincronizar snapshot en el pedido activo (si tiene uno)
      const { data: mens } = await this.supabase
        .from('mensajeros')
        .select('pedido_actual_id')
        .eq('id', mensajeroId)
        .maybeSingle();

      if (mens?.pedido_actual_id) {
        // Intentar actualizar en pedidos (B2C)
        await this.supabase
          .from('pedidos')
          .update({ mensajero_ultima_lat: lat, mensajero_ultima_lng: lng })
          .eq('id', mens.pedido_actual_id);

        // Intentar actualizar en ordenes_compra (B2B)
        await this.supabase
          .from('ordenes_compra')
          .update({ mensajero_ultima_lat: lat, mensajero_ultima_lng: lng })
          .eq('mensajero_id', mensajeroId)
          .in('status', ['en_preparacion', 'enviada']);
      }

      console.log(`[MensajeroService] Ubicación actualizada: ${mensajeroId} → (${lat}, ${lng})`);
      return { success: true };
    } catch (err) {
      console.error('[MensajeroService] actualizarUbicacion error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async setDisponible(mensajeroId, disponible) {
    try {
      const { data, error } = await this.supabase
        .from('mensajeros')
        .update({ disponible, updated_at: new Date().toISOString() })
        .eq('id', mensajeroId)
        .select()
        .maybeSingle();

      if (error) throw error;
      console.log(`[MensajeroService] ${data?.nombre} → disponible=${disponible}`);
      return { success: true, mensajero: data };
    } catch (err) {
      console.error('[MensajeroService] setDisponible error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Devuelve los últimos pedidos completados por el mensajero.
   * @param {string} mensajeroId
   * @param {number} [limite=5]
   */
  async historialPedidos(mensajeroId, limite = 5) {
    try {
      const { data } = await this.supabase
        .from('pedidos')
        .select('numero_pedido, total, status, entregado_at, cliente_nombre')
        .eq('mensajero_id', mensajeroId)
        .in('status', ['entregado'])
        .order('entregado_at', { ascending: false })
        .limit(limite);

      return data || [];
    } catch (err) {
      console.error('[MensajeroService] historialPedidos error:', err.message);
      return [];
    }
  }
}

module.exports = MensajeroService;
