# Configuración Twilio WhatsApp

## Modo SANDBOX (puedes probar HOY mismo, gratis)

Twilio tiene un sandbox de WhatsApp que funciona en 5 minutos sin aprobación de Meta. Útil para pruebas internas.

### Pasos:

1. Crear cuenta gratis en [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Ir a **Messaging → Try it out → Send a WhatsApp message**
3. Verás un número como `+1 415 523 8886` y un código tipo `join blue-cat`
4. Desde tu celular, envía un WhatsApp a ese número con el texto del código (ej: `join blue-cat`)
5. El sandbox queda activado para tu número.
6. Copia desde la consola de Twilio:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
7. En `.env` del backend pon:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxx
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   META_PHONE_NUMBER=14155238886
   ```
8. En la consola Twilio → **Sandbox Settings**, configura:
   - **WHEN A MESSAGE COMES IN:** `https://tu-dominio-render.com/webhook/whatsapp` (POST)

⚠️ **Limitaciones del sandbox:**
- Solo funciona con números que primero se registraron con el `join blue-cat`
- No puedes enviarle mensajes a clientes reales que no hayan hecho el join
- El número del bot es de Twilio, no tuyo
- Se va expirando si no hay actividad

**Útil para:** desarrollo, pruebas internas, demos al socio.
**No sirve para:** lanzamiento al público.

---

## Modo PRODUCCIÓN (lo que necesitas para Cartagena)

### Requisitos previos
- Empresa con NIT registrado
- Sitio web público (puede ser una landing simple)
- Política de privacidad publicada (ver `legal/POLITICA-PRIVACIDAD.md`)
- Caso de uso definido

### Paso 1 — Cuenta Twilio con upgrade
1. Crear cuenta o usar la que ya tienes
2. Hacer upgrade: agregar tarjeta de crédito (no se cobra hasta consumir)
3. **Verifica tu identidad** (KYC): Twilio te pedirá documentos de la empresa

### Paso 2 — Solicitar acceso a WhatsApp Business API
Hay dos caminos:

**Opción A — Twilio Senders (más directo)**
1. Twilio Console → **Senders → WhatsApp Senders → New Sender**
2. Llenar el formulario:
   - Display Name: `Drogueria Virtual` (o el nombre comercial)
   - Categoría: **Health**
   - Sitio web: tu landing
   - Casos de uso: pedidos farmacéuticos, soporte cliente
3. Twilio reenvía la solicitud a Meta. Tiempo de aprobación: **3-5 días hábiles**.
4. Una vez aprobado, Twilio te asigna un número (puede ser uno tuyo o uno nuevo)

**Opción B — Embedded Signup (si ya tienes Facebook Business Manager)**
1. Twilio Console → **WhatsApp → Embedded Signup**
2. Conectar tu Facebook Business Manager
3. Verificar tu negocio en Meta (puede tomar días si nunca lo hiciste)
4. Asignar tu número de WhatsApp Business

### Paso 3 — Plantillas de mensajes (templates)

WhatsApp exige plantillas pre-aprobadas para mensajes salientes "no sesión" (cuando inicias tú la conversación).

Plantillas que necesitas crear:
1. **Confirmación de pedido**
   ```
   Hola {{1}}, tu pedido {{2}} fue confirmado.
   Total: ${{3}}. Llega en {{4}} minutos.
   ```
2. **Pedido en camino**
   ```
   {{1}}, tu domiciliario {{2}} está en camino.
   Llega en aprox. {{3}} minutos.
   ```
3. **Notificación al mensajero**
   ```
   Nuevo pedido {{1}}. Cliente: {{2}}. Total: ${{3}}.
   ```

Las creas en: **Twilio Console → Content Builder → Create Template**.
Aprobación de Meta: 1-2 días.

### Paso 4 — Variables de entorno en Render
Una vez aprobado el número, en el dashboard de Render del servicio `drogueria-api`:

```
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+57XXXXXXXXXX  # tu número aprobado
META_PHONE_NUMBER=57XXXXXXXXXX
```

### Paso 5 — Configurar webhook
En **Twilio Console → Senders → tu número → Configure**:

- **WHEN A MESSAGE COMES IN:**
  - URL: `https://drogueria-api.onrender.com/webhook/whatsapp`
  - Method: `HTTP POST`
- **STATUS CALLBACK URL:** (opcional, para tracking de entrega de mensajes)

### Paso 6 — Probar
Desde otro celular, enviar un WhatsApp al número aprobado. Debe responder el bot.

---

## Costos referenciales (Twilio + Meta)

| Concepto | Costo |
|---|---|
| Mensajes entrantes (cliente → bot) | Gratis primeras 1.000/mes |
| Mensajes salientes en sesión (24h) | Gratis primeras 1.000/mes |
| Mensajes salientes fuera de sesión (templates) | ~$0.04 USD c/u (Colombia) |
| Número WhatsApp Business | $1 USD/mes |
| Conversaciones de servicio | Cobran por categoría según Meta |

**Estimación 1.000 pedidos/mes en Cartagena:** ~$30-50 USD/mes en mensajería.

---

## Troubleshooting común

**El webhook no recibe mensajes:**
- Verifica que la URL en Twilio Console termina exactamente en `/webhook/whatsapp` (sin slash final)
- Verifica que sea HTTPS (Render lo provee automáticamente)
- Twilio Console → Logs → Errors

**Errores 11200 / 21408:**
- El número del cliente no está en la región habilitada
- Tu cuenta Twilio no tiene saldo (recarga mínimo $20 USD)

**El bot no responde:**
- Revisa Render Logs del servicio `drogueria-api`
- Confirma que `TWILIO_WHATSAPP_NUMBER` empieza con `whatsapp:`

---

## Checklist final antes de lanzar

- [ ] Sandbox probado y funcionando
- [ ] Cuenta Twilio con upgrade (tarjeta agregada)
- [ ] Identidad verificada (KYC)
- [ ] Número WhatsApp Business aprobado
- [ ] Plantillas creadas y aprobadas (mínimo 3)
- [ ] Webhook configurado y probado
- [ ] Variables en Render llenas
- [ ] Bot responde "Hola" desde un celular real
