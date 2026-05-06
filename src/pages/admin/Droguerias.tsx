import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Search, CheckCircle, XCircle, MapPin, Phone, Mail,
  Loader2, Store, ChevronLeft, ChevronRight, Filter, Plus, X,
} from 'lucide-react';
import AdminNavbar from '../../components/AdminNavbar';

const FORM_VACIO = { nombre: '', email: '', telefono: '', whatsapp_numero: '', ciudad: 'Cartagena', direccion: '', barrio: '', nit: '', tipo: 'socio' };

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  operador: { label: 'Operador',  color: 'bg-indigo-100 text-indigo-800' },
  socio:    { label: 'Socio B2B', color: 'bg-purple-100 text-purple-700' },
};

interface Drogueria {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  ciudad: string;
  direccion: string;
  tipo: 'operador' | 'socio';
  estado: 'activo' | 'pendiente' | 'suspendido' | 'inactivo' | 'rechazado';
  pedidosTotales: number;
  fechaRegistro: string;
}

const MOCK_DROGUERIAS: Drogueria[] = [];

const PAGE_SIZE = 10;

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  activo:     { label: 'Activa',              color: 'bg-green-100 text-green-800' },
  pendiente:  { label: 'Pendiente aprobación', color: 'bg-yellow-100 text-yellow-800' },
  suspendido: { label: 'Suspendida',           color: 'bg-red-100 text-red-800' },
  inactivo:   { label: 'Inactiva',             color: 'bg-gray-100 text-gray-600' },
  rechazado:  { label: 'Rechazada',            color: 'bg-red-200 text-red-900' },
};

