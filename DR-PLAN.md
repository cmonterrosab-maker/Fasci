# Plan de Disaster Recovery — Droguería Virtual

Este documento describe los procedimientos de continuidad del servicio,
backups y recuperación ante desastres del sistema **Droguería Virtual**
(bot WhatsApp + API REST + panel admin + Supabase).

Última revisión: 2026-05-04

---

## 1. Escenarios y RTO/RPO objetivo

| # | Escenario                                       | RTO (recuperación) | RPO (pérdida máx. de datos) | Probabilidad |
|---|-------------------------------------------------|--------------------|-----------------------------|--------------|
| 1 | Datos perdidos por error humano (borrado, edición incorrecta, script defectuoso) | **1 hora**  | **24 horas**  | Media |
| 2 | Supabase caído (plataforma)                     | **4 horas** (depende de status.supabase.com) | < 5 min (PITR de Supabase) | Baja |
| 3 | Servidor Render caído                           | **30 minutos** (redespliegue automático)    | 0 (estado en Supabase)     | Baja |
| 4 | Compromiso de seguridad (credenciales filtradas, intrusión) | **24 horas** | **24 horas** | Muy baja |
| 5 | Pérdida total del proyecto Supabase             | **8 horas**  | **24 horas**  | Muy baja |

**RTO** = Recovery Time Objective: tiempo máximo aceptable para volver a operar.
**RPO** = Recovery Point Objective: ventana máxima aceptable de datos perdidos.

---

## 2. Arquitectura de respaldos

```
                ┌────────────────────────────────────────┐
                │  Render Cron Job (drogueria-backup)    │
                │  Diario 04:00 UTC = 23:00 Colombia     │
                └────────────────┬───────────────────────┘
                                 │ ejecuta
                                 ▼
                ┌────────────────────────────────────────┐
                │  scripts/backup-supabase.js            │
                │  - Exporta 11 tablas a JSON            │
                │  - Comprime tar.gz (timestamp UTC)     │
                │  - Sube a AWS S3 (si configurado)      │
                │  - Conserva 30 backups locales         │
                └─────┬────────────────────┬─────────────┘
                      │                    │
                      ▼                    ▼
           ./backups/*.tar.gz   s3://AWS_BACKUP_BUCKET/drogueria-virtual/
```

**Tablas incluidas** (orden de FKs):
1. `categorias_medicamentos`
2. `medicamentos`
3. `droguerias`
4. `mensajeros`
5. `catalogos`
6. `configuracion_fee`
7. `pedidos`
8. `detalle_pedidos`
9. `ordenes_compra`
10. `detalle_ordenes_compra`
11. `liquidaciones`

---

## 3. Procedimientos paso a paso

### 3.1 Verificar que el backup automático está corriendo

**Frecuencia esperada**: 1 vez al día, 04:00 UTC.

**Vía Render dashboard** (recomendada):
1. Ir a https://dashboard.render.com
2. Abrir el servicio `drogueria-backup-diario` (tipo *Cron Job*).
3. Pestaña **Logs** → confirmar que la última ejecución terminó con
   `OK · 11 tablas · N registros`.
4. Pestaña **Events** → la última corrida debe tener estado `succeeded`.

**Vía S3** (si está configurado):
```bash
aws s3 ls s3://$AWS_BACKUP_BUCKET/drogueria-virtual/ \
  --human-readable --summarize | tail -5
```
La línea más reciente debe ser de las últimas 26 horas.

**Vía local** (si se corre manualmente):
```bash
ls -lh "/Users/.../Drogueria virtual/backups/" | tail -5
```

**Alarma**: si pasaron > 30 horas sin un nuevo backup, abrir incidente.
Posibles causas: cron suspendido en Render, expiración de la
SUPABASE_SERVICE_KEY, cuota de S3, fallo de DNS.

---

### 3.2 Restauración completa desde backup

**Caso de uso**: Escenario 1, 4 o 5 (datos corruptos o perdidos a gran escala).

```bash
# 1. Descargar el backup más reciente
cd "/Users/.../Drogueria virtual"

# Opción A — desde S3
aws s3 cp s3://$AWS_BACKUP_BUCKET/drogueria-virtual/backup-2026-05-04-040000.tar.gz \
  ./backups/

# Opción B — desde el cron de Render (Shell del servicio)
# (los .tar.gz quedan en /opt/render/project/src/backups/)

# 2. (RECOMENDADO) Restaurar primero a un proyecto Supabase de pruebas
export SUPABASE_URL="https://staging-xxxxx.supabase.co"
export SUPABASE_SERVICE_KEY="staging-service-key"
node scripts/restore-supabase.js ./backups/backup-2026-05-04-040000.tar.gz
# Confirmar: ESCRIBA RESTAURAR para confirmar: RESTAURAR

# 3. Validar manualmente en el panel staging que todo se ve bien.

# 4. Apuntar a producción y restaurar
export SUPABASE_URL="https://prod-xxxxx.supabase.co"
export SUPABASE_SERVICE_KEY="prod-service-key"
node scripts/restore-supabase.js ./backups/backup-2026-05-04-040000.tar.gz
# Confirmar: ESCRIBA RESTAURAR para confirmar: RESTAURAR
```

