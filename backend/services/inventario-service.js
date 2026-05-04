'use strict';

/**
 * InventarioService
 * Gestión de stock e inventario para Droguería Virtual.
 */

class InventarioService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    if (!supabase) throw new Error('InventarioService requiere una instancia de Supabase');
    this.supabase = supabase;
  }

  // ------------------------------------------------------------------
  // verificarDisponibilidad
  // Verifica si una droguería tiene stock suficiente para los ítems
  // solicitados en un pedido.
  // items: [{ catalogoId, cantidad }]
  // ------------------------------------------------------------------
  async verificarDisponibilidad(drogueriaId, items) {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Se requiere al menos un ítem para verificar');
    }

    try {
      const catalogoIds = items.map(i => i.catalogoId).filter(Boolean);
      if (catalogoIds.length === 0) {
        throw new Error('Los ítems deben incluir catalogoId');
      }

      const { data: registros, error } = await this.supabase
        .from('catalogos')
        .select('id, stock, disponible, medicamento_id, medicamentos(nombre)')
        .eq('drogueria_id', drogueriaId)
        .in('id', catalogoIds);

      if (error) throw error;

      const resultado = {
        disponible: true,
        items: [],
        faltantes: [],
      };

      for (const item of items) {
        const registro = registros.find(r => r.id === item.catalogoId);

        if (!registro) {
          resultado.disponible = false;
          resultado.faltantes.push({
            catalogoId: item.catalogoId,
            motivo: 'Medicamento no encontrado en el catálogo',
          });
          continue;
        }

        if (!registro.disponible) {
          resultado.disponible = false;
          resultado.faltantes.push({
            catalogoId: item.catalogoId,
            nombre: registro.medicamentos?.nombre,
            motivo: 'Medicamento marcado como no disponible',
          });
          continue;
        }

        if (registro.stock < item.cantidad) {
          resultado.disponible = false;
          resultado.faltantes.push({
            catalogoId: item.catalogoId,
            nombre: registro.medicamentos?.nombre,
            stockActual: registro.stock,
            cantidadSolicitada: item.cantidad,
            motivo: `Stock insuficiente (disponible: ${registro.stock}, solicitado: ${item.cantidad})`,
          });
          continue;
        }

        resultado.items.push({
          catalogoId: item.catalogoId,
          nombre: registro.medicamentos?.nombre,
          stockActual: registro.stock,
          cantidadSolicitada: item.cantidad,
          stockRestante: registro.stock - item.cantidad,
        });
      }

      return resultado;
    } catch (err) {
      throw new Error(`InventarioService.verificarDisponibilidad: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // descontarStock
  // Descuenta el stock de los ítems de un pedido cuando es confirmado.
  // Se ejecuta de forma atómica ítem por ítem con verificación.
  // ------------------------------------------------------------------
  async descontarStock(pedidoId) {
    if (!pedidoId) throw new Error('Se requiere el ID del pedido');
    try {
      // Obtener detalles del pedido
      const { data: detalles, error: errDetalles } = await this.supabase
        .from('detalle_pedidos')
        .select('id, catalogo_id, cantidad, nombre_medicamento')
        .eq('pedido_id', pedidoId);

      if (errDetalles) throw errDetalles;
      if (!detalles || detalles.length === 0) {
        throw new Error(`Pedido ${pedidoId} no tiene detalles o no existe`);
      }

      const operaciones = [];

      for (const detalle of detalles) {
        if (!detalle.catalogo_id) continue;

        // Leer stock actual
        const { data: catalogo, error: errCat } = await this.supabase
          .from('catalogos')
          .select('id, stock, disponible')
          .eq('id', detalle.catalogo_id)
          .single();

        if (errCat) throw errCat;
        if (!catalogo) {
          throw new Error(`Catálogo ${detalle.catalogo_id} no encontrado`);
        }

        const nuevoStock = catalogo.stock - detalle.cantidad;
        if (nuevoStock < 0) {
          throw new Error(
            `Stock insuficiente para "${detalle.nombre_medicamento}" ` +
            `(stock: ${catalogo.stock}, requerido: ${detalle.cantidad})`
          );
        }

        const { error: errUpdate } = await this.supabase
          .from('catalogos')
          .update({
            stock:      nuevoStock,
            disponible: nuevoStock > 0,
          })
          .eq('id', detalle.catalogo_id);

        if (errUpdate) throw errUpdate;

        operaciones.push({
          catalogoId:      detalle.catalogo_id,
          nombre:          detalle.nombre_medicamento,
          stockAnterior:   catalogo.stock,
          cantidadDescontada: detalle.cantidad,
          stockNuevo:      nuevoStock,
        });
      }

      return { pedidoId, operaciones, descontado: true };
    } catch (err) {
      throw new Error(`InventarioService.descontarStock: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // devolverStock
  // Devuelve el stock al inventario cuando un pedido es cancelado.
  // ------------------------------------------------------------------
  async devolverStock(pedidoId) {
    if (!pedidoId) throw new Error('Se requiere el ID del pedido');
    try {
      // Verificar que el pedido esté cancelado
      const { data: pedido, error: errPedido } = await this.supabase
        .from('pedidos')
        .select('id, status')
        .eq('id', pedidoId)
        .single();

      if (errPedido) throw errPedido;
      if (!pedido) throw new Error(`Pedido ${pedidoId} no encontrado`);
      if (pedido.status !== 'cancelado') {
        throw new Error('Solo se puede devolver stock de pedidos cancelados');
      }

      const { data: detalles, error: errDetalles } = await this.supabase
        .from('detalle_pedidos')
        .select('id, catalogo_id, cantidad, nombre_medicamento')
        .eq('pedido_id', pedidoId);

      if (errDetalles) throw errDetalles;

      const operaciones = [];

      for (const detalle of detalles) {
        if (!detalle.catalogo_id) continue;

        const { data: catalogo, error: errCat } = await this.supabase
          .from('catalogos')
          .select('id, stock')
          .eq('id', detalle.catalogo_id)
          .single();

        if (errCat || !catalogo) continue; // Si no existe el catálogo, ignorar

        const nuevoStock = catalogo.stock + detalle.cantidad;

        const { error: errUpdate } = await this.supabase
          .from('catalogos')
          .update({
            stock:      nuevoStock,
            disponible: true,       // Al devolver stock, marcar como disponible
          })
          .eq('id', detalle.catalogo_id);

        if (errUpdate) throw errUpdate;

        operaciones.push({
          catalogoId:     detalle.catalogo_id,
          nombre:         detalle.nombre_medicamento,
          stockAnterior:  catalogo.stock,
          cantidadDevuelta: detalle.cantidad,
          stockNuevo:     nuevoStock,
        });
      }

      return { pedidoId, operaciones, devuelto: true };
    } catch (err) {
      throw new Error(`InventarioService.devolverStock: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // alertasStockBajo
  // Devuelve medicamentos con stock igual o menor al umbral.
  // ------------------------------------------------------------------
  async alertasStockBajo(drogueriaId, umbral = 5) {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    try {
      const { data, error } = await this.supabase
        .from('catalogos')
        .select(`
          id, stock, disponible, precio,
          medicamentos (
            id, nombre, nombre_generico, presentacion, concentracion,
            categorias_medicamentos (nombre, icono)
          )
        `)
        .eq('drogueria_id', drogueriaId)
        .lte('stock', umbral)
        .order('stock', { ascending: true });

      if (error) throw error;

      const sinStock     = data.filter(i => i.stock === 0);
      const conStockBajo = data.filter(i => i.stock > 0 && i.stock <= umbral);

      return {
        umbral,
        totalAlertas: data.length,
        sinStock: {
          cantidad: sinStock.length,
          items:    sinStock,
        },
        stockBajo: {
          cantidad: conStockBajo.length,
          items:    conStockBajo,
        },
        generadoEn: new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(`InventarioService.alertasStockBajo: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // reporteInventario
  // Genera un reporte completo del inventario de la droguería.
  // ------------------------------------------------------------------
  async reporteInventario(drogueriaId) {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    try {
      const { data, error } = await this.supabase
        .from('catalogos')
        .select(`
          id, precio, precio_sin_formula, stock, disponible, notas,
          created_at, updated_at,
          medicamentos (
            id, nombre, nombre_generico, laboratorio, presentacion,
            concentracion, requiere_formula_medica, codigo_cum,
            categorias_medicamentos (id, nombre, icono)
          )
        `)
        .eq('drogueria_id', drogueriaId)
        .order('stock', { ascending: true });

      if (error) throw error;

      // Métricas generales
      const totalItems          = data.length;
      const itemsDisponibles    = data.filter(i => i.disponible).length;
      const itemsSinStock       = data.filter(i => i.stock === 0).length;
      const itemsStockCritico   = data.filter(i => i.stock > 0 && i.stock <= 5).length;
      const valorInventario     = data.reduce((acc, i) => acc + i.precio * i.stock, 0);
      const precioMax           = data.length > 0 ? Math.max(...data.map(i => i.precio)) : 0;
      const precioMin           = data.length > 0 ? Math.min(...data.map(i => i.precio)) : 0;
      const precioPromedio      = totalItems > 0
        ? data.reduce((acc, i) => acc + i.precio, 0) / totalItems : 0;

      // Agrupar por categoría
      const porCategoria = {};
      data.forEach(item => {
        const cat = item.medicamentos?.categorias_medicamentos?.nombre || 'Sin categoría';
        if (!porCategoria[cat]) {
          porCategoria[cat] = { cantidad: 0, valorTotal: 0, items: [] };
        }
        porCategoria[cat].cantidad++;
        porCategoria[cat].valorTotal += item.precio * item.stock;
        porCategoria[cat].items.push({
          nombre:  item.medicamentos?.nombre,
          stock:   item.stock,
          precio:  item.precio,
        });
      });

      // Medicamentos que requieren fórmula
      const requierenFormula = data.filter(
        i => i.medicamentos?.requiere_formula_medica
      ).length;

      return {
        drogueriaId,
        generadoEn: new Date().toISOString(),
        resumen: {
          totalItems,
          itemsDisponibles,
          itemsNoDisponibles: totalItems - itemsDisponibles,
          itemsSinStock,
          itemsStockCritico,
          requierenFormula,
          valorInventario:   parseFloat(valorInventario.toFixed(2)),
          precioMax:         parseFloat(precioMax.toFixed(2)),
          precioMin:         parseFloat(precioMin.toFixed(2)),
          precioPromedio:    parseFloat(precioPromedio.toFixed(2)),
        },
        porCategoria,
        detalle: data,
      };
    } catch (err) {
      throw new Error(`InventarioService.reporteInventario: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // ajustarStock
  // Permite hacer un ajuste manual del stock (positivo o negativo).
  // motivo: 'entrada', 'salida', 'vencimiento', 'daño', 'inventario_fisico'
  // ------------------------------------------------------------------
  async ajustarStock(catalogoId, cantidad, motivo = 'ajuste_manual') {
    if (!catalogoId) throw new Error('Se requiere el ID del catálogo');
    if (cantidad === undefined || cantidad === null) {
      throw new Error('Se requiere la cantidad de ajuste (puede ser negativa)');
    }

    const ajuste = parseInt(cantidad, 10);
    if (isNaN(ajuste)) throw new Error('La cantidad debe ser un número entero');

    try {
      // Leer stock actual
      const { data: catalogo, error: errGet } = await this.supabase
        .from('catalogos')
        .select('id, stock, medicamentos(nombre)')
        .eq('id', catalogoId)
        .single();

      if (errGet) throw errGet;
      if (!catalogo) throw new Error(`Catálogo con id=${catalogoId} no encontrado`);

      const stockAnterior = catalogo.stock;
      const nuevoStock    = stockAnterior + ajuste;

      if (nuevoStock < 0) {
        throw new Error(
          `El ajuste dejaría el stock en negativo ` +
          `(stock actual: ${stockAnterior}, ajuste: ${ajuste})`
        );
      }

      const { data, error } = await this.supabase
        .from('catalogos')
        .update({
          stock:      nuevoStock,
          disponible: nuevoStock > 0,
        })
        .eq('id', catalogoId)
        .select()
        .single();

      if (error) throw error;

      return {
        catalogoId,
        nombre:         catalogo.medicamentos?.nombre,
        stockAnterior,
        ajuste,
        stockNuevo:     nuevoStock,
        motivo,
        ajustadoEn:     new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(`InventarioService.ajustarStock: ${err.message}`);
    }
  }
}

module.exports = InventarioService;
