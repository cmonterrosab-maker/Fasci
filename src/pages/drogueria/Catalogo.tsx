import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Search,
  Plus,
  Edit2,
  ToggleLeft,
  ToggleRight,
  X,
  Loader2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Save,
  AlertCircle,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useDrogueriaAuth } from '../../contexts/DrogueriaAuthContext';

interface Medicamento {
  id: string;
  medicamentoMaestroId: string;
  nombre: string;
  presentacion: string;
  laboratorio: string;
  precio: number;
  stock: number;
  disponible: boolean;
  requiereFormula: boolean;
}

interface MedicamentoMaestro {
  id: string;
  nombre: string;
  principioActivo: string;
  presentacion: string;
  laboratorio: string;
}

const MOCK_MEDICAMENTOS: Medicamento[] = [
  { id: '1', medicamentoMaestroId: 'm1', nombre: 'Acetaminofen 500mg x 10', presentacion: 'Tabletas x 10', laboratorio: 'Genfar', precio: 3500, stock: 50, disponible: true, requiereFormula: false },
  { id: '2', medicamentoMaestroId: 'm2', nombre: 'Ibuprofeno 400mg x 10', presentacion: 'Tabletas x 10', laboratorio: 'Lafrancol', precio: 5200, stock: 30, disponible: true, requiereFormula: false },
  { id: '3', medicamentoMaestroId: 'm3', nombre: 'Amoxicilina 500mg x 10', presentacion: 'Capsulas x 10', laboratorio: 'Genfar', precio: 12000, stock: 8, disponible: true, requiereFormula: true },
  { id: '4', medicamentoMaestroId: 'm4', nombre: 'Loratadina 10mg x 10', presentacion: 'Tabletas x 10', laboratorio: 'Bayer', precio: 7500, stock: 45, disponible: false, requiereFormula: false },
  { id: '5', medicamentoMaestroId: 'm5', nombre: 'Omeprazol 20mg x 14', presentacion: 'Capsulas x 14', laboratorio: 'Tecnoquimicas', precio: 18000, stock: 20, disponible: true, requiereFormula: false },
];

const MOCK_MAESTROS: MedicamentoMaestro[] = [
  { id: 'n1', nombre: 'Aspirina 100mg', principioActivo: 'Acido Acetilsalicilico', presentacion: 'Tabletas x 30', laboratorio: 'Bayer' },
  { id: 'n2', nombre: 'Metformina 850mg', principioActivo: 'Metformina', presentacion: 'Tabletas x 30', laboratorio: 'Genfar' },
  { id: 'n3', nombre: 'Enalapril 10mg', principioActivo: 'Enalapril', presentacion: 'Tabletas x 30', laboratorio: 'Lafrancol' },
];

const PAGE_SIZE = 10;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

