import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  MapPin, Phone, Bike, Star, Activity, RefreshCw, Circle,
  AlertCircle, Package, Clock, User, UserPlus, X
} from 'lucide-react';
import MapaMensajeros from '../../components/MapaMensajeros';
import { API_BASE_URL } from '../../lib/api';

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

type Resumen = {
  total: number;
  activos: number;
  disponibles: number;
  ocupados: number;
  con_gps_vivo: number;
};

const FORM_VACIO = { nombre: '', telefono: '', vehiculo: 'moto', ciudad: 'Cartagena', zona: '', placa: '' };

export default function MensajerosLive() {
  const [mensajeros, setMensajeros] = useState<Mensajero[]>([]);
  const [resumen, setResumen]       = useState<Resumen | null>(null);
  const [loading, setLoading]       = useState(true);
  const [seleccionado, setSeleccionado] = useState<Mensajero | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState(FORM_VACIO);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');

  const cargar = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/mensajeros/live`);
      setMensajeros(data.mensajeros || []);
      setResumen(data.resumen);
    } catch (err) {
      console.error('Error cargando mensajeros:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 15000); // refresh cada 15s
    return () => clearInterval(id);
  }, []);

  const registrar = async () => {
    if (!form.nombre.trim() || !form.telefono.trim()) return;
    setSaving(true); setSaveError('');
    try {
      await axios.post(`${API}/api/admin/mensajeros`, {
        nombre:   form.nombre.trim(),
        telefono: form.telefono.trim().replace(/\D/g, '').slice(-10),
        vehiculo: form.vehiculo,
        ciudad:   form.ciudad.trim(),
        zona:     form.zona.trim() || null,
        placa:    form.placa.trim() || null,
      });
      setShowModal(false);
      setForm(FORM_VACIO);
      cargar();
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  const toggleDisponible = async (id: string, disponible: boolean) => {
    try {
      await axios.put(`${API}/api/admin/mensajeros/${id}/disponible`, { disponible: !disponible });
      cargar();
    } catch (err) {
      console.error('Error actualizando:', err);
    }
  };

  const getStatusColor = (m: Mensajero) => {
    if (!m.disponible && m.pedido_activo)            return 'bg-blue-500';   // ocupado
    if (m.disponible && m.min_sin_gps !== null && m.min_sin_gps < 45) return 'bg-green-500'; // disponible con GPS
    if (m.disponible)                                return 'bg-yellow-500'; // disponible sin GPS reciente
    return 'bg-gray-400';                                                    // inactivo
  };

  const getStatusText = (m: Mensajero) => {
    if (!m.disponible && m.pedido_activo) return 'En entrega';
    if (m.disponible && m.min_sin_gps !== null && m.min_sin_gps < 45) return 'Disponible';
    if (m.disponible) return 'Disponible (GPS desactualizado)';
    return 'Pausado';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Bike className="w-8 h-8 text-emerald-600" />
              Mensajeros en vivo
            </h1>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <Circle className="w-2 h-2 fill-red-500 text-red-500 animate-pulse" />
              Actualización automática cada 15 segundos
            </p>
          </div>
          <div className="flex gap-3">
          <button
            onClick={() => { setShowModal(true); setSaveError(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <UserPlus className="w-4 h-4" /> Registrar mensajero
          </button>
          <button
            onClick={cargar}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
          </div>

        {/* Modal Registrar Mensajero */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">Registrar mensajero</h2>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Nombre completo *</label>
                  <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Juan García" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Teléfono WhatsApp * (10 dígitos)</label>
                  <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="3005292953" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Vehículo</label>
                    <select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.vehiculo}
                      onChange={e => setForm(f => ({ ...f, vehiculo: e.target.value }))}>
                      <option value="moto">Moto</option>
                      <option value="bicicleta">Bicicleta</option>
                      <option value="carro">Carro</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Ciudad</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.ciudad}
                      onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Zona (opcional)</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.zona}
                      onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} placeholder="Norte, Sur..." />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Placa (opcional)</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.placa}
                      onChange={e => setForm(f => ({ ...f, placa: e.target.value }))} placeholder="ABC123" />
                  </div>
                </div>
                {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={registrar} disabled={saving || !form.nombre || !form.telefono}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resumen cards */}
        {resumen && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card label="Total"         valor={resumen.total}        icon={User}        color="gray" />
            <Card label="Activos"       valor={resumen.activos}      icon={Activity}    color="emerald" />
            <Card label="Disponibles"   valor={resumen.disponibles}  icon={Bike}        color="green" />
            <Card label="En entrega"    valor={resumen.ocupados}     icon={Package}     color="blue" />
            <Card label="GPS en vivo"   valor={resumen.con_gps_vivo} icon={MapPin}      color="emerald" />
          </div>
        )}

        {/* Mapa interactivo */}
        <div className="mb-6">
          <MapaMensajeros mensajeros={mensajeros} />
        </div>

        {/* Lista de mensajeros */}
        <div className="bg-white rounded-lg shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : mensajeros.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Bike className="w-12 h-12 mx-auto mb-3 opacity-50" />
              No hay mensajeros registrados.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {mensajeros.map(m => (
                <div
                  key={m.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => setSeleccionado(m)}
                >
                  <div className="flex items-center gap-4">
                    {/* Indicador de estado */}
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(m)} flex-shrink-0`} />

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{m.nombre}</h3>
                        <span className="text-xs text-gray-500">
                          {m.vehiculo} {m.placa && `• ${m.placa}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {m.telefono}
                        </span>
                        {m.zona && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {m.zona}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {Number(m.calificacion_promedio || 5).toFixed(1)}
                        </span>
                        <span className="text-xs">
                          {m.pedidos_completados} entregas
                        </span>
                      </div>
                    </div>

                    {/* Pedido activo */}
                    {m.pedido_activo ? (
                      <div className="text-right">
                        <div className="text-sm font-mono text-blue-600 font-semibold">
                          {m.pedido_activo.numero_pedido}
                        </div>
                        <div className="text-xs text-gray-500">
                          {m.pedido_activo.cliente_nombre || m.pedido_activo.cliente_telefono}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{getStatusText(m)}</span>
                    )}

                    {/* GPS status */}
                    {m.ultima_ubicacion_at ? (
                      <div className="text-right text-xs">
                        <div className={`font-medium ${m.min_sin_gps !== null && m.min_sin_gps < 45 ? 'text-emerald-600' : 'text-yellow-600'}`}>
                          <MapPin className="w-3 h-3 inline" /> hace {m.min_sin_gps}min
                        </div>
                        {m.ultima_lat && (
                          <a
                            href={`https://maps.google.com/?q=${m.ultima_lat},${m.ultima_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-blue-600 hover:underline"
                          >
                            Ver mapa
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Sin GPS</span>
                    )}

                    {/* Toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDisponible(m.id, m.disponible); }}
                      className={`px-3 py-1 rounded text-xs font-medium ${
                        m.disponible
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {m.disponible ? 'Activo' : 'Pausado'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detalle modal */}
        {seleccionado && (
          <Modal mensajero={seleccionado} onClose={() => setSeleccionado(null)} />
        )}
      </div>
    </div>
  );
}

