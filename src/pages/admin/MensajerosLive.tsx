import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  MapPin, Phone, Bike, Star, Activity, RefreshCw, Circle,
  AlertCircle, Package, User, UserPlus, X, Loader2,
} from 'lucide-react';
import MapaMensajeros from '../../components/MapaMensajeros';
import { API_BASE_URL } from '../../lib/api';
import AdminNavbar from '../../components/AdminNavbar';
import { useCanal } from '../../contexts/CanalContext';

const API = API_BASE_URL;

type PedidoActivo = {
  numero_pedido: string;
  cliente_nombre: string | null;
  cliente_telefono: string;
  cliente_direccion: string | null;
  status: string;
  total: number;
  created_at: string;
};

type Mensajero = {
  id: string;
  nombre: string;
  telefono: string;
  ciudad: string | null;
  zona: string | null;
  vehiculo: string;
  placa: string | null;
  canal: CanalMensajero;
  status: string;
  disponible: boolean;
  pedidos_completados: number;
  calificacion_promedio: number;
  ultima_lat: number | null;
  ultima_lng: number | null;
  ultima_ubicacion_at: string | null;
  min_sin_gps: number | null;
  pedido_actual_id: string | null;
  pedido_activo: PedidoActivo | null;
};

type Resumen = { total: number; activos: number; disponibles: number; ocupados: number; con_gps_vivo: number };
type CanalMensajero = 'b2c' | 'b2b' | 'ambos';

const FORM_VACIO: { nombre: string; telefono: string; vehiculo: string; canal: CanalMensajero; ciudad: string; zona: string; placa: string } =
  { nombre: '', telefono: '', vehiculo: 'moto', canal: 'b2c', ciudad: 'Cartagena', zona: '', placa: '' };

function dotColor(m: Mensajero) {
  if (!m.disponible && m.pedido_activo) return 'bg-blue-500';
  if (m.disponible && m.min_sin_gps !== null && m.min_sin_gps < 45) return 'bg-emerald-500';
  if (m.disponible) return 'bg-yellow-400';
  return 'bg-gray-300';
}

function statusText(m: Mensajero) {
  if (!m.disponible && m.pedido_activo) return 'En entrega';
  if (m.disponible && m.min_sin_gps !== null && m.min_sin_gps < 45) return 'Disponible';
  if (m.disponible) return 'Disponible';
  return 'Pausado';
}

