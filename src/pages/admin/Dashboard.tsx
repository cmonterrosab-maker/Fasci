import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Store,
  ShoppingBag,
  Pill,
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  MapPin,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import AdminNavbar from '../../components/AdminNavbar';

interface GlobalMetrics {
  drogueriaActivas: number;
  pedidosHoy: number;
  medicamentosEnCatalogo: number;
  totalPedidosMes: number;
}

interface Drogueria {
  id: string;
  nombre: string;
  ciudad: string;
  estado: 'activa' | 'pendiente' | 'suspendida';
  pedidosHoy: number;
  fechaRegistro: string;
}

interface PedidosCiudad {
  ciudad: string;
  pedidos: number;
}

const MOCK_METRICS: GlobalMetrics = {
  drogueriaActivas: 47,
  pedidosHoy: 284,
  medicamentosEnCatalogo: 1250,
  totalPedidosMes: 8430,
};

const MOCK_DROGUERIAS: Drogueria[] = [
  { id: '1', nombre: 'Drogueria La Salud', ciudad: 'Bogota', estado: 'activa', pedidosHoy: 24, fechaRegistro: '2024-01-15' },
  { id: '2', nombre: 'Farmacia El Alivio', ciudad: 'Medellin', estado: 'activa', pedidosHoy: 18, fechaRegistro: '2024-02-01' },
  { id: '3', nombre: 'Drogueria San Pedro', ciudad: 'Cali', estado: 'pendiente', pedidosHoy: 0, fechaRegistro: '2024-11-20' },
  { id: '4', nombre: 'Farmacia Central', ciudad: 'Barranquilla', estado: 'activa', pedidosHoy: 31, fechaRegistro: '2024-03-10' },
  { id: '5', nombre: 'Drogueria Vital', ciudad: 'Bucaramanga', estado: 'suspendida', pedidosHoy: 0, fechaRegistro: '2024-04-05' },
];

const MOCK_CIUDAD_DATA: PedidosCiudad[] = [
  { ciudad: 'Bogota', pedidos: 140 },
  { ciudad: 'Medellin', pedidos: 80 },
  { ciudad: 'Cali', pedidos: 35 },
  { ciudad: 'Barranquilla', pedidos: 20 },
  { ciudad: 'Otros', pedidos: 9 },
];

const PIE_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#6b7280'];

const ESTADO_CONFIG = {
  activa: { label: 'Activa', color: 'bg-green-100 text-green-800' },
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  suspendida: { label: 'Suspendida', color: 'bg-red-100 text-red-800' },
};

function mapStatus(status?: string): Drogueria['estado'] {
  if (status === 'active' || status === 'approved' || status === 'activo') return 'activa';
  if (status === 'suspended' || status === 'inactive' || status === 'suspendido') return 'suspendida';
  return 'pendiente';
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<GlobalMetrics>(MOCK_METRICS);
  const [droguerias, setDroguerias] = useState<Drogueria[]>(MOCK_DROGUERIAS);
  const [ciudadData, setCiudadData] = useState<PedidosCiudad[]>(MOCK_CIUDAD_DATA);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [metricsRes, drogueriasRes] = await Promise.all([
          axios.get('/api/admin/stats'),
          axios.get('/api/admin/droguerias?limit=5&sort=recientes'),
        ]);
        setMetrics({
          drogueriaActivas: metricsRes.data.total_droguerias || 0,
          pedidosHoy: metricsRes.data.total_pedidos_hoy || 0,
          medicamentosEnCatalogo: metricsRes.data.total_medicamentos || 0,
          totalPedidosMes: MOCK_METRICS.totalPedidosMes,
        });
        setDroguerias((drogueriasRes.data.droguerias || []).map((d: any) => ({
          id: d.id,
          nombre: d.nombre,
          ciudad: d.ciudad || 'Sin ciudad',
          estado: mapStatus(d.status),
          pedidosHoy: d.total_pedidos || 0,
          fechaRegistro: d.created_at,
        })));
        setCiudadData(MOCK_CIUDAD_DATA);
      } catch {
        // usar mock
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const aprobar = (id: string) => {
    setDroguerias(prev => prev.map(d => d.id === id ? { ...d, estado: 'activa' } : d));
  };

  const suspender = (id: string) => {
    setDroguerias(prev => prev.map(d => d.id === id ? { ...d, estado: 'suspendida' } : d));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-10 w-10 animate-spin text-green-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Panel de Administracion</h1>
          <p className="text-gray-500 text-sm mt-1">Vista global de Drogueria Virtual</p>
        </div>

        {/* Metricas globales */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <Store className="h-6 w-6 text-green-600" />, bg: 'bg-green-50', label: 'Droguerias activas', value: metrics.drogueriaActivas },
            { icon: <ShoppingBag className="h-6 w-6 text-blue-600" />, bg: 'bg-blue-50', label: 'Pedidos hoy', value: metrics.pedidosHoy },
            { icon: <Pill className="h-6 w-6 text-purple-600" />, bg: 'bg-purple-50', label: 'Medicamentos', value: metrics.medicamentosEnCatalogo.toLocaleString() },
            { icon: <TrendingUp className="h-6 w-6 text-orange-600" />, bg: 'bg-orange-50', label: 'Pedidos este mes', value: metrics.totalPedidosMes.toLocaleString() },
          ].map((card) => (
            <div key={card.label} className="card">
              <div className={`${card.bg} p-3 rounded-xl w-fit mb-3`}>
                {card.icon}
              </div>
              <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              <div className="text-sm text-gray-500 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Pedidos por ciudad - Barras */}
          <div className="card">
            <h2 className="font-bold text-gray-900 mb-6">Pedidos por ciudad hoy</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ciudadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="ciudad" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="pedidos" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Distribucion - Pie */}
          <div className="card">
            <h2 className="font-bold text-gray-900 mb-6">Distribucion por ciudad</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={ciudadData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="pedidos"
                  nameKey="ciudad"
                  label={({ ciudad, percent }) => `${ciudad} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {ciudadData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Droguerias recientes */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-gray-900">Ultimas droguerias registradas</h2>
            <Link to="/admin/droguerias" className="text-sm text-green-600 hover:text-green-700 font-medium">
              Ver todas
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Drogueria</th>
                  <th className="pb-3 pr-4">Ciudad</th>
                  <th className="pb-3 pr-4">Estado</th>
                  <th className="pb-3 pr-4">Pedidos hoy</th>
                  <th className="pb-3 pr-4">Registro</th>
                  <th className="pb-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {droguerias.map((d) => {
                  const estadoConf = ESTADO_CONFIG[d.estado];
                  return (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pr-4 font-medium text-gray-900 text-sm">{d.nombre}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" />
                          {d.ciudad}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`badge ${estadoConf.color}`}>{estadoConf.label}</span>
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-600">{d.pedidosHoy}</td>
                      <td className="py-3 pr-4 text-sm text-gray-400">
                        {new Date(d.fechaRegistro).toLocaleDateString('es-CO')}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          {d.estado === 'pendiente' && (
                            <button
                              onClick={() => aprobar(d.id)}
                              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Aprobar
                            </button>
                          )}
                          {d.estado === 'activa' && (
                            <button
                              onClick={() => suspender(d.id)}
                              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium"
                            >
                              <XCircle className="h-4 w-4" />
                              Suspender
                            </button>
                          )}
                          {d.estado === 'suspendida' && (
                            <button
                              onClick={() => aprobar(d.id)}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
