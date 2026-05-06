import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Store, ShoppingBag, Pill, TrendingUp, MapPin,
  Package, Brain, ArrowRight, Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import AdminNavbar from '../../components/AdminNavbar';
import { useCanal } from '../../contexts/CanalContext';

// ── Metric card component ──────────────────────────────────────────────────
function MetricCard({
  icon, iconBg, label, value, sub,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="metric-card animate-in">
      <div className="flex items-start justify-between">
        <div className={`icon-circle ${iconBg}`}>{icon}</div>
      </div>
      <div className="mt-4">
        <div className="stat-number">{value}</div>
        <div className="text-sm text-gray-500 mt-0.5 font-medium">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

// ── Quick action link ─────────────────────────────────────────────────────
function QuickLink({ to, label, color }: { to: string; label: string; color: string }) {
  return (
    <Link to={to}
      className={`${color} group flex items-center justify-between gap-2 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-all duration-150 active:scale-[0.98] hover:brightness-110`}>
      <span>{label}</span>
      <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

// ──────────────────────────────────────────────
// B2C Dashboard
// ──────────────────────────────────────────────
const ESTADO_CONF_B2C: Record<string, { label: string; color: string }> = {
  activo:     { label: 'Activa',     color: 'bg-emerald-50 text-emerald-700' },
  pendiente:  { label: 'Pendiente',  color: 'bg-amber-50 text-amber-700' },
  suspendido: { label: 'Suspendida', color: 'bg-red-50 text-red-700' },
};

function DashboardB2C() {
  const [metrics, setMetrics] = useState({ drogueriaActivas: 0, pedidosHoy: 0, medicamentos: 0, pedidosMes: 0 });
  const [droguerias, setDroguerias] = useState<any[]>([]);
  const [ciudadData, setCiudadData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [statsRes, drogsRes] = await Promise.all([
          axios.get('/api/admin/stats'),
          axios.get('/api/admin/droguerias?limit=5&sort=recientes'),
        ]);
        setMetrics({
          drogueriaActivas: statsRes.data.total_droguerias || 0,
          pedidosHoy:       statsRes.data.total_pedidos_hoy || 0,
          medicamentos:     statsRes.data.total_medicamentos || 0,
          pedidosMes:       statsRes.data.total_pedidos_mes || 0,
        });
        const drogs = (drogsRes.data.droguerias || drogsRes.data || []).map((d: any) => ({
          id: d.id, nombre: d.nombre, ciudad: d.ciudad || '—',
          estado: d.status === 'activo' ? 'activo' : d.status === 'suspendido' ? 'suspendido' : 'pendiente',
          pedidosHoy: d.total_pedidos || 0, fechaRegistro: d.created_at,
        }));
        setDroguerias(drogs);
        if (statsRes.data.pedidos_por_ciudad?.length) setCiudadData(statsRes.data.pedidos_por_ciudad);
      } catch { /* keep zeros */ } finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      <span className="text-sm text-gray-400">Cargando panel B2C…</span>
    </div>
  );

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="icon-circle bg-gradient-to-br from-green-500 to-emerald-600">
            <ShoppingBag className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-gradient-green text-2xl font-bold">Droguería Virtual · B2C</h1>
            <p className="text-sm text-gray-500">Consumidores finales · pedidos por WhatsApp · entregas a domicilio</p>
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          icon={<Store className="h-5 w-5 text-green-600" />}
          iconBg="bg-green-50"
          label="Droguerías activas"
          value={metrics.drogueriaActivas}
        />
        <MetricCard
          icon={<ShoppingBag className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="Pedidos hoy"
          value={metrics.pedidosHoy}
        />
        <MetricCard
          icon={<Pill className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
          label="Medicamentos"
          value={metrics.medicamentos.toLocaleString('es-CO')}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5 text-orange-600" />}
          iconBg="bg-orange-50"
          label="Pedidos este mes"
          value={metrics.pedidosMes.toLocaleString('es-CO')}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Gráfica */}
        {ciudadData.length > 0 ? (
          <div className="card lg:col-span-2">
            <h2 className="section-title mb-5">Pedidos por ciudad — hoy</h2>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={ciudadData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="ciudad" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 13 }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="pedidos" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="card lg:col-span-2 flex items-center justify-center py-12">
            <p className="text-sm text-gray-400">Sin datos de pedidos por ciudad hoy</p>
          </div>
        )}

        {/* Accesos rápidos */}
        <div className="card">
          <h2 className="section-title mb-4">Accesos rápidos</h2>
          <div className="flex flex-col gap-2.5">
            <QuickLink to="/admin/pedidos"      label="Ver pedidos"     color="bg-blue-600" />
            <QuickLink to="/admin/mensajeros"   label="Mensajeros live" color="bg-emerald-600" />
            <QuickLink to="/admin/metricas"     label="Métricas RT"     color="bg-slate-700" />
            <QuickLink to="/admin/medicamentos" label="Catálogo"        color="bg-violet-600" />
          </div>
        </div>
      </div>

      {/* Últimas droguerías */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title">Últimas droguerías registradas</h2>
          <Link to="/admin/droguerias"
            className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1">
            Ver todas <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <table className="w-full">
          <thead><tr className="table-head">
            <th>Droguería</th><th>Ciudad</th><th>Estado</th><th>Pedidos</th><th>Registro</th>
          </tr></thead>
          <tbody>
            {droguerias.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">Sin droguerías aún</td></tr>
            ) : droguerias.map((d) => {
              const ec = ESTADO_CONF_B2C[d.estado] ?? ESTADO_CONF_B2C['pendiente'];
              return (
                <tr key={d.id} className="table-row">
                  <td className="font-semibold text-gray-900">{d.nombre}</td>
                  <td className="text-gray-500">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 opacity-50" />{d.ciudad}</span>
                  </td>
                  <td><span className={`badge ${ec.color}`}>{ec.label}</span></td>
                  <td className="text-gray-600 font-medium">{d.pedidosHoy}</td>
                  <td className="text-gray-400">{new Date(d.fechaRegistro).toLocaleDateString('es-CO')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// B2B Dashboard
// ──────────────────────────────────────────────
const ORDEN_STATUS: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'bg-amber-50 text-amber-700' },
  confirmado: { label: 'Confirmado', color: 'bg-blue-50 text-blue-700' },
  en_proceso: { label: 'En proceso', color: 'bg-violet-50 text-violet-700' },
  despachado: { label: 'Despachado', color: 'bg-indigo-50 text-indigo-700' },
  entregado:  { label: 'Entregado',  color: 'bg-emerald-50 text-emerald-700' },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-50 text-red-700' },
};

function DashboardB2B() {
  const [ordenes, setOrdenes]       = useState<any[]>([]);
  const [socios, setSocios]         = useState(0);
  const [ordenesHoy, setOrdenesHoy] = useState(0);
  const [valorMes, setValorMes]     = useState(0);
  const [perfiles, setPerfiles]     = useState(0);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [ordenesRes, drogsRes, perfilesRes] = await Promise.all([
          axios.get('/api/admin/ordenes-compra?limit=8'),
          axios.get('/api/admin/droguerias'),
          axios.get('/api/admin/b2b/perfiles').catch(() => ({ data: [] })),
        ]);
        const ords = ordenesRes.data.ordenes || ordenesRes.data || [];
        setOrdenes(ords);
        const hoy = new Date().toISOString().slice(0, 10);
        setOrdenesHoy(ords.filter((o: any) => o.created_at?.slice(0, 10) === hoy).length);
        setValorMes(ords.reduce((s: number, o: any) => s + (Number(o.total_estimado) || 0), 0));
        const raw = Array.isArray(drogsRes.data) ? drogsRes.data : (drogsRes.data?.droguerias ?? []);
        setSocios(raw.filter((d: any) => d.tipo === 'socio' && d.status === 'activo').length);
        const pData = Array.isArray(perfilesRes.data) ? perfilesRes.data : (perfilesRes.data?.perfiles ?? []);
        setPerfiles(pData.length);
      } catch { /* keep zeros */ } finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      <span className="text-sm text-gray-400">Cargando panel B2B…</span>
    </div>
  );

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="icon-circle bg-gradient-to-br from-indigo-500 to-violet-600">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-gradient-indigo text-2xl font-bold">Mayorista · B2B</h1>
            <p className="text-sm text-gray-500">Droguerías socias · órdenes de compra mayoristas · perfiles predictivos IA</p>
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          icon={<Store className="h-5 w-5 text-indigo-600" />}
          iconBg="bg-indigo-50"
          label="Socios activos"
          value={socios}
        />
        <MetricCard
          icon={<Package className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="Órdenes hoy"
          value={ordenesHoy}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="Valor órdenes (mes)"
          value={`$${valorMes.toLocaleString('es-CO')}`}
        />
        <MetricCard
          icon={<Brain className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
          label="Perfiles IA"
          value={perfiles}
          sub="Productos aprendidos"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Resumen estado órdenes */}
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-5">Últimas órdenes de compra</h2>
          <table className="w-full">
            <thead><tr className="table-head">
              <th>Orden</th><th>Droguería</th><th>Estado</th><th>Total</th><th>Fecha</th>
            </tr></thead>
            <tbody>
              {ordenes.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">Sin órdenes aún</td></tr>
              ) : ordenes.map((o: any) => {
                const sc = ORDEN_STATUS[o.status] ?? { label: o.status, color: 'bg-gray-100 text-gray-700' };
                return (
                  <tr key={o.id} className="table-row">
                    <td className="font-mono font-bold text-indigo-600 text-xs">{o.numero_orden || o.id?.slice(0, 8)}</td>
                    <td className="font-semibold text-gray-900">{o.drogueria?.nombre ?? o.drogueria_nombre ?? '—'}</td>
                    <td><span className={`badge ${sc.color}`}>{sc.label}</span></td>
                    <td className="font-semibold text-gray-700">
                      {o.total_estimado != null ? `$${Number(o.total_estimado).toLocaleString('es-CO')}` : '—'}
                    </td>
                    <td className="text-gray-400">{o.created_at ? new Date(o.created_at).toLocaleDateString('es-CO') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 pt-4 border-t border-gray-50">
            <Link to="/admin/ordenes-b2b"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Ver todas las órdenes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Accesos rápidos */}
        <div className="card">
          <h2 className="section-title mb-4">Accesos rápidos</h2>
          <div className="flex flex-col gap-2.5">
            <QuickLink to="/admin/ordenes-b2b"  label="Gestionar órdenes"   color="bg-indigo-600" />
            <QuickLink to="/admin/droguerias"   label="Socios B2B"          color="bg-violet-600" />
            <QuickLink to="/admin/mensajeros"   label="Mensajeros"          color="bg-blue-600" />
            <QuickLink to="/admin/medicamentos" label="Catálogo mayorista"  color="bg-slate-700" />
          </div>

          {/* IA hint */}
          <div className="mt-5 p-3 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-indigo-100">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-semibold text-indigo-700">Perfiles predictivos IA</span>
            </div>
            <p className="text-xs text-indigo-500 leading-relaxed">
              El sistema aprende de cada orden y alerta a los socios cuando es tiempo de reabastecerse.
            </p>
            <Link to="/admin/ordenes-b2b"
              className="mt-2 text-xs font-semibold text-indigo-600 flex items-center gap-1 hover:text-indigo-700">
              Ver perfiles <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Root
// ──────────────────────────────────────────────
export default function AdminDashboard() {
  const { canal } = useCanal();
  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <AdminNavbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {canal === 'b2b' ? <DashboardB2B /> : <DashboardB2C />}
      </main>
    </div>
  );
}
