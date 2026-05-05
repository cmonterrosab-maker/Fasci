import { useEffect, useState } from 'react';
import axios from 'axios';
import { MessageCircle, Phone, Clock, ShoppingCart, Activity, RefreshCw, Circle } from 'lucide-react';
import { API_BASE_URL } from '../../lib/api';

const API = API_BASE_URL;

const FLUJO_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  inicio:        { label: 'Inicio',        color: 'gray',    icon: '👋' },
  buscando:      { label: 'Buscando med',  color: 'blue',    icon: '🔍' },
  seleccionando: { label: 'Seleccionando', color: 'blue',    icon: '☑️' },
  cantidad:      { label: 'Cantidad',      color: 'blue',    icon: '🔢' },
  carrito:       { label: 'En carrito',    color: 'yellow',  icon: '🛒' },
  confirmacion:  { label: 'Confirmando',   color: 'yellow',  icon: '✅' },
  ubicacion:     { label: 'Pidiendo GPS',  color: 'purple',  icon: '📍' },
  nombre:        { label: 'Nombre',        color: 'purple',  icon: '👤' },
  cedula:        { label: 'Cédula',        color: 'purple',  icon: '🪪' },
  tc:            { label: 'T&C',           color: 'purple',  icon: '📜' },
  comprobante:   { label: 'Esperando pago', color: 'orange', icon: '💳' },
  finalizado:    { label: 'Finalizado',    color: 'green',   icon: '✅' },
  b2b_menu:      { label: 'B2B menú',      color: 'indigo',  icon: '🏪' },
  b2b_buscando:  { label: 'B2B buscando',  color: 'indigo',  icon: '🔍' },
  b2b_carrito:   { label: 'B2B carrito',   color: 'indigo',  icon: '🛒' },
  b2b_cotizacion: { label: 'B2B cotización', color: 'indigo', icon: '📋' },
  b2b_pago:      { label: 'B2B pago',      color: 'orange',  icon: '💳' },
};

type Conversacion = {
  telefono: string;
  estado: string;
  flujo: string | null;
  datos: any;
  created_at: string;
  updated_at: string;
};

export default function Conversaciones() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('todos');

  const cargar = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/conversaciones-activas`);
      setConversaciones(data.conversaciones || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error cargando conversaciones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 10000); // refresh cada 10s
    return () => clearInterval(id);
  }, []);

  const minutosDesde = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `${min}min`;
    return `${Math.floor(min / 60)}h ${min % 60}min`;
  };

  // Conteos por estado de flujo
  const conteos = {
    todos:       conversaciones.length,
    busqueda:    conversaciones.filter(c => ['buscando', 'seleccionando', 'cantidad'].includes(c.estado)).length,
    carrito:     conversaciones.filter(c => ['carrito', 'confirmacion'].includes(c.estado)).length,
    pago:        conversaciones.filter(c => ['comprobante', 'b2b_pago'].includes(c.estado)).length,
    abandono:    conversaciones.filter(c => {
      const min = (Date.now() - new Date(c.updated_at).getTime()) / 60000;
      return min > 10 && min < 30;
    }).length,
  };

  const filtradas = filtro === 'todos'
    ? conversaciones
    : filtro === 'busqueda'
      ? conversaciones.filter(c => ['buscando', 'seleccionando', 'cantidad'].includes(c.estado))
      : filtro === 'carrito'
        ? conversaciones.filter(c => ['carrito', 'confirmacion'].includes(c.estado))
        : filtro === 'pago'
          ? conversaciones.filter(c => ['comprobante', 'b2b_pago'].includes(c.estado))
          : conversaciones;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <MessageCircle className="w-8 h-8 text-emerald-600" />
              Conversaciones activas
            </h1>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <Circle className="w-2 h-2 fill-red-500 text-red-500 animate-pulse" />
              Refresco cada 10 segundos · {total} conversaciones en últimos 30 min
            </p>
          </div>
          <button
            onClick={cargar}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { key: 'todos',    label: 'Todas',          count: conteos.todos },
            { key: 'busqueda', label: 'En búsqueda',    count: conteos.busqueda },
            { key: 'carrito',  label: 'En carrito',     count: conteos.carrito },
            { key: 'pago',     label: 'En pago',        count: conteos.pago },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFiltro(tab.key)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition ${
                filtro === tab.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label} <span className="ml-1 opacity-75">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="bg-white rounded-lg shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : filtradas.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No hay conversaciones {filtro !== 'todos' ? `en "${filtro}"` : 'activas'} en este momento.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtradas.map(c => {
                const info = FLUJO_LABELS[c.estado] || { label: c.estado, color: 'gray', icon: '•' };
                const minSinActividad = (Date.now() - new Date(c.updated_at).getTime()) / 60000;
                const carritoLen = Array.isArray(c.datos?.carrito) ? c.datos.carrito.length : 0;

                return (
                  <div key={c.telefono} className="p-4 hover:bg-gray-50 transition">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl flex-shrink-0">{info.icon}</div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono font-semibold text-gray-900">+57 {c.telefono}</span>
                          {c.datos?.nombre && (
                            <span className="text-sm text-gray-600">— {c.datos.nombre}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${info.color}-100 text-${info.color}-700`}>
                            {info.label}
                          </span>
                          {carritoLen > 0 && (
                            <span className="flex items-center gap-1">
                              <ShoppingCart className="w-3 h-3" />
                              {carritoLen} ítem{carritoLen > 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            actualizado hace {minutosDesde(c.updated_at)}
                          </span>
                        </div>
                      </div>

                      {/* Indicador de abandono potencial */}
                      {minSinActividad > 10 && minSinActividad < 30 && (
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                          ⚠️ Posible abandono
                        </span>
                      )}

                      {/* Detalle del carrito si está en checkout */}
                      {(c.estado === 'comprobante' || c.estado === 'b2b_pago') && (
                        <span className="text-xs text-orange-700 font-semibold">
                          ESPERANDO PAGO
                        </span>
                      )}
                    </div>

                    {/* Carrito expandido */}
                    {Array.isArray(c.datos?.carrito) && c.datos.carrito.length > 0 && (
                      <div className="mt-3 ml-10 text-xs text-gray-600 bg-gray-50 rounded p-2">
                        {c.datos.carrito.map((item: any, i: number) => (
                          <div key={i}>
                            • {item.nombre} x{item.cantidad} — ${Number(item.subtotal || 0).toLocaleString('es-CO')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info al final */}
        <p className="text-xs text-gray-400 mt-4 text-center">
          <Activity className="w-3 h-3 inline mr-1" />
          Solo se muestran conversaciones con actividad en los últimos 30 minutos.
        </p>
      </div>
    </div>
  );
}
