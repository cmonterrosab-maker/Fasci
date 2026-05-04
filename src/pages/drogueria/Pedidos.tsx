import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  User,
  Phone,
  MapPin,
  X,
  Loader2,
  Bell,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useDrogueriaAuth } from '../../contexts/DrogueriaAuthContext';

type EstadoPedido = 'pendiente' | 'confirmado' | 'en_preparacion' | 'en_camino' | 'entregado' | 'cancelado';

interface ItemPedido {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
}

interface Pedido {
  id: string;
  numero: string;
  cliente: string;
  telefono: string;
  direccion: string;
  estado: EstadoPedido;
  items: ItemPedido[];
  total: number;
  createdAt: string;
  notas?: string;
}

const MOCK_PEDIDOS: Pedido[] = [
  {
    id: '1', numero: '#1045', cliente: 'Carlos Martinez', telefono: '+573001234567', direccion: 'Calle 50 #30-25, Bogota',
    estado: 'pendiente', total: 45000, createdAt: new Date().toISOString(), notas: 'Entregar en porteria',
    items: [
      { id: 'i1', nombre: 'Acetaminofen 500mg x 10', cantidad: 2, precio: 7000 },
      { id: 'i2', nombre: 'Ibuprofeno 400mg x 10', cantidad: 1, precio: 5200 },
      { id: 'i3', nombre: 'Loratadina 10mg x 10', cantidad: 1, precio: 7500 },
    ],
  },
  {
    id: '2', numero: '#1044', cliente: 'Maria Garcia', telefono: '+573109876543', direccion: 'Carrera 7 #45-12, Bogota',
    estado: 'confirmado', total: 28500, createdAt: new Date(Date.now() - 1800000).toISOString(),
    items: [
      { id: 'i4', nombre: 'Omeprazol 20mg x 14', cantidad: 1, precio: 18000 },
      { id: 'i5', nombre: 'Acetaminofen 500mg x 10', cantidad: 3, precio: 10500 },
    ],
  },
  {
    id: '3', numero: '#1043', cliente: 'Juan Perez', telefono: '+573201234567', direccion: 'Av. El Dorado #68-11, Bogota',
    estado: 'en_preparacion', total: 67000, createdAt: new Date(Date.now() - 3600000).toISOString(),
    items: [
      { id: 'i6', nombre: 'Amoxicilina 500mg x 10', cantidad: 2, precio: 24000 },
      { id: 'i7', nombre: 'Ibuprofeno 400mg x 10', cantidad: 4, precio: 20800 },
      { id: 'i8', nombre: 'Loratadina 10mg x 10', cantidad: 3, precio: 22500 },
    ],
  },
  {
    id: '4', numero: '#1042', cliente: 'Ana Rodriguez', telefono: '+573151234567', direccion: 'Calle 100 #15-30, Bogota',
    estado: 'en_camino', total: 19000, createdAt: new Date(Date.now() - 5400000).toISOString(),
    items: [
      { id: 'i9', nombre: 'Loratadina 10mg x 10', cantidad: 1, precio: 7500 },
      { id: 'i10', nombre: 'Acetaminofen 500mg x 10', cantidad: 2, precio: 7000 },
    ],
  },
  {
    id: '5', numero: '#1041', cliente: 'Pedro Sanchez', telefono: '+573001111111', direccion: 'Calle 72 #40-20, Bogota',
    estado: 'entregado', total: 52000, createdAt: new Date(Date.now() - 86400000).toISOString(),
    items: [
      { id: 'i11', nombre: 'Omeprazol 20mg x 14', cantidad: 2, precio: 36000 },
      { id: 'i12', nombre: 'Ibuprofeno 400mg x 10', cantidad: 3, precio: 16000 },
    ],
  },
  {
    id: '6', numero: '#1040', cliente: 'Laura Torres', telefono: '+573002222222', direccion: 'Carrera 30 #25-90, Bogota',
    estado: 'cancelado', total: 35000, createdAt: new Date(Date.now() - 86400000).toISOString(),
    items: [
      { id: 'i13', nombre: 'Amoxicilina 500mg x 10', cantidad: 2, precio: 24000 },
      { id: 'i14', nombre: 'Acetaminofen 500mg x 10', cantidad: 1, precio: 3500 },
    ],
  },
];