function Card({ label, valor, icon: Icon, color }: { label: string; valor: number; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    gray:    'text-gray-600 bg-gray-100',
    emerald: 'text-emerald-600 bg-emerald-100',
    green:   'text-green-600 bg-green-100',
    blue:    'text-blue-600 bg-blue-100',
  };
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{valor}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function Modal({ mensajero, onClose }: { mensajero: Mensajero; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">{mensajero.nombre}</h2>
            <p className="text-gray-500">{mensajero.telefono} • {mensajero.vehiculo}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>

        {mensajero.pedido_activo && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Pedido activo: {mensajero.pedido_activo.numero_pedido}
            </h3>
            <p className="text-sm text-gray-700">Cliente: <strong>{mensajero.pedido_activo.cliente_nombre}</strong></p>
            <p className="text-sm text-gray-700">Tel: {mensajero.pedido_activo.cliente_telefono}</p>
            <p className="text-sm text-gray-700">Dirección: {mensajero.pedido_activo.cliente_direccion}</p>
            <p className="text-sm font-semibold text-emerald-600 mt-2">
              ${Number(mensajero.pedido_activo.total).toLocaleString('es-CO')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Calificación</p>
            <p className="text-xl font-bold flex items-center gap-1">
              <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              {Number(mensajero.calificacion_promedio || 5).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Entregas completadas</p>
            <p className="text-xl font-bold">{mensajero.pedidos_completados}</p>
          </div>
          <div>
            <p className="text-gray-500">Zona</p>
            <p>{mensajero.zona || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Última ubicación</p>
            {mensajero.ultima_lat ? (
              <a
                href={`https://maps.google.com/?q=${mensajero.ultima_lat},${mensajero.ultima_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                <MapPin className="w-4 h-4" /> Abrir en Maps
              </a>
            ) : '—'}
          </div>
        </div>

        {mensajero.min_sin_gps !== null && mensajero.min_sin_gps > 60 && (
          <div className="mt-4 p-3 bg-yellow-50 rounded flex items-center gap-2 text-yellow-800 text-sm">
            <AlertCircle className="w-4 h-4" />
            GPS sin actualizarse hace más de 1 hora. Pídele que comparta su ubicación.
          </div>
        )}
      </div>
    </div>
  );
}