export default function MensajerosLive() {
  const { canal } = useCanal();
  const [todos, setTodos]         = useState<Mensajero[]>([]);
  const [resumen, setResumen]     = useState<Resumen | null>(null);
  const [loading, setLoading]     = useState(true);
  const [seleccionado, setSel]    = useState<Mensajero | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState<typeof FORM_VACIO>({ ...FORM_VACIO, canal: canal as CanalMensajero });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  // Filtrar por canal activo: mostrar propios + "ambos"
  const mensajeros = todos.filter(m => m.canal === canal || m.canal === 'ambos');
  const otroCanal  = todos.filter(m => m.canal === (canal === 'b2c' ? 'b2b' : 'b2c'));

  const isB2B    = canal === 'b2b';
  const accent   = isB2B ? 'text-indigo-600' : 'text-emerald-600';
  const accentBg = isB2B ? 'bg-indigo-50'    : 'bg-emerald-50';
  const btnColor = isB2B ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700';

  const cargar = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/mensajeros/live`);
      setTodos(data.mensajeros || []);
      setResumen(data.resumen);
    } catch (err) {
      console.error('Error cargando mensajeros:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 15000);
    return () => clearInterval(id);
  }, []);

  // Sincronizar canal default del form al cambiar de vista
  useEffect(() => { setForm(f => ({ ...f, canal: canal as CanalMensajero })); }, [canal]);

  const registrar = async () => {
    if (!form.nombre.trim() || !form.telefono.trim()) return;
    setSaving(true); setSaveError('');
    try {
      await axios.post(`${API}/api/admin/mensajeros`, {
        nombre:   form.nombre.trim(),
        telefono: form.telefono.trim().replace(/\D/g, '').slice(-10),
        vehiculo: form.vehiculo,
        canal:    form.canal,
        ciudad:   form.ciudad.trim(),
        zona:     form.zona.trim() || null,
        placa:    form.placa.trim() || null,
      });
      setShowModal(false);
      setForm({ ...FORM_VACIO, canal: canal as CanalMensajero });
      cargar();
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Error al registrar');
    } finally { setSaving(false); }
  };

  const toggleDisponible = async (id: string, disponible: boolean) => {
    try {
      await axios.put(`${API}/api/admin/mensajeros/${id}/disponible`, { disponible: !disponible });
      cargar();
    } catch {}
  };

  const cambiarCanal = async (id: string, nuevoCanal: CanalMensajero) => {
    try {
      await axios.patch(`${API}/api/admin/mensajeros/${id}/canal`, { canal: nuevoCanal });
      setTodos(prev => prev.map(m => m.id === id ? { ...m, canal: nuevoCanal } : m));
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <AdminNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Mensajeros — <span className={accent}>{isB2B ? 'B2B Mayorista' : 'B2C Droguería Virtual'}</span>
            </h1>
            <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
              <Circle className="w-2 h-2 fill-red-500 text-red-500 animate-pulse" />
              Actualización automática cada 15 s
              {otroCanal.length > 0 && (
                <span className="text-gray-300">·</span>
              )}
              {otroCanal.length > 0 && (
                <span className="text-gray-400">
                  {otroCanal.length} mensajero{otroCanal.length > 1 ? 's' : ''} en el otro canal no se muestran aquí
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowModal(true); setSaveError(''); }}
              className={`flex items-center gap-2 px-4 py-2 ${btnColor} text-white rounded-xl text-sm font-semibold transition-all`}>
              <UserPlus className="w-4 h-4" /> Registrar
            </button>
            <button onClick={cargar}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all">
              <RefreshCw className="w-4 h-4" /> Actualizar
            </button>
          </div>
        </div>

        {/* Métricas del canal actual */}
        {resumen && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'En este canal', valor: mensajeros.length,                                                icon: User,     bg: 'bg-gray-50',     text: 'text-gray-600' },
              { label: 'Activos',       valor: mensajeros.filter(m => m.status === 'activo').length,             icon: Activity, bg: accentBg,          text: accent },
              { label: 'Disponibles',   valor: mensajeros.filter(m => m.disponible).length,                     icon: Bike,     bg: accentBg,          text: accent },
              { label: 'En entrega',    valor: mensajeros.filter(m => m.pedido_activo).length,                   icon: Package,  bg: 'bg-blue-50',      text: 'text-blue-600' },
              { label: 'GPS en vivo',   valor: mensajeros.filter(m => m.min_sin_gps !== null && m.min_sin_gps < 45).length, icon: MapPin, bg: 'bg-emerald-50', text: 'text-emerald-600' },
            ].map(({ label, valor, icon: Icon, bg, text }) => (
              <div key={label} className="metric-card">
                <div className={`icon-circle ${bg} mb-3`}>
                  <Icon className={`w-5 h-5 ${text}`} />
                </div>
                <div className="stat-number">{valor}</div>
                <div className="text-sm text-gray-500 mt-0.5 font-medium">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Mapa */}
        <div className="card mb-6 p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <span className="section-title">Mapa en tiempo real</span>
            <span className="text-xs text-gray-400">{mensajeros.length} mensajero{mensajeros.length !== 1 ? 's' : ''} en vista</span>
          </div>
          <MapaMensajeros mensajeros={mensajeros} />
        </div>

        {/* Lista — muestra todos para poder reasignar canal */}
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <span className="section-title">Todos los mensajeros</span>
            <span className="text-xs text-gray-400">Cambia el canal con el selector de cada fila</span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className={`w-7 h-7 animate-spin ${accent}`} />
              <span className="text-sm text-gray-400">Cargando mensajeros…</span>
            </div>
          ) : todos.length === 0 ? (
            <div className="py-16 text-center">
              <Bike className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">No hay mensajeros registrados.</p>
              <button onClick={() => setShowModal(true)}
                className={`mt-4 text-sm font-semibold ${accent} hover:underline`}>
                + Registrar el primero
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todos.map(m => (
                <div key={m.id}
                  className="px-5 py-3.5 hover:bg-gray-50/70 cursor-pointer transition-colors"
                  onClick={() => setSel(m)}>
                  <div className="flex items-center gap-4">

                    {/* Dot estado */}
                    <div className={`w-2.5 h-2.5 rounded-full ${dotColor(m)} flex-shrink-0 ring-2 ring-white`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900 truncate">{m.nombre}</span>
                        <span className="text-xs text-gray-400">{m.vehiculo}{m.placa ? ` · ${m.placa}` : ''}</span>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          m.canal === 'ambos' ? 'bg-violet-100 text-violet-600' :
                          m.canal === 'b2b'   ? 'bg-indigo-100 text-indigo-600' :
                                               'bg-emerald-100 text-emerald-600'
                        }`}>{m.canal === 'ambos' ? 'Ambos' : m.canal.toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{m.telefono}</span>
                        {m.zona && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{m.zona}</span>}
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {Number(m.calificacion_promedio || 5).toFixed(1)}
                        </span>
                        <span>{m.pedidos_completados} entregas</span>
                      </div>
                    </div>

                    {/* Pedido activo */}
                    {m.pedido_activo ? (
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono font-bold text-blue-600">{m.pedido_activo.numero_pedido}</div>
                        <div className="text-xs text-gray-400">{m.pedido_activo.cliente_nombre || m.pedido_activo.cliente_telefono}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 flex-shrink-0">{statusText(m)}</span>
                    )}

                    {/* GPS */}
                    {m.ultima_ubicacion_at ? (
                      <div className="text-right text-xs flex-shrink-0">
                        <div className={`font-medium ${m.min_sin_gps !== null && m.min_sin_gps < 45 ? 'text-emerald-600' : 'text-yellow-600'}`}>
                          <MapPin className="w-3 h-3 inline" /> {m.min_sin_gps}min
                        </div>
                        {m.ultima_lat && (
                          <a href={`https://maps.google.com/?q=${m.ultima_lat},${m.ultima_lng}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-blue-500 hover:underline">Ver</a>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 flex-shrink-0">Sin GPS</span>
                    )}

                    {/* Selector canal */}
                    <select
                      value={m.canal}
                      onClick={e => e.stopPropagation()}
                      onChange={e => cambiarCanal(m.id, e.target.value as CanalMensajero)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    >
                      <option value="b2c">B2C</option>
                      <option value="b2b">B2B</option>
                      <option value="ambos">Ambos</option>
                    </select>

                    {/* Toggle disponible */}
                    <button
                      onClick={e => { e.stopPropagation(); toggleDisponible(m.id, m.disponible); }}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                        m.disponible
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {m.disponible ? 'Activo' : 'Pausado'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal registrar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-md p-6 animate-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Registrar mensajero</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-300 hover:text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre completo *</label>
                <input className="input-field mt-1" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Juan García" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Teléfono WhatsApp *</label>
                <input className="input-field mt-1" value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="3005292953" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehículo</label>
                  <select className="input-field mt-1" value={form.vehiculo}
                    onChange={e => setForm(f => ({ ...f, vehiculo: e.target.value }))}>
                    <option value="moto">Moto</option>
                    <option value="bicicleta">Bicicleta</option>
                    <option value="carro">Carro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Canal</label>
                  <select className="input-field mt-1" value={form.canal}
                    onChange={e => setForm(f => ({ ...f, canal: e.target.value as CanalMensajero }))}>
                    <option value="b2c">B2C — Droguería Virtual</option>
                    <option value="b2b">B2B — Mayorista</option>
                    <option value="ambos">Ambos canales</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ciudad</label>
                  <input className="input-field mt-1" value={form.ciudad}
                    onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zona</label>
                  <input className="input-field mt-1" value={form.zona}
                    onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} placeholder="Norte, Sur…" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Placa</label>
                <input className="input-field mt-1" value={form.placa}
                  onChange={e => setForm(f => ({ ...f, placa: e.target.value }))} placeholder="ABC123" />
              </div>
              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={registrar} disabled={saving || !form.nombre || !form.telefono}
                className={`flex-1 ${btnColor} text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50`}>
                {saving ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detalle modal */}
      {seleccionado && <DetalleModal mensajero={seleccionado} onClose={() => setSel(null)} accent={accent} />}
    </div>
  );
}

function DetalleModal({ mensajero: m, onClose, accent }: { mensajero: Mensajero; onClose: () => void; accent: string }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card-lg max-w-md w-full p-6 animate-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{m.nombre}</h2>
            <p className="text-sm text-gray-400">{m.telefono} · {m.vehiculo}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {m.pedido_activo && (
          <div className="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4" /> {m.pedido_activo.numero_pedido}
            </h3>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p>Cliente: <strong>{m.pedido_activo.cliente_nombre}</strong></p>
              <p>Tel: {m.pedido_activo.cliente_telefono}</p>
              <p>Dir: {m.pedido_activo.cliente_direccion}</p>
              <p className={`font-semibold ${accent} mt-1`}>${Number(m.pedido_activo.total).toLocaleString('es-CO')}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">Calificación</p>
            <p className="text-xl font-bold flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              {Number(m.calificacion_promedio || 5).toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">Entregas</p>
            <p className="text-xl font-bold">{m.pedidos_completados}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">Zona</p>
            <p className="font-medium text-gray-700">{m.zona || '—'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">GPS</p>
            {m.ultima_lat ? (
              <a href={`https://maps.google.com/?q=${m.ultima_lat},${m.ultima_lng}`}
                target="_blank" rel="noopener noreferrer"
                className="text-blue-500 hover:underline text-sm flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Ver en Maps
              </a>
            ) : <p className="text-gray-400 text-sm">Sin GPS</p>}
          </div>
        </div>

        {m.min_sin_gps !== null && m.min_sin_gps > 60 && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-xl flex items-center gap-2 text-yellow-700 text-sm border border-yellow-100">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            GPS sin actualizar hace más de 1 hora.
          </div>
        )}
      </div>
    </div>
  );
}
