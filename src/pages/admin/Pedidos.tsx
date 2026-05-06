import React, { useState, useEffect } from 'react';
import axios from 'axios';

function mediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes('twilio.com') || url.includes('api.twilio.com')) {
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
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
  ChevronLeft,
  ChevronRight,
  Camera,
  CreditCard,
  Phone,
  Hash,
  ShieldCheck,
  Copy,
  ExternalLink,
} from 'lucide-react';
import AdminNavbar from '../../components/AdminNavbar';

type EstadoPedido = 'pendiente' | 'pendiente_pago' | 'confirmado' | 'en_preparacion' | 'en_camino' | 'entregado' | 'cancelado';

interface Item {
  nombre_medicamento: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface MediaMeta {
  sha256: string;
  file_size_bytes: number;
  content_type: string;
  twilio_message_sid: string | null;
  received_at: string;
  sender_phone: string;
}

interface PedidoAdmin {
  id: string;
  numero: string;
  drogueria: string;
  ciudad: string;
  cliente: string;
  clienteTelefono: string;
  clienteDireccion: string;
  total: number;
  costoEnvio: number;
  estado: EstadoPedido;
  itemsCount: number;
  createdAt: string;
  entregadoAt: string | null;
  fotoEntregaUrl: string | null;
  fotoEntregaMeta: MediaMeta | null;
  comprobanteUrl: string | null;
  comprobanteMeta: MediaMeta | null;
  mensajeroNombre: string | null;
  mensajeroTelefono: string | null;
}

interface PedidoDetalle extends PedidoAdmin {
  items: Item[];
}

const MOCK_PEDIDOS: PedidoAdmin[] = [
  { id: '1', numero: '#1045', drogueria: 'Drogueria La Salud', ciudad: 'Bogota', cliente: 'Carlos M.', clienteTelefono: '', clienteDireccion: '', total: 45000, costoEnvio: 4000, estado: 'pendiente', itemsCount: 3, createdAt: new Date().toISOString(), entregadoAt: null, fotoEntregaUrl: null, fotoEntregaMeta: null, comprobanteUrl: null, comprobanteMeta: null, mensajeroNombre: null, mensajeroTelefono: null },
  { id: '2', numero: '#1044', drogueria: 'Farmacia El Alivio', ciudad: 'Medellin', cliente: 'Maria G.', clienteTelefono: '', clienteDireccion: '', total: 28500, costoEnvio: 4000, estado: 'en_camino', itemsCount: 2, createdAt: new Date(Date.now() - 1800000).toISOString(), entregadoAt: null, fotoEntregaUrl: null, fotoEntregaMeta: null, comprobanteUrl: null, comprobanteMeta: null, mensajeroNombre: 'Juan', mensajeroTelefono: null },
  { id: '3', numero: '#1043', drogueria: 'Drogueria La Salud', ciudad: 'Bogota', cliente: 'Juan P.', clienteTelefono: '', clienteDireccion: '', total: 67000, costoEnvio: 4000, estado: 'entregado', itemsCount: 4, createdAt: new Date(Date.now() - 3600000).toISOString(), entregadoAt: new Date(Date.now() - 1800000).toISOString(), fotoEntregaUrl: null, fotoEntregaMeta: null, comprobanteUrl: null, comprobanteMeta: null, mensajeroNombre: 'Pedro', mensajeroTelefono: null },
];

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente:      { label: 'Pendiente',      color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3.5 w-3.5" /> },
  pendiente_pago: { label: 'Pend. Pago',     color: 'bg-orange-100 text-orange-700', icon: <CreditCard className="h-3.5 w-3.5" /> },
  confirmado:     { label: 'Confirmado',     color: 'bg-blue-100 text-blue-800',     icon: <CheckCircle className="h-3.5 w-3.5" /> },
  en_preparacion: { label: 'En preparacion', color: 'bg-purple-100 text-purple-800', icon: <Package className="h-3.5 w-3.5" /> },
  en_camino:      { label: 'En camino',      color: 'bg-orange-100 text-orange-800', icon: <Truck className="h-3.5 w-3.5" /> },
  entregado:      { label: 'Entregado',      color: 'bg-green-100 text-green-800',   icon: <CheckCircle className="h-3.5 w-3.5" /> },
  cancelado:      { label: 'Cancelado',      color: 'bg-red-100 text-red-800',       icon: <XCircle className="h-3.5 w-3.5" /> },
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

function fmtDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function mapPedido(p: any): PedidoAdmin {
  return {
    id:               p.id,
    numero:           p.numero_pedido ?? p.numero ?? `#${p.id?.slice(0, 6)}`,
    drogueria:        p.droguerias?.nombre ?? p.drogueria ?? 'Bot WhatsApp',
    ciudad:           p.droguerias?.ciudad ?? p.ciudad ?? '—',
    cliente:          p.cliente_nombre ?? p.cliente ?? 'Cliente',
    clienteTelefono:  p.cliente_telefono ?? '',
    clienteDireccion: p.cliente_direccion ?? '',
    total:            p.total ?? 0,
    costoEnvio:       p.costo_domicilio ?? 4000,
    estado:           p.status ?? p.estado ?? 'pendiente',
    itemsCount:       p.itemsCount ?? (p.detalle_pedidos?.length ?? 0),
    createdAt:        p.created_at ?? p.createdAt ?? new Date().toISOString(),
    entregadoAt:      p.entregado_at ?? null,
    fotoEntregaUrl:   p.foto_entrega_url    ?? null,
    fotoEntregaMeta:  p.foto_entrega_meta   ?? null,
    comprobanteUrl:   p.comprobante_url     ?? null,
    comprobanteMeta:  p.comprobante_meta    ?? null,
    mensajeroNombre:  p.mensajeros?.nombre  ?? null,
    mensajeroTelefono: p.mensajeros?.telefono ?? null,
  };
}

// ─── Metadata verification panel ─────────────────────────────────────────────

function MetaPanel({ meta, label }: { meta: MediaMeta; label: string }) {
  const [copied, setCopied] = React.useState(false);

  const copyHash = () => {
    navigator.clipboard.writeText(meta.sha256).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const fmtBytes = (b: number) => b < 1024 * 1024
    ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / (1024 * 1024)).toFixed(2)} MB`;

  const twilioLogUrl = meta.twilio_message_sid
    ? `https://console.twilio.com/us1/monitor/logs/sms/${meta.twilio_message_sid}`
    : null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-100 border-b border-emerald-200">
        <ShieldCheck className="h-4 w-4 text-emerald-700" />
        <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">{label} — Verificación</span>
      </div>
      <div className="px-4 py-3 space-y-2 text-xs">
        {/* Hash */}
        <div>
          <div className="text-gray-500 mb-0.5">SHA-256 (integridad)</div>
          <div className="flex items-center gap-2">
            <code className="text-[10px] font-mono text-gray-700 bg-white rounded px-2 py-1 border border-gray-200 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {meta.sha256}
            </code>
            <button onClick={copyHash} className="shrink-0 text-gray-400 hover:text-emerald-700">
              <Copy className="h-3.5 w-3.5" />
            </button>
            {copied && <span className="text-emerald-600 text-xs">¡Copiado!</span>}
          </div>
        </div>
        {/* Grid of quick facts */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div><span className="text-gray-400">Tipo: </span><span className="text-gray-700">{meta.content_type}</span></div>
          <div><span className="text-gray-400">Tamaño: </span><span className="text-gray-700">{fmtBytes(meta.file_size_bytes)}</span></div>
          <div><span className="text-gray-400">Recibido: </span><span className="text-gray-700">{new Date(meta.received_at).toLocaleString('es-CO', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span></div>
          <div><span className="text-gray-400">Teléfono: </span><span className="text-gray-700">{meta.sender_phone}</span></div>
        </div>
        {/* Twilio SID */}
        {meta.twilio_message_sid && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">MessageSid: </span>
            <code className="text-[10px] font-mono text-gray-700">{meta.twilio_message_sid}</code>
            {twilioLogUrl && (
              <a href={twilioLogUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ pedidoId, onClose }: { pedidoId: string; onClose: () => void }) {
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`/api/admin/pedidos/${pedidoId}`)
      .then(res => {
        const p = res.data;
        setDetalle({
          ...mapPedido(p),
          items: p.detalle_pedidos ?? [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pedidoId]);

  const conf = detalle ? (ESTADO_CONFIG[detalle.estado] ?? { label: detalle.estado, color: 'bg-gray-100 text-gray-800', icon: null }) : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{detalle?.numero ?? '...'}</h2>
            {conf && (
              <span className={`badge ${conf.color} flex items-center gap-1 w-fit mt-1`}>
                {conf.icon}{conf.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : !detalle ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">No se pudo cargar el pedido</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Tiempos */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400 mb-0.5">Creado</div>
                <div className="text-sm font-medium text-gray-700">{fmtDateTime(detalle.createdAt)}</div>
              </div>
              {detalle.entregadoAt && (
                <div className="bg-green-50 rounded-xl p-3">
                  <div className="text-xs text-green-600 mb-0.5">Entregado</div>
                  <div className="text-sm font-medium text-green-700">{fmtDateTime(detalle.entregadoAt)}</div>
                </div>
              )}
            </div>

            {/* Droguería y mensajero */}
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                <Store className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{detalle.drogueria}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{detalle.ciudad}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                <User className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{detalle.cliente}</div>
                  {detalle.clienteTelefono && (
                    <div className="text-xs text-gray-400 flex items-center gap-1"><Phone className="h-3 w-3" />{detalle.clienteTelefono}</div>
                  )}
                  {detalle.clienteDireccion && (
                    <div className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{detalle.clienteDireccion}</div>
                  )}
                </div>
              </div>
              {detalle.mensajeroNombre && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <Truck className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{detalle.mensajeroNombre}</div>
                    {detalle.mensajeroTelefono && (
                      <div className="text-xs text-gray-400 flex items-center gap-1"><Phone className="h-3 w-3" />{detalle.mensajeroTelefono}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Items */}
            {detalle.items.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Productos</h3>
                <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                  {detalle.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <div>
                        <div className="text-sm text-gray-800">{item.nombre_medicamento}</div>
                        <div className="text-xs text-gray-400">x{item.cantidad} × {formatCurrency(item.precio_unitario)}</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-700">{formatCurrency(item.subtotal)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="flex justify-between px-4 py-2.5 bg-gray-50">
                <span className="text-sm text-gray-500">Subtotal productos</span>
                <span className="text-sm text-gray-700">{formatCurrency(detalle.total - detalle.costoEnvio)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                <span className="text-sm text-gray-500">Envío</span>
                <span className="text-sm text-gray-700">{formatCurrency(detalle.costoEnvio)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-white border-t border-gray-200">
                <span className="text-sm font-bold text-gray-900">Total</span>
                <span className="text-sm font-bold text-green-700">{formatCurrency(detalle.total)}</span>
              </div>
            </div>

            {/* Comprobante de pago */}
            {detalle.comprobanteUrl && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />Comprobante de pago
                </h3>
                <img
                  src={mediaUrl(detalle.comprobanteUrl)!}
                  alt="Comprobante de pago"
                  className="w-full rounded-xl border border-gray-200 cursor-zoom-in object-cover max-h-64"
                  onClick={() => setFotoAmpliada(mediaUrl(detalle.comprobanteUrl))}
                />
                {detalle.comprobanteMeta && (
                  <MetaPanel meta={detalle.comprobanteMeta} label="Comprobante" />
                )}
              </div>
            )}

            {/* Foto de entrega */}
            {detalle.fotoEntregaUrl ? (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />Foto de entrega
                </h3>
                <div className="relative">
                  <img
                    src={mediaUrl(detalle.fotoEntregaUrl)!}
                    alt="Foto de entrega"
                    className="w-full rounded-xl border-2 border-green-300 cursor-zoom-in object-cover max-h-72"
                    onClick={() => setFotoAmpliada(mediaUrl(detalle.fotoEntregaUrl))}
                  />
                  <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />Entregado
                  </div>
                </div>
                {detalle.fotoEntregaMeta && (
                  <MetaPanel meta={detalle.fotoEntregaMeta} label="Foto entrega" />
                )}
              </div>
            ) : detalle.estado === 'entregado' ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-gray-400 text-sm">
                <Camera className="h-6 w-6 mx-auto mb-2 opacity-40" />
                Sin foto de entrega registrada
              </div>
            ) : null}

          </div>
        )}
      </div>

      {/* Lightbox */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <img src={fotoAmpliada} alt="Vista ampliada" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPedidos() {
  const [pedidos, setPedidos] = useState<PedidoAdmin[]>(MOCK_PEDIDOS);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPedidos = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/admin/pedidos');
        const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.pedidos ?? res.data?.data ?? []);
        setPedidos(raw.map(mapPedido));
      } catch {}
      finally { setLoading(false); }
    };
    fetchPedidos();
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
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 mb-6">
          {Object.entries(ESTADO_CONFIG).map(([key, conf]) => (
            <button
              key={key}
              onClick={() => { setFiltroEstado(filtroEstado === key ? 'todos' : key); setPage(1); }}
              className={`rounded-xl p-3 text-center transition-all border-2 ${
                filtroEstado === key ? 'border-green-600 shadow-md' : 'border-transparent'
              } ${conf.color.split(' ')[0]}`}
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
                    const conf = ESTADO_CONFIG[p.estado] ?? { label: p.estado, color: 'bg-gray-100 text-gray-800', icon: null };
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-green-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedId(p.id)}
                      >
                        <td className="px-6 py-4 font-mono font-bold text-gray-900 text-sm">{p.numero}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-green-600 flex-shrink-0" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{p.drogueria}</div>
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <MapPin className="h-3 w-3" />{p.ciudad}
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
                          <div className="flex items-center gap-2">
                            <span className={`badge ${conf.color} flex items-center gap-1 w-fit`}>
                              {conf.icon}{conf.label}
                            </span>
                            {p.fotoEntregaUrl && (
                              <span title="Foto de entrega disponible"><Camera className="h-4 w-4 text-green-500" /></span>
                            )}
                          </div>
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

      {selectedId && (
        <DetailDrawer pedidoId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
