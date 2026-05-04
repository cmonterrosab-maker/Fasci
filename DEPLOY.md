# Deploy en Render — Droguería Virtual

## Antes de empezar

Necesitas tener listo:
- [ ] Cuenta en [render.com](https://render.com)
- [ ] Proyecto en Supabase creado y schema ejecutado
- [ ] Número de WhatsApp Business aprobado en Twilio
- [ ] Código en un repositorio de GitHub (público o privado)

---

## Paso 1 — Subir el código a GitHub

```bash
git init
git add .
git commit -m "feat: drogueria virtual v1.0"
git remote add origin https://github.com/tu-usuario/drogueria-virtual.git
git push -u origin main
```

---

## Paso 2 — Crear los servicios en Render

### Opción A: Blueprint (automático con render.yaml)

1. En Render → **New** → **Blueprint**
2. Conectar el repositorio de GitHub
3. Render detecta el `render.yaml` y crea los dos servicios automáticamente
4. Ir a **Paso 3** para configurar las variables de entorno

### Opción B: Manual

**Backend (Web Service):**
1. New → Web Service → conectar repo
2. Configurar:
   - Name: `drogueria-api`
   - Runtime: `Node`
   - Region: `Oregon`
   - Plan: **Starter ($7/mes)** ← obligatorio, no usar Free
   - Build Command: `cd backend && npm install --production`
   - Start Command: `cd backend && node server/index.js`
   - Health Check Path: `/health`

**Frontend (Static Site):**
1. New → Static Site → conectar repo
2. Configurar:
   - Name: `drogueria-panel`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`

---

## Paso 3 — Variables de entorno en Render

En el servicio **drogueria-api** → Environment → agregar:

| Variable | Valor | Dónde conseguirlo |
|---|---|---|
| `NODE_ENV` | `production` | — |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Supabase → Settings → API → service_role |
| `SUPABASE_ANON_KEY` | `eyJ...` | Supabase → Settings → API → anon |
| `TWILIO_ACCOUNT_SID` | `ACxxx` | Twilio Console |
| `TWILIO_AUTH_TOKEN` | `xxx` | Twilio Console |
| `TWILIO_WHATSAPP_NUMBER` | `whatsapp:+57XXXXXXXXXX` | Twilio Console |
| `META_PHONE_NUMBER` | `57XXXXXXXXXX` | Solo dígitos |
| `API_URL` | `https://drogueria-api.onrender.com` | URL que asigna Render |
| `NEQUI_NUMERO` | `3XXXXXXXXX` | Número Nequi del distribuidor |
| `DAVIPLATA_NUMERO` | `3XXXXXXXXX` | Número Daviplata del distribuidor |
| `NOMBRE_CUENTA` | `Droguería Virtual SAS` | Nombre de la cuenta de pago |
| `COSTO_DOMICILIO` | `4000` | — |
| `RESEND_API_KEY` | `re_xxx` | resend.com |
| `FROM_EMAIL` | `no-reply@tudominio.com` | — |
| `JWT_SECRET` | *(generar con Render)* | Render lo genera automáticamente |

En el servicio **drogueria-panel** → Environment → agregar:

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://drogueria-api.onrender.com` |
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (anon key, NO la service key) |

---

## Paso 4 — Configurar Supabase

1. Ir a [supabase.com](https://supabase.com) → tu proyecto
2. SQL Editor → pegar el contenido completo de `supabase/schema.sql` → Run
3. Verificar que las tablas se crearon en Table Editor
4. En Authentication → URL Configuration:
   - Site URL: `https://drogueria-panel.onrender.com`
   - Redirect URLs: `https://drogueria-panel.onrender.com/*`

---

## Paso 5 — Configurar Twilio

1. Twilio Console → Messaging → WhatsApp Senders
2. En el número aprobado → Webhook:
   - **When a message comes in:**
     `https://drogueria-api.onrender.com/webhook/whatsapp`
   - Método: `HTTP POST`
3. Guardar

---

## Paso 6 — Verificar que todo funciona

```bash
# Health check del backend
curl https://drogueria-api.onrender.com/health

# Respuesta esperada:
# {"status":"ok","service":"drogueria-virtual","timestamp":"..."}
```

Luego enviar un mensaje al número de WhatsApp y verificar que el bot responde.

---

## Paso 7 — Carga inicial de datos

Antes de abrir al público, cargar en Supabase:

1. **Mensajeros**: Insertar al menos 3 mensajeros activos en Cartagena con sus teléfonos
2. **Catálogo**: Cargar los medicamentos reales del distribuidor con precios y stock
3. **Fee**: Verificar que `configuracion_fee` tiene el porcentaje correcto (default: 12%)
4. **Droguería propia**: Registrar la bodega/punto del distribuidor en la tabla `droguerias` con sus coordenadas GPS en Cartagena

---

## Monitoreo post-lanzamiento

- Render Dashboard → Logs: ver errores en tiempo real
- Supabase Dashboard → Logs: queries lentas o errores
- Twilio Console → Monitor: mensajes enviados/fallidos
- `/api/fee/resumen`: verificar que los fees se están registrando

---

## Costos mensuales estimados

| Servicio | Plan | Costo |
|---|---|---|
| Render Backend | Starter | $7 USD/mes |
| Render Frontend | Static Site | Gratis |
| Supabase | Free (hasta 500MB) | $0 / $25 USD |
| Twilio WhatsApp | Por mensaje | ~$0.005 USD/msg |
| Resend Email | Free (3k emails/mes) | $0 |
| **Total base** | | **~$7-32 USD/mes** |
