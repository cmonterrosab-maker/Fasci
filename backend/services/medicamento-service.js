'use strict';

/**
 * MedicamentoService
 * Gestión del catálogo maestro de medicamentos para Droguería Virtual.
 */

const Fuse = require('fuse.js');

class MedicamentoService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    if (!supabase) throw new Error('MedicamentoService requiere una instancia de Supabase');
    this.supabase = supabase;
  }

  // ------------------------------------------------------------------
  // buscarMedicamentos
  // Búsqueda fuzzy por nombre o nombre genérico usando Fuse.js.
  // filtros: { categoriaId, requiereFormula, activo, limit, offset }
  // ------------------------------------------------------------------
  async buscarMedicamentos(query = '', filtros = {}) {
    try {
      const {
        categoriaId,
        requiereFormula,
        activo = true,
        limit = 50,
        offset = 0,
      } = filtros;

      let dbQuery = this.supabase
        .from('medicamentos')
        .select(`
          id, nombre, nombre_generico, laboratorio, presentacion,
          concentracion, requiere_formula_medica, codigo_cum,
          descripcion, imagen_url, activo,
          categorias_medicamentos (id, nombre, icono)
        `)
        .eq('activo', activo)
        .range(offset, offset + limit - 1);

      if (categoriaId) dbQuery = dbQuery.eq('categoria_id', categoriaId);
      if (requiereFormula !== undefined) {
        dbQuery = dbQuery.eq('requiere_formula_medica', requiereFormula);
      }

      const { data, error } = await dbQuery;
      if (error) throw error;

      // Si hay query de texto, aplicar Fuse.js sobre los resultados
      if (query && query.trim().length > 0) {
        const fuse = new Fuse(data, {
          keys: [
            { name: 'nombre',          weight: 0.6 },
            { name: 'nombre_generico', weight: 0.3 },
            { name: 'laboratorio',     weight: 0.1 },
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
      }

      return { data, total: data.length, query: '' };
    } catch (err) {
      throw new Error(`MedicamentoService.buscarMedicamentos: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // obtenerMedicamento
  // Retorna un medicamento por su UUID con su categoría.
  // ------------------------------------------------------------------
  async obtenerMedicamento(id) {
    if (!id) throw new Error('Se requiere el ID del medicamento');
    try {
      const { data, error } = await this.supabase
        .from('medicamentos')
        .select(`
          id, nombre, nombre_generico, laboratorio, presentacion,
          concentracion, requiere_formula_medica, codigo_cum,
          descripcion, imagen_url, activo, created_at, updated_at,
          categorias_medicamentos (id, nombre, descripcion, icono, requiere_formula)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error(`Medicamento con id=${id} no encontrado`);
      return data;
    } catch (err) {
      throw new Error(`MedicamentoService.obtenerMedicamento: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // listarCategorias
  // Devuelve todas las categorías de medicamentos.
  // ------------------------------------------------------------------
  async listarCategorias() {
    try {
      const { data, error } = await this.supabase
        .from('categorias_medicamentos')
        .select('id, nombre, descripcion, requiere_formula, icono')
        .order('nombre', { ascending: true });

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`MedicamentoService.listarCategorias: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // buscarPorCategoria
  // Lista medicamentos activos de una categoría específica.
  // ------------------------------------------------------------------
  async buscarPorCategoria(categoriaId, opciones = {}) {
    if (!categoriaId) throw new Error('Se requiere el ID de la categoría');
    try {
      const { limit = 100, offset = 0 } = opciones;

      const { data, error } = await this.supabase
        .from('medicamentos')
        .select(`
          id, nombre, nombre_generico, laboratorio, presentacion,
          concentracion, requiere_formula_medica, codigo_cum,
          descripcion, imagen_url,
          categorias_medicamentos (id, nombre, icono)
        `)
        .eq('categoria_id', categoriaId)
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`MedicamentoService.buscarPorCategoria: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // crearMedicamento (solo admin / service role)
  // ------------------------------------------------------------------
  async crearMedicamento(datos) {
    const requeridos = ['nombre', 'presentacion', 'categoria_id'];
    for (const campo of requeridos) {
      if (!datos[campo]) throw new Error(`Campo requerido: ${campo}`);
    }

    try {
      const payload = {
        nombre:                 datos.nombre.trim(),
        nombre_generico:        datos.nombre_generico?.trim() || null,
        laboratorio:            datos.laboratorio?.trim() || null,
        presentacion:           datos.presentacion.trim(),
        concentracion:          datos.concentracion?.trim() || null,
        categoria_id:           datos.categoria_id,
        requiere_formula_medica: datos.requiere_formula_medica ?? false,
        codigo_cum:             datos.codigo_cum?.trim() || null,
        descripcion:            datos.descripcion?.trim() || null,
        imagen_url:             datos.imagen_url || null,
        activo:                 datos.activo ?? true,
      };

      const { data, error } = await this.supabase
        .from('medicamentos')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`MedicamentoService.crearMedicamento: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // actualizarMedicamento (solo admin / service role)
  // ------------------------------------------------------------------
  async actualizarMedicamento(id, datos) {
    if (!id) throw new Error('Se requiere el ID del medicamento');
    if (!datos || Object.keys(datos).length === 0) {
      throw new Error('No se proporcionaron datos para actualizar');
    }

    // Campos permitidos para actualización
    const camposPermitidos = [
      'nombre', 'nombre_generico', 'laboratorio', 'presentacion',
      'concentracion', 'categoria_id', 'requiere_formula_medica',
      'codigo_cum', 'descripcion', 'imagen_url', 'activo',
    ];

    const payload = {};
    for (const campo of camposPermitidos) {
      if (datos[campo] !== undefined) payload[campo] = datos[campo];
    }

    try {
      const { data, error } = await this.supabase
        .from('medicamentos')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new Error(`MedicamentoService.actualizarMedicamento: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // buscarDisponibleEnDroguerias
  // Devuelve las droguerías activas que tienen en stock un medicamento.
  // Filtra opcionalmente por ciudad.
  // ------------------------------------------------------------------
  async buscarDisponibleEnDroguerias(medicamentoId, ciudad = null) {
    if (!medicamentoId) throw new Error('Se requiere el ID del medicamento');
    try {
      let query = this.supabase
        .from('catalogos')
        .select(`
          id, precio, precio_sin_formula, stock, disponible, notas,
          droguerias (
            id, nombre, telefono, direccion, ciudad, barrio,
            whatsapp_numero, horario, lat, lng, status,
            calificacion_promedio
          ),
          medicamentos (
            id, nombre, nombre_generico, presentacion, concentracion,
            requiere_formula_medica
          )
        `)
        .eq('medicamento_id', medicamentoId)
        .eq('disponible', true)
        .gt('stock', 0);

      const { data, error } = await query;
      if (error) throw error;

      // Filtro por ciudad post-query (relación anidada)
      let resultado = data.filter(
        item => item.droguerias && item.droguerias.status === 'active'
      );

      if (ciudad) {
        const ciudadNorm = ciudad.toLowerCase().trim();
        resultado = resultado.filter(
          item =>
            item.droguerias?.ciudad?.toLowerCase().includes(ciudadNorm)
        );
      }

      // Ordenar por precio ascendente
      resultado.sort((a, b) => a.precio - b.precio);

      return resultado;
    } catch (err) {
      throw new Error(`MedicamentoService.buscarDisponibleEnDroguerias: ${err.message}`);
    }
  }
}

module.exports = MedicamentoService;
