# Plan de pruebas End-to-End — Droguería Virtual

## Objetivo

Validar que todo el flujo funciona correctamente con datos reales antes del lanzamiento al público en Cartagena.

## Pre-requisitos

- [ ] Backend levantado (local o Render)
- [ ] Frontend levantado
- [ ] Supabase con `schema.sql` y `seed-cartagena.sql` ejecutados
- [ ] Twilio sandbox configurado y conectado al webhook
- [ ] 2 teléfonos disponibles (uno para cliente, otro para mensajero)
- [ ] Catálogo cargado (mínimo 5 medicamentos con stock)
- [ ] Mínimo 1 mensajero registrado

---

## Casos de prueba

### CT-01 — Registro de mensajero por script

**Pasos:**
1. Ejecutar: `node scripts/registrar-mensajero.js`
2. Llenar los datos pedidos (nombre, teléfono real, ciudad Cartagena, etc.)
3. Confirmar

**Resultado esperado:**
- ✅ Mensaje "Mensajero registrado" con ID UUID
- ✅ Aparece en panel admin → `/admin/mensajeros`
- ✅ Status "Activo", disponible en verde
- ✅ Sin GPS aún (gris)

---

### CT-02 — Reconocimiento del mensajero por el bot

**Pasos:**
1. Desde el teléfono del mensajero registrado, enviar `Hola` al WhatsApp del bot
2. Esperar respuesta

**Resultado esperado:**
- ✅ Bot responde con menú de mensajero (no menú de cliente)
- ✅ Muestra: estado, opciones DISPONIBLE / NO DISPONIBLE / MIS PEDIDOS
- ✅ Si no tiene pedido activo, indica "No tienes pedidos activos"

---

### CT-03 — Mensajero comparte ubicación GPS

**Pasos:**
1. Desde WhatsApp del mensajero: clip 📎 → Ubicación → Compartir ubicación actual
2. Esperar respuesta

**Resultado esperado:**
- ✅ Bot responde "📍 Ubicación registrada correctamente"
- ✅ En `/admin/mensajeros` aparece la ubicación con texto "hace 0min"
- ✅ Marcador aparece en el mapa de la página

---

### CT-04 — Búsqueda de medicamento (cliente B2C)

**Pasos:**
1. Desde un teléfono distinto al del mensajero, enviar `Hola` al bot
2. Bot pregunta qué medicamento necesitas
3. Escribir `acetaminofen` (o el nombre de uno cargado)

**Resultado esperado:**
- ✅ Bot saluda con menú de cliente
- ✅ Muestra resultados numerados con precio y disponibilidad
- ✅ Si no encuentra: mensaje claro de "no disponible"

---

### CT-05 — Flujo completo de pedido B2C (modo legacy con Nequi/Daviplata)

**Pasos** (con `WOMPI_PRIVATE_KEY` vacío):
1. Buscar medicamento → seleccionar `1`
2. Cantidad: `2`
3. Carrito → `NO` (continuar)
4. Confirmar pedido → `SI`
5. Compartir ubicación GPS desde WhatsApp
6. Nombre: `Juan Prueba`
7. Cédula: `1012345678`
8. T&C → `ACEPTO`
9. Bot envía instrucciones de pago Nequi
10. Enviar foto de cualquier imagen como "comprobante"

**Resultado esperado:**
- ✅ Bot crea pedido `DV-YYYY-NNNN`
- ✅ Descuenta stock del medicamento (verifica en Supabase)
- ✅ Asigna mensajero turbo (si hay disponible con GPS)
- ✅ Notifica al mensajero por WhatsApp con detalles del pedido
- ✅ Cliente recibe confirmación con número de pedido y datos del mensajero

---

### CT-06 — Flujo completo con Wompi (modo producción)

**Pasos** (con `WOMPI_PRIVATE_KEY` configurado):
1. Repetir CT-05 hasta el paso de T&C
2. Bot envía link de Wompi (en lugar de instrucciones Nequi)
3. Abrir el link en el celular
4. Pagar con tarjeta de prueba o sandbox
5. Esperar el webhook

**Resultado esperado:**
- ✅ Pedido inicialmente queda en `pendiente_pago`
- ✅ Al pagar, webhook actualiza a `confirmado`
- ✅ Stock se descuenta
- ✅ Fee se registra en pedidos.fee_monto
- ✅ Puntos de lealtad otorgados (1 pt por cada $1.000)
- ✅ Mensajero asignado y notificado
- ✅ Cliente recibe email de confirmación (si Resend configurado)

---

### CT-07 — Seguimiento del pedido por el cliente

**Pasos:**
1. Después de hacer un pedido, escribir al bot:
   - `seguimiento`
   - `mis pedidos`
   - `DV-YYYY-NNNN` (el número específico)

**Resultado esperado:**
- ✅ Bot responde con estado actual del pedido
- ✅ Si está `en_camino`, muestra nombre y teléfono del mensajero
- ✅ Si el mensajero compartió ubicación reciente, link de Google Maps en vivo
- ✅ "Última ubicación hace X min"

