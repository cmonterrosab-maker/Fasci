# 💊 Droguería Virtual

Plataforma de farmacias colombianas con WhatsApp Bot para búsqueda y pedido de medicamentos. Basada en la arquitectura de Speady, adaptada para el sector farmacéutico.

---

## Arquitectura general

```
Drogueria virtual/
├── backend/                     # Node.js + Express
│   ├── server/
│   │   ├── index.js             # Servidor principal + API REST
│   │   └── bot.js               # Lógica del Bot de WhatsApp
│   ├── services/
│   │   ├── medicamento-service.js   # Búsqueda y gestión de medicamentos
│   │   ├── catalogo-service.js      # Catálogo por droguería (precios/stock)
│   │   ├── pedido-service.js        # Gestión de pedidos
│   │   ├── inventario-service.js    # Control de inventario
│   │   ├── whatsapp-service.js      # Envío de mensajes via Twilio
│   │   ├── security-service.js      # Validaciones y sanitización
│   │   └── cache-service.js         # Cache en memoria
│   ├── middleware/
│   │   └── security.js          # Rate limiting, CORS, Helmet
│   └── config/
│       └── nlu-config.json      # Intents del bot
├── src/                         # Frontend React + TypeScript
│   ├── pages/
│   │   ├── Index.tsx            # Landing page pública
│   │   ├── Login.tsx            # Login droguerías
│   │   ├── drogueria/
│   │   │   ├── Dashboard.tsx    # Panel principal de la droguería
│   │   │   ├── Catalogo.tsx     # Gestión del catálogo
│   │   │   ├── Pedidos.tsx      # Gestión de pedidos
│   │   │   └── Inventario.tsx   # Control de inventario
│   │   └── admin/
│   │       ├── Dashboard.tsx    # Panel de administración
│   │       ├── Droguerias.tsx   # Gestión de droguerías
│   │       ├── Medicamentos.tsx # Catálogo maestro
│   │       └── Pedidos.tsx      # Todos los pedidos
│   └── contexts/
│       ├── DrogueriaAuthContext.tsx
│       └── AdminAuthContext.tsx
└── supabase/
    └── schema.sql               # Esquema completo de base de datos
```

---

## Flujos del Bot de WhatsApp

El cliente interactúa con el bot vía Twilio + WhatsApp:

1. **Búsqueda de medicamentos** — Busca por nombre, muestra disponibilidad y precios en droguerías cercanas
2. **Hacer un pedido** — Agrega al carrito, elige domicilio o recoge en tienda, paga con Nequi/Daviplata/efectivo
3. **Ver mis pedidos** — Consulta el estado de pedidos anteriores
4. **Registro de droguería** — Flujo para que nuevas droguerías se registren en la plataforma

---

## Configuración inicial

### 1. Clonar y configurar variables

```bash
cp .env.example .env.local
# Editar con las credenciales reales de Supabase, Twilio, etc.
```

### 2. Base de datos

Ejecutar en el editor SQL de Supabase:
```bash
# Abrir supabase/schema.sql y ejecutar completo
```
El schema crea las 7 tablas, índices, triggers, RLS y carga datos iniciales (10 categorías + 20 medicamentos comunes colombianos).

### 3. Backend

```bash
cd backend
npm install
npm run dev      # Desarrollo (nodemon)
npm start        # Producción
```

El servidor corre en `http://localhost:3000`.

### 4. Frontend

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # Build de producción
```

### 5. Configurar Webhook en Twilio

En la consola de Twilio, configurar el webhook de WhatsApp:
- URL: `https://tu-dominio.com/webhook/whatsapp`
- Método: `POST`

---

## Base de datos (Supabase)

| Tabla | Descripción |
|-------|-------------|
| `droguerias` | Farmacias registradas en la plataforma |
| `medicamentos` | Catálogo maestro de medicamentos |
| `categorias_medicamentos` | Categorías (Analgésicos, Antibióticos, etc.) |
| `catalogos` | Medicamentos por droguería con precio y stock |
| `pedidos` | Pedidos de clientes |
| `detalle_pedidos` | Items de cada pedido |
| `bot_sessions` | Estado de conversaciones WhatsApp |

---

## API REST

### Endpoints públicos
- `GET /api/medicamentos/buscar?q=acetaminofen`
- `GET /api/medicamentos/categorias`
- `GET /api/droguerias?ciudad=bogota`

### Portal Droguería
- `GET /api/drogueria/:id/stats`
- `GET/POST /api/drogueria/:id/catalogo`
- `GET /api/drogueria/:id/pedidos`
- `PUT /api/drogueria/pedidos/:id/status`
- `GET /api/drogueria/:id/inventario`
- `GET /api/drogueria/:id/alertas-stock`

### Admin
- `GET /api/admin/stats`
- `GET /api/admin/droguerias`
- `PUT /api/admin/droguerias/:id/status`
- `GET/POST /api/admin/medicamentos`

### WhatsApp
- `POST /webhook/whatsapp` (Twilio)

---

## Stack tecnológico

**Backend:** Node.js 18+, Express, Twilio SDK, Supabase JS, Fuse.js, Helmet, bcryptjs  
**Frontend:** React 18, TypeScript, Vite, TailwindCSS, Recharts, Lucide Icons  
**Base de datos:** PostgreSQL via Supabase  
**WhatsApp:** Twilio Messaging API  

---

## Próximos pasos sugeridos

- [ ] Notificaciones push al dueño cuando llega un pedido nuevo
- [ ] Sistema de calificaciones de droguerías
- [ ] Integración con geolocalización para mostrar droguerías más cercanas
- [ ] Módulo de fórmulas médicas (validación con INVIMA)
- [ ] Dashboard de métricas avanzadas con exportación a Excel
- [ ] App móvil para droguerías (gestión de pedidos desde el celular)
