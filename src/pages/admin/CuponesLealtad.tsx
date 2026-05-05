import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Gift, Tag, Star, TrendingUp, Plus, Calendar,
  RefreshCw, Award, Ticket, Phone
} from 'lucide-react';
import { API_BASE_URL } from '../../lib/api';

const API = API_BASE_URL;

type Cupon = {
  id: string;
  codigo: string;
  tipo: 'porcentaje' | 'monto_fijo' | 'envio_gratis';
  valor: number;
  uso_maximo: number;
  usos_actuales: number;
  vigente_hasta: string | null;
  para_telefono: string | null;
  activo: boolean;
  descripcion: string | null;
  created_at: string;
};

type ClienteLeal = {
  telefono: string;
  nombre: string | null;
  puntos_actuales: number;
  puntos_totales_ganados: number;
  pedidos_completados: number;
  codigo_referido: string | null;
};

export default function CuponesLealtad() {
  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [topClientes, setTopClientes] = useState<ClienteLeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'cupones' | 'clientes'>('cupones');
  const [showModal, setShowModal] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [cuponesRes, clientesRes] = await Promise.all([
        axios.get(`${API}/api/lealtad/cupones`),
        axios.get(`${API}/api/lealtad/top-clientes?limite=20`),
      ]);
      setCupones(cuponesRes.data.data || []);
      setTopClientes(clientesRes.data.data || []);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const totalPuntosCirculacion = topClientes.reduce((s, c) => s + c.puntos_actuales, 0);
  const totalCuponesActivos = cupones.filter(c => c.activo).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Gift className="w-8 h-8 text-emerald-600" />
              Cupones y Lealtad
            </h1>
            <p className="text-gray-500 mt-1">Programa de fidelización y promociones</p>
          </div>
          <button
            onClick={cargar}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>

        {/* Cards de resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card label="Cupones activos"     valor={totalCuponesActivos}        icon={Ticket}     color="emerald" />
          <Card label="Clientes con puntos" valor={topClientes.length}         icon={Star}       color="yellow" />
          <Card label="Puntos en circulación" valor={totalPuntosCirculacion}   icon={Award}      color="blue" />
          <Card label="Valor en puntos"     valor={`$${(totalPuntosCirculacion * 1000).toLocaleString('es-CO')}`} icon={TrendingUp} color="purple" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setTab('cupones')}
            className={`px-4 py-2 border-b-2 transition ${
              tab === 'cupones'
                ? 'border-emerald-600 text-emerald-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Tag className="w-4 h-4 inline mr-2" />
            Cupones
          </button>
          <button
            onClick={() => setTab('clientes')}
            className={`px-4 py-2 border-b-2 transition ${
              tab === 'clientes'
                ? 'border-emerald-600 text-emerald-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Award className="w-4 h-4 inline mr-2" />
            Top clientes
          </button>
        </div>

        {/* Cupones */}
        {tab === 'cupones' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4" />
                Crear cupón
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Cargando...</div>
              ) : cupones.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <Ticket className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aún no has creado cupones.</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-4 text-emerald-600 hover:underline"
                  >
                    Crear el primero
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Código</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-center">Usos</th>
                      <th className="px-4 py-3 text-left">Vigencia</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cupones.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono font-semibold">{c.codigo}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                            {c.tipo === 'porcentaje' && `% descuento`}
                            {c.tipo === 'monto_fijo' && `$ fijo`}
                            {c.tipo === 'envio_gratis' && `Envío gratis`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.tipo === 'porcentaje' && `${c.valor}%`}
                          {c.tipo === 'monto_fijo' && `$${Number(c.valor).toLocaleString('es-CO')}`}
                          {c.tipo === 'envio_gratis' && '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {c.usos_actuales} / {c.uso_maximo}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {c.vigente_hasta
                            ? new Date(c.vigente_hasta).toLocaleDateString('es-CO')
                            : 'Sin límite'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {c.activo ? (
                            <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded">Activo</span>
                          ) : (
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">Inactivo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Top clientes leales */}
        {tab === 'clientes' && (
          <div className="bg-white rounded-lg shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Cargando...</div>
            ) : topClientes.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Award className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Aún no hay clientes en el programa de lealtad.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-left">Teléfono</th>
                    <th className="px-4 py-3 text-right">Pts actuales</th>
                    <th className="px-4 py-3 text-right">Pts totales</th>
                    <th className="px-4 py-3 text-center">Pedidos</th>
                    <th className="px-4 py-3 text-left">Código referido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topClientes.map((c, i) => (
                    <tr key={c.telefono} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">
                        {i === 0 && '🥇'}
                        {i === 1 && '🥈'}
                        {i === 2 && '🥉'}
                        {i > 2 && `${i + 1}`}
                      </td>
                      <td className="px-4 py-3 font-medium">{c.nombre || '(sin nombre)'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.telefono}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-emerald-600">{c.puntos_actuales}</span>
                        <span className="text-xs text-gray-400 ml-1">
                          (${(c.puntos_actuales * 1000).toLocaleString('es-CO')})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{c.puntos_totales_ganados}</td>
                      <td className="px-4 py-3 text-center">{c.pedidos_completados}</td>
                      <td className="px-4 py-3 font-mono text-xs">{c.codigo_referido || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Modal crear cupón */}
        {showModal && <ModalCrearCupon onClose={() => setShowModal(false)} onCreado={cargar} />}
      </div>
    </div>
  );
}

function Card({ label, valor, icon: Icon, color }: any) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-100',
    yellow:  'text-yellow-600 bg-yellow-100',
    blue:    'text-blue-600 bg-blue-100',
    purple:  'text-purple-600 bg-purple-100',
  };
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{valor}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function ModalCrearCupon({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [form, setForm] = useState({
    codigo: '',
    tipo: 'porcentaje' as 'porcentaje' | 'monto_fijo' | 'envio_gratis',
    valor: 10,
    uso_maximo: 100,
    vigente_hasta: '',
    para_telefono: '',
    descripcion: '',
  });
  const [enviando, setEnviando] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await axios.post(`${API}/api/lealtad/cupones`, {
        ...form,
        codigo: form.codigo.toUpperCase().trim(),
        para_telefono: form.para_telefono || null,
        vigente_hasta: form.vigente_hasta || null,
      });
      onCreado();
      onClose();
    } catch (err: any) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Crear cupón</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Código</label>
            <input
              type="text"
              required
              value={form.codigo}
              onChange={e => setForm({ ...form, codigo: e.target.value })}
              placeholder="EJ: BIENVENIDA10"
              className="w-full border border-gray-300 rounded px-3 py-2 uppercase"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tipo</label>
            <select
              value={form.tipo}
              onChange={e => setForm({ ...form, tipo: e.target.value as any })}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="porcentaje">Porcentaje (%)</option>
              <option value="monto_fijo">Monto fijo ($)</option>
              <option value="envio_gratis">Envío gratis</option>
            </select>
          </div>
          {form.tipo !== 'envio_gratis' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Valor {form.tipo === 'porcentaje' ? '(%)' : '($)'}
              </label>
              <input
                type="number"
                required
                value={form.valor}
                onChange={e => setForm({ ...form, valor: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Usos máximos</label>
              <input
                type="number"
                min="1"
                value={form.uso_maximo}
                onChange={e => setForm({ ...form, uso_maximo: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vigente hasta</label>
              <input
                type="date"
                value={form.vigente_hasta}
                onChange={e => setForm({ ...form, vigente_hasta: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Para teléfono específico (opcional)</label>
            <input
              type="text"
              value={form.para_telefono}
              onChange={e => setForm({ ...form, para_telefono: e.target.value })}
              placeholder="Dejar vacío = todos los clientes"
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              {enviando ? 'Creando...' : 'Crear cupón'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
