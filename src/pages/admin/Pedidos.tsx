import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Search,
  Store,
  User,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  Loader2,
  Calendar,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import AdminNavbar from '../../components/AdminNavbar';

type EstadoPedido = 'pendiente' | 'confirmado' | 'en_preparacion' | 'en_camino' | 'entregado' | 'cancelado';

interface PedidoAdmin {
  id: string;
  numero: string;
  drogueria: string;
  ciudad: string;
  cliente: string;
  total: number;
  estado: EstadoPedido;
  itemsCount: number;
  createdAt: string;
}

const MOCK_PEDIDOS: PedidoAdmin[] = [
  { id: '1', numero: '#1045', drogueria: 'Drogueria La Salud', ciudad: 'Bogota', cliente: 'Carlos M.', total: 45000, estado: 'pendiente', itemsCount: 3, createdAt: new Date().toISOString() },
  { id: '2', numero: '#1044', drogueria: 'Farmacia El Alivio', ciudad: 'Medellin', cliente: 'Maria G.', total: 28500, estado: 'en_camino', itemsCount: 2, createdAt: new Date(Date.now() - 1800000).toISOString() },
  { id: '3', numero: '#1043', drogueria: 'Drogueria La Salud', ciudad: 'Bogota', cliente: 'Juan P.', total: 67000, estado: 'entregado', itemsCount: 4, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: '4', numero: '#1042', drogueria: 'Farmacia Central', ciudad: 'Barranquilla', cliente: 'Ana R.', total: 19000, estado: 'confirmado', itemsCount: 1, createdAt: new Date(Date.now() - 5400000).toISOString() },
  { id: '5', numero: '#1041', drogueria: 'Pharmacity Unicentro', ciudad: 'Bogota', cliente: 'Pedro S.', total: 52000, estado: 'cancelado', itemsCount: 2, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: '6', numero: '#1040', drogueria: 'Farmacia El Alivio', ciudad: 'Medellin', cliente: 'Laura T.', total: 35000, estado: 'en_preparacion', itemsCount: 3, createdAt: new Date(Date.now() - 7200000).toISOString() },
];

const ESTADO_CONFIG: Record<EstadoPedido, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3.5 w-3.5" /> },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  en_preparacion: { label: 'En preparacion', color: 'bg-purple-100 text-purple-800', icon: <Package className="h-3.5 w-3.5" /> },
  en_camino: { label: 'En camino', color: 'bg-orange-100 text-orange-800', icon: <Truck className="h-3.5 w-3.5" /> },
  entregado: { label: 'Entregado', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3.5 w-3.5" /> },
};

const PAGE_SIZE = 20;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Ahora';
  if (diff < 60) return `Hace ${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `Hace ${h}h`;
  return new Date(dateStr).toLocaleDateString('es-CO');
}

export default function AdminPedidos() {
  const [pedidos, setPedidos] = useState<PedidoAdmin[]>(MOCK_PEDIDOS);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/admin/pedidos');
        const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.pedidos ?? res.data?.data ?? []);
        const data: PedidoAdmin[] = raw.map(p => ({
          id:         p.id,
          numero:     p.numero_pedido ?? p.numero ?? `#${p.id?.slice(0,6)}`,
          drogueria:  p.droguerias?.nombre ?? p.drogueria ?? 'Bot WhatsApp',
          ciudad:     p.droguerias?.ciudad ?? p.ciudad ?? '—',
          cliente:    p.cliente_nombre ?? p.cliente ?? 'Cliente',
          total:      p.total ?? 0,
          estado:     p.status ?? p.estado ?? 'pendiente',
          itemsCount: p.itemsCount ?? 0,
          createdAt:  p.created_at ?? p.createdAt ?? new Date().toISOString(),
        }));
        setPedidos(data);
      } catch {}
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  const filtrados = pedidos.filter(p => {
    const matchBusqueda = p.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.drogueria.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.cliente.toLowerCase().includes(busqueda.toLowerCase());
    const matchEstado = filtroEstado === 'todos' || p.estado === filtroEstado;
    const matchFecha = !fechaFiltro || new Date(p.createdAt).toISOString().split('T')[0] === fechaFiltro;
    return matchBusqueda && matchEstado && matchFecha;
  });

  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE);
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Resumen
  const resumen = Object.keys(ESTADO_CONFIG).reduce((acc, key) => {
    acc[key] = pedidos.filter(p => p.estado === key).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Todos los Pedidos</h1>
          <p className="text-gray-500 text-sm mt-1">{pedidos.length} pedidos en total</p>
        </div>

        {/* Resumen rapido */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          {Object.entries(ESTADO_CONFIG).map(([key, conf]) => (
            <button
              key={key}
              onClick={() => { setFiltroEstado(filtroEstado === key ? 'todos' : key); setPage(1); }}
              className={`rounded-xl p-3 text-center transition-all border-2 ${
                filtroEstado === key ? 'border-green-600 shadow-md' : 'border-transparent'
              } ${conf.color.replace('text-', 'text-').split(' ')[0]}`}
            >
              <div className="text-xl font-bold">{resumen[key] || 0}</div>
              <div className="text-xs mt-0.5 opacity-80">{conf.label}</div>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por numero, drogueria o cliente..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(1); }}
              className="input-field pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={fechaFiltro}
              onChange={e => { setFechaFiltro(e.target.value); setPage(1); }}
              className="input-field w-auto text-sm"
            />
            {fechaFiltro && (
              <button onClick={() => setFechaFiltro('')} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Numero</th>
                  <th className="px-6 py-4">Drogueria</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Items</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" /></td></tr>
                ) : paginados.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No se encontraron pedidos</td></tr>
                ) : (
                  paginados.map(p => {
                    const conf = ESTADO_CONFIG[p.estado];
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-gray-900 text-sm">{p.numero}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-green-600 flex-shrink-0" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{p.drogueria}</div>
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <MapPin className="h-3 w-3" />
                                {p.ciudad}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-gray-700">
                            <User className="h-4 w-4 text-gray-400" />
                            {p.cliente}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{p.itemsCount} items</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">{formatCurrency(p.total)}</td>
                        <td className="px-6 py-4">
                          <span className={`badge ${conf.color} flex items-center gap-1 w-fit`}>
                            {conf.icon}
                            {conf.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">{timeAgo(p.createdAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">Pagina {page} de {totalPages} ({filtrados.length} resultados)</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
