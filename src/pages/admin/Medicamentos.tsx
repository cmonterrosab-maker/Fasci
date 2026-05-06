import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Search,
  Plus,
  Edit2,
  ShieldAlert,
  X,
  Loader2,
  Save,
  ChevronLeft,
  ChevronRight,
  Pill,
} from 'lucide-react';
import AdminNavbar from '../../components/AdminNavbar';

interface MedicamentoMaestro {
  id: string;
  nombre: string;
  principioActivo: string;
  presentacion: string;
  laboratorio: string;
  categoria: string;
  requiereFormula: boolean;
  codigoEAN?: string;
}

const MOCK_MEDICAMENTOS: MedicamentoMaestro[] = [
  { id: '1', nombre: 'Acetaminofen 500mg x 10', principioActivo: 'Acetaminofen', presentacion: 'Tabletas x 10', laboratorio: 'Genfar', categoria: 'Analgesico', requiereFormula: false, codigoEAN: '7702045001' },
  { id: '2', nombre: 'Ibuprofeno 400mg x 10', principioActivo: 'Ibuprofeno', presentacion: 'Tabletas x 10', laboratorio: 'Lafrancol', categoria: 'Analgesico', requiereFormula: false },
  { id: '3', nombre: 'Amoxicilina 500mg x 10', principioActivo: 'Amoxicilina', presentacion: 'Capsulas x 10', laboratorio: 'Genfar', categoria: 'Antibiotico', requiereFormula: true },
  { id: '4', nombre: 'Loratadina 10mg x 10', principioActivo: 'Loratadina', presentacion: 'Tabletas x 10', laboratorio: 'Bayer', categoria: 'Antihistaminico', requiereFormula: false },
  { id: '5', nombre: 'Omeprazol 20mg x 14', principioActivo: 'Omeprazol', presentacion: 'Capsulas x 14', laboratorio: 'Tecnoquimicas', categoria: 'Gastroprotector', requiereFormula: false },
  { id: '6', nombre: 'Metformina 850mg x 30', principioActivo: 'Metformina', presentacion: 'Tabletas x 30', laboratorio: 'Genfar', categoria: 'Antidiabetico', requiereFormula: true },
  { id: '7', nombre: 'Enalapril 10mg x 30', principioActivo: 'Enalapril', presentacion: 'Tabletas x 30', laboratorio: 'Lafrancol', categoria: 'Antihipertensivo', requiereFormula: true },
];

const CATEGORIAS = ['Todos', 'Analgesico', 'Antibiotico', 'Antihistaminico', 'Gastroprotector', 'Antidiabetico', 'Antihipertensivo', 'Vitamina', 'Otro'];
const PAGE_SIZE = 10;

const FORM_INITIAL = {
  nombre: '',
  principioActivo: '',
  presentacion: '',
  laboratorio: '',
  categoria: 'Analgesico',
  requiereFormula: false,
  codigoEAN: '',
};

export default function AdminMedicamentos() {
  const [medicamentos, setMedicamentos] = useState<MedicamentoMaestro[]>(MOCK_MEDICAMENTOS);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('Todos');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MedicamentoMaestro | null>(null);
  const [form, setForm] = useState(FORM_INITIAL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/admin/medicamentos');
        const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.medicamentos ?? []);
        setMedicamentos(data);
      } catch {}
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(FORM_INITIAL);
    setShowModal(true);
  };

  const openEdit = (med: MedicamentoMaestro) => {
    setEditing(med);
    setForm({
      nombre: med.nombre,
      principioActivo: med.principioActivo,
      presentacion: med.presentacion,
      laboratorio: med.laboratorio,
      categoria: med.categoria,
      requiereFormula: med.requiereFormula,
      codigoEAN: med.codigoEAN || '',
    });
    setShowModal(true);
  };

  const saveForm = async () => {
    setSaving(true);
    try {
      if (editing) {
        const updated = { ...editing, ...form };
        setMedicamentos(prev => prev.map(m => m.id === editing.id ? updated : m));
        await axios.put(`/api/admin/medicamentos/${editing.id}`, form);
      } else {
        const nuevo: MedicamentoMaestro = { id: `new-${Date.now()}`, ...form };
        setMedicamentos(prev => [nuevo, ...prev]);
        await axios.post('/api/admin/medicamentos', form);
      }
      setShowModal(false);
    } catch {}
    finally { setSaving(false); }
  };

  const filtrados = medicamentos.filter(m => {
    const matchBusqueda = m.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.principioActivo.toLowerCase().includes(busqueda.toLowerCase());
    const matchCat = categoria === 'Todos' || m.categoria === categoria;
    return matchBusqueda && matchCat;
  });

  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE);
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <AdminNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Catalogo Maestro de Medicamentos</h1>
            <p className="text-gray-500 text-sm mt-1">{medicamentos.length} medicamentos registrados</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 btn-primary">
            <Plus className="h-4 w-4" />
            Agregar medicamento
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o principio activo..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(1); }}
              className="input-field pl-10"
            />
          </div>
          <select
            value={categoria}
            onChange={e => { setCategoria(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Medicamento</th>
                  <th className="px-6 py-4">Principio activo</th>
                  <th className="px-6 py-4">Presentacion</th>
                  <th className="px-6 py-4">Laboratorio</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">Formula</th>
                  <th className="px-6 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto" /></td></tr>
                ) : paginados.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No se encontraron medicamentos</td></tr>
                ) : (
                  paginados.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="bg-green-50 p-1.5 rounded-lg">
                            <Pill className="h-4 w-4 text-green-600" />
                          </div>
                          <span className="font-medium text-gray-900 text-sm">{m.nombre}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{m.principioActivo}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{m.presentacion}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{m.laboratorio}</td>
                      <td className="px-6 py-4">
                        <span className="badge bg-gray-100 text-gray-700">{m.categoria}</span>
                      </td>
                      <td className="px-6 py-4">
                        {m.requiereFormula ? (
                          <div className="flex items-center gap-1 text-orange-600">
                            <ShieldAlert className="h-4 w-4" />
                            <span className="text-xs font-medium">Si</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button onClick={() => openEdit(m)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">Pagina {page} de {totalPages}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-100 rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? 'Editar medicamento' : 'Nuevo medicamento'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { key: 'nombre', label: 'Nombre completo', placeholder: 'Ej: Acetaminofen 500mg x 10' },
                { key: 'principioActivo', label: 'Principio activo', placeholder: 'Ej: Acetaminofen' },
                { key: 'presentacion', label: 'Presentacion', placeholder: 'Ej: Tabletas x 10' },
                { key: 'laboratorio', label: 'Laboratorio', placeholder: 'Ej: Genfar' },
                { key: 'codigoEAN', label: 'Codigo EAN (opcional)', placeholder: 'Ej: 7702045001' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
                  <input
                    type="text"
                    value={form[field.key as keyof typeof form] as string}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="input-field"
                  />
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={e => setForm(prev => ({ ...prev, categoria: e.target.value }))}
                  className="input-field"
                >
                  {CATEGORIAS.filter(c => c !== 'Todos').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requiereFormula}
                  onChange={e => setForm(prev => ({ ...prev, requiereFormula: e.target.checked }))}
                  className="w-4 h-4 text-green-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Requiere formula medica</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 btn-secondary">Cancelar</button>
                <button
                  onClick={saveForm}
                  disabled={saving || !form.nombre.trim()}
                  className="flex-1 flex items-center justify-center gap-2 btn-primary"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editing ? 'Guardar cambios' : 'Crear medicamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