export default function AdminDroguerias() {
  const [droguerias, setDroguerias] = useState<Drogueria[]>(MOCK_DROGUERIAS);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activo' | 'pendiente' | 'suspendido'>('todos');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/admin/droguerias');
        const raw = Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.droguerias ?? []);
        setDroguerias(raw.map((d: any) => ({
          ...d,
          tipo: d.tipo ?? 'socio',
          estado: d.status ?? d.estado ?? 'pendiente',
          fechaRegistro: d.created_at ?? d.fechaRegistro ?? '',
          pedidosTotales: d.total_pedidos ?? d.pedidosTotales ?? 0,
        })));
      } catch {
        // usar mock
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const aprobar = async (id: string) => {
    setDroguerias(prev => prev.map(d => d.id === id ? { ...d, estado: 'activo' as const } : d));
    try { await axios.put(`/api/admin/droguerias/${id}/status`, { status: 'activo' }); } catch {}
  };

  const suspender = async (id: string) => {
    setDroguerias(prev => prev.map(d => d.id === id ? { ...d, estado: 'suspendido' as const } : d));
    try { await axios.put(`/api/admin/droguerias/${id}/status`, { status: 'suspendido' }); } catch {}
  };

  const filtradas = droguerias.filter(d => {
    const matchBusqueda = d.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      d.ciudad.toLowerCase().includes(busqueda.toLowerCase()) ||
      d.email.toLowerCase().includes(busqueda.toLowerCase());
    const matchEstado = filtroEstado === 'todos' || d.estado === filtroEstado;
    return matchBusqueda && matchEstado;
  });

  const totalPages = Math.ceil(filtradas.length / PAGE_SIZE);
  const paginadas = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const registrar = async () => {
    if (!form.nombre || !form.telefono || !form.ciudad) return;
    setSaving(true); setSaveError('');
    try {
      await axios.post('/api/admin/droguerias', form);
      setShowModal(false);
      setForm(FORM_VACIO);
      // Recargar lista
      const res = await axios.get('/api/admin/droguerias');
      const raw = Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.droguerias ?? []);
      setDroguerias(raw.map((d: any) => ({
        ...d,
        tipo: d.tipo ?? 'socio',
        estado: d.status ?? d.estado ?? 'pendiente',
        fechaRegistro: d.created_at ?? d.fechaRegistro ?? '',
        pedidosTotales: d.total_pedidos ?? d.pedidosTotales ?? 0,
      })));
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Error al registrar');
    } finally { setSaving(false); }
  };

  const pendientesCount = droguerias.filter(d => d.estado === 'pendiente' || d.estado === 'inactivo').length;

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <AdminNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Droguerias</h1>
            <p className="text-gray-500 text-sm mt-1">
              {droguerias.length} droguerias registradas
              {pendientesCount > 0 && (
                <span className="ml-2 text-yellow-600 font-medium">· {pendientesCount} pendientes de aprobacion</span>
              )}
            </p>
          </div>
          <button onClick={() => { setShowModal(true); setSaveError(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            <Plus className="h-4 w-4" /> Registrar droguería
          </button>
        </div>

        {/* Modal Registrar Droguería */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">Registrar droguería</h2>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-700">Nombre *</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.nombre}
                      onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Droguería La Salud" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Teléfono *</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.telefono}
                      onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="3001234567" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">WhatsApp B2B</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.whatsapp_numero}
                      onChange={e => setForm(f => ({ ...f, whatsapp_numero: e.target.value }))} placeholder="3001234567 (para pedidos mayoristas)" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Ciudad *</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.ciudad}
                      onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-700">Dirección</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.direccion}
                      onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Calle 50 #30-25" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Email</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="drogueria@mail.com" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">NIT</label>
                    <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.nit}
                      onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} placeholder="900123456-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Tipo</label>
                    <select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={form.tipo}
                      onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                      <option value="socio">Socio B2B (compra al mayorista)</option>
                      <option value="operador">Operador (bodega / Droguería Virtual)</option>
                    </select>
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
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, ciudad o email..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(1); }}
              className="input-field pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={filtroEstado}
              onChange={e => { setFiltroEstado(e.target.value as typeof filtroEstado); setPage(1); }}
              className="input-field w-auto"
            >
              <option value="todos">Todos los estados</option>
              <option value="activo">Activas</option>
              <option value="pendiente">Pendientes</option>
              <option value="suspendido">Suspendidas</option>
            </select>
          </div>
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Drogueria</th>
                  <th className="px-6 py-4">Contacto</th>
                  <th className="px-6 py-4">Ciudad</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Pedidos</th>
                  <th className="px-6 py-4">Registro</th>
                  <th className="px-6 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" />
                    </td>
                  </tr>
                ) : paginadas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      No se encontraron droguerias
                    </td>
                  </tr>
                ) : (
                  paginadas.map((d) => {
                    const estadoConf = ESTADO_CONFIG[d.estado] ?? { label: d.estado ?? 'Desconocido', color: 'bg-gray-100 text-gray-800' };
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-green-100 p-2 rounded-lg flex-shrink-0">
                              <Store className="h-4 w-4 text-green-700" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 text-sm">{d.nombre}</div>
                              <div className="text-xs text-gray-400">{d.direccion}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            <a href={`mailto:${d.email}`} className="hover:text-green-600">{d.email}</a>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            {d.telefono}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            {d.ciudad}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {(() => { const t = TIPO_CONFIG[d.tipo] ?? TIPO_CONFIG['socio']; return (
                            <span className={`badge ${t.color}`}>{t.label}</span>
                          ); })()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`badge ${estadoConf.color}`}>{estadoConf.label}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{d.pedidosTotales}</td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {new Date(d.fechaRegistro).toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            {(d.estado === 'pendiente' || d.estado === 'inactivo' || d.estado === 'rechazado') && (
                              <button
                                onClick={() => aprobar(d.id)}
                                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium bg-green-50 px-2 py-1 rounded-lg"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Aprobar
                              </button>
                            )}
                            {d.estado === 'activo' && (
                              <button
                                onClick={() => suspender(d.id)}
                                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium bg-red-50 px-2 py-1 rounded-lg"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Suspender
                              </button>
                            )}
                            {d.estado === 'suspendido' && (
                              <button
                                onClick={() => aprobar(d.id)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-2 py-1 rounded-lg"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Reactivar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">Pagina {page} de {totalPages}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