> **IMPORTANTE**: el script vacía y reinserta cada tabla. Cualquier
> dato creado *después* del backup se perderá. Si hay actividad reciente
> que se quiere preservar, exportar primero las filas posteriores al
> timestamp del backup y reinsertarlas después.

---

### 3.3 Recuperación de un pedido específico borrado

**Caso de uso**: error humano que borra un solo pedido o un grupo pequeño.
**Sin** restaurar toda la base.

```bash
# 1. Descomprimir el backup más reciente
cd "/Users/.../Drogueria virtual"
mkdir -p tmp/restore
tar -xzf ./backups/backup-2026-05-04-040000.tar.gz -C tmp/restore
cd tmp/restore/backup-2026-05-04-040000

# 2. Localizar el pedido (por id o por número)
# Linux/Mac:
grep -A 2 -B 2 '"numero": "PED-2026-00123"' pedidos.json

# 3. Copiar manualmente el registro encontrado y abrir el panel
#    Supabase → Table Editor → pedidos → "Insert row".
#    Pegar los campos. Hacer lo mismo en detalle_pedidos para sus líneas.
#
#    Alternativa con SQL (Supabase SQL Editor):
#    INSERT INTO pedidos (col1, col2, ...) VALUES (...);
#    INSERT INTO detalle_pedidos (...) VALUES (...);

# 4. Validar en el panel admin del sistema que el pedido aparece
#    completo (encabezado + líneas + estado).
```

---

### 3.4 Rotación de credenciales (compromiso de seguridad)

**Disparador**: clave filtrada en repo público, log o terminal compartida;
acceso anómalo detectado; ex-empleado con acceso.

Ejecutar **todo lo siguiente en menos de 60 minutos**:

#### a) Supabase
1. https://supabase.com/dashboard → proyecto → **Settings → API**.
2. Click **"Reset service_role key"**. Anotar la nueva.
3. Click **"Reset anon key"**. Anotar la nueva.
4. Render → `drogueria-api` → Environment → actualizar
   `SUPABASE_SERVICE_KEY` y `SUPABASE_ANON_KEY` (también en
   `drogueria-panel` → `VITE_SUPABASE_ANON_KEY`).
5. Render redespliega automáticamente.
6. Validar: `curl https://drogueria-api.onrender.com/health` → 200 OK.

#### b) Twilio
1. https://console.twilio.com → **Account → API keys & tokens**.
2. **"Create new auth token"** → marcar el anterior como secundario, después borrarlo.
3. Render → actualizar `TWILIO_AUTH_TOKEN`.
4. Probar enviando un mensaje de test al bot.

#### c) Wompi
1. https://comercios.wompi.co → **Configuración → Llaves API**.
2. Regenerar **Public**, **Private**, **Integrity** y **Events Secret**.
3. Render → actualizar `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`,
   `WOMPI_INTEGRITY_KEY`, `WOMPI_EVENTS_SECRET`.
4. Re-registrar el webhook si la URL cambió.

#### d) JWT
1. Render → `drogueria-api` → Environment → `JWT_SECRET` → **Generate**.
2. Esto invalida todas las sesiones del panel admin: el equipo
   tendrá que volver a iniciar sesión.

#### e) AWS / S3 (si hay backups en S3)
1. https://console.aws.amazon.com/iam → desactivar el access key viejo.
2. Crear un nuevo IAM user limitado al bucket de backups
   (política `s3:PutObject` y `s3:ListBucket` sobre `AWS_BACKUP_BUCKET`).
3. Render → `drogueria-backup-diario` → actualizar
   `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`.

#### f) Resend (email)
1. https://resend.com/api-keys → revocar la clave actual, crear una nueva.
2. Render → actualizar `RESEND_API_KEY`.

#### g) Después de la rotación
- Ejecutar un backup manual: `node scripts/backup-supabase.js`.
- Auditar logs de Supabase de las últimas 72 h en busca de actividad
  anómala (Dashboard → Logs Explorer → filtros por `auth.users`).
- Cambiar la contraseña del admin operativo en el panel.
- Documentar el incidente (fecha, vector sospechado, acciones).

---

### 3.5 Comunicación durante un incidente

**Orden de notificación**:

1. **T+0** — Detectado el incidente.
   Anotar hora exacta y síntomas.
2. **T+5 min** — Notificar al **admin operativo** (ver §4) por WhatsApp/llamada.
3. **T+15 min** — Si el incidente afecta pedidos en curso, enviar mensaje
   masivo a clientes activos del día con pedido pendiente:
   > "Estamos resolviendo un inconveniente técnico. Tu pedido sigue en
   > nuestro sistema y será atendido. Te avisamos en cuanto se restablezca el servicio."
