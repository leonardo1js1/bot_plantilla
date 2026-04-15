const OpenAI = require("openai");

const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";
const DEFAULT_GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_HISTORY_MESSAGES = 10;
const FALLBACK_REPLY =
  "Ahora mismo no pude procesar esa consulta. Si quieres, puedo ayudarte con una reserva, el menu o la ubicacion de Aviator.";
const AVIATOR_SYSTEM_PROMPT = `Eres el asistente virtual de Aviator, un restaurante temático de aviación en Santa Cruz de la Sierra, Bolivia.

Tu objetivo es responder de forma clara, amable, natural y útil por WhatsApp, como si fueras parte del equipo de atención del restaurante.

Información confirmada del restaurante:
- Nombre: Aviator
- Tipo de restaurante: especializado en alitas, hamburguesas, piqueos y bebidas
- Ubicación: Dr. Leonardo Nava, Santa Cruz de la Sierra
- Horario: todos los días de 11:00 a.m. a 12:00 a.m.
- Teléfono de contacto: 75552233
- Servicios disponibles: consumo en el lugar, para llevar, entrega a domicilio, entrega sin contacto, retiros en la puerta
- Se aceptan reservas
- Se recomienda reservar para la cena
- Tiene asientos al aire libre y terraza
- Tiene servicio a la mesa
- Tiene bar
- Es ideal para grupos, universitarios, turistas y también para ir con niños
- Tiene sillas altas para niños
- Accesible para personas en silla de ruedas
- Métodos de pago aceptados: tarjetas de crédito, tarjetas de débito y pagos móviles por NFC
- Estacionamiento: hay estacionamiento gratuito en la calle, pero puede ser difícil encontrar espacio

Menú y productos confirmados:
- Costilla BBQ Ful Rack — BOB 229
- Bacon Cheese + Papas Curly + Pepsi — BOB 61
- 6 Alitas Aviator + Papas Curly + Pepsi — BOB 61
- Bacon Airwolf — BOB 65
- Alitas a la Parrilla 6 piezas — BOB 47
- Alitas a la Parrilla 12 piezas — BOB 87
- Alitas a la Parrilla 18 piezas — BOB 124
- Alitas a la Parrilla 24 piezas — BOB 164
- Limited Edition Pilot — BOB 55
- Limited Edition Comand — BOB 55
- Ala Hawaiana — BOB 65
- Andes 737 — BOB 65
- Alitas fritas 6 piezas — BOB 47
- Alitas fritas 12 piezas — BOB 87
- Alitas fritas 18 piezas — BOB 124
- Alitas fritas 24 piezas — BOB 164
- Hamburguesa Tamarindo Smokey Bomb — BOB 59 o BOB 69 según presentación
- Hamburguesa Aviator Happy Lunch — BOB 59
- La Re-Llenita — BOB 50
- Alitas a la Parrilla con papas fritas y bebida — BOB 59
- Hamburguesa Bacon Airwolf Happy Lunch — BOB 59
- Alitas Tradicionales con papas fritas y bebida — BOB 59
- Gaseosa Coca-Cola 500 ml — BOB 18
- Gaseosa Fanta 500 ml — BOB 18
- Gaseosa Sprite 500 ml — BOB 18
- Salsas extra: Hot Barbacoa, Parmesan Garlic, Sweet Buffalo, Mostaza y Miel, Barbacoa Aviator, Honey Buffalo, Buffalo Hot, Blue Cheese, Buffalo Mild, Sweet — BOB 8
- Chicken Tenders — BOB 46
- Misiles de Mozzarella — BOB 54
- ALL-ABOARD para 6 personas — BOB 329
- Papas Fritas Curly — BOB 25
- Ensalada Coleslaw — BOB 15
- Hamburguesa Black Box — BOB 69
- Hamburguesa Bacon Airwolf — BOB 69
- Hamburguesa Kimcheese — BOB 69
- Hamburguesa Aviator — BOB 69
- Tamarindo Smokey Bomb — BOB 69
- Hamburguesa Honolulu — BOB 69
- Hamburguesa American Aviator — BOB 69
- Hamburguesa Smoke Kamikaze — BOB 69
- Hamburguesa Macho Pilot — BOB 69

Reglas importantes:
- Nunca inventes información.
- Si el usuario pregunta algo no confirmado, dilo con honestidad y sugiere consultar directamente al restaurante al 75552233.
- No asegures cosas que no están confirmadas, por ejemplo WiFi o política de mascotas.
- Nunca digas que vas a llamar al cliente ni prometas llamadas reales desde este chat.
- Si el usuario pide llamada, dice que prefiere llamada o quiere atencion humana, indicale que contacte a Aviator al 75552233.
- Si el usuario quiere reservar por llamada o salir del proceso de reserva para hablar con alguien, deriva al 75552233 en lugar de seguir pidiendo datos.
- Si te preguntan por WiFi, responde que en este momento no tienes confirmación y que lo mejor es consultar directamente al restaurante.
- Si te preguntan por mascotas, responde que en este momento no tienes confirmación oficial y que lo mejor es consultar directamente al restaurante.
- Si te preguntan por algo del menú, responde usando solo los productos confirmados.
- Si el usuario pide recomendaciones, sugiere platos populares y variados según lo que busca: hamburguesas, alitas, piqueos, combos, algo para compartir, algo económico, etc.
- Si el usuario quiere reservar, indícale amablemente que envíe estos datos: nombre, fecha, hora y cantidad de personas.
- Mantén las respuestas breves, útiles y conversacionales, ideales para WhatsApp.
- No uses respuestas demasiado largas salvo que el usuario pida más detalle.
- Usa un tono amigable, moderno y atento.

Ejemplos de estilo:
- Si preguntan “¿qué me recomiendas?” puedes recomendar hamburguesas como Bacon Airwolf, Aviator o Black Box, alitas tradicionales o a la parrilla, o el combo ALL-ABOARD si vienen varias personas.
- Si preguntan “¿tienen opciones vegetarianas?” no afirmes demasiado. Solo menciona lo que sí está confirmado, como Ensalada Coleslaw y Misiles de Mozzarella, aclarando que para más opciones conviene consultar directamente al restaurante.`;

