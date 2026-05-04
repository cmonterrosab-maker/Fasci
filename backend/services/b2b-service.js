'use strict';

/**
 * B2BService
 * Gestión de pedidos mayoristas entre droguerías registradas (canal WhatsApp bot).
 * Solo pueden comprar las droguerías con status 'active' o 'approved'.
 */

let Fuse;
try {
  Fuse = require('fuse.js');
} catch (_) {
  // fuse.js puede estar como default export en algunas versiones
  Fuse = require('fuse.js').default || require('fuse.js');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normaliza un número de teléfono colombiano a 10 dígitos.
 * Elimina prefijo país +57 / 57, espacios, guiones, etc.
 * @param {string} telefono
 * @returns {string}
 */
function normalizarTelefono(telefono) {
  let limpio = String(telefono || '').replace(/\D/g, '');
  // Quitar prefijo 57 solo si tiene más de 10 dígitos
  if (limpio.length > 10 && limpio.startsWith('57')) {
    limpio = limpio.slice(2);
  }
  return limpio.slice(-10);
}

/**
 * Formatea un número como moneda colombiana.
 * @param {number} valor
 * @returns {string}
 */
function formatCOP(valor) {
  return `$${Number(valor || 0).toLocaleString('es-CO')}`;
}

// ─── Clase principal ──────────────────────────────────────────────────────────

class B2BService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    if (!supabase) throw new Error('B2BService requiere una instancia de Supabase');
    this.supabase = supabase;
  }

  // ─── 1. getDrogueriaByPhone ───────────────────────────────────────────────

  /**
   * Busca una droguería registrada por número de WhatsApp o teléfono.
   * Normaliza a 10 dígitos colombianos antes de buscar.
   * Solo retorna droguerías con status 'active' o 'approved'.
   *
   * @param {string} telefono
   * @returns {Promise<object|null>}
   */
  async getDrogueriaByPhone(telefono) {
    try {
      const limpio = normalizarTelefono(telefono);
      console.log(`[B2BService] getDrogueriaByPhone: buscando ${limpio}`);

      const { data, error } = await this.supabase
        .from('droguerias')
        .select('*')
        .in('status', ['active', 'approved'])
        .or(`whatsapp_numero.eq.${limpio},telefono.eq.${limpio}`)
        .maybeSingle();

      if (error) {
        console.error('[B2BService] getDrogueriaByPhone error:', error.message);
        return null;
      }

      if (data) {
        console.log(`[B2BService] Droguería B2B encontrada: ${data.nombre} (${data.status})`);
      } else {
        console.log(`[B2BService] No se encontró droguería B2B para ${limpio}`);
      }

      return data || null;
    } catch (err) {
      console.error('[B2BService] getDrogueriaByPhone excepción:', err.message);
      return null;
    }
  }

  // ─── 2. buscarMedicamentosB2B ─────────────────────────────────────────────

  /**
   * Busca medicamentos disponibles para venta mayorista.
   * Usa Fuse.js para búsqueda fuzzy por nombre/nombre_generico/laboratorio.
   * Solo retorna ítems con precio_mayorista > 0 y stock > cantidad_minima_mayorista.
   * Si query está vacío, retorna los 8 de mayor stock.
   *
   * @param {string} query
   * @param {number} [limite=8]
   * @returns {Promise<Array<{medicamento_id, catalogo_id, nombre, presentacion, laboratorio, precio_mayorista, precio_retail, stock, cantidad_minima}>>}
   */
  async buscarMedicamentosB2B(query, limite = 8) {
    try {
      console.log(`[B2BService] buscarMedicamentosB2B: query="${query}" limite=${limite}`);

      // Traer catalogos con precio_mayorista y stock suficiente
      const { data: catalogos, error } = await this.supabase
        .from('catalogos')
        .select(`
          id,
          precio,
          precio_mayorista,
          stock,
          cantidad_minima_mayorista,
          disponible,
          medicamento_id,
          medicamentos (
            id,
            nombre,
            nombre_generico,
            laboratorio,
            presentacion,
            concentracion,
            activo
          )
        `)
        .eq('disponible', true)
        .gt('precio_mayorista', 0)
        .not('precio_mayorista', 'is', null);

      if (error) throw error;

      // Filtrar por stock > cantidad_minima_mayorista
      const disponibles = (catalogos || []).filter(c => {
        const minimo = c.cantidad_minima_mayorista || 10;
        return c.stock > minimo && c.medicamentos && c.medicamentos.activo;
      });

      // Mapear a estructura de respuesta
      const mapear = (c) => ({
        medicamento_id: c.medicamento_id,
        catalogo_id: c.id,
        nombre: c.medicamentos.nombre,
        nombre_generico: c.medicamentos.nombre_generico || '',
        presentacion: c.medicamentos.presentacion || '',
        concentracion: c.medicamentos.concentracion || '',
        laboratorio: c.medicamentos.laboratorio || '',
        precio_mayorista: Number(c.precio_mayorista),
        precio_retail: Number(c.precio),
        stock: c.stock,
        cantidad_minima: c.cantidad_minima_mayorista || 10,
      });

      // Sin query: retornar los de mayor stock
      if (!query || !query.trim()) {
        const topStock = disponibles
          .sort((a, b) => b.stock - a.stock)
          .slice(0, limite)
          .map(mapear);

        console.log(`[B2BService] buscarMedicamentosB2B (sin query): ${topStock.length} resultados`);
        return topStock;
      }

      // Con query: búsqueda fuzzy con Fuse.js
      const FuseClass = Fuse.default || Fuse;
      const fuse = new FuseClass(disponibles, {
        keys: [
          { name: 'medicamentos.nombre', weight: 0.5 },
          { name: 'medicamentos.nombre_generico', weight: 0.3 },
          { name: 'medicamentos.laboratorio', weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
      });

      const resultados = fuse.search(query.trim())
        .slice(0, limite)
        .map(r => mapear(r.item));

      console.log(`[B2BService] buscarMedicamentosB2B query="${query}": ${resultados.length} resultados`);
      return resultados;
    } catch (err) {
      console.error('[B2BService] buscarMedicamentosB2B error:', err.message);
      return [];
    }
  }

  // ─── 3. generarTextoCotizacion ────────────────────────────────────────────

  /**
   * Genera el texto formateado de una cotización para enviar por WhatsApp.
   *
   * @param {Array<{nombre, cantidad, precio_mayorista, subtotal, presentacion, laboratorio}>} items
   * @param {object} drogueria  - Objeto droguería compradora
   * @returns {string}
   */
  generarTextoCotizacion(items, drogueria) {
    const ahora = new Date();
    const numProvisional = `COT-${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}-${String(ahora.getTime()).slice(-4)}`;

    const fechaStr = ahora.toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const horaStr = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    // Calcular subtotal
    const subtotal = items.reduce((acc, i) => acc + (Number(i.subtotal) || Number(i.cantidad) * Number(i.precio_mayorista)), 0);
    const { porcentaje, monto, total } = this.calcularDescuento(subtotal);

    // Tabla de items
    const lineasItems = items.map(i => {
      const sub = Number(i.subtotal) || Number(i.cantidad) * Number(i.precio_mayorista);
      return [
        `• *${i.nombre}*${i.presentacion ? ` (${i.presentacion})` : ''}`,
        `  ${i.cantidad} uds × ${formatCOP(i.precio_mayorista)} = ${formatCOP(sub)}`,
      ].join('\n');
    }).join('\n');

    const lines = [
      '━━━━━━━━━━━━━━━━━━━━━━',
      '🏪 *DROGUERÍA VIRTUAL*',
      '   _Cotización Mayorista B2B_',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `📋 Cotización: ${numProvisional}`,
      `📅 Fecha: ${fechaStr} ${horaStr}`,
      `⏳ Válida por: 24 horas`,
      '',
      `🏢 Cliente: *${drogueria.nombre || 'Droguería'}*`,
      drogueria.nit ? `   NIT: ${drogueria.nit}` : '',
      '',
      '─────────────────────',
      '🛒 *Productos:*',
      '',
      lineasItems,
      '',
      '─────────────────────',
      `Subtotal:        ${formatCOP(subtotal)}`,
    ];

    if (porcentaje > 0) {
      lines.push(`Descuento (${porcentaje}%): -${formatCOP(monto)}`);
    }

    lines.push(
      `*TOTAL:          ${formatCOP(total)}*`,
      '─────────────────────',
      '',
      '✅ *Para confirmar este pedido responde:*',
      '   *CONFIRMAR*',
      '',
      '📞 *Para modificar o cancelar:*',
      '   *CANCELAR*',
      '',
      '_Precios incluyen IVA. Sujeto a disponibilidad de stock._',
      '━━━━━━━━━━━━━━━━━━━━━━',
    );

    return lines.filter(l => l !== undefined).join('\n');
  }

  // ─── 4. crearOrdenCompra ─────────────────────────────────────────────────

  /**
   * Crea una orden de compra B2B en la base de datos.
   *
   * @param {object} datos
   * @param {string}  datos.drogueriaCompradoraId
   * @param {string}  datos.compradoraTelefono
   * @param {string}  [datos.compradoraNombre]
   * @param {string}  [datos.compradoraDireccion]
   * @param {number}  [datos.compradoraLat]
   * @param {number}  [datos.compradoraLng]
   * @param {string}  [datos.compradoraNit]
   * @param {Array}   datos.items  - [{catalogo_id, medicamento_id, nombre, presentacion, laboratorio, cantidad, precio_mayorista}]
   * @param {string}  [datos.metodoPago]
   * @param {string}  [datos.comprobanteUrl]
   * @param {string}  [datos.notas]
   * @returns {Promise<{success: boolean, orden?: object, numero_orden?: string, error?: string}>}
   */
  async crearOrdenCompra(datos) {
    try {
      const {
        drogueriaCompradoraId,
        compradoraTelefono,
        compradoraNombre,
        compradoraDireccion,
        compradoraLat,
        compradoraLng,
        compradoraNit,
        items,
        metodoPago = 'nequi_daviplata',
        comprobanteUrl,
        notas,
      } = datos;

      if (!compradoraTelefono) throw new Error('compradoraTelefono es requerido');
      if (!items || items.length === 0) throw new Error('La orden debe tener al menos un item');

      // Calcular subtotal
      const subtotal = items.reduce((acc, i) => {
        const sub = Number(i.subtotal) || Number(i.cantidad) * Number(i.precio_mayorista);
        return acc + sub;
      }, 0);

      const { monto: descuento, total } = this.calcularDescuento(subtotal);

      console.log(`[B2BService] crearOrdenCompra: ${items.length} items, subtotal=${subtotal}, total=${total}`);

      // Insertar orden
      const { data: orden, error: errOrden } = await this.supabase
        .from('ordenes_compra')
        .insert({
          drogueria_compradora_id: drogueriaCompradoraId || null,
          compradora_nombre: compradoraNombre || null,
          compradora_telefono: normalizarTelefono(compradoraTelefono),
          compradora_direccion: compradoraDireccion || null,
          compradora_lat: compradoraLat || null,
          compradora_lng: compradoraLng || null,
          compradora_nit: compradoraNit || null,
          status: 'pagada',
          subtotal: Math.round(subtotal * 100) / 100,
          descuento: Math.round(descuento * 100) / 100,
          total: Math.round(total * 100) / 100,
          metodo_pago: metodoPago,
          comprobante_url: comprobanteUrl || null,
          tc_aceptado: true,
          tc_aceptado_at: new Date().toISOString(),
          canal: 'whatsapp',
          notas: notas || null,
          pagada_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (errOrden) throw errOrden;

      // Insertar detalles
      const detalles = items.map(i => {
        const sub = Number(i.subtotal) || Number(i.cantidad) * Number(i.precio_mayorista);
        return {
          orden_id: orden.id,
          medicamento_id: i.medicamento_id || null,
          catalogo_id: i.catalogo_id || null,
          nombre_medicamento: i.nombre || i.nombre_medicamento || 'Sin nombre',
          presentacion: i.presentacion || null,
          laboratorio: i.laboratorio || null,
          cantidad: Number(i.cantidad),
          precio_mayorista: Number(i.precio_mayorista),
          subtotal: Math.round(sub * 100) / 100,
        };
      });

      const { error: errDetalle } = await this.supabase
        .from('detalle_ordenes_compra')
        .insert(detalles);

      if (errDetalle) throw errDetalle;

      console.log(`[B2BService] Orden creada: ${orden.numero_orden}`);
      return { success: true, orden, numero_orden: orden.numero_orden };
    } catch (err) {
      console.error('[B2BService] crearOrdenCompra error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── 5. listarOrdenesCompra ───────────────────────────────────────────────

  /**
   * Lista las últimas órdenes de compra de una droguería compradora.
   *
   * @param {string} drogueriaId
   * @param {number} [limite=5]
   * @returns {Promise<Array>}
   */
  async listarOrdenesCompra(drogueriaId, limite = 5) {
    try {
      console.log(`[B2BService] listarOrdenesCompra drogueriaId=${drogueriaId}`);

      const { data, error } = await this.supabase
        .from('ordenes_compra')
        .select(`
          id,
          numero_orden,
          status,
          subtotal,
          descuento,
          total,
          metodo_pago,
          created_at,
          detalle_ordenes_compra (
            id,
            nombre_medicamento,
            cantidad,
            precio_mayorista,
            subtotal
          )
        `)
        .eq('drogueria_compradora_id', drogueriaId)
        .order('created_at', { ascending: false })
        .limit(limite);

      if (error) throw error;

      const ordenes = (data || []).map(o => ({
        numero_orden: o.numero_orden,
        status: o.status,
        subtotal: o.subtotal,
        descuento: o.descuento,
        total: o.total,
        metodo_pago: o.metodo_pago,
        created_at: o.created_at,
        items_count: (o.detalle_ordenes_compra || []).length,
        items: o.detalle_ordenes_compra || [],
      }));

      console.log(`[B2BService] listarOrdenesCompra: ${ordenes.length} órdenes`);
      return ordenes;
    } catch (err) {
      console.error('[B2BService] listarOrdenesCompra error:', err.message);
      return [];
    }
  }

  // ─── 6. construirMenuB2B ──────────────────────────────────────────────────

  /**
   * Construye el mensaje de bienvenida/menú principal para clientes B2B.
   *
   * @param {object} drogueria  - Objeto droguería compradora
   * @returns {string}
   */
  construirMenuB2B(drogueria) {
    const nombre = drogueria.nombre || 'Droguería';

    return [
      '━━━━━━━━━━━━━━━━━━━━━━',
      '🏪 *DROGUERÍA VIRTUAL*',
      '   _Portal Mayorista B2B_',
      '━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `Hola *${nombre}* 👋`,
      'Bienvenido al canal de compras mayoristas.',
      '',
      '📋 *¿Qué deseas hacer?*',
      '',
      '1️⃣  *BUSCAR [medicamento]*',
      '     Ej: BUSCAR acetaminofen',
      '',
      '2️⃣  *CATALOGO*',
      '     Ver los productos más populares',
      '',
      '3️⃣  *MIS ORDENES*',
      '     Historial de compras recientes',
      '',
      '4️⃣  *COTIZAR*',
      '     Iniciar una nueva cotización',
      '',
      '5️⃣  *AYUDA*',
      '     Contactar asesor comercial',
      '',
      '_Precios mayoristas disponibles para droguerías registradas._',
      '━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n');
  }

  // ─── 7. calcularDescuento ─────────────────────────────────────────────────

  /**
   * Calcula el descuento aplicable según el subtotal.
   * - 5% si subtotal >= 500.000
   * - 3% si subtotal >= 200.000
   * - 0% si menor
   *
   * @param {number} subtotal
   * @returns {{ porcentaje: number, monto: number, total: number }}
   */
  calcularDescuento(subtotal) {
    const valor = Number(subtotal) || 0;
    let porcentaje = 0;

    if (valor >= 500000) {
      porcentaje = 5;
    } else if (valor >= 200000) {
      porcentaje = 3;
    }

    const monto = Math.round((valor * porcentaje) / 100);
    const total = valor - monto;

    return { porcentaje, monto, total };
  }

  // ─── 8. descontarStockOrden ───────────────────────────────────────────────

  /**
   * Descuenta el stock de catalogos por cada item de una orden de compra B2B.
   * Si el stock es insuficiente para algún item, registra advertencia pero no falla.
   *
   * @param {string} ordenId
   * @returns {Promise<{success: boolean, advertencias: string[], error?: string}>}
   */
  async descontarStockOrden(ordenId) {
    const advertencias = [];

    try {
      console.log(`[B2BService] descontarStockOrden: ordenId=${ordenId}`);

      // Obtener items de la orden
      const { data: detalles, error: errDetalles } = await this.supabase
        .from('detalle_ordenes_compra')
        .select('id, catalogo_id, nombre_medicamento, cantidad')
        .eq('orden_id', ordenId);

      if (errDetalles) throw errDetalles;
      if (!detalles || detalles.length === 0) {
        console.warn(`[B2BService] descontarStockOrden: sin items para orden ${ordenId}`);
        return { success: true, advertencias };
      }

      // Procesar cada item
      for (const item of detalles) {
        if (!item.catalogo_id) {
          advertencias.push(`Item "${item.nombre_medicamento}" sin catalogo_id — stock no descontado`);
          continue;
        }

        try {
          // Obtener stock actual
          const { data: catalogo, error: errCat } = await this.supabase
            .from('catalogos')
            .select('id, stock')
            .eq('id', item.catalogo_id)
            .maybeSingle();

          if (errCat || !catalogo) {
            advertencias.push(`Catalogo ${item.catalogo_id} no encontrado — stock no descontado para "${item.nombre_medicamento}"`);
            continue;
          }

          const stockActual = catalogo.stock || 0;
          const nuevoStock = stockActual - item.cantidad;

          if (nuevoStock < 0) {
            advertencias.push(
              `Stock insuficiente para "${item.nombre_medicamento}": disponible=${stockActual}, solicitado=${item.cantidad}. Stock quedará en 0.`
            );
          }

          // Actualizar stock (mínimo 0)
          const { error: errUpdate } = await this.supabase
            .from('catalogos')
            .update({
              stock: Math.max(0, nuevoStock),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.catalogo_id);

          if (errUpdate) {
            advertencias.push(`Error actualizando stock de "${item.nombre_medicamento}": ${errUpdate.message}`);
          } else {
            console.log(`[B2BService] Stock descontado: "${item.nombre_medicamento}" ${stockActual} → ${Math.max(0, nuevoStock)}`);
          }
        } catch (itemErr) {
          advertencias.push(`Error procesando item "${item.nombre_medicamento}": ${itemErr.message}`);
        }
      }

      if (advertencias.length > 0) {
        console.warn(`[B2BService] descontarStockOrden completado con ${advertencias.length} advertencia(s):`, advertencias);
      } else {
        console.log(`[B2BService] descontarStockOrden completado sin advertencias. Orden: ${ordenId}`);
      }

      return { success: true, advertencias };
    } catch (err) {
      console.error('[B2BService] descontarStockOrden error:', err.message);
      return { success: false, advertencias, error: err.message };
    }
  }
}

module.exports = B2BService;
