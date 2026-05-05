'use strict';

/**
 * LealtadService — Programa de puntos, referidos y cupones
 *
 * Reglas del programa:
 *   • 1 punto por cada $1.000 del pedido (sin contar domicilio).
 *   • 50 puntos al referidor cuando un referido completa su primera compra.
 *   • 1 punto = $1.000 COP de descuento al canjear.
 *   • Mínimo 10 puntos para canjear.
 *   • Los puntos no expiran en esta versión (futuro: 12 meses).
 *
 * Cupones:
 *   • Tipo 'porcentaje' (ej: 10 = 10% off)
 *   • Tipo 'monto_fijo' (ej: 5000 = $5.000 off)
 *   • Tipo 'envio_gratis' (descuenta el costo de domicilio)
 *   • Pueden ser globales (uso_maximo > 1) o personales (para_telefono)
 */

const PUNTOS_POR_MIL_COP = 1;            // 1 pto por cada $1.000
const PUNTOS_BONO_REFERIDO = 50;         // bono al referidor
const MIN_PUNTOS_CANJE = 10;             // mínimo para canjear
const VALOR_PUNTO_COP = 1000;            // 1 pt = $1.000

class LealtadService {
  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLIENTES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Crea el registro de lealtad si no existe, o lo retorna si ya existe.
   * Genera código de referido único en el primer registro.
   */
  async obtenerOCrearCliente(telefono, nombre = null, referidoPor = null) {
    try {
      // Buscar existente
      const { data: existente } = await this.supabase
        .from('clientes_lealtad')
        .select('*')
        .eq('telefono', telefono)
        .maybeSingle();

      if (existente) {
        // Actualizar nombre si llega más completo
        if (nombre && !existente.nombre) {
          await this.supabase
            .from('clientes_lealtad')
            .update({ nombre })
            .eq('telefono', telefono);
          existente.nombre = nombre;
        }
        return existente;
      }

      // Generar código de referido único
      const codigoReferido = await this._generarCodigoUnico();

      const { data: nuevo, error } = await this.supabase
        .from('clientes_lealtad')
        .insert({
          telefono,
          nombre,
          puntos_actuales: 0,
          puntos_totales_ganados: 0,
          pedidos_completados: 0,
          codigo_referido: codigoReferido,
          referido_por: referidoPor,
        })
        .select()
        .single();

      if (error) throw error;

      // Si fue referido por alguien, validar que el referidor exista
      if (referidoPor) {
        await this.supabase
          .from('clientes_lealtad')
          .select('telefono')
          .eq('telefono', referidoPor)
          .maybeSingle();
      }

      console.log(`[Lealtad] Cliente creado: ${telefono} | código: ${codigoReferido}`);
      return nuevo;

    } catch (err) {
      console.error('[Lealtad] obtenerOCrearCliente error:', err.message);
      throw err;
    }
  }

