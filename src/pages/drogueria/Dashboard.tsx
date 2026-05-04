import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  ShoppingBag,
  Clock,
  BookOpen,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
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
} from 'recharts';
import Navbar from '../../components/Navbar';
import { useDrogueriaAuth } from '../../contexts/DrogueriaAuthContext';

interface Metric {
  pedidosHoy: number;
  pedidosPendientes: number;
  medicamentosEnCatalogo: number;
  ventasMes: number;
}

interface Pedido {
  id: string;
  numero: string;
  cliente: string;
  total: number;
  estado: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  createdAt: string;
  items: number;
}

interface StockAlerta {
  id: string;
  nombre: string;
  stock: number;
  stockMinimo: number;
}

interface ChartData {
  dia: string;
  pedidos: number;
}

const ESTADO_LABELS: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'badge bg-yellow-100 text-yellow-800' },
  en_proceso: { label: 'En proceso', className: 'badge bg-blue-100 text-blue-800' },
  completado: { label: 'Completado', className: 'badge bg-green-100 text-green-800' },
  cancelado: { label: 'Cancelado', className: 'badge bg-red-100 text-red-800' },
};

// Datos de ejemplo para cuando no hay backend
const MOCK_METRICS: Metric = {
  pedidosHoy: 12,
  pedidosPendientes: 4,
  medicamentosEnCatalogo: 287,
  ventasMes: 3450000,
};

const MOCK_PEDIDOS: Pedido[] = [
  { id: '1', numero: '#1045', cliente: 'Carlos M.', total: 45000, estado: 'pendiente', createdAt: new Date().toISOString(), items: 3 },
  { id: '2', numero: '#1044', cliente: 'Maria G.', total: 28500, estado: 'en_proceso', createdAt: new Date().toISOString(), items: 2 },
  { id: '3', numero: '#1043', cliente: 'Juan P.', total: 67000, estado: 'completado', createdAt: new Date().toISOString(), items: 4 },
  { id: '4', numero: '#1042', cliente: 'Ana R.', total: 19000, estado: 'completado', createdAt: new Date().toISOString(), items: 1 },
  { id: '5', numero: '#1041', cliente: 'Pedro S.', total: 52000, estado: 'cancelado', createdAt: new Date().toISOString(), items: 2 },
];

const MOCK_ALERTAS: StockAlerta[] = [
  { id: '1', nombre: 'Acetaminofen 500mg x 10', stock: 5, stockMinimo: 20 },
  { id: '2', nombre: 'Amoxicilina 500mg', stock: 8, stockMinimo: 30 },
];

const MOCK_CHART: ChartData[] = [
  { dia: 'Lun', pedidos: 8 },
  { dia: 'Mar', pedidos: 14 },
  { dia: 'Mie', pedidos: 10 },
  { dia: 'Jue', pedidos: 18 },
  { dia: 'Vie', pedidos: 22 },
  { dia: 'Sab', pedidos: 16 },
  { dia: 'Dom', pedidos: 12 },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'Ahora';
  if (diff < 60) return `Hace ${diff} min`;
  const hours = Math.floor(diff / 60);
  return `Hace ${hours}h`;
}

