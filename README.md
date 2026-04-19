# WhatsApp Multi-Business Backend Template

Plantilla reusable de backend para WhatsApp construida con Node.js + Express.

Esta version deja una base lista para clonar en multiples negocios sin tocar la logica principal:

- configuracion por negocio en JSON
- validacion fuerte al arrancar
- flujo guiado de reservas
- handoff a humano persistente
- storage en memoria o archivo JSON local
- endpoints de prueba y administrativos
- webhooks compatibles con Twilio, Cloud API y UltraMsg
- integracion opcional con Groq para fallback conversacional

Aviator queda incluido como negocio de ejemplo y sigue funcionando como demo principal.

## Que trae esta plantilla

- Backend Express con estructura mas clara: `app/`, `routes/`, `services/`, `storage/`, `validators/`
- Seleccion del negocio activo con `BUSINESS_ID`
- Validacion reusable para `src/config/business/*.json`
- Persistencia basica para sesiones, reservas y handoffs
- Reservas con `id`, `status`, `createdAt`, `businessId`, `userId` y datos capturados
- Endpoints admin minimos listos para proteger con `ADMIN_API_KEY`
- Base de tests ejecutable con `npm test`
- Despliegue listo para Railway

## Estructura del proyecto

```text
.
|-- assets/
|-- data/
|-- src/
|   |-- app/
|   |   |-- createApp.js
|   |   |-- createDependencies.js
|   |   `-- httpUtils.js
|   |-- bot/
|   |   |-- aviatorBot.js
|   |   `-- bot.js
|   |-- config/
|   |   |-- aviatorConfig.js
|   |   |-- loadBusiness.js
|   |   |-- loadEnv.js
|   |   `-- business/
|   |       |-- _template.json
|   |       |-- aviator.json
|   |       `-- demo.json
|   |-- integrations/
|   |   |-- openai/
|   |   `-- ultramsg/
|   |-- middleware/
|   |   `-- adminAuth.js
|   |-- routes/
|   |   |-- adminRoutes.js
|   |   |-- publicRoutes.js
|   |   `-- webhookRoutes.js
|   |-- services/
|   |   |-- conversationService.js
|   |   |-- handoffService.js
|   |   `-- reservationService.js
|   |-- storage/
|   |   |-- adapters/
|   |   |   |-- jsonFileStorageAdapter.js
|   |   |   `-- memoryStorageAdapter.js
|   |   |-- createStorageAdapter.js
|   |   `-- defaultState.js
|   |-- store/
|   |   `-- sessionStore.js
|   |-- utils/
|   |   |-- dateTime.js
|   |   |-- records.js
|   |   `-- text.js
|   |-- validators/
|   |   `-- businessConfigValidator.js
|   `-- index.js
|-- test/
|   |-- helpers.js
|   `-- run-tests.js
|-- .env.example
|-- index.js
|-- package.json
`-- railway.json
```

## Requisitos

- Node.js 18 o superior

## Instalacion local

En PowerShell puede que `npm` este bloqueado por la politica de ejecucion. Si pasa eso, usa `npm.cmd`.

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Para ejecucion normal:

```powershell
npm.cmd start
```

## Variables de entorno

Variables principales:

- `PORT`: puerto del servidor. Default `3000`.
- `BASE_URL`: URL publica base para enlaces como el PDF del menu.
- `BUSINESS_ID`: negocio activo. Default `aviator`.
- `BUSINESS_SLUG`: alias legacy soportado como fallback.
- `STORAGE_DRIVER`: `file` o `memory`. Default `file`.
- `STORAGE_FILE_PATH`: ruta del JSON local. Default `./data/storage.json`.
- `ADMIN_API_KEY`: si se define, protege `/api/admin/*`.
- `WHATSAPP_VERIFY_TOKEN`: token para verificar el webhook de Cloud API.