  async _generarCodigoUnico() {
    const caracteres = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (let intento = 0; intento < 5; intento++) {
      let codigo = 'DV-';
      for (let i = 0; i < 6; i++) {
        codigo += caracteres[Math.floor(Math.random() * caracteres.length)];
      }
      const { data } = await this.supabase
        .from('clientes_lealtad')
        .select('telefono')
        .eq('codigo_referido', codigo)
        .maybeSingle();
      if (!data) return codigo;
    }
    // Fallback: usar timestamp
    return `DV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  /**
   * Consulta el saldo y datos del cliente.
   */
  async consultarPuntos(telefono) {
    try {
      const cliente = await this.obtenerOCrearCliente(telefono);
      return {
        telefono:               cliente.telefono,
        nombre:                 cliente.nombre,
        puntos_actuales:        cliente.puntos_actuales,
        puntos_totales_ganados: cliente.puntos_totales_ganados,
        pedidos_completados:    cliente.pedidos_completados,
        codigo_referido:        cliente.codigo_referido,
        valor_canje_cop:        cliente.puntos_actuales * VALOR_PUNTO_COP,
        puede_canjear:          cliente.puntos_actuales >= MIN_PUNTOS_CANJE,
      };
    } catch (err) {
      console.error('[Lealtad] consultarPuntos error:', err.message);
      return { telefono, puntos_actuales: 0, valor_canje_cop: 0 };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OTORGAMIENTO DE PUNTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Otorga puntos por una compra completada.
   * 1 punto por cada $1.000 del pedido (sin contar domicilio).
   */
  async otorgarPuntosCompra(pedidoId) {
    try {
      const { data: pedido } = await this.supabase
        .from('pedidos')
        .select('id, cliente_telefono, cliente_nombre, total, costo_domicilio, numero_pedido')
        .eq('id', pedidoId)
        .maybeSingle();

      if (!pedido) return { success: false, error: 'Pedido no encontrado' };
      if (!pedido.cliente_telefono) return { success: false, error: 'Sin teléfono' };

      const totalSinDomicilio = Number(pedido.total) - Number(pedido.costo_domicilio || 0);
      const puntosGanados = Math.floor(totalSinDomicilio / 1000) * PUNTOS_POR_MIL_COP;
      if (puntosGanados <= 0) return { success: true, puntos: 0 };

      // Obtener o crear cliente
      const cliente = await this.obtenerOCrearCliente(pedido.cliente_telefono, pedido.cliente_nombre);

      // Sumar puntos
      const nuevosPuntos = (cliente.puntos_actuales || 0) + puntosGanados;
      const nuevoTotal   = (cliente.puntos_totales_ganados || 0) + puntosGanados;
      const nuevosPedidos = (cliente.pedidos_completados || 0) + 1;

      await this.supabase
        .from('clientes_lealtad')
        .update({
          puntos_actuales:        nuevosPuntos,
          puntos_totales_ganados: nuevoTotal,
          pedidos_completados:    nuevosPedidos,
        })
        .eq('telefono', pedido.cliente_telefono);

      // Registrar movimiento
      await this.supabase.from('movimientos_puntos').insert({
        telefono:    pedido.cliente_telefono,
        tipo:        'gana_compra',
        puntos:      puntosGanados,
        pedido_id:   pedidoId,
        descripcion: `Pedido ${pedido.numero_pedido} ($${totalSinDomicilio.toLocaleString('es-CO')})`,
      });

      console.log(`[Lealtad] +${puntosGanados} pts → ${pedido.cliente_telefono} (pedido ${pedido.numero_pedido})`);

      // Si es la primera compra y fue referido, otorgar bono al referidor
      if (nuevosPedidos === 1 && cliente.referido_por) {
        await this.otorgarBonoReferido(pedido.cliente_telefono, cliente.referido_por, pedidoId);
      }

      return { success: true, puntos: puntosGanados, saldo_total: nuevosPuntos };

    } catch (err) {
      console.error('[Lealtad] otorgarPuntosCompra error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Otorga el bono al referidor cuando su referido completa primera compra.
   */
  async otorgarBonoReferido(telefonoNuevo, telefonoReferidor, pedidoId) {
    try {
      const { data: referidor } = await this.supabase
        .from('clientes_lealtad')
        .select('puntos_actuales, puntos_totales_ganados')
        .eq('telefono', telefonoReferidor)
        .maybeSingle();

      if (!referidor) return { success: false };

      const nuevoSaldo = (referidor.puntos_actuales || 0) + PUNTOS_BONO_REFERIDO;
      const nuevoTotal = (referidor.puntos_totales_ganados || 0) + PUNTOS_BONO_REFERIDO;

      await this.supabase
        .from('clientes_lealtad')
        .update({ puntos_actuales: nuevoSaldo, puntos_totales_ganados: nuevoTotal })
        .eq('telefono', telefonoReferidor);

      await this.supabase.from('movimientos_puntos').insert({
        telefono:    telefonoReferidor,
        tipo:        'gana_referido',
        puntos:      PUNTOS_BONO_REFERIDO,
        pedido_id:   pedidoId,
        descripcion: `Bono referido — ${telefonoNuevo}`,
      });

      console.log(`[Lealtad] Bono referido +${PUNTOS_BONO_REFERIDO} pts → ${telefonoReferidor}`);
      return { success: true, puntos: PUNTOS_BONO_REFERIDO };

    } catch (err) {
      console.error('[Lealtad] otorgarBonoReferido error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CANJE DE PUNTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Canjea puntos por descuento. Retorna el descuento en COP.
   * NO descuenta los puntos hasta que se confirme la compra (caller debe hacerlo).
   */
  async validarCanje(telefono, puntosCanjear) {
    const cliente = await this.obtenerOCrearCliente(telefono);
    if (puntosCanjear < MIN_PUNTOS_CANJE) {
      return { valido: false, motivo: `Mínimo ${MIN_PUNTOS_CANJE} puntos para canjear` };
    }
    if (puntosCanjear > cliente.puntos_actuales) {
      return { valido: false, motivo: `Solo tienes ${cliente.puntos_actuales} puntos disponibles` };
    }
    return {
      valido: true,
      descuento_cop: puntosCanjear * VALOR_PUNTO_COP,
      puntos_canjeados: puntosCanjear,
    };
  }

  /**
   * Confirma un canje (descuenta los puntos del saldo).
   */
  async canjearPuntos(telefono, puntos, pedidoId) {
    try {
      const validacion = await this.validarCanje(telefono, puntos);
      if (!validacion.valido) return { success: false, ...validacion };

      const { data: cliente } = await this.supabase
        .from('clientes_lealtad')
        .select('puntos_actuales')
        .eq('telefono', telefono)
        .single();

      const nuevoSaldo = cliente.puntos_actuales - puntos;

      await this.supabase
        .from('clientes_lealtad')
        .update({ puntos_actuales: nuevoSaldo })
        .eq('telefono', telefono);

      await this.supabase.from('movimientos_puntos').insert({
        telefono,
        tipo:        'canje',
        puntos:      -puntos,
        pedido_id:   pedidoId,
        descripcion: `Canje en pedido — descuento $${(puntos * VALOR_PUNTO_COP).toLocaleString('es-CO')}`,
      });

      console.log(`[Lealtad] Canje: ${telefono} | -${puntos} pts | descuento $${puntos * VALOR_PUNTO_COP}`);
      return { success: true, descuento_cop: puntos * VALOR_PUNTO_COP, saldo_restante: nuevoSaldo };

    } catch (err) {
      console.error('[Lealtad] canjearPuntos error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CUPONES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Valida un cupón y calcula el descuento.
   */
  async aplicarCupon(codigoCupon, telefono, total, costoDomicilio = 0) {
    try {
      const codigo = String(codigoCupon || '').toUpperCase().trim();
      if (!codigo) return { valido: false, motivo: 'Código vacío' };

      const { data: cupon } = await this.supabase
        .from('cupones')
        .select('*')
        .eq('codigo', codigo)
        .eq('activo', true)
        .maybeSingle();

      if (!cupon) return { valido: false, motivo: 'Cupón no existe o está desactivado' };

      // Verificar vigencia
      if (cupon.vigente_hasta && new Date(cupon.vigente_hasta) < new Date()) {
        return { valido: false, motivo: 'Cupón expirado' };
      }

      // Verificar usos disponibles
      if (cupon.uso_maximo && cupon.usos_actuales >= cupon.uso_maximo) {
        return { valido: false, motivo: 'Cupón agotado' };
      }

      // Verificar si es exclusivo de un cliente
      if (cupon.para_telefono && cupon.para_telefono !== telefono) {
        return { valido: false, motivo: 'Este cupón no aplica a tu cuenta' };
      }

      // Calcular descuento
      let descuento = 0;
      if (cupon.tipo === 'porcentaje') {
        descuento = Math.round((total * Number(cupon.valor)) / 100);
      } else if (cupon.tipo === 'monto_fijo') {
        descuento = Math.min(Number(cupon.valor), total);
      } else if (cupon.tipo === 'envio_gratis') {
        descuento = costoDomicilio;
      }

      return {
        valido:        true,
        descuento_cop: descuento,
        tipo:          cupon.tipo,
        descripcion:   cupon.descripcion,
        codigo:        cupon.codigo,
      };

    } catch (err) {
      console.error('[Lealtad] aplicarCupon error:', err.message);
      return { valido: false, motivo: err.message };
    }
  }

  /**
   * Registra el uso de un cupón en un pedido.
   */
  async registrarUsoCupon(codigoCupon, pedidoId) {
    try {
      const codigo = String(codigoCupon).toUpperCase().trim();
      const { data: cupon } = await this.supabase
        .from('cupones')
        .select('id, usos_actuales')
        .eq('codigo', codigo)
        .maybeSingle();

      if (!cupon) return { success: false };

      await this.supabase
        .from('cupones')
        .update({ usos_actuales: (cupon.usos_actuales || 0) + 1 })
        .eq('id', cupon.id);

      console.log(`[Lealtad] Cupón usado: ${codigo} en pedido ${pedidoId}`);
      return { success: true };

    } catch (err) {
      console.error('[Lealtad] registrarUsoCupon error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Crea un cupón desde el panel admin.
   */
  async crearCupon({ codigo, tipo, valor, uso_maximo, vigente_hasta, para_telefono, descripcion }) {
    try {
      const { data, error } = await this.supabase
        .from('cupones')
        .insert({
          codigo:        String(codigo).toUpperCase().trim(),
          tipo,
          valor,
          uso_maximo:    uso_maximo || 1,
          vigente_hasta: vigente_hasta || null,
          para_telefono: para_telefono || null,
          descripcion,
          activo:        true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[Lealtad] crearCupon error:', err.message);
      throw err;
    }
  }

  async listarCupones() {
    const { data } = await this.supabase
      .from('cupones')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RANKINGS / REPORTES
  // ══════════════════════════════════════════════════════════════════════════

  async topClientesLealtad(limite = 10) {
    const { data } = await this.supabase
      .from('clientes_lealtad')
      .select('telefono, nombre, puntos_actuales, puntos_totales_ganados, pedidos_completados, codigo_referido')
      .order('puntos_totales_ganados', { ascending: false })
      .limit(limite);
    return data || [];
  }

  /**
   * Busca cliente por su código de referido (para validar al registrar nuevo).
   */
  async buscarPorCodigoReferido(codigo) {
    const { data } = await this.supabase
      .from('clientes_lealtad')
      .select('telefono, nombre, codigo_referido')
      .eq('codigo_referido', String(codigo).toUpperCase().trim())
      .maybeSingle();
    return data;
  }
}

module.exports = LealtadService;
