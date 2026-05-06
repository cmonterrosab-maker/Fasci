import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Actualiza el centro del mapa cuando cambian las coordenadas (MapContainer.center es initial-only)
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center[0], center[1]]);
  return null;
}

// Centro de Cartagena por defecto
const CENTRO_CARTAGENA: [number, number] = [10.3997, -75.5144];

type Mensajero = {
  id: string;
  nombre: string;
  telefono: string;
  vehiculo: string;
  ultima_lat: number | null;
  ultima_lng: number | null;
  ultima_ubicacion_at: string | null;
  min_sin_gps: number | null;
  pedido_actual_id: string | null;
  disponible: boolean;
  pedido_activo: any;
};

// Iconos personalizados con colores según estado
function crearIcono(color: string, emoji: string) {
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 36px; height: 36px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
      ">
        <span style="transform: rotate(45deg); font-size: 18px;">${emoji}</span>
      </div>
    `,
    className: 'custom-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

const ICONO_DISPONIBLE = crearIcono('#10b981', '🛵');
const ICONO_OCUPADO    = crearIcono('#3b82f6', '📦');
const ICONO_INACTIVO   = crearIcono('#9ca3af', '⏸️');

export default function MapaMensajeros({ mensajeros }: { mensajeros: Mensajero[] }) {
  // Filtrar solo los que tienen GPS
  const conGPS = mensajeros.filter(m => m.ultima_lat && m.ultima_lng);

  // Calcular centro del mapa basado en mensajeros (si los hay)
  const centro: [number, number] = conGPS.length > 0
    ? [
        conGPS.reduce((s, m) => s + (m.ultima_lat || 0), 0) / conGPS.length,
        conGPS.reduce((s, m) => s + (m.ultima_lng || 0), 0) / conGPS.length,
      ]
    : CENTRO_CARTAGENA;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">📍 Mapa en vivo</h3>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Disponible
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-500" /> En entrega
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-400" /> Inactivo
          </span>
        </div>
      </div>

      <div style={{ height: '500px', width: '100%' }}>
        <MapContainer
          center={centro}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <ChangeView center={centro} />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {conGPS.map(m => {
            const icono = !m.disponible && m.pedido_actual_id
              ? ICONO_OCUPADO
              : m.disponible
                ? ICONO_DISPONIBLE
                : ICONO_INACTIVO;

            const lat = m.ultima_lat as number;
            const lng = m.ultima_lng as number;

            return (
              <div key={m.id}>
                <Marker position={[lat, lng]} icon={icono}>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold text-gray-900 mb-1">{m.nombre}</div>
                      <div className="text-gray-600">📞 {m.telefono}</div>
                      <div className="text-gray-600">🛵 {m.vehiculo}</div>
                      {m.min_sin_gps !== null && (
                        <div className="text-xs mt-1 text-gray-500">
                          Última actualización: hace {m.min_sin_gps}min
                        </div>
                      )}
                      {m.pedido_activo && (
                        <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                          <div className="font-semibold text-blue-900">
                            En entrega: {m.pedido_activo.numero_pedido}
                          </div>
                          <div>Cliente: {m.pedido_activo.cliente_nombre || 'N/A'}</div>
                        </div>
                      )}
                      <a
                        href={`https://maps.google.com/?q=${lat},${lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 text-xs mt-2 inline-block hover:underline"
                      >
                        Abrir en Google Maps →
                      </a>
                    </div>
                  </Popup>
                </Marker>

                {/* Círculo de cobertura aproximada (1km) si está disponible */}
                {m.disponible && !m.pedido_actual_id && (
                  <Circle
                    center={[lat, lng]}
                    radius={1000}
                    pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.05, weight: 1 }}
                  />
                )}
              </div>
            );
          })}
        </MapContainer>
      </div>

      {conGPS.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          <p>📭 Ningún mensajero ha compartido su ubicación recientemente.</p>
          <p className="text-xs mt-2">Pídeles que envíen su ubicación en vivo desde WhatsApp.</p>
        </div>
      )}
    </div>
  );
}