const TABS: { key: string; estados: EstadoPedido[]; label: string }[] = [
  { key: 'pendientes', estados: ['pendiente'], label: 'Pendientes' },
  { key: 'en_proceso', estados: ['confirmado', 'en_preparacion', 'en_camino'], label: 'En proceso' },
  { key: 'completados', estados: ['entregado'], label: 'Completados' },
  { key: 'cancelados', estados: ['cancelado'], label: 'Cancelados' },
];

const ESTADO_CONFIG: Record<EstadoPedido, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-4 w-4" /> },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800', icon: <CheckCircle className="h-4 w-4" /> },
  en_preparacion: { label: 'En preparacion', color: 'bg-purple-100 text-purple-800', icon: <Package className="h-4 w-4" /> },
  en_camino: { label: 'En camino', color: 'bg-orange-100 text-orange-800', icon: <Truck className="h-4 w-4" /> },
  entregado: { label: 'Entregado', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4" /> },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-4 w-4" /> },
};

const ACCIONES: Record<EstadoPedido, { label: string; nextEstado: EstadoPedido; color: string } | null> = {
  pendiente: { label: 'Confirmar pedido', nextEstado: 'confirmado', color: 'bg-blue-600 hover:bg-blue-700 text-white' },
  confirmado: { label: 'Iniciar preparacion', nextEstado: 'en_preparacion', color: 'bg-purple-600 hover:bg-purple-700 text-white' },
  en_preparacion: { label: 'Marcar en camino', nextEstado: 'en_camino', color: 'bg-orange-600 hover:bg-orange-700 text-white' },
  en_camino: { label: 'Marcar como entregado', nextEstado: 'entregado', color: 'bg-green-600 hover:bg-green-700 text-white' },
  entregado: null,
  cancelado: null,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'Ahora mismo';
  if (diff < 60) return `Hace ${diff} min`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `Hace ${hours}h`;
  return new Date(dateStr).toLocaleDateString('es-CO');
}