export default function DrogueriaCatalogo() {
  const { drogueria } = useDrogueriaAuth();
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>(MOCK_MEDICAMENTOS);
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Medicamento | null>(null);
  const [maestrosBusqueda, setMaestrosBusqueda] = useState('');
  const [maestros, setMaestros] = useState<MedicamentoMaestro[]>([]);
  const [buscandoMaestros, setBuscandoMaestros] = useState(false);
  const [editPrecio, setEditPrecio] = useState('');
  const [editStock, setEditStock] = useState('');

  useEffect(() => {
    const fetchMedicamentos = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/drogueria/${drogueria?.id}/catalogo`);
        setMedicamentos(res.data);
      } catch {
        // usar mock
      } finally {
        setLoading(false);
      }
    };
    if (drogueria?.id) fetchMedicamentos();
    else setLoading(false);
  }, [drogueria?.id]);

  const filtrados = medicamentos.filter((m) =>
    m.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );
  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE);
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const buscarMaestros = useCallback(async (query: string) => {
    if (!query.trim()) {
      setMaestros([]);
      return;
    }
    setBuscandoMaestros(true);
    try {
      const res = await axios.get(`/api/medicamentos/buscar?q=${query}`);
      setMaestros(res.data);
    } catch {
      setMaestros(MOCK_MAESTROS.filter(m => m.nombre.toLowerCase().includes(query.toLowerCase())));
    } finally {
      setBuscandoMaestros(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => buscarMaestros(maestrosBusqueda), 400);
    return () => clearTimeout(timer);
  }, [maestrosBusqueda, buscarMaestros]);

  const toggleDisponible = async (id: string) => {
    setMedicamentos(prev =>
      prev.map(m => m.id === id ? { ...m, disponible: !m.disponible } : m)
    );
    try {
      const item = medicamentos.find(m => m.id === id);
      await axios.patch(`/api/drogueria/${drogueria?.id}/catalogo/${id}`, { disponible: !item?.disponible });
    } catch {
      // Revertir si falla
      setMedicamentos(prev =>
        prev.map(m => m.id === id ? { ...m, disponible: !m.disponible } : m)
      );
    }
  };

  const openEdit = (item: Medicamento) => {
    setEditingItem(item);
    setEditPrecio(String(item.precio));
    setEditStock(String(item.stock));
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    const updated = { ...editingItem, precio: Number(editPrecio), stock: Number(editStock) };
    setMedicamentos(prev => prev.map(m => m.id === editingItem.id ? updated : m));
    try {
      await axios.patch(`/api/drogueria/${drogueria?.id}/catalogo/${editingItem.id}`, {
        precio: Number(editPrecio),
        stock: Number(editStock),
      });
    } catch {
      // silent
    }
    setShowEditModal(false);
    setEditingItem(null);
  };

  const agregarDelMaestro = async (maestro: MedicamentoMaestro) => {
    const nuevo: Medicamento = {
      id: `new-${Date.now()}`,
      medicamentoMaestroId: maestro.id,
      nombre: maestro.nombre,
      presentacion: maestro.presentacion,
      laboratorio: maestro.laboratorio,
      precio: 0,
      stock: 0,
      disponible: false,
      requiereFormula: false,
    };
    setMedicamentos(prev => [nuevo, ...prev]);
    setShowAddModal(false);
    setMaestrosBusqueda('');
    try {
      await axios.post(`/api/drogueria/${drogueria?.id}/catalogo`, {
        medicamentoMaestroId: maestro.id,
        precio: 0,
        stock: 0,
      });
    } catch {
      // silent
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Catalogo de medicamentos</h1>
            <p className="text-gray-500 text-sm mt-1">{medicamentos.length} medicamentos registrados</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 btn-primary"
          >
            <Plus className="h-4 w-4" />
            Agregar medicamento
          </button>
        </div>

        {/* Busqueda */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            className="input-field pl-10"
          />
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Medicamento</th>
                  <th className="px-6 py-4">Presentacion</th>
                  <th className="px-6 py-4">Precio</th>
                  <th className="px-6 py-4">Stock</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" />
                    </td>
                  </tr>
                ) : paginados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
                      No se encontraron medicamentos
                    </td>
                  </tr>
                ) : (
                  paginados.map((med) => (
                    <tr key={med.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 text-sm">{med.nombre}</div>
                        <div className="text-xs text-gray-400">{med.laboratorio}</div>
                        {med.requiereFormula && (
                          <div className="flex items-center gap-1 mt-1">
                            <ShieldAlert className="h-3 w-3 text-orange-500" />
                            <span className="text-xs text-orange-600 font-medium">Requiere formula</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{med.presentacion}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">{formatCurrency(med.precio)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-semibold ${med.stock < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                          {med.stock}
                        </span>
                        {med.stock < 10 && (
                          <span className="ml-1 text-xs text-red-500">bajo</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleDisponible(med.id)}
                          className="flex items-center gap-1.5 transition-colors"
                        >
                          {med.disponible ? (
                            <>
                              <ToggleRight className="h-6 w-6 text-green-600" />
                              <span className="text-xs font-medium text-green-700">Disponible</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="h-6 w-6 text-gray-400" />
                              <span className="text-xs font-medium text-gray-400">No disponible</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openEdit(med)}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <Edit2 className="h-4 w-4" />
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacion */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">
                Pagina {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal Agregar */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Agregar medicamento al catalogo</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar en catalogo maestro..."
                  value={maestrosBusqueda}
                  onChange={e => setMaestrosBusqueda(e.target.value)}
                  className="input-field pl-10"
                  autoFocus
                />
              </div>

              {buscandoMaestros && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                </div>
              )}

              {maestros.length > 0 && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {maestros.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => agregarDelMaestro(m)}
                      className="w-full text-left flex items-start gap-3 p-4 border border-gray-100 rounded-xl hover:border-green-300 hover:bg-green-50 transition-colors group"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 text-sm group-hover:text-green-800">{m.nombre}</div>
                        <div className="text-xs text-gray-500">{m.principioActivo} · {m.presentacion}</div>
                        <div className="text-xs text-gray-400">{m.laboratorio}</div>
                      </div>
                      <Plus className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    </button>
                  ))}
                </div>
              )}

              {maestrosBusqueda && !buscandoMaestros && maestros.length === 0 && (
                <div className="flex items-center gap-2 text-gray-400 py-6 justify-center">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm">No se encontraron medicamentos</span>
                </div>
              )}

              {!maestrosBusqueda && (
                <p className="text-center text-sm text-gray-400 py-6">
                  Escribe el nombre del medicamento para buscarlo
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Editar medicamento</h2>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <p className="font-medium text-gray-900">{editingItem.nombre}</p>
                <p className="text-sm text-gray-500">{editingItem.laboratorio}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Precio (COP)
                </label>
                <input
                  type="number"
                  value={editPrecio}
                  onChange={e => setEditPrecio(e.target.value)}
                  className="input-field"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Stock (unidades)
                </label>
                <input
                  type="number"
                  value={editStock}
                  onChange={e => setEditStock(e.target.value)}
                  className="input-field"
                  min="0"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEdit}
                  className="flex-1 flex items-center justify-center gap-2 btn-primary"
                >
                  <Save className="h-4 w-4" />
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