4. **T+30 min** — Notificar al **socio distribuidor** si el incidente
   bloquea órdenes de compra o liquidaciones.
5. **T+1 h** — Si el incidente persiste, abrir ticket con el proveedor
   correspondiente (Supabase / Twilio / Wompi / Render). Ver §4.
6. **T+resolución** — Postmortem por escrito en menos de 72 h:
   causa raíz, acciones tomadas, plan de prevención.

**Plantilla de mensaje al admin (WhatsApp)**:
```
INCIDENTE Droguería Virtual
- Hora: [HH:MM Colombia]
- Síntoma: [bot no responde / pedidos no se guardan / etc]
- Detectado por: [yo / cliente / monitoreo]
- Acciones en curso: [...]
- ETA estimada: [...]
```

---

## 4. Contactos de emergencia

### Proveedores
| Proveedor | Canal de soporte                  | Tiempo respuesta esperado |
|-----------|-----------------------------------|---------------------------|
| Supabase  | support@supabase.io · https://supabase.com/dashboard/support/new | 4-24 h (plan free) |
| Twilio    | help@twilio.com · https://console.twilio.com/?frameUrl=/console/support/tickets | 8-24 h |
| Wompi     | soporte@wompi.co · https://soporte.wompi.co | 24-48 h |
| Render    | https://render.com/support · feedback@render.com | 24 h |
| Resend    | https://resend.com/help | 24 h |
| AWS       | https://console.aws.amazon.com/support/ | depende del plan |

### Internos
| Rol | Nombre | Teléfono / WhatsApp | Email |
|-----|--------|---------------------|-------|
| Admin operativo (primer responsable) | _(a llenar)_ | _(a llenar)_ | _(a llenar)_ |
| Socio distribuidor | _(a llenar)_ | _(a llenar)_ | _(a llenar)_ |
| Desarrollador / mantenedor | _(a llenar)_ | _(a llenar)_ | _(a llenar)_ |
| Backup técnico (suplente) | _(a llenar)_ | _(a llenar)_ | _(a llenar)_ |

> Mantener este bloque actualizado. Imprimir una copia en papel o guardar
> fuera de la nube para que sea accesible aunque el sistema esté caído.

---

## 5. Pruebas y simulacros

### 5.1 Mensual — restore a entorno de pruebas

**Cuándo**: primer lunes de cada mes, 30 minutos.

**Cómo**:
1. Tener listo un proyecto Supabase de **staging** (gratis es suficiente).
2. Descargar el backup más reciente (S3 o local).
3. Ejecutar:
   ```bash
   export SUPABASE_URL="https://staging-xxxxx.supabase.co"
   export SUPABASE_SERVICE_KEY="staging-service-key"
   node scripts/restore-supabase.js ./backups/backup-mas-reciente.tar.gz
   ```
4. Validar en el panel staging:
   - Conteo de medicamentos, droguerías, pedidos coincide con producción.
   - Un pedido al azar abre correctamente con todas sus líneas.
   - Un usuario admin puede iniciar sesión con sus credenciales staging.
5. Registrar en `tests/dr-log.md`: fecha, duración total,
   tablas con error (si hubo), responsable.

### 5.2 Trimestral — simulacro completo

**Cuándo**: primer lunes de enero, abril, julio y octubre.

**Cómo**:
1. **Semana previa**: avisar al equipo, agendar 2 horas.
2. **Día del simulacro** (en orden):
   a. Simular un escenario (elegir uno de los 5 de §1).
   b. Aplicar el procedimiento correspondiente como si fuera real,
      con cronómetro corriendo desde "T+0".
   c. Comparar tiempo real vs. RTO objetivo.
3. **Después**: postmortem con el equipo.
   - ¿Se cumplió el RTO?
   - ¿Qué pasos del documento estaban desactualizados?
   - ¿Faltó alguna credencial o acceso?
   - Actualizar este `DR-PLAN.md` con los hallazgos.

### 5.3 Continuas (automáticas)

- **Diario 04:00 UTC**: cron de backup en Render.
- **Cada 5 min**: Render hace `GET /health` al backend
  (`healthCheckPath` en `render.yaml`). Si falla 3 veces, redespliega.
- **Sentry**: alertas automáticas de excepciones por email
  (`SENTRY_DSN` configurada).

---

## 6. Checklist anual

Una vez al año (enero):

- [ ] Revisar y actualizar contactos de emergencia (§4).
- [ ] Confirmar que las cuotas de S3 y Render son suficientes.
- [ ] Auditar permisos IAM del usuario AWS de backups.
- [ ] Renovar dominios y certificados.
- [ ] Validar que `BACKUP_RETENTION` (30) sigue siendo apropiado.
- [ ] Probar la restauración a un proyecto Supabase **completamente nuevo**
      (no solo staging) para confirmar que no hay dependencias ocultas.
- [ ] Revisar los webhooks de Wompi y Twilio: aún apuntan al endpoint correcto.