---

### CT-08 — Confirmación de entrega por el mensajero

**Pasos:**
1. Desde WhatsApp del mensajero, enviar: `ENTREGADO DV-YYYY-NNNN`

**Resultado esperado:**
- ✅ Bot confirma entrega al mensajero
- ✅ Mensajero queda libre (disponible: true, pedido_actual_id: null)
- ✅ Cliente recibe WhatsApp: "Tu pedido fue entregado"
- ✅ pedido.status = `entregado`, entregado_at = NOW
- ✅ pedido.calificacion_solicitada_at se llena en el siguiente cron (5 min)

---

### CT-09 — Calificación post-entrega

**Pasos:**
1. Esperar 5-10 minutos después de la entrega (o ejecutar manualmente: `POST /api/calificaciones/procesar-pendientes`)
2. Cliente recibe mensaje pidiendo calificación
3. Cliente responde: `5`

**Resultado esperado:**
- ✅ Bot agradece la calificación
- ✅ Registro en tabla `calificaciones`
- ✅ Trigger actualiza `mensajero.calificacion_promedio`
- ✅ Aparece en `/admin/calificaciones/recientes`

---

### CT-10 — Programa de lealtad

**Pasos:**
1. Cliente con pedido confirmado escribe `puntos`
2. Bot muestra saldo

**Resultado esperado:**
- ✅ Muestra puntos actuales, equivalente en COP
- ✅ Muestra código de referido (DV-XXXXXX)
- ✅ Total ganados, pedidos completados

**Pasos referido:**
1. Cliente A le pasa su código a Cliente B
2. Cliente B (nuevo) escribe el código `DV-XXXXXX`
3. Cliente B hace su primera compra completa

**Resultado esperado:**
- ✅ Sistema asocia A como referidor de B
- ✅ Al completar primera compra de B, A recibe +50 puntos
- ✅ Movimiento aparece en `movimientos_puntos` con tipo `gana_referido`

---

### CT-11 — Flujo B2B (droguería compradora)

**Pasos:**
1. Pre-requisito: registrar una droguería con teléfono `3209876543` y status `active` en tabla droguerias
2. Desde ese número escribir al bot `hola`

**Resultado esperado:**
- ✅ Bot reconoce a la droguería (no usa flujo B2C)
- ✅ Saluda con nombre de la droguería + menú B2B
- ✅ Opciones: cotizar, ver órdenes, etc.

**Pasos cotización:**
1. Buscar medicamento
2. Seleccionar uno
3. Pedir 30 unidades (sobre el mínimo mayorista)
4. Carrito → NO
5. Bot genera cotización con descuento si aplica

**Resultado esperado:**
- ✅ Precios en mayorista (precio_mayorista, no precio retail)
- ✅ Descuento 3% si total > $200.000, 5% si > $500.000
- ✅ Permite confirmar y proceder al pago

---

### CT-12 — Vista admin en tiempo real

**Pasos:**
1. Mientras se hacen los CT-04 a CT-09, abrir el panel admin en navegador
2. Navegar entre las páginas: Dashboard, Métricas, Mensajeros, Conversaciones, Pedidos

**Resultado esperado:**
- ✅ Métricas se actualizan cada 30 segundos
- ✅ Mensajeros muestran ubicación si compartieron GPS
- ✅ Conversaciones activas aparecen mientras los clientes interactúan
- ✅ Pedidos aparecen en tiempo real con su status

---

### CT-13 — Backup y restore

**Pasos:**
1. Ejecutar: `node scripts/backup-supabase.js`
2. Verificar que se crea un `.tar.gz` en `backups/`
3. (Opcional) Restaurar a un proyecto Supabase de pruebas con `restore-supabase.js`

**Resultado esperado:**
- ✅ Archivo backup-YYYY-MM-DD-HHMMSS.tar.gz creado
- ✅ Manifest.json incluye contador de registros por tabla
- ✅ Si AWS configurado, también sube a S3

---

## Reporte de bugs

Si algún test falla, documentar en GitHub Issues:

```
**Test:** CT-XX
**Pasos:** [los del test]
**Esperado:** [resultado esperado]
**Actual:** [lo que pasó]
**Logs Render:** [pega los logs relevantes]
**Screenshots:** [si aplica]
```

---

## Sign-off

Solo después de que TODOS los CT-01 a CT-13 pasen:

- [ ] Todos los tests pasan
- [ ] Logs limpios (sin errores 500 inesperados)
- [ ] Tiempos de respuesta razonables (<2s en bot, <300ms en API)
- [ ] Se verificó al menos 1 entrega física real con dirección física verdadera
- [ ] Equipo operativo entrenado en el panel admin
- [ ] Plan DR revisado

**Firma operativo:** ____________________  **Fecha:** ____________
**Firma técnico:** ______________________  **Fecha:** ____________