IA opcional con Groq:

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_REQUEST_TIMEOUT_MS`
- `GROQ_API_BASE_URL`

Integraciones opcionales:

- `ULTRAMSG_INSTANCE_ID`
- `ULTRAMSG_TOKEN`
- `ULTRAMSG_API_BASE_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER`

## Negocio activo

La plantilla carga un solo negocio activo por proceso.

Ejemplo:

```env
BUSINESS_ID=aviator
```

Si `BUSINESS_ID` no existe, se usa `aviator`.

## Como crear un negocio nuevo

1. Copia `src/config/business/_template.json`.
2. Renombra el archivo a `src/config/business/<tu-id>.json`.
3. Ajusta al menos estos campos:
   - `id`
   - `name`
   - `location`
   - `contact`
   - `hours`
   - `menu`
   - `reservation`
4. Cambia `BUSINESS_ID=<tu-id>` en `.env`.
5. Reinicia el servidor.

### Campos obligatorios del JSON

- `id`
- `name`
- `location.text` o `location.address`
- `contact.primaryPhone` o `contact.text`
- `hours.summary` o `hours.text`
- `menu.label`
- `reservation.label`
- `reservation.optionLabel`
- `reservation.openingTime`
- `reservation.cutoffTime`
- `reservation.successMessage`

### Campos opcionales pero recomendados

- `description`
- `tone`
- `menu.pdfFilename`
- `menu.pdfPath`
- `menu.links`
- `faqs`
- `quickAnswers`
- `ai.confirmedFacts`
- `ai.rules`
- `reservation.duplicateMessage`

## Validacion de configuracion

Todos los JSON dentro de `src/config/business/` se validan al arrancar.

Si falta un campo critico o el esquema es invalido, el servidor falla con un error claro antes de levantar Express.

Ejemplos de validacion:

- id obligatorio
- horario de reserva con formato `HH:MM`
- `openingTime <= cutoffTime`
- `menu.pdfFilename` y `menu.pdfPath` deben existir juntos
- `faqs` y `quickAnswers` deben tener `question` y `answer`

## Persistencia

La plantilla soporta dos drivers:

- `memory`: util para pruebas o sesiones efimeras
- `file`: guarda estado en un JSON local y es el valor por defecto

El storage persiste:

- sesiones y contexto minimo por usuario
- historial de conversacion guardado en la sesion
- reservas
- handoffs a humano

Archivo por defecto:

```text
data/storage.json
```

## Reservas

El flujo actual se mantiene, pero ahora al confirmar una reserva:

- se crea un `id`
- se guarda `status: pending`
- se registra `createdAt`
- se asocia `businessId` y `userId`
- se persisten los datos capturados

Tambien hay validacion minima de duplicados obvios para evitar reservas pendientes repetidas con los mismos datos.

## Handoff a humano

Cuando el usuario pide hablar con una persona:

- se crea un registro persistente de handoff
- se guarda `userId`
- se guarda `businessId`
- se guarda `reason`
- se guarda `requestedAt`
- se guarda `status: pending`

Si ya existe un handoff pendiente para ese usuario y negocio, se reutiliza en vez de duplicarlo.

## Endpoints principales

Salud y pruebas:

- `GET /`
- `GET /health`
- `POST /api/test/message`
- `GET /api/test/conversations/:userId`

Admin:

- `GET /api/admin/reservations`
- `GET /api/admin/reservations/:id`
- `GET /api/admin/handoffs`
- `GET /api/admin/conversations/:userId`

Webhooks:

- `POST /webhooks/whatsapp/test`
- `POST /webhooks/whatsapp/twilio`
- `GET /webhooks/whatsapp/cloud-api`
- `POST /webhooks/whatsapp/cloud-api`
- `POST /webhook-ultramsg`

## Seguridad basica de endpoints admin

Si defines `ADMIN_API_KEY`, debes enviar el valor en alguno de estos headers:

- `x-admin-api-key: <tu-clave>`
- `Authorization: Bearer <tu-clave>`

Si `ADMIN_API_KEY` no esta definida:

- los endpoints admin quedan accesibles sin autenticacion
- el servidor muestra un warning al arrancar

## Como probar mensajes localmente

### Saludo inicial

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/test/message `
  -ContentType 'application/json' `
  -Body '{"userId":"59170000001","message":"hola"}'
```

### Ver menu o catalogo

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/test/message `
  -ContentType 'application/json' `
  -Body '{"userId":"59170000001","message":"1"}'
```

### Reserva paso a paso

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"hola"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"2"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"Carlos Rojas"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"4"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"manana"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"19:00"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"si"}'
```

### Pedir humano

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/test/message `
  -ContentType 'application/json' `
  -Body '{"userId":"59170000003","message":"quiero hablar con un humano"}'
```

## Como consultar reservas y handoffs

Sin `ADMIN_API_KEY`:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/admin/reservations
Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/admin/handoffs
Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/admin/conversations/59170000002
```

Con `ADMIN_API_KEY`:

```powershell
$headers = @{ "x-admin-api-key" = "tu-clave-admin" }
Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/admin/reservations -Headers $headers
Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/admin/handoffs -Headers $headers
```

## Integracion con Groq

La integracion de IA es opcional.

Comportamiento:

- si el mensaje no cae en intents fijos, el backend puede usar Groq como fallback
- si no existe `GROQ_API_KEY`, el flujo sigue funcionando sin romperse
- si Groq falla, el sistema responde con un fallback seguro

## Railway

El proyecto sigue preparado para Railway:

- `index.js` en raiz es el entrypoint estable
- `src/index.js` levanta la app real
- `railway.json` mantiene el arranque y healthcheck

Configuracion recomendada en Railway:

- `PORT`: Railway la inyecta
- `BASE_URL`: URL publica de la app
- `BUSINESS_ID`
- `STORAGE_DRIVER=file`
- `STORAGE_FILE_PATH=./data/storage.json`
- `ADMIN_API_KEY`
- variables opcionales de Groq o proveedor WhatsApp

## Tests

Ejecuta:

```powershell
npm.cmd test
```

Cobertura base incluida:

- carga de configuracion de negocio
- validacion de config
- flujo basico de reserva
- validacion de horario permitido
- creacion de handoff

## Compatibilidad mantenida

Se mantienen funcionando:

- `GET /health`
- `POST /api/test/message`
- `GET /api/test/conversations/:userId`
- webhooks existentes
- negocio de ejemplo Aviator

Cambio importante:

- ahora se recomienda `BUSINESS_ID` en vez de `BUSINESS_SLUG`
- `BUSINESS_SLUG` sigue soportado como fallback legacy

## Siguiente paso natural para una v2

- mover storage a PostgreSQL, MySQL o Redis
- autenticacion real para endpoints admin
- panel interno para reservas y handoffs
- estado de reservas editable desde API
- colas/eventos para notificaciones
- multi-tenant real en un solo proceso