let cachedClient = null;
let cachedApiKey = null;
let cachedBaseUrl = null;
let cachedTimeoutMs = null;

function serializeForLog(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function logErrorWithStack(context, error) {
  console.error(`[ERROR][Groq] ${context}`);

  if (error && error.stack) {
    console.error(error.stack);
    return;
  }

  console.error(error);
}

function getGroqConfig() {
  const timeoutMs = Number(
    process.env.GROQ_REQUEST_TIMEOUT_MS || process.env.OPENAI_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
  );
  const configuredBaseUrl = String(
    process.env.GROQ_API_BASE_URL || DEFAULT_GROQ_API_BASE_URL
  ).trim();

  return {
    apiKey: String(process.env.GROQ_API_KEY || "").trim(),
    model: String(process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim(),
    baseUrl: configuredBaseUrl.replace(/\/$/, ""),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

function hasAiConfig() {
  const { apiKey } = getGroqConfig();
  return Boolean(apiKey);
}

function getClient() {
  const { apiKey, baseUrl, timeoutMs } = getGroqConfig();

  if (!apiKey) {
    return null;
  }

  if (
    !cachedClient ||
    cachedApiKey !== apiKey ||
    cachedBaseUrl !== baseUrl ||
    cachedTimeoutMs !== timeoutMs
  ) {
    cachedApiKey = apiKey;
    cachedBaseUrl = baseUrl;
    cachedTimeoutMs = timeoutMs;
    cachedClient = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      maxRetries: 1,
      timeout: timeoutMs
    });
  }

  return cachedClient;
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMenuPdfUrl(baseUrl, restaurant) {
  if (!baseUrl || !restaurant?.menuPdfPath) {
    return null;
  }

  return `${String(baseUrl).replace(/\/$/, "")}${restaurant.menuPdfPath}`;
}

function formatReservationDetails(reservationDraft = {}) {
  const fields = [
    ["Nombre", reservationDraft.name],
    ["Personas", reservationDraft.partySize],
    ["Fecha", reservationDraft.date],
    ["Hora", reservationDraft.time]
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

  if (!fields.length) {
    return "Sin datos capturados aun.";
  }

  return fields.map(([label, value]) => `${label}: ${value}`).join(" | ");
}

function buildContextMessage({ restaurant, session, baseUrl }) {
  const menuPdfUrl = buildMenuPdfUrl(baseUrl, restaurant);
  const lines = [
    "Esta llamada ocurre solo como fallback cuando el mensaje no coincidio con intents fijos.",
    "Responde solo con informacion confirmada del prompt del sistema y del contexto operativo.",
    "Este asistente no puede hacer llamadas telefonicas ni prometer que llamara al cliente.",
    "Si el cliente pide llamada, reserva por llamada o atencion humana, deriva al 75552233.",
    menuPdfUrl ? `Menu PDF disponible: ${menuPdfUrl}` : "Menu PDF no disponible en esta solicitud.",
    "Si el cliente quiere reservar, guia la reserva pidiendo nombre, cantidad de personas, fecha y hora.",
    "Si ya existe una reserva en curso, pide solo el siguiente dato faltante y evita repetir preguntas.",
    `Estado actual de la reserva: ${session.currentFlow === "reservation" ? "en curso" : "sin reserva activa"}.`,
    `Paso actual de reserva: ${session.reservationStep || "ninguno"}.`,
    `Datos actuales de reserva: ${formatReservationDetails(session.reservationDraft)}`,
    session.lastReservation
      ? `Ultima reserva registrada: ${formatReservationDetails(session.lastReservation)}`
      : "No hay una reserva registrada todavia."
  ];

  return lines.join("\n");
}

function mapHistoryEntryToMessage(entry) {
  if (!entry || !["user", "assistant"].includes(entry.role)) {
    return null;
  }

  const parts = [];
  const text = compactText(entry.text);

  if (text) {
    parts.push(text);
  }

  if (entry.type === "document" && entry.url) {
    parts.push(`Documento compartido: ${entry.url}`);
  }

  const content = parts.join("\n");

  if (!content) {
    return null;
  }

  return {
    role: entry.role,
    content
  };
}

function extractReplyText(choice) {
  const content = choice?.message?.content;

  if (typeof content === "string") {
    return compactText(content);
  }

  if (Array.isArray(content)) {
    return compactText(
      content
        .map((part) => {
          if (typeof part?.text === "string") {
            return part.text;
          }

          if (typeof part?.text?.value === "string") {
            return part.text.value;
          }

          return "";
        })
        .join(" ")
    );
  }

  return "";
}

async function generateAssistReply({ session, restaurant, baseUrl }) {
  const client = getClient();

  if (!client) {
    console.log("[DEBUG][Groq] Missing GROQ_API_KEY. Skipping AI call.");
    return null;
  }

  const { model, baseUrl: groqBaseUrl } = getGroqConfig();
  const conversationMessages = (session.history || [])
    .slice(-MAX_HISTORY_MESSAGES)
    .map(mapHistoryEntryToMessage)
    .filter(Boolean);

  try {
    console.log(
      `[DEBUG][Groq] Sending request: ${serializeForLog({
        userId: session.userId,
        apiBaseUrl: groqBaseUrl,
        model,
        messageCount: conversationMessages.length,
        lastMessage: conversationMessages[conversationMessages.length - 1] || null
      })}`
    );

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: AVIATOR_SYSTEM_PROMPT
        },
        {
          role: "system",
          content: buildContextMessage({ restaurant, session, baseUrl })
        },
        ...conversationMessages
      ]
    });

    const reply = extractReplyText(completion.choices?.[0]);

    console.log(
      `[DEBUG][Groq] Received response: ${serializeForLog({
        userId: session.userId,
        reply,
        finishReason: completion.choices?.[0]?.finish_reason || null
      })}`
    );

    return reply || null;
  } catch (error) {
    logErrorWithStack("Groq request failed", error);

    return FALLBACK_REPLY;
  }
}

module.exports = {
  AVIATOR_SYSTEM_PROMPT,
  generateAssistReply,
  hasAiConfig,
  hasOpenAiConfig: hasAiConfig
};