export default function DrogueriaPedidos() {
  const { drogueria } = useDrogueriaAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>(MOCK_PEDIDOS);
  const [activeTab, setActiveTab] = useState('pendientes');
  const [detallePedido, setDetallePedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(false);
  const [fechaFiltro, setFechaFiltro] = useState('');

  useEffect(() => {
    const fetchPedidos = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/drogueria/${drogueria?.id}/pedidos`);
        setPedidos(res.data);
      } catch {
        // usar mock
      } finally {
        setLoading(false);
      }
    };
    if (drogueria?.id) fetchPedidos();
    else setLoading(false);
  }, [drogueria?.id]);

  const avanzarEstado = async (pedidoId: string, nuevoEstado: EstadoPedido) => {
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: nuevoEstado } : p));
    try {
      await axios.patch(`/api/drogueria/${drogueria?.id}/pedidos/${pedidoId}`, { estado: nuevoEstado });
    } catch {
      // silent
    }
  };

  const cancelar = async (pedidoId: string) => {
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: 'cancelado' } : p));
    try {
      await axios.patch(`/api/drogueria/${drogueria?.id}/pedidos/${pedidoId}`, { estado: 'cancelado' });
    } catch {
      // silent
    }
  };

  const tabActual = TABS.find(t => t.key === activeTab)!;
  const pedidosFiltrados = pedidos.filter(p => {
    const inTab = tabActual.estados.includes(p.estado);
    if (!inTab) return false;
    if (fechaFiltro) {
      const fecha = new Date(p.createdAt).toISOString().split('T')[0];
      return fecha === fechaFiltro;
    }
    return true;
  });

  const pendientesCount = pedidos.filter(p => p.estado === 'pendiente').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
              {pendientesCount > 0 && (
                <div className="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                  <Bell className="h-4 w-4" />
                  {pendientesCount} nuevos
                </div>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">Gestiona los pedidos de tu drogueria</p>
          </div>

          {/* Filtro fecha */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={fechaFiltro}
              onChange={e => setFechaFiltro(e.target.value)}
              className="input-field w-auto text-sm"
            />
            {fechaFiltro && (
              <button onClick={() => setFechaFiltro('')} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
          {TABS.map((tab) => {
            const count = pedidos.filter(p => tab.estados.includes(p.estado)).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-green-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Pedidos */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-green-600" />
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="card text-center py-16">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No hay pedidos en esta categoria</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pedidosFiltrados.map((pedido) => {
              const estadoConf = ESTADO_CONFIG[pedido.estado];
              const accion = ACCIONES[pedido.estado];
              return (
                <div key={pedido.id} className="card">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono font-bold text-gray-900">{pedido.numero}</span>
                        <span className={`badge ${estadoConf.color} flex items-center gap-1`}>
                          {estadoConf.icon}
                          {estadoConf.label}
                        </span>
                        <span className="text-sm text-gray-400 ml-auto sm:ml-0">{timeAgo(pedido.createdAt)}</span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <User className="h-4 w-4 text-gray-400" />
                          <span>{pedido.cliente}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <a href={`tel:${pedido.telefono}`} className="hover:text-green-600">{pedido.telefono}</a>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-gray-600 sm:col-span-2">
                          <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <span>{pedido.direccion}</span>
                        </div>
                      </div>

                      {/* Items preview */}
                      <div className="text-sm text-gray-500">
                        {pedido.items.slice(0, 2).map(item => (
                          <span key={item.id}>{item.nombre} x{item.cantidad}{pedido.items.indexOf(item) < pedido.items.length - 1 ? ', ' : ''}</span>
                        ))}
                        {pedido.items.length > 2 && <span className="text-gray-400"> +{pedido.items.length - 2} mas</span>}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <div className="text-xl font-bold text-gray-900">{formatCurrency(pedido.total)}</div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <button
                          onClick={() => setDetallePedido(pedido)}
                          className="btn-secondary text-sm py-1.5"
                        >
                          Ver detalle
                        </button>
                        {accion && (
                          <button
                            onClick={() => avanzarEstado(pedido.id, accion.nextEstado)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${accion.color}`}
                          >
                            {accion.label}
                          </button>
                        )}
                        {pedido.estado === 'pendiente' && (
                          <button
                            onClick={() => cancelar(pedido.id)}
                            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal detalle */}
      {detallePedido && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-100 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Pedido {detallePedido.numero}</h2>
                <span className={`badge ${ESTADO_CONFIG[detallePedido.estado].color}`}>
                  {ESTADO_CONFIG[detallePedido.estado].label}
                </span>
              </div>
              <button onClick={() => setDetallePedido(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info cliente */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-gray-900 text-sm">Informacion del cliente</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4 text-gray-400" /> {detallePedido.cliente}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <a href={`tel:${detallePedido.telefono}`} className="text-green-600 hover:underline">{detallePedido.telefono}</a>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" /> {detallePedido.direccion}
                </div>
                {detallePedido.notas && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
                    <strong>Notas:</strong> {detallePedido.notas}
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Productos solicitados</h3>
                <div className="space-y-2">
                  {detallePedido.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.nombre}</div>
                        <div className="text-xs text-gray-500">Cantidad: {item.cantidad}</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900">{formatCurrency(item.precio)}</div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between pt-3 border-t border-gray-200 mt-2">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-xl text-green-700">{formatCurrency(detallePedido.total)}</span>
                </div>
              </div>

              {/* Acciones */}
              {ACCIONES[detallePedido.estado] && (
                <button
                  onClick={() => {
                    const accion = ACCIONES[detallePedido.estado];
                    if (accion) {
                      avanzarEstado(detallePedido.id, accion.nextEstado);
                      setDetallePedido(prev => prev ? { ...prev, estado: accion.nextEstado } : null);
                    }
                  }}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors ${ACCIONES[detallePedido.estado]!.color}`}
                >
                  {ACCIONES[detallePedido.estado]!.label}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
