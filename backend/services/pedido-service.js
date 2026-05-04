'use strict';

/**
 * PedidoService
 * Gestión completa de pedidos para Droguería Virtual.
 */

class PedidoService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    if (!supabase) throw new Error('PedidoService requiere una instancia de Supabase');
    this.supabase = supabase;
  }

  // ------------------------------------------------------------------
  // crearPedido
  // Crea un pedido con sus ítems (detalle_pedidos).
  // datos: {
  //   drogueriaId, clienteTelefono, clienteNombre, clienteDireccion,
  //   clienteBarrio, modalidad, metodoPago, notas, formulaMedicaUrl,
  //   tieneFormula, canal,
  //   items: [{ catalogoId, medicamentoId, nombreMedicamento, cantidad,
  //             precioUnitario, requiereFormula }]
  // }
  // ------------------------------------------------------------------
  async crearPedido(datos) {
    const requeridos = ['drogueriaId', 'clienteTelefono', 'items'];
    for (const campo of requeridos) {
      if (!datos[campo]) throw new Error(`Campo requerido: ${campo}`);
    }
    if (!Array.isArray(datos.items) || datos.items.length === 0) {
      throw new Error('El pedido debe tener al menos un ítem');
    }

    try {
      // Validar y calcular total
      const total = await this.calcularTotal(datos.items, datos.drogueriaId);

      // Crear cabecera del pedido
      const pedidoPayload = {
        drogueria_id:      datos.drogueriaId,
        cliente_telefono:  datos.clienteTelefono,
        cliente_nombre:    datos.clienteNombre || null,
        cliente_direccion: datos.clienteDireccion || null,
        cliente_barrio:    datos.clienteBarrio || null,
        modalidad:         datos.modalidad || 'domicilio',
        total:             total.totalCalculado,
        metodo_pago:       datos.metodoPago || null,
        notas:             datos.notas || null,
        formula_medica_url: datos.formulaMedicaUrl || null,
        tiene_formula:     datos.tieneFormula ?? false,
        canal:             datos.canal || 'whatsapp',
        status:            'pendiente',
      };

      const { data: pedido, error: errPedido } = await this.supabase
        .from('pedidos')
        .insert(pedidoPayload)
        .select()
        .single();

      if (errPedido) throw errPedido;

      // Crear detalles
      const detalles = datos.items.map(item => ({
        pedido_id:         pedido.id,
        medicamento_id:    item.medicamentoId || null,
        catalogo_id:       item.catalogoId || null,
        nombre_medicamento: item.nombreMedicamento,
        cantidad:          parseInt(item.cantidad, 10),
        precio_unitario:   parseFloat(item.precioUnitario),
        subtotal:          parseFloat((item.cantidad * item.precioUnitario).toFixed(2)),
        requiere_formula:  item.requiereFormula ?? false,
      }));

      const { error: errDetalle } = await this.supabase
        .from('detalle_pedidos')
        .insert(detalles);

      if (errDetalle) throw errDetalle;

      // Incrementar contador de pedidos en la droguería
      await this.supabase.rpc('incrementar_total_pedidos', { p_drogueria_id: datos.drogueriaId })
        .then(() => {}) // Fire-and-forget, no crítico
        .catch(() => {});

      return this.obtenerPedido(pedido.id);
    } catch (err) {
      throw new Error(`PedidoService.crearPedido: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // obtenerPedido
  // Devuelve un pedido completo con sus detalles y medicamentos.
  // ------------------------------------------------------------------
  async obtenerPedido(id) {
    if (!id) throw new Error('Se requiere el ID del pedido');
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select(`
          id, numero_pedido, cliente_telefono, cliente_nombre,
          cliente_direccion, cliente_barrio, modalidad, status,
          total, metodo_pago, notas, formula_medica_url, tiene_formula,
          canal, created_at, updated_at, confirmado_at, entregado_at,
          droguerias (
            id, nombre, telefono, direccion, ciudad, barrio,
            whatsapp_numero
          ),
          detalle_pedidos (
            id, nombre_medicamento, cantidad, precio_unitario,
            subtotal, requiere_formula,
            medicamentos (id, nombre, nombre_generico, presentacion, concentracion)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error(`Pedido con id=${id} no encontrado`);
      return data;
    } catch (err) {
      throw new Error(`PedidoService.obtenerPedido: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // listarPedidosDrogueria
  // Lista pedidos de una droguería con paginación y filtros.
  // filtros: { status, canal, fecha_inicio, fecha_fin, limit, offset }
  // ------------------------------------------------------------------
  async listarPedidosDrogueria(drogueriaId, filtros = {}) {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    try {
      const {
        status,
        canal,
        fechaInicio,
        fechaFin,
        limit = 20,
        offset = 0,
      } = filtros;

      let query = this.supabase
        .from('pedidos')
        .select(`
          id, numero_pedido, cliente_telefono, cliente_nombre,
          cliente_direccion, cliente_barrio, modalidad, status,
          total, metodo_pago, canal, created_at, confirmado_at, entregado_at,
          detalle_pedidos (id, nombre_medicamento, cantidad, subtotal)
        `, { count: 'exact' })
        .eq('drogueria_id', drogueriaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status)      query = query.eq('status', status);
      if (canal)       query = query.eq('canal', canal);
      if (fechaInicio) query = query.gte('created_at', fechaInicio);
      if (fechaFin)    query = query.lte('created_at', fechaFin);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data,
        total: count,
        limit,
        offset,
        paginas: Math.ceil((count || 0) / limit),
      };
    } catch (err) {
      throw new Error(`PedidoService.listarPedidosDrogueria: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // listarPedidosCliente
  // Lista todos los pedidos de un cliente por teléfono.
  // ------------------------------------------------------------------
  async listarPedidosCliente(telefono, opciones = {}) {
    if (!telefono) throw new Error('Se requiere el teléfono del cliente');
    try {
      const { limit = 20, offset = 0 } = opciones;

      const { data, error } = await this.supabase
        .from('pedidos')
        .select(`
          id, numero_pedido, status, total, metodo_pago, modalidad,
          canal, created_at, confirmado_at, entregado_at,
          droguerias (id, nombre, telefono, ciudad),
          detalle_pedidos (id, nombre_medicamento, cantidad, subtotal)
        `)
        .eq('cliente_telefono', telefono)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`PedidoService.listarPedidosCliente: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // cambiarStatus
  // Cambia el estado de un pedido y actualiza timestamps relevantes.
  // ------------------------------------------------------------------
  async cambiarStatus(pedidoId, nuevoStatus, notas = null) {
    if (!pedidoId)   throw new Error('Se requiere el ID del pedido');
    if (!nuevoStatus) throw new Error('Se requiere el nuevo estado');

    const statusValidos = ['pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];
    if (!statusValidos.includes(nuevoStatus)) {
      throw new Error(`Estado inválido: ${nuevoStatus}. Valores válidos: ${statusValidos.join(', ')}`);
    }

    try {
      const payload = { status: nuevoStatus };
      if (notas) payload.notas = notas;
      if (nuevoStatus === 'confirmado')  payload.confirmado_at = new Date().toISOString();
      if (nuevoStatus === 'entregado')   payload.entregado_at  = new Date().toISOString();

      const { data, error } = await this.supabase
        .from('pedidos')
        .update(payload)
        .eq('id', pedidoId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`PedidoService.cambiarStatus: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // calcularTotal
  // Valida los precios de los ítems contra el catálogo y calcula total.
  // items: [{ catalogoId, cantidad, precioUnitario }]
  // ------------------------------------------------------------------
  async calcularTotal(items, drogueriaId = null) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Se requiere al menos un ítem para calcular el total');
    }

    const errores       = [];
    let totalCalculado  = 0;
    const itemsValidados = [];

    for (const item of items) {
      if (!item.cantidad || item.cantidad <= 0) {
        errores.push(`Cantidad inválida para ítem: ${item.nombreMedicamento || item.catalogoId}`);
        continue;
      }

      // Si hay catalogoId, validar precio contra BD
      if (item.catalogoId) {
        const { data: catalogo, error } = await this.supabase
          .from('catalogos')
          .select('id, precio, stock, disponible')
          .eq('id', item.catalogoId)
          .single();

        if (error || !catalogo) {
          errores.push(`Catálogo ${item.catalogoId} no encontrado`);
          continue;
        }
        if (!catalogo.disponible) {
          errores.push(`Medicamento no disponible: ${item.nombreMedicamento}`);
          continue;
        }
        if (catalogo.stock < item.cantidad) {
          errores.push(`Stock insuficiente para: ${item.nombreMedicamento} (disponible: ${catalogo.stock})`);
          continue;
        }

        const precioValidado = catalogo.precio;
        const subtotal = parseFloat((item.cantidad * precioValidado).toFixed(2));
        totalCalculado += subtotal;
        itemsValidados.push({ ...item, precioUnitario: precioValidado, subtotal });
      } else {
        // Sin catalogoId: confiar en el precio enviado (usado desde WhatsApp bot)
        const precio   = parseFloat(item.precioUnitario) || 0;
        const subtotal = parseFloat((item.cantidad * precio).toFixed(2));
        totalCalculado += subtotal;
        itemsValidados.push({ ...item, subtotal });
      }
    }

    if (errores.length > 0) {
      throw new Error(`Errores en los ítems:\n${errores.join('\n')}`);
    }

    return {
      itemsValidados,
      totalCalculado: parseFloat(totalCalculado.toFixed(2)),
    };
  }

  // ------------------------------------------------------------------
  // cancelarPedido
  // ------------------------------------------------------------------
  async cancelarPedido(pedidoId, motivo = null) {
    if (!pedidoId) throw new Error('Se requiere el ID del pedido');
    try {
      // Verificar que el pedido no esté ya entregado
      const { data: pedido, error: errGet } = await this.supabase
        .from('pedidos')
        .select('id, status')
        .eq('id', pedidoId)
        .single();

      if (errGet) throw errGet;
      if (!pedido) throw new Error(`Pedido con id=${pedidoId} no encontrado`);
      if (pedido.status === 'entregado') {
        throw new Error('No se puede cancelar un pedido ya entregado');
      }
      if (pedido.status === 'cancelado') {
        throw new Error('El pedido ya está cancelado');
      }

      return this.cambiarStatus(pedidoId, 'cancelado', motivo);
    } catch (err) {
      throw new Error(`PedidoService.cancelarPedido: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // obtenerEstadisticasDrogueria
  // Devuelve métricas de ventas y pedidos de una droguería en un período.
  // periodo: 'hoy' | 'semana' | 'mes' | 'anio' | { inicio, fin }
  // ------------------------------------------------------------------
  async obtenerEstadisticasDrogueria(drogueriaId, periodo = 'mes') {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    try {
      let fechaInicio;
      const ahora = new Date();

      if (typeof periodo === 'object' && periodo.inicio && periodo.fin) {
        fechaInicio = new Date(periodo.inicio).toISOString();
      } else {
        switch (periodo) {
          case 'hoy':
            fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
            break;
          case 'semana':
            fechaInicio = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case 'anio':
            fechaInicio = new Date(ahora.getFullYear(), 0, 1).toISOString();
            break;
          case 'mes':
          default:
            fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
        }
      }

      const { data: pedidos, error } = await this.supabase
        .from('pedidos')
        .select('id, status, total, metodo_pago, canal, created_at')
        .eq('drogueria_id', drogueriaId)
        .gte('created_at', fechaInicio);

      if (error) throw error;

      const totalPedidos    = pedidos.length;
      const entregados      = pedidos.filter(p => p.status === 'entregado');
      const cancelados      = pedidos.filter(p => p.status === 'cancelado');
      const pendientes      = pedidos.filter(p => p.status === 'pendiente');
      const enProceso       = pedidos.filter(p =>
        ['confirmado', 'en_preparacion', 'en_camino'].includes(p.status)
      );

      const ventasTotales = entregados.reduce((acc, p) => acc + (p.total || 0), 0);
      const ticketPromedio = entregados.length > 0
        ? ventasTotales / entregados.length : 0;

      // Agrupar por método de pago
      const porMetodoPago = {};
      entregados.forEach(p => {
        const mp = p.metodo_pago || 'sin_especificar';
        porMetodoPago[mp] = (porMetodoPago[mp] || 0) + 1;
      });

      // Agrupar por canal
      const porCanal = {};
      pedidos.forEach(p => {
        porCanal[p.canal] = (porCanal[p.canal] || 0) + 1;
      });

      return {
        periodo,
        fechaInicio,
        totalPedidos,
        entregados:    entregados.length,
        cancelados:    cancelados.length,
        pendientes:    pendientes.length,
        enProceso:     enProceso.length,
        ventasTotales: parseFloat(ventasTotales.toFixed(2)),
        ticketPromedio: parseFloat(ticketPromedio.toFixed(2)),
        tasaCancelacion: totalPedidos > 0
          ? parseFloat(((cancelados.length / totalPedidos) * 100).toFixed(1)) : 0,
        porMetodoPago,
        porCanal,
      };
    } catch (err) {
      throw new Error(`PedidoService.obtenerEstadisticasDrogueria: ${err.message}`);
    }
  }
}

module.exports = PedidoService;
