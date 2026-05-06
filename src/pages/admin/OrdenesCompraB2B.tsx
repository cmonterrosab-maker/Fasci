import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Package, ChevronLeft, ChevronRight, RefreshCw,
  Building2, Phone, Calendar, ChevronDown, ChevronUp,
  Brain, Bell, CheckCircle, XCircle, ImageIcon, Clock,
} from 'lucide-react';
import AdminNavbar from '../../components/AdminNavbar';

function mediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes('twilio.com') || url.includes('api.twilio.com')) {
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  cotizacion:     { label: 'Cotización',     color: 'bg-gray-100 text-gray-700' },
  confirmada:     { label: 'Confirmada',      color: 'bg-blue-100 text-blue-800' },
  pago_pendiente: { label: 'Pago pendiente',  color: 'bg-yellow-100 text-yellow-800' },
  pagada:         { label: 'Pagada',          color: 'bg-green-100 text-green-800' },
  en_preparacion: { label: 'En preparación',  color: 'bg-purple-100 text-purple-800' },
  enviada:        { label: 'Enviada',         color: 'bg-indigo-100 text-indigo-800' },
  entregada:      { label: 'Entregada',       color: 'bg-green-200 text-green-900' },
  cancelada:      { label: 'Cancelada',       color: 'bg-red-100 text-red-800' },
};

const STATUS_ORDEN = ['cotizacion','confirmada','pago_pendiente','pagada','en_preparacion','enviada','entregada','cancelada'];

function formatCOP(v: number) {
  return `$${Number(v || 0).toLocaleString('es-CO')}`;
}

interface DetalleItem {
  id: string;
  nombre_medicamento: string;
  presentacion: string;
  cantidad: number;
  precio_mayorista: number;
  subtotal: number;
}

interface OrdenCompra {
  id: string;
  numero_orden: string;
  status: string;
  subtotal: number;
  descuento: number;
  total: number;
  metodo_pago: string;
  comprobante_url: string | null;
  created_at: string;
  compradora_nombre: string;
  compradora_telefono: string;
  compradora_nit: string;
  droguerias: { nombre: string; ciudad: string } | null;
  detalle_ordenes_compra: DetalleItem[];
}

const PAGE_SIZE = 15;

