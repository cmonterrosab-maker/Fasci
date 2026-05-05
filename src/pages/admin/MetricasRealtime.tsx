import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  ShoppingCart,
  DollarSign,
  Truck,
  Receipt,
  TrendingUp,
  Clock,
  Users,
  AlertTriangle,
  RefreshCw,
  Search,
  Package,
  CreditCard,
  CheckCircle2,
  Pill,
  Loader2,
  Briefcase,
} from 'lucide-react';
import AdminNavbar from '../../components/AdminNavbar';
import { API_BASE_URL } from '../../lib/api';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface RealtimeStats {
  pedidos_hoy: number;
  pedidos_en_camino: number;
  pedidos_entregados_hoy: number;
  ventas_hoy: number;
  ticket_promedio_hoy: number;
  tiempo_entrega_promedio_min: number;
  tasa_conversion_pago: number;
  mensajeros_activos: number;
  mensajeros_ocupados: number;
  alertas_stock: number;
  timestamp: string;
}

interface PedidoHora {
  hora: string;
  pedidos: number;
  ventas: number;
}

interface TopMedicamento {
  nombre: string;
  cantidad_vendida: number;
  ingresos: number;
}

interface Embudo {
  buscaron: number;
  agregaron_carrito: number;
  llegaron_a_pago: number;
  pagaron: number;
  tasa_conversion: number;
}

interface ResumenSocio {
  periodo: string;
  pedidos_totales: number;
  ventas_mes: number;
  fee_acumulado: number;
  neto_distribuidor: number;
  ticket_promedio: number;
  timestamp: string;
}

// ─── Config ────────────────────────────────────────────────────────────────

const POLL_MS = 30_000;

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtCOP = (n: number | undefined | null) =>
  `$${Number(n || 0).toLocaleString('es-CO')}`;

const fmtNum = (n: number | undefined | null) =>
  Number(n || 0).toLocaleString('es-CO');

// ─── Card métrica ──────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'emerald';
  subLabel?: string;
}

const accentMap = {
  green:   { bg: 'bg-green-50',   icon: 'bg-green-600 text-white',   ring: 'ring-green-200' },
  blue:    { bg: 'bg-blue-50',    icon: 'bg-blue-600 text-white',    ring: 'ring-blue-200' },
  amber:   { bg: 'bg-amber-50',   icon: 'bg-amber-500 text-white',   ring: 'ring-amber-200' },
  red:     { bg: 'bg-red-50',     icon: 'bg-red-600 text-white',     ring: 'ring-red-200' },
  purple:  { bg: 'bg-purple-50',  icon: 'bg-purple-600 text-white',  ring: 'ring-purple-200' },
  emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-600 text-white', ring: 'ring-emerald-200' },
};

