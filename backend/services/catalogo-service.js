'use strict';

/**
 * CatalogoService
 * Gestión del catálogo de medicamentos por droguería (precios, stock, disponibilidad).
 */

const Fuse = require('fuse.js');

class CatalogoService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    if (!supabase) throw new Error('CatalogoService requiere una instancia de Supabase');
    this.supabase = supabase;
  }

  // ------------------------------------------------------------------
  // obtenerCatalogoDrogueria
  // Lista todos los medicamentos del catálogo de una droguería.
  // filtros: { disponible, categoriaId, stockMinimo, limit, offset }
  // ------------------------------------------------------------------
  async obtenerCatalogoDrogueria(drogueriaId, filtros = {}) {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    try {
      const {
        disponible,
        categoriaId,
        stockMinimo,
        limit = 100,
        offset = 0,
      } = filtros;

      let query = this.supabase
        .from('catalogos')
        .select(`
          id, precio, precio_sin_formula, stock, disponible, notas,
          created_at, updated_at,
          medicamentos (
            id, nombre, nombre_generico, laboratorio, presentacion,
            concentracion, requiere_formula_medica, imagen_url,
            categorias_medicamentos (id, nombre, icono)
          )
        `)
        .eq('drogueria_id', drogueriaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (disponible !== undefined) query = query.eq('disponible', disponible);
      if (stockMinimo !== undefined) query = query.gte('stock', stockMinimo);

      const { data, error } = await query;
      if (error) throw error;

      // Filtro por categoría (anidado en medicamentos)
      let resultado = data;
      if (categoriaId) {
        resultado = data.filter(
          item => item.medicamentos?.categorias_medicamentos?.id === categoriaId
        );
      }

      return { data: resultado, total: resultado.length };
    } catch (err) {
      throw new Error(`CatalogoService.obtenerCatalogoDrogueria: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // agregarMedicamento
  // Agrega un medicamento al catálogo de una droguería.
  // ------------------------------------------------------------------
  async agregarMedicamento(drogueriaId, medicamentoId, precio, stock = 0, opciones = {}) {
    if (!drogueriaId)  throw new Error('Se requiere el ID de la droguería');
    if (!medicamentoId) throw new Error('Se requiere el ID del medicamento');
    if (precio === undefined || precio < 0) throw new Error('Se requiere un precio válido (>= 0)');

    try {
      const payload = {
        drogueria_id:       drogueriaId,
        medicamento_id:     medicamentoId,
        precio:             parseFloat(precio),
        precio_sin_formula: opciones.precioSinFormula != null
          ? parseFloat(opciones.precioSinFormula) : null,
        stock:              parseInt(stock, 10),
        disponible:         opciones.disponible ?? true,
        notas:              opciones.notas || null,
      };

      const { data, error } = await this.supabase
        .from('catalogos')
        .insert(payload)
        .select(`
          id, precio, precio_sin_formula, stock, disponible, notas,
          medicamentos (id, nombre, nombre_generico, presentacion, concentracion)
        `)
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Este medicamento ya existe en el catálogo de esta droguería');
        }
        throw error;
      }
      return data;
    } catch (err) {
      throw new Error(`CatalogoService.agregarMedicamento: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // actualizarPrecio
  // ------------------------------------------------------------------
  async actualizarPrecio(catalogoId, nuevoPrecio, precioSinFormula = null) {
    if (!catalogoId)   throw new Error('Se requiere el ID del registro de catálogo');
    if (nuevoPrecio === undefined || nuevoPrecio < 0) {
      throw new Error('Se requiere un precio válido (>= 0)');
    }

    try {
      const payload = { precio: parseFloat(nuevoPrecio) };
      if (precioSinFormula !== null) {
        payload.precio_sin_formula = parseFloat(precioSinFormula);
      }

      const { data, error } = await this.supabase
        .from('catalogos')
        .update(payload)
        .eq('id', catalogoId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`CatalogoService.actualizarPrecio: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // actualizarStock
  // ------------------------------------------------------------------
  async actualizarStock(catalogoId, nuevoStock) {
    if (!catalogoId) throw new Error('Se requiere el ID del registro de catálogo');
    if (nuevoStock === undefined || nuevoStock < 0) {
      throw new Error('El stock no puede ser negativo');
    }

    try {
      const stock = parseInt(nuevoStock, 10);
      // Si llega a 0, marcarlo como no disponible automáticamente
      const payload = {
        stock,
        disponible: stock > 0 ? undefined : false,
      };
      // Limpiar campos undefined
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const { data, error } = await this.supabase
        .from('catalogos')
        .update(payload)
        .eq('id', catalogoId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`CatalogoService.actualizarStock: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // toggleDisponibilidad
  // Activa/desactiva la disponibilidad de un ítem del catálogo.
  // ------------------------------------------------------------------
  async toggleDisponibilidad(catalogoId) {
    if (!catalogoId) throw new Error('Se requiere el ID del registro de catálogo');
    try {
      // Obtener estado actual
      const { data: actual, error: errActual } = await this.supabase
        .from('catalogos')
        .select('id, disponible, stock')
        .eq('id', catalogoId)
        .single();

      if (errActual) throw errActual;
      if (!actual) throw new Error(`Catálogo con id=${catalogoId} no encontrado`);

      // Si quiere activar pero no hay stock, se advierte
      const nuevoEstado = !actual.disponible;
      if (nuevoEstado && actual.stock === 0) {
        throw new Error('No se puede activar un medicamento sin stock. Actualice el stock primero.');
      }

      const { data, error } = await this.supabase
        .from('catalogos')
        .update({ disponible: nuevoEstado })
        .eq('id', catalogoId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`CatalogoService.toggleDisponibilidad: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // eliminarDelCatalogo
  // ------------------------------------------------------------------
  async eliminarDelCatalogo(catalogoId) {
    if (!catalogoId) throw new Error('Se requiere el ID del registro de catálogo');
    try {
      const { error } = await this.supabase
        .from('catalogos')
        .delete()
        .eq('id', catalogoId);

      if (error) throw error;
      return { eliminado: true, catalogoId };
    } catch (err) {
      throw new Error(`CatalogoService.eliminarDelCatalogo: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // buscarEnCatalogo
  // Búsqueda fuzzy dentro del catálogo de una droguería.
  // ------------------------------------------------------------------
  async buscarEnCatalogo(drogueriaId, query) {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    if (!query || query.trim().length === 0) {
      return this.obtenerCatalogoDrogueria(drogueriaId, { disponible: true });
    }

    try {
      // Traer todo el catálogo disponible para aplicar Fuse.js
      const { data: catalogo } = await this.obtenerCatalogoDrogueria(drogueriaId, {
        disponible: true,
        limit: 500,
      });

      const fuse = new Fuse(catalogo, {
        keys: [
          { name: 'medicamentos.nombre',          weight: 0.6 },
          { name: 'medicamentos.nombre_generico', weight: 0.3 },
          { name: 'medicamentos.laboratorio',     weight: 0.1 },
        ],
        threshold: 0.4,
        includeScore: true,
      });

      const resultados = fuse.search(query.trim());
      return {
        data: resultados.map(r => r.item),
        total: resultados.length,
        query,
      };
    } catch (err) {
      throw new Error(`CatalogoService.buscarEnCatalogo: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // obtenerEstadisticasCatalogo
  // Retorna métricas del catálogo de una droguería.
  // ------------------------------------------------------------------
  async obtenerEstadisticasCatalogo(drogueriaId) {
    if (!drogueriaId) throw new Error('Se requiere el ID de la droguería');
    try {
      const { data, error } = await this.supabase
        .from('catalogos')
        .select('id, precio, stock, disponible')
        .eq('drogueria_id', drogueriaId);

      if (error) throw error;

      const totalItems     = data.length;
      const disponibles    = data.filter(i => i.disponible).length;
      const noDisponibles  = totalItems - disponibles;
      const sinStock       = data.filter(i => i.stock === 0).length;
      const stockBajo      = data.filter(i => i.stock > 0 && i.stock <= 5).length;
      const valorInventario = data.reduce(
        (acc, i) => acc + i.precio * i.stock, 0
      );
      const precioPromedio = totalItems > 0
        ? data.reduce((acc, i) => acc + i.precio, 0) / totalItems : 0;

      return {
        totalItems,
        disponibles,
        noDisponibles,
        sinStock,
        stockBajo,
        valorInventario: parseFloat(valorInventario.toFixed(2)),
        precioPromedio:  parseFloat(precioPromedio.toFixed(2)),
      };
    } catch (err) {
      throw new Error(`CatalogoService.obtenerEstadisticasCatalogo: ${err.message}`);
    }
  }
}

module.exports = CatalogoService;