export default function OrdenesCompraB2B() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cambiandoStatus, setCambiandoStatus] = useState<string | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [showPerfiles, setShowPerfiles] = useState(false);
  const [enviandoAlertas, setEnviandoAlertas] = useState(false);
  const [alertaResultado, setAlertaResultado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (filtroStatus) params.status = filtroStatus;
      const res = await axios.get('/api/admin/ordenes-compra', { params });
      setOrdenes(res.data.ordenes || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, filtroStatus]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarStatus = async (id: string, status: string) => {
    setCambiandoStatus(id);
    try {
      await axios.patch(`/api/admin/ordenes-compra/${id}/status`, { status });
      setOrdenes(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } catch (e) {
      console.error(e);
    } finally {
      setCambiandoStatus(null);
    }
  };

  const aprobar = async (id: string) => {
    setAprobando(id);
    try {
      await axios.post(`/api/admin/ordenes-compra/${id}/aprobar`);
      setOrdenes(prev => prev.map(o => o.id === id ? { ...o, status: 'pagada' } : o));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Error al aprobar');
    } finally {
      setAprobando(null);
    }
  };

  const rechazar = async (id: string) => {
    const motivo = prompt('Motivo del rechazo (opcional):');
    if (motivo === null) return; // canceló el prompt
    setRechazando(id);
    try {
      await axios.post(`/api/admin/ordenes-compra/${id}/rechazar`, { motivo });
      setOrdenes(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelada' } : o));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Error al rechazar');
    } finally {
      setRechazando(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const cargarPerfiles = async () => {
    try {
      const res = await axios.get('/api/admin/b2b/perfiles');
      setPerfiles(res.data.perfiles || []);
      setShowPerfiles(true);
    } catch (e) { console.error(e); }
  };

  const enviarAlertas = async () => {
    setEnviandoAlertas(true);
    setAlertaResultado(null);
    try {
      const res = await axios.post('/api/admin/b2b/enviar-alertas');
      setAlertaResultado(`✅ ${res.data.enviados} alertas enviadas${res.data.errores > 0 ? `, ${res.data.errores} errores` : ''}`);
    } catch (e: any) {
      setAlertaResultado(`❌ Error: ${e?.response?.data?.error || e.message}`);
    } finally {
      setEnviandoAlertas(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <AdminNavbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Órdenes de Compra B2B</h1>
            <p className="text-gray-500 text-sm mt-1">{total} órdenes mayoristas</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cargar} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
              <RefreshCw className="h-4 w-4" /> Actualizar
            </button>
            <button onClick={enviarAlertas} disabled={enviandoAlertas}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
              <Bell className="h-4 w-4" />
              {enviandoAlertas ? 'Enviando...' : 'Enviar alertas'}
            </button>
            <button onClick={cargarPerfiles}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
              <Brain className="h-4 w-4" /> Perfiles IA
            </button>
          </div>
        </div>

        {/* Banner de órdenes pendientes de aprobación */}
        {ordenes.filter(o => o.status === 'pago_pendiente').length > 0 && (
          <div className="mb-5 rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-yellow-800">
                {ordenes.filter(o => o.status === 'pago_pendiente').length} orden(es) pendiente(s) de aprobación
              </p>
              <p className="text-xs text-yellow-600 mt-0.5">Revisar comprobante de pago y aprobar o rechazar.</p>
            </div>
          </div>
        )}

        {alertaResultado && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 text-green-800 text-sm border border-green-200">
            {alertaResultado}
          </div>
        )}

        {showPerfiles && perfiles.length > 0 && (
          <div className="card p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" /> Perfiles de compra predictivos
              </h2>
              <button onClick={() => setShowPerfiles(false)} className="text-xs text-gray-400 hover:text-gray-600">Cerrar</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2">Droguería</th>
                    <th className="px-3 py-2">Medicamento</th>
                    <th className="px-3 py-2 text-right">Pedidos</th>
                    <th className="px-3 py-2 text-right">Cant. prom.</th>
                    <th className="px-3 py-2 text-right">Frecuencia</th>
                    <th className="px-3 py-2">Próximo estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {perfiles.map(p => {
                    const vencido = p.proximo_pedido_estimado && new Date(p.proximo_pedido_estimado) <= new Date();
                    return (
                      <tr key={p.id} className={vencido ? 'bg-yellow-50' : ''}>
                        <td className="px-3 py-2 font-medium text-gray-800">{p.droguerias?.nombre || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{p.nombre_medicamento}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{p.veces_ordenado}×</td>
                        <td className="px-3 py-2 text-right text-gray-600">{Math.round(p.cantidad_promedio)} und</td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {p.frecuencia_dias ? `cada ${p.frecuencia_dias} días` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {p.proximo_pedido_estimado ? (
                            <span className={`font-medium ${vencido ? 'text-red-600' : 'text-gray-700'}`}>
                              {vencido ? '⚠️ ' : ''}
                              {new Date(p.proximo_pedido_estimado).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filtro status */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => { setFiltroStatus(''); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!filtroStatus ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
          >
            Todos
          </button>
          {STATUS_ORDEN.map(s => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => { setFiltroStatus(s); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filtroStatus === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Cargando...</div>
          ) : ordenes.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No hay órdenes B2B</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-4">Orden</th>
                  <th className="px-5 py-4">Droguería</th>
                  <th className="px-5 py-4">Items</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4">Fecha</th>
                  <th className="px-5 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ordenes.map(o => {
                  const cfg = STATUS_CONFIG[o.status] ?? { label: o.status, color: 'bg-gray-100 text-gray-700' };
                  const abierto = expandido === o.id;
                  const nombreDrog = o.droguerias?.nombre || o.compradora_nombre || '—';
                  return (
                    <React.Fragment key={o.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm font-semibold text-gray-800">{o.numero_orden}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{nombreDrog}</div>
                              {o.compradora_telefono && (
                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <Phone className="h-3 w-3" />{o.compradora_telefono}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {(o.detalle_ordenes_compra || []).length} producto(s)
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold text-gray-900">{formatCOP(o.total)}</div>
                          {o.descuento > 0 && (
                            <div className="text-xs text-green-600">-{formatCOP(o.descuento)} desc.</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`badge ${cfg.color}`}>{cfg.label}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(o.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {o.status === 'pago_pendiente' ? (
                              <>
                                <button
                                  onClick={() => aprobar(o.id)}
                                  disabled={aprobando === o.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  {aprobando === o.id ? '...' : 'Aprobar'}
                                </button>
                                <button
                                  onClick={() => rechazar(o.id)}
                                  disabled={rechazando === o.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 disabled:opacity-50"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  {rechazando === o.id ? '...' : 'Rechazar'}
                                </button>
                              </>
                            ) : (
                              <select
                                value={o.status}
                                disabled={cambiandoStatus === o.id}
                                onChange={e => cambiarStatus(o.id, e.target.value)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 disabled:opacity-50"
                              >
                                {STATUS_ORDEN.map(s => (
                                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => setExpandido(abierto ? null : o.id)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                            >
                              {abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td colSpan={7} className="px-5 pb-5 bg-gray-50">
                            <div className="flex gap-4">
                              {/* Comprobante de pago */}
                              <div className="flex-shrink-0 w-48">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                                  <ImageIcon className="h-3.5 w-3.5" /> Comprobante
                                </p>
                                {mediaUrl(o.comprobante_url) ? (
                                  <a href={mediaUrl(o.comprobante_url)!} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={mediaUrl(o.comprobante_url)!}
                                      alt="Comprobante de pago"
                                      className="w-full rounded-xl border border-gray-200 object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                                      style={{ maxHeight: 200 }}
                                    />
                                  </a>
                                ) : (
                                  <div className="w-full h-28 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 text-xs">
                                    Sin comprobante
                                  </div>
                                )}
                                {o.status === 'pago_pendiente' && (
                                  <div className="mt-3 flex flex-col gap-2">
                                    <button onClick={() => aprobar(o.id)} disabled={aprobando === o.id}
                                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      {aprobando === o.id ? 'Aprobando...' : 'Aprobar y despachar'}
                                    </button>
                                    <button onClick={() => rechazar(o.id)} disabled={rechazando === o.id}
                                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 disabled:opacity-50">
                                      <XCircle className="h-3.5 w-3.5" />
                                      {rechazando === o.id ? 'Rechazando...' : 'Rechazar'}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Detalle de productos */}
                              <div className="flex-1 rounded-lg border border-gray-100 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-100">
                                    <tr className="text-gray-500 uppercase tracking-wider">
                                      <th className="px-4 py-2 text-left">Medicamento</th>
                                      <th className="px-4 py-2 text-right">Cant.</th>
                                      <th className="px-4 py-2 text-right">Precio unit.</th>
                                      <th className="px-4 py-2 text-right">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 bg-white">
                                    {(o.detalle_ordenes_compra || []).map(item => (
                                      <tr key={item.id}>
                                        <td className="px-4 py-2 font-medium text-gray-800">
                                          {item.nombre_medicamento}
                                          {item.presentacion && <span className="text-gray-400 ml-1">({item.presentacion})</span>}
                                        </td>
                                        <td className="px-4 py-2 text-right text-gray-600">{item.cantidad}</td>
                                        <td className="px-4 py-2 text-right text-gray-600">{formatCOP(item.precio_mayorista)}</td>
                                        <td className="px-4 py-2 text-right font-semibold text-gray-800">{formatCOP(item.subtotal)}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-gray-50">
                                      <td colSpan={3} className="px-4 py-2 text-right font-semibold text-gray-700">Total orden:</td>
                                      <td className="px-4 py-2 text-right font-bold text-green-700">{formatCOP(o.total)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
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
