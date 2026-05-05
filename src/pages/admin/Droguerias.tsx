import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Search,
  CheckCircle,
  XCircle,
  MapPin,
  Phone,
  Mail,
  Loader2,
  Store,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import AdminNavbar from '../../components/AdminNavbar';

interface Drogueria {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  ciudad: string;
  direccion: string;
  estado: 'activa' | 'pendiente' | 'suspendida';
  pedidosTotales: number;
  fechaRegistro: string;
}

const MOCK_DROGUERIAS: Drogueria[] = [
  { id: '1', nombre: 'Drogueria La Salud', email: 'lasalud@mail.com', telefono: '+573001234567', ciudad: 'Bogota', direccion: 'Calle 50 #30-25', estado: 'activa', pedidosTotales: 342, fechaRegistro: '2024-01-15' },
  { id: '2', nombre: 'Farmacia El Alivio', email: 'elalivio@mail.com', telefono: '+574201234567', ciudad: 'Medellin', direccion: 'Carrera 80 #45-12', estado: 'activa', pedidosTotales: 287, fechaRegistro: '2024-02-01' },
  { id: '3', nombre: 'Drogueria San Pedro', email: 'sanpedro@mail.com', telefono: '+572301234567', ciudad: 'Cali', direccion: 'Av. Roosevelt #25-18', estado: 'pendiente', pedidosTotales: 0, fechaRegistro: '2024-11-20' },
  { id: '4', nombre: 'Farmacia Central', email: 'central@mail.com', telefono: '+575001234567', ciudad: 'Barranquilla', direccion: 'Calle 72 #40-20', estado: 'activa', pedidosTotales: 198, fechaRegistro: '2024-03-10' },
  { id: '5', nombre: 'Drogueria Vital', email: 'vital@mail.com', telefono: '+577001234567', ciudad: 'Bucaramanga', direccion: 'Carrera 18 #30-10', estado: 'suspendida', pedidosTotales: 45, fechaRegistro: '2024-04-05' },
  { id: '6', nombre: 'Pharmacity Unicentro', email: 'unicentro@mail.com', telefono: '+573501234567', ciudad: 'Bogota', direccion: 'Cra 15 #123-30 Local 201', estado: 'activa', pedidosTotales: 521, fechaRegistro: '2023-12-01' },
];

const PAGE_SIZE = 10;

const ESTADO_CONFIG = {
  activa: { label: 'Activa', color: 'bg-green-100 text-green-800' },
  pendiente: { label: 'Pendiente aprobacion', color: 'bg-yellow-100 text-yellow-800' },
  suspendida: { label: 'Suspendida', color: 'bg-red-100 text-red-800' },
};

export default function AdminDroguerias() {
  const [droguerias, setDroguerias] = useState<Drogueria[]>(MOCK_DROGUERIAS);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activa' | 'pendiente' | 'suspendida'>('todos');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/admin/droguerias');
        const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.droguerias ?? []);
        setDroguerias(data);
      } catch {
        // usar mock
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const aprobar = async (id: string) => {
    setDroguerias(prev => prev.map(d => d.id === id ? { ...d, estado: 'activa' } : d));
    try { await axios.patch(`/api/admin/droguerias/${id}`, { estado: 'activa' }); } catch {}
  };

  const suspender = async (id: string) => {
    setDroguerias(prev => prev.map(d => d.id === id ? { ...d, estado: 'suspendida' } : d));
    try { await axios.patch(`/api/admin/droguerias/${id}`, { estado: 'suspendida' }); } catch {}
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

  const pendientesCount = droguerias.filter(d => d.estado === 'pendiente').length;

  return (
    <div className="min-h-screen bg-gray-50">
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
        </div>

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
              <option value="activa">Activas</option>
              <option value="pendiente">Pendientes</option>
              <option value="suspendida">Suspendidas</option>
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
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Pedidos</th>
                  <th className="px-6 py-4">Registro</th>
                  <th className="px-6 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" />
                    </td>
                  </tr>
                ) : paginadas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
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
                          <span className={`badge ${estadoConf.color}`}>{estadoConf.label}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{d.pedidosTotales}</td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {new Date(d.fechaRegistro).toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            {d.estado === 'pendiente' && (
                              <button
                                onClick={() => aprobar(d.id)}
                                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium bg-green-50 px-2 py-1 rounded-lg"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Aprobar
                              </button>
                            )}
                            {d.estado === 'activa' && (
                              <button
                                onClick={() => suspender(d.id)}
                                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium bg-red-50 px-2 py-1 rounded-lg"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Suspender
                              </button>
                            )}
                            {d.estado === 'suspendida' && (
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