function KpiCard({ label, value, icon, accent = 'green', subLabel }: KpiCardProps) {
  const a = accentMap[accent];
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 truncate">{value}</p>
          {subLabel && <p className="mt-0.5 text-xs text-gray-500">{subLabel}</p>}
        </div>
        <div className={`flex-shrink-0 rounded-lg p-2.5 ${a.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function MetricasRealtime() {
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [serie, setSerie] = useState<PedidoHora[]>([]);
  const [top, setTop] = useState<TopMedicamento[]>([]);
  const [embudo, setEmbudo] = useState<Embudo | null>(null);
  const [socio, setSocio] = useState<ResumenSocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async (silencioso = false) => {
    if (!silencioso) setRefreshing(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/metricas/realtime`),
        axios.get(`${API_BASE_URL}/api/metricas/pedidos-horas?horas=12`),
        axios.get(`${API_BASE_URL}/api/metricas/top-medicamentos?limite=10`),
        axios.get(`${API_BASE_URL}/api/metricas/embudo`),
        axios.get(`${API_BASE_URL}/api/metricas/socio`),
      ]);
      setStats(r1.data?.stats || null);
      setSerie(r2.data?.data || []);
      setTop(r3.data?.data || []);
      setEmbudo(r4.data?.data || null);
      setSocio(r5.data?.data || null);
      setLastUpdate(new Date());
      setError(null);
    } catch (err: any) {
      console.error('[MetricasRealtime] Error:', err);
      setError(err?.message || 'Error al cargar métricas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(true), POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Loading inicial ──────────────────────────────────────────────────────
  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar />
        <div className="flex items-center justify-center pt-32">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-green-600" />
            <p className="text-sm text-gray-600">Cargando métricas en tiempo real...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Datos para el embudo ─────────────────────────────────────────────────
  const embudoSteps = embudo ? [
    { label: 'Buscaron',          value: embudo.buscaron,          icon: <Search className="h-5 w-5" />,        color: 'bg-blue-500',    width: 100 },
    { label: 'Agregaron al carrito', value: embudo.agregaron_carrito, icon: <Package className="h-5 w-5" />,    color: 'bg-emerald-500', width: embudo.buscaron ? Math.max(15, (embudo.agregaron_carrito / embudo.buscaron) * 100) : 0 },
    { label: 'Llegaron a pago',   value: embudo.llegaron_a_pago,   icon: <CreditCard className="h-5 w-5" />,    color: 'bg-amber-500',   width: embudo.buscaron ? Math.max(10, (embudo.llegaron_a_pago / embudo.buscaron) * 100) : 0 },
    { label: 'Pagaron',           value: embudo.pagaron,           icon: <CheckCircle2 className="h-5 w-5" />,  color: 'bg-green-600',   width: embudo.buscaron ? Math.max(8,  (embudo.pagaron / embudo.buscaron) * 100) : 0 },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="h-7 w-7 text-green-600" />
              Métricas en Tiempo Real
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Monitoreo en vivo de operaciones de Droguería Virtual
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador EN VIVO */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
              </span>
              <span className="text-xs font-bold text-red-700 tracking-wide">EN VIVO</span>
            </div>

            <button
              onClick={() => fetchData()}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* Última actualización */}
        <div className="text-xs text-gray-500 mb-4">
          Última actualización: {lastUpdate.toLocaleTimeString('es-CO')} · Auto-refresh cada 30s
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── 8 KPI Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Pedidos hoy"
            value={fmtNum(stats?.pedidos_hoy)}
            icon={<ShoppingCart className="h-5 w-5" />}
            accent="green"
            subLabel={`${stats?.pedidos_entregados_hoy || 0} entregados`}
          />
          <KpiCard
            label="Ventas hoy"
            value={fmtCOP(stats?.ventas_hoy)}
            icon={<DollarSign className="h-5 w-5" />}
            accent="emerald"
          />
          <KpiCard
            label="En camino"
            value={fmtNum(stats?.pedidos_en_camino)}
            icon={<Truck className="h-5 w-5" />}
            accent="blue"
            subLabel="Pedidos activos"
          />
          <KpiCard
            label="Ticket promedio"
            value={fmtCOP(stats?.ticket_promedio_hoy)}
            icon={<Receipt className="h-5 w-5" />}
            accent="purple"
          />
          <KpiCard
            label="Tasa conversión"
            value={`${stats?.tasa_conversion_pago || 0}%`}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="emerald"
            subLabel="Creados → Pagados"
          />
          <KpiCard
            label="Tiempo entrega"
            value={`${stats?.tiempo_entrega_promedio_min || 0} min`}
            icon={<Clock className="h-5 w-5" />}
            accent="blue"
            subLabel="Últimos 50 entregados"
          />
          <KpiCard
            label="Mensajeros activos"
            value={fmtNum(stats?.mensajeros_activos)}
            icon={<Users className="h-5 w-5" />}
            accent="green"
            subLabel={`${stats?.mensajeros_ocupados || 0} ocupados`}
          />
          <KpiCard
            label="Alertas de stock"
            value={fmtNum(stats?.alertas_stock)}
            icon={<AlertTriangle className="h-5 w-5" />}
            accent={(stats?.alertas_stock || 0) > 0 ? 'red' : 'amber'}
            subLabel="Productos con stock < 10"
          />
        </div>

        {/* ── Grid principal ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Gráfico de barras */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Pedidos últimas 12 horas</h2>
                <p className="text-xs text-gray-500">Volumen y ventas por hora</p>
              </div>
              <Activity className="h-5 w-5 text-green-600" />
            </div>
            <div style={{ width: '100%', height: 320 }}>
              {serie.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  No hay datos disponibles
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="hora" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                      }}
                      formatter={(value: any, name: string) => {
                        if (name === 'ventas') return [fmtCOP(value), 'Ventas'];
                        return [value, 'Pedidos'];
                      }}
                    />
                    <Bar dataKey="pedidos" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Resumen socio */}
          <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl shadow-md p-5 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Resumen del socio</h2>
              </div>
            </div>
            <p className="text-xs text-green-100 mb-4">{socio?.periodo || 'Mes en curso'}</p>

            <div className="space-y-3">
              <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                <p className="text-xs text-green-100">Pedidos del mes</p>
                <p className="text-2xl font-bold">{fmtNum(socio?.pedidos_totales)}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                <p className="text-xs text-green-100">Ventas brutas</p>
                <p className="text-2xl font-bold">{fmtCOP(socio?.ventas_mes)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <p className="text-xs text-green-100">Fee acumulado</p>
                  <p className="text-lg font-bold">{fmtCOP(socio?.fee_acumulado)}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <p className="text-xs text-green-100">Neto distribuidor</p>
                  <p className="text-lg font-bold">{fmtCOP(socio?.neto_distribuidor)}</p>
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                <p className="text-xs text-green-100">Ticket promedio</p>
                <p className="text-lg font-bold">{fmtCOP(socio?.ticket_promedio)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Top medicamentos + Embudo ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top medicamentos */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Top medicamentos</h2>
                <p className="text-xs text-gray-500">Más vendidos últimos 30 días</p>
              </div>
              <Pill className="h-5 w-5 text-green-600" />
            </div>

            {top.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                No hay ventas registradas
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                      <th className="pb-2 px-2 font-medium">#</th>
                      <th className="pb-2 px-2 font-medium">Medicamento</th>
                      <th className="pb-2 px-2 font-medium text-right">Cantidad</th>
                      <th className="pb-2 px-2 font-medium text-right">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((item, idx) => (
                      <tr key={`${item.nombre}-${idx}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="py-2.5 px-2 text-gray-500 font-medium">{idx + 1}</td>
                        <td className="py-2.5 px-2 text-gray-900 font-medium truncate max-w-[180px]" title={item.nombre}>
                          {item.nombre}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-700">{fmtNum(item.cantidad_vendida)}</td>
                        <td className="py-2.5 px-2 text-right text-green-700 font-semibold">{fmtCOP(item.ingresos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Embudo */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Embudo de conversión</h2>
                <p className="text-xs text-gray-500">Del bot al pago confirmado</p>
              </div>
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>

            {!embudo ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                Sin datos
              </div>
            ) : (
              <div className="space-y-3">
                {embudoSteps.map((step, idx) => (
                  <div key={step.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md text-white ${step.color}`}>
                          {step.icon}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{step.label}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900">{fmtNum(step.value)}</span>
                    </div>
                    <div className="h-8 bg-gray-100 rounded-md overflow-hidden">
                      <div
                        className={`h-full ${step.color} flex items-center justify-end px-2 text-xs font-semibold text-white transition-all duration-700`}
                        style={{ width: `${Math.min(100, Math.max(idx === 0 ? 100 : 8, step.width))}%` }}
                      >
                        {step.width > 12 && embudo.buscaron > 0 && (
                          <span>{Math.round((step.value / embudo.buscaron) * 100)}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                    <span className="text-sm font-medium text-green-800">Tasa global de conversión</span>
                    <span className="text-2xl font-bold text-green-700">{embudo.tasa_conversion}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
