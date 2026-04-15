# bottt-aviator

Proyecto Node.js + Express para ejecutar el bot de WhatsApp de Aviator y dejarlo listo para publicarlo en GitHub y desplegarlo en Railway.

## Que incluye

- Bot conversacional adaptado a Aviator
- Contexto en memoria por usuario
- Flujo guiado para reservas
- Validacion estricta de reservas entre `11:00` y `19:30`
- Endpoint de prueba para simular mensajes entrantes
- Webhooks listos para conectar despues con Twilio o WhatsApp Cloud API
- Integracion con Groq usando el SDK compatible con OpenAI para FAQs y respuestas flexibles
- PDF de menu de ejemplo: `Menu AVIATOR 2026.pdf`

## Requisitos

- Node.js 18 o superior

## Instalacion

En PowerShell puede que `npm` este bloqueado por la politica de ejecucion. En ese caso usa `npm.cmd`.

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Tambien puedes iniciar en modo normal:

```powershell
npm.cmd start
```

## Despliegue en Railway

El proyecto arranca desde el entrypoint de raiz `index.js`, que delega al servidor real en `src/index.js`.

Archivos relevantes para Railway:

- `package.json`: usa `npm start`
- `index.js`: entrypoint estable del proyecto
- `src/index.js`: servidor Express real
- `railway.json`: fija `startCommand` y healthcheck en `/health`

Si en Railway habias configurado manualmente `node src/index.js`, puedes dejar que tome la configuracion del repo o cambiarlo a `npm start`.

### Variables de entorno recomendadas en Railway

- `PORT`: Railway la inyecta automaticamente.
- `BASE_URL`: recomendada para generar enlaces publicos estables al PDF del menu.
- `GROQ_API_KEY`: requerida si quieres respuestas flexibles con IA.
- `GROQ_MODEL`: opcional.
- `GROQ_REQUEST_TIMEOUT_MS`: opcional.
- `ULTRAMSG_INSTANCE_ID`: requerido solo si usaras `POST /webhook-ultramsg`.
- `ULTRAMSG_TOKEN`: requerido solo si usaras `POST /webhook-ultramsg`.
- `ULTRAMSG_API_BASE_URL`: opcional.
- `WHATSAPP_VERIFY_TOKEN`: requerido solo si usaras el webhook de Meta Cloud API.

Las variables de Twilio estan como placeholders en `.env.example`, pero el codigo actual no depende de ellas para arrancar.

## Endpoints principales

- `GET /health`
- `GET /api/menu-pdf`
- `POST /api/test/message`
- `GET /api/test/conversations/:userId`
- `POST /webhooks/whatsapp/test`
- `POST /webhooks/whatsapp/twilio`
- `GET /webhooks/whatsapp/cloud-api`
- `POST /webhooks/whatsapp/cloud-api`
- `POST /webhook-ultramsg`

## Simular mensajes

### 1. Primer contacto

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/test/message `
  -ContentType 'application/json' `
  -Body '{"userId":"59170000001","message":"hola"}'
```

### 2. Ver menu

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/test/message `
  -ContentType 'application/json' `
  -Body '{"userId":"59170000001","message":"1"}'
```

### 3. Reservar mesa paso a paso

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"hola"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"2"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"4"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"Carlos Rojas"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"15/04/2026"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"19:00"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/message -ContentType 'application/json' -Body '{"userId":"59170000002","message":"75552233"}'
```

### 4. Ver conversacion de un usuario

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri http://localhost:3000/api/test/conversations/59170000002
```

## Integracion futura con WhatsApp real

### UltraMsg

La ruta `POST /webhook-ultramsg` ya recibe el payload tipico de UltraMsg con `data.from` y `data.body`, reutiliza la logica del bot en `src/bot/aviatorBot.js` y responde al mismo chat usando `messages/chat`.

Configura estas variables en tu `.env`:

```env
PORT=3000
BASE_URL=https://superjet-flatware-unjustly.ngrok-free.dev
ULTRAMSG_INSTANCE_ID=tu_instance_id
ULTRAMSG_TOKEN=tu_token
ULTRAMSG_API_BASE_URL=https://api.ultramsg.com
```

Luego apunta el webhook de UltraMsg a:

```text
https://superjet-flatware-unjustly.ngrok-free.dev/webhook-ultramsg
```

Notas de comportamiento:

- Si llega un texto simple como `hola`, `1`, `2`, `reservar` o `ubicacion`, el flujo actual del bot se mantiene.
- Si el bot genera un documento PDF del menu, para UltraMsg se envia como texto con el enlace publico del PDF, porque esta integracion usa `messages/chat`.

### Twilio

La ruta `POST /webhooks/whatsapp/twilio` ya acepta el formato tipico de campos `From` y `Body`. En una integracion real:

1. Configuras el webhook del sandbox o numero de Twilio hacia esa URL.
2. Reemplazas la respuesta local por el envio real si quieres mensajes salientes asincronos.
3. Mantienes la logica de negocio en `src/bot/aviatorBot.js`.

### WhatsApp Cloud API

La ruta `GET /webhooks/whatsapp/cloud-api` sirve para verificar el webhook.

La ruta `POST /webhooks/whatsapp/cloud-api` ya extrae un mensaje entrante de la estructura principal de Meta. En una integracion real:

1. Validas la firma del webhook.
2. Tomas los `outboundMessages` generados por el bot.
3. Los envias a la API de WhatsApp Cloud con tus credenciales.

## Integracion con Groq

El backend sigue usando `src/integrations/openai/openaiService.js` para minimizar cambios, pero ahora apunta a Groq usando la API compatible con OpenAI y el SDK oficial `openai`.

Comportamiento actual:

- Usa `GROQ_API_KEY` desde el backend
- Usa `GROQ_MODEL` para definir el modelo de la demo gratis
- Envia prompt de sistema de Aviator
- Envia los ultimos 10 mensajes del historial con roles `system`, `user` y `assistant`
- Mantiene respuestas fijas para menu, reserva, ubicacion y opciones principales
- Usa Groq para consultas abiertas, FAQs y mensajes que no caen en intents fijos
- Si Groq falla, responde con un mensaje amable sin romper el webhook

## Notas

- El almacenamiento actual es en memoria. Si reinicias el servidor, se pierde el contexto.
- El proyecto esta pensado como demo local, no como sistema de produccion.
