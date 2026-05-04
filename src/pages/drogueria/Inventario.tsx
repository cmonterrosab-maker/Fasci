import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Package,
  TrendingDown,
  CheckCircle,
  Search,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useDrogueriaAuth } from '../../contexts/DrogueriaAuthContext';

interface ItemInventario {
  id: string;
  nombre: string;
  presentacion: string;
  laboratorio: string;
  stock: number;
  stockMinimo: number;
  stockIdeal: number;
  disponible: boolean;
  ultimaActualizacion: string;
}

const MOCK_INVENTARIO: ItemInventario[] = [
  { id: '1', nombre: 'Acetaminofen 500mg x 10', presentacion: 'Tabletas x 10', laboratorio: 'Genfar', stock: 5, stockMinimo: 20, stockIdeal: 100, disponible: true, ultimaActualizacion: new Date().toISOString() },
  { id: '2', nombre: 'Ibuprofeno 400mg x 10', presentacion: 'Tabletas x 10', laboratorio: 'Lafrancol', stock: 30, stockMinimo: 15, stockIdeal: 80, disponible: true, ultimaActualizacion: new Date().toISOString() },
  { id: '3', nombre: 'Amoxicilina 500mg x 10', presentacion: 'Capsulas x 10', laboratorio: 'Genfar', stock: 8, stockMinimo: 30, stockIdeal: 120, disponible: true, ultimaActualizacion: new Date().toISOString() },
  { id: '4', nombre: 'Loratadina 10mg x 10', presentacion: 'Tabletas x 10', laboratorio: 'Bayer', stock: 45, stockMinimo: 10, stockIdeal: 60, disponible: false, ultimaActualizacion: new Date().toISOString() },
  { id: '5', nombre: 'Omeprazol 20mg x 14', presentacion: 'Capsulas x 14', laboratorio: 'Tecnoquimicas', stock: 20, stockMinimo: 20, stockIdeal: 80, disponible: true, ultimaActualizacion: new Date().toISOString() },
  { id: '6', nombre: 'Metformina 850mg x 30', presentacion: 'Tabletas x 30', laboratorio: 'Genfar', stock: 0, stockMinimo: 10, stockIdeal: 50, disponible: false, ultimaActualizacion: new Date().toISOString() },
];

function getStockStatus(item: ItemInventario): 'agotado' | 'critico' | 'bajo' | 'normal' | 'optimo' {
  if (item.stock === 0) return 'agotado';
  if (item.stock < item.stockMinimo * 0.5) return 'critico';
  if (item.stock < item.stockMinimo) return 'bajo';
  if (item.stock >= item.stockIdeal * 0.8) return 'optimo';
  return 'normal';
}

const STATUS_CONFIG = {
  agotado: { label: 'Agotado', color: 'bg-red-100 text-red-800', barColor: 'bg-red-500', icon: <XCircleIcon /> },
  critico: { label: 'Critico', color: 'bg-red-100 text-red-800', barColor: 'bg-red-400', icon: <AlertTriangle className="h-4 w-4" /> },
  bajo: { label: 'Stock bajo', color: 'bg-yellow-100 text-yellow-800', barColor: 'bg-yellow-400', icon: <TrendingDown className="h-4 w-4" /> },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-800', barColor: 'bg-blue-400', icon: <Package className="h-4 w-4" /> },
  optimo: { label: 'Optimo', color: 'bg-green-100 text-green-800', barColor: 'bg-green-500', icon: <CheckCircle className="h-4 w-4" /> },
};

function XCircleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export default function DrogueriaInventario() {
  const { drogueria } = useDrogueriaAuth();
  const [inventario, setInventario] = useState<ItemInventario[]>(MOCK_INVENTARIO);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'agotado' | 'critico' | 'bajo'>('todos');
  const [loading, setLoading] = useState(false);
  const [editingStock, setEditingStock] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/drogueria/${drogueria?.id}/inventario`);
        setInventario(res.data);
      } catch {
        // usar mock
      } finally {
        setLoading(false);
      }
    };
    if (drogueria?.id) fetch();
    else setLoading(false);
  }, [drogueria?.id]);

  const actualizarStock = async (id: string, nuevoStock: number) => {
    setInventario(prev => prev.map(i => i.id === id ? { ...i, stock: nuevoStock } : i));
    try {
      await axios.patch(`/api/drogueria/${drogueria?.id}/inventario/${id}`, { stock: nuevoStock });
    } catch {
      // silent
    }
    setEditingStock(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const filtrados = inventario.filter(item => {
    const matchBusqueda = item.nombre.toLowerCase().includes(busqueda.toLowerCase());
    if (filtro === 'todos') return matchBusqueda;
    const status = getStockStatus(item);
    if (filtro === 'agotado') return matchBusqueda && status === 'agotado';
    if (filtro === 'critico') return matchBusqueda && (status === 'critico' || status === 'agotado');
    if (filtro === 'bajo') return matchBusqueda && (status === 'bajo' || status === 'critico' || status === 'agotado');
    return matchBusqueda;
  });

  const resumen = {
    agotados: inventario.filter(i => getStockStatus(i) === 'agotado').length,
    criticos: inventario.filter(i => getStockStatus(i) === 'critico').length,
    bajos: inventario.filter(i => getStockStatus(i) === 'bajo').length,
    total: inventario.length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-500 text-sm mt-1">Control de stock de medicamentos</p>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total medicamentos', value: resumen.total, color: 'text-gray-900', bg: 'bg-gray-50', icon: <Package className="h-5 w-5 text-gray-500" /> },
            { label: 'Agotados', value: resumen.agotados, color: 'text-red-700', bg: 'bg-red-50', icon: <XCircleIcon /> },
            { label: 'Stock critico', value: resumen.criticos, color: 'text-orange-700', bg: 'bg-orange-50', icon: <AlertTriangle className="h-5 w-5 text-orange-500" /> },
            { label: 'Stock bajo', value: resumen.bajos, color: 'text-yellow-700', bg: 'bg-yellow-50', icon: <TrendingDown className="h-5 w-5 text-yellow-500" /> },
          ].map((card) => (
            <div key={card.label} className={`card ${card.bg} border-0`}>
              <div className="flex items-center gap-3">
                {card.icon}
                <div>
                  <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar medicamento..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <div className="flex gap-2">
            {(['todos', 'agotado', 'critico', 'bajo'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filtro === f ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Medicamento</th>
                  <th className="px-6 py-4">Stock actual</th>
                  <th className="px-6 py-4 hidden lg:table-cell">Nivel</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Actualizar stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" />
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      No se encontraron medicamentos
                    </td>
                  </tr>
                ) : (
                  filtrados.map((item) => {
                    const status = getStockStatus(item);
                    const statusConf = STATUS_CONFIG[status];
                    const pct = Math.min(100, (item.stock / item.stockIdeal) * 100);
                    const isEditing = editingStock[item.id] !== undefined;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 text-sm">{item.nombre}</div>
                          <div className="text-xs text-gray-400">{item.laboratorio}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-lg font-bold ${item.stock === 0 ? 'text-red-600' : item.stock < item.stockMinimo ? 'text-yellow-600' : 'text-gray-900'}`}>
                            {item.stock}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">/ min {item.stockMinimo}</span>
                        </td>
                        <td className="px-6 py-4 hidden lg:table-cell">
                          <div className="w-24 bg-gray-100 rounded-full h-2">
                            <div
                              className={`${statusConf.barColor} h-2 rounded-full transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{Math.round(pct)}% del ideal</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`badge ${statusConf.color} flex items-center gap-1 w-fit`}>
                            {statusConf.icon}
                            {statusConf.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={editingStock[item.id]}
                                onChange={e => setEditingStock(prev => ({ ...prev, [item.id]: e.target.value }))}
                                className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                min="0"
                              />
                              <button
                                onClick={() => actualizarStock(item.id, Number(editingStock[item.id]))}
                                className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditingStock(prev => { const n = { ...prev }; delete n[item.id]; return n; })}
                                className="p-1.5 text-gray-400 hover:text-gray-600"
                              >
                                <XCircleIcon />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingStock(prev => ({ ...prev, [item.id]: String(item.stock) }))}
                              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <RefreshCw className="h-4 w-4" />
                              Actualizar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
