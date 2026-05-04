'use strict';

/**
 * FeeService — Sistema de fee para el canal B2C
 *
 * Modelo:
 *   - La plataforma cobra un % sobre cada pedido B2C entregado.
 *   - El distribuidor despacha y recibe el neto (total - fee).
 *   - Al cierre de cada período se genera una liquidación
 *     con el detalle de lo que se deben entre socios.
 *
 * Flujo por pedido:
 *   1. crearPedidoConFee()  → registra pedido + calcula fee automáticamente
 *   2. confirmarEntrega()   → cambia fee_estado a 'liquidable'
 *   3. generarLiquidacion() → agrupa pedidos del período y genera el corte
 *   4. marcarPagada()       → cierra la liquidación cuando el socio paga
 */

class FeeService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURACIÓN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Obtiene el porcentaje de fee activo para el canal B2C.
   * Siempre lee de la BD para respetar cambios dinámicos.
   * @returns {Promise<number>} porcentaje (ej: 12.00)
   */
  async obtenerPorcentajeActivo() {
    const { data } = await this.supabase
      .from('configuracion_fee')
      .select('porcentaje')
      .eq('canal', 'b2c')
      .eq('activo', true)
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.porcentaje ?? 12.00; // fallback al 12% si no hay config
  }

  /**
   * Actualiza el porcentaje del fee (admin).
   * Desactiva el anterior y crea uno nuevo para tener historial.
   */
  async actualizarPorcentaje(nuevoPorcentaje, descripcion = '') {
    // Desactivar el actual
    await this.supabase
      .from('configuracion_fee')
      .update({ activo: false })
      .eq('canal', 'b2c')
      .eq('activo', true);

    // Insertar el nuevo
    const { data, error } = await this.supabase
      .from('configuracion_fee')
      .insert({
        canal:        'b2c',
        porcentaje:   nuevoPorcentaje,
        descripcion:  descripcion || `Actualización a ${nuevoPorcentaje}%`,
        activo:       true,
        vigente_desde: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;
    console.log(`[FeeService] Fee actualizado a ${nuevoPorcentaje}%`);
    return data;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CÁLCULO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula el fee y el neto para un monto dado.
   * @param {number} total — valor total del pedido
   * @param {number} [porcentaje] — si no se pasa, usa el activo en BD
   * @returns {{ porcentaje, fee, neto }}
   */
  calcular(total, porcentaje) {
    const pct  = porcentaje ?? 12;
    const fee  = Math.round((total * pct / 100) * 100) / 100;
    const neto = Math.round((total - fee) * 100) / 100;
    return { porcentaje: pct, fee, neto };
  }

  /**
   * Registra el fee en un pedido B2C ya creado.
   * Se llama justo después de crear el pedido en el bot.
   *
   * @param {string} pedidoId
   * @param {number} total — valor total del pedido
   * @returns {Promise<{ fee, neto, porcentaje }>}
   */
  async registrarFeeEnPedido(pedidoId, total) {
    const porcentaje = await this.obtenerPorcentajeActivo();
    const { fee, neto } = this.calcular(total, porcentaje);

    const { error } = await this.supabase
      .from('pedidos')
      .update({
        es_b2c:            true,
        fee_porcentaje:    porcentaje,
        fee_monto:         fee,
        neto_distribuidor: neto,
        fee_estado:        'pendiente',
      })
      .eq('id', pedidoId);

    if (error) {
      console.error('[FeeService] Error registrando fee en pedido:', error.message);
      throw error;
    }

    console.log(`[FeeService] Fee registrado — pedido ${pedidoId} | total $${total} | fee $${fee} (${porcentaje}%) | neto $${neto}`);
    return { fee, neto, porcentaje };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Resumen de fees del período actual (mes en curso por defecto).
   * Útil para el dashboard de admin de la plataforma.
   *
   * @param {{ desde?: string, hasta?: string }} opciones — fechas ISO, defecto: mes actual
   * @returns {Promise<object>}
   */
  async resumenPeriodo({ desde, hasta } = {}) {
    const ahora  = new Date();
    const inicio = desde || new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const fin    = hasta || new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: pedidos, error } = await this.supabase
      .from('pedidos')
      .select('total, fee_monto, neto_distribuidor, fee_estado, status, created_at')
      .eq('es_b2c', true)
      .gte('created_at', inicio)
      .lte('created_at', fin)
      .in('status', ['entregado', 'en_camino', 'confirmado']);

    if (error) throw error;

    const rows = pedidos || [];

    const resumen = {
      periodo:           { desde: inicio.split('T')[0], hasta: fin.split('T')[0] },
      total_pedidos:     rows.length,
      valor_bruto:       rows.reduce((s, p) => s + Number(p.total || 0), 0),
      total_fee:         rows.reduce((s, p) => s + Number(p.fee_monto || 0), 0),
      total_neto:        rows.reduce((s, p) => s + Number(p.neto_distribuidor || 0), 0),
      pendientes_liquidar: rows.filter(p => p.fee_estado === 'pendiente' && p.status === 'entregado').length,
    };

    resumen.ticket_promedio = rows.length
      ? Math.round(resumen.valor_bruto / rows.length)
      : 0;

    resumen.fee_promedio_pct = resumen.valor_bruto
      ? Math.round((resumen.total_fee / resumen.valor_bruto) * 10000) / 100
      : 0;

    console.log(`[FeeService] Resumen ${resumen.periodo.desde} → ${resumen.periodo.hasta}:`,
      `${resumen.total_pedidos} pedidos | fee $${resumen.total_fee}`);

    return resumen;
  }

  /**
   * Lista pedidos B2C pendientes de liquidar (entregados, fee no liquidado).
   */
  async pedidosPendientesLiquidar() {
    const { data, error } = await this.supabase
      .from('pedidos')
      .select(`
        id, numero_pedido, total, fee_porcentaje, fee_monto,
        neto_distribuidor, created_at, entregado_at, cliente_nombre
      `)
      .eq('es_b2c', true)
      .eq('status', 'entregado')
      .eq('fee_estado', 'pendiente')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIQUIDACIONES (CORTES ENTRE SOCIOS)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Genera una liquidación para el período indicado.
   * Agrupa todos los pedidos B2C entregados con fee pendiente.
   *
   * @param {{ desde: string, hasta: string, notas?: string }} params
   * @returns {Promise<{ liquidacion, pedidos }>}
   */
  async generarLiquidacion({ desde, hasta, notas = '' }) {
    // 1. Pedidos del período entregados y con fee pendiente
    const { data: pedidos, error } = await this.supabase
      .from('pedidos')
      .select('id, numero_pedido, total, fee_monto, neto_distribuidor, entregado_at')
      .eq('es_b2c', true)
      .eq('status', 'entregado')
      .eq('fee_estado', 'pendiente')
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!pedidos || pedidos.length === 0) {
      return { liquidacion: null, pedidos: [], mensaje: 'No hay pedidos pendientes de liquidar en ese período.' };
    }

    // 2. Calcular totales
    const valorBruto   = pedidos.reduce((s, p) => s + Number(p.total || 0), 0);
    const totalFee     = pedidos.reduce((s, p) => s + Number(p.fee_monto || 0), 0);
    const totalNeto    = pedidos.reduce((s, p) => s + Number(p.neto_distribuidor || 0), 0);

    // 3. Crear registro de liquidación
    const { data: liq, error: errLiq } = await this.supabase
      .from('liquidaciones')
      .insert({
        periodo_inicio: desde.split('T')[0],
        periodo_fin:    hasta.split('T')[0],
        total_pedidos:  pedidos.length,
        valor_bruto:    valorBruto,
        total_fee:      totalFee,
        total_neto:     totalNeto,
        status:         'borrador',
        notas,
      })
      .select()
      .single();

    if (errLiq) throw errLiq;

    // 4. Marcar pedidos como liquidados y asociarlos a esta liquidación
    const ids = pedidos.map(p => p.id);
    await this.supabase
      .from('pedidos')
      .update({ fee_estado: 'liquidado', liquidacion_id: liq.id })
      .in('id', ids);

    console.log(`[FeeService] Liquidación generada: ${liq.id} | ${pedidos.length} pedidos | fee $${totalFee} | neto $${totalNeto}`);
    return { liquidacion: liq, pedidos };
  }

  /**
   * Formatea una liquidación como texto para WhatsApp o email entre socios.
   */
  formatearLiquidacion(liquidacion, pedidos = []) {
    const fmtCOP = n => `$${Number(n).toLocaleString('es-CO')}`;
    const lineas = pedidos.slice(0, 10).map(p =>
      `• ${p.numero_pedido} | ${fmtCOP(p.total)} → fee ${fmtCOP(p.fee_monto)}`
    );
    if (pedidos.length > 10) lineas.push(`  ... y ${pedidos.length - 10} pedidos más`);

    return [
      `📊 *LIQUIDACIÓN B2C — Droguería Virtual*`,
      ``,
      `📅 Período: ${liquidacion.periodo_inicio} → ${liquidacion.periodo_fin}`,
      ``,
      `📦 Pedidos despachados: *${liquidacion.total_pedidos}*`,
      `💰 Valor bruto total:   *${fmtCOP(liquidacion.valor_bruto)}*`,
      `✂️  Fee plataforma:      *${fmtCOP(liquidacion.total_fee)}*`,
      `🏦 Neto distribuidor:   *${fmtCOP(liquidacion.total_neto)}*`,
      ``,
      `Detalle:`,
      ...lineas,
      ``,
      `Estado: ${liquidacion.status === 'pagado' ? '✅ PAGADO' : '⏳ Pendiente de pago'}`,
    ].join('\n');
  }

  /**
   * Marca una liquidación como pagada (el distribuidor transfirió el fee).
   */
  async marcarLiquidacionPagada(liquidacionId) {
    const { data, error } = await this.supabase
      .from('liquidaciones')
      .update({ status: 'pagado', pagado_at: new Date().toISOString() })
      .eq('id', liquidacionId)
      .select()
      .single();

    if (error) throw error;
    console.log(`[FeeService] Liquidación ${liquidacionId} marcada como pagada.`);
    return data;
  }

  /**
   * Lista todas las liquidaciones con sus totales.
   */
  async listarLiquidaciones(limite = 12) {
    const { data, error } = await this.supabase
      .from('liquidaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limite);

    if (error) throw error;
    return data || [];
  }
}

module.exports = FeeService;