export default function DrogueriaDashboard() {
  const { drogueria } = useDrogueriaAuth();
  const [metrics, setMetrics] = useState<Metric>(MOCK_METRICS);
  const [pedidos, setPedidos] = useState<Pedido[]>(MOCK_PEDIDOS);
  const [alertas, setAlertas] = useState<StockAlerta[]>(MOCK_ALERTAS);
  const [chartData, setChartData] = useState<ChartData[]>(MOCK_CHART);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, pedidosRes, alertasRes, chartRes] = await Promise.all([
          axios.get(`/api/drogueria/${drogueria?.id}/metrics`),
          axios.get(`/api/drogueria/${drogueria?.id}/pedidos?limit=5`),
          axios.get(`/api/drogueria/${drogueria?.id}/stock-alertas`),
          axios.get(`/api/drogueria/${drogueria?.id}/pedidos-chart`),
        ]);
        setMetrics(metricsRes.data);
        setPedidos(pedidosRes.data);
        setAlertas(alertasRes.data);
        setChartData(chartRes.data);
      } catch {
        // Usar datos de ejemplo si no hay backend
      } finally {
        setLoading(false);
      }
    };

    if (drogueria?.id) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [drogueria?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-10 w-10 animate-spin text-green-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{drogueria?.nombre || 'Mi Drogueria'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-green-600 font-medium">Activa</span>
                </div>
                <span className="text-gray-300">|</span>
                <span className="text-sm text-gray-500">{drogueria?.ciudad}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Alertas de stock */}
        {alertas.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-amber-800">Alertas de stock bajo</h3>
            </div>
            <div className="space-y-2">
              {alertas.map((alerta) => (
                <div key={alerta.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-amber-100">
                  <span className="text-sm font-medium text-gray-800">{alerta.nombre}</span>
                  <span className="text-sm text-red-600 font-semibold">
                    {alerta.stock} unidades (min: {alerta.stockMinimo})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metricas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              icon: <ShoppingBag className="h-6 w-6 text-blue-600" />,
              bg: 'bg-blue-50',
              label: 'Pedidos hoy',
              value: metrics.pedidosHoy,
              suffix: '',
            },
            {
              icon: <Clock className="h-6 w-6 text-yellow-600" />,
              bg: 'bg-yellow-50',
              label: 'Pendientes',
              value: metrics.pedidosPendientes,
              suffix: '',
            },
            {
              icon: <BookOpen className="h-6 w-6 text-green-600" />,
              bg: 'bg-green-50',
              label: 'Medicamentos',
              value: metrics.medicamentosEnCatalogo,
              suffix: '',
            },
            {
              icon: <DollarSign className="h-6 w-6 text-purple-600" />,
              bg: 'bg-purple-50',
              label: 'Ventas del mes',
              value: formatCurrency(metrics.ventasMes),
              suffix: '',
              isFormatted: true,
            },
          ].map((card) => (
            <div key={card.label} className="card">
              <div className={`${card.bg} p-3 rounded-xl w-fit mb-3`}>
                {card.icon}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {card.isFormatted ? card.value : card.value}
              </div>
              <div className="text-sm text-gray-500 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Grafico de pedidos */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Pedidos ultimos 7 dias
              </h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  formatter={(value) => [`${value} pedidos`, 'Pedidos']}
                />
                <Bar dataKey="pedidos" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Accesos rapidos */}
          <div className="card">
            <h2 className="font-bold text-gray-900 mb-4">Accesos rapidos</h2>
            <div className="space-y-3">
              <Link
                to="/drogueria/pedidos"
                className="flex items-center justify-between p-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Gestionar pedidos</div>
                    <div className="text-xs text-gray-500">{metrics.pedidosPendientes} pendientes</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
              </Link>
              <Link
                to="/drogueria/catalogo"
                className="flex items-center justify-between p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Ver catalogo</div>
                    <div className="text-xs text-gray-500">{metrics.medicamentosEnCatalogo} medicamentos</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-green-600" />
              </Link>
              <Link
                to="/drogueria/inventario"
                className="flex items-center justify-between p-3 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-purple-600" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Inventario</div>
                    <div className="text-xs text-gray-500">{alertas.length} alertas de stock</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-purple-600" />
              </Link>
            </div>
          </div>
        </div>

        {/* Ultimos pedidos */}
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-gray-900">Ultimos pedidos</h2>
            <Link to="/drogueria/pedidos" className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
              Ver todos
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Numero</th>
                  <th className="pb-3 pr-4">Cliente</th>
                  <th className="pb-3 pr-4">Items</th>
                  <th className="pb-3 pr-4">Total</th>
                  <th className="pb-3 pr-4">Estado</th>
                  <th className="pb-3">Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pedidos.map((pedido) => {
                  const estadoInfo = ESTADO_LABELS[pedido.estado] || ESTADO_LABELS['pendiente'];
                  return (
                    <tr key={pedido.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pr-4 font-mono font-semibold text-gray-900 text-sm">{pedido.numero}</td>
                      <td className="py-3 pr-4 text-sm text-gray-700">{pedido.cliente}</td>
                      <td className="py-3 pr-4 text-sm text-gray-500">{pedido.items} items</td>
                      <td className="py-3 pr-4 text-sm font-semibold text-gray-900">{formatCurrency(pedido.total)}</td>
                      <td className="py-3 pr-4">
                        <span className={estadoInfo.className}>{estadoInfo.label}</span>
                      </td>
                      <td className="py-3 text-sm text-gray-400">{timeAgo(pedido.createdAt)}</td>
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
