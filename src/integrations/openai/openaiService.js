const OpenAI = require("openai");

const defaultBusiness = require("../../config/loadBusiness");

const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";
const DEFAULT_GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_HISTORY_MESSAGES = 10;

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
  const configuredBaseUrl = String(process.env.GROQ_API_BASE_URL || DEFAULT_GROQ_API_BASE_URL).trim();

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

function capitalizeFirst(value) {
  const text = compactText(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function resolveBusiness(business) {
  return business || defaultBusiness;
}

function getPrimaryPhone(business) {
  return String(resolveBusiness(business).contact?.primaryPhone || "").trim();
}

function buildFallbackReply(business) {
  const resolvedBusiness = resolveBusiness(business);
  const configuredReply = compactText(resolvedBusiness.ai?.fallbackReply);

  if (configuredReply) {
    return configuredReply;
  }

  return `Ahora mismo no pude procesar esa consulta. Si quieres, puedo ayudarte con una ${resolvedBusiness.reservation.label}, ${resolvedBusiness.menu.label} o la ubicacion de ${resolvedBusiness.name}.`;
}

function buildMenuPdfUrl(baseUrl, business) {
  if (!baseUrl || !resolveBusiness(business).menu?.pdfPath) {
    return null;
  }

  return `${String(baseUrl).replace(/\/$/, "")}${resolveBusiness(business).menu.pdfPath}`;
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

function buildFaqLines(business) {
  return (resolveBusiness(business).faqs || [])
    .filter((faq) => faq && faq.question && faq.answer)
    .map((faq) => `- ${compactText(faq.question)}: ${compactText(faq.answer)}`);
}

function buildListLines(items = []) {
  return items.filter(Boolean).map((item) => `- ${compactText(item)}`);
}

function buildSystemPrompt(business) {
  const resolvedBusiness = resolveBusiness(business);
  const phone = getPrimaryPhone(resolvedBusiness);
  const facts = buildListLines(resolvedBusiness.ai?.confirmedFacts || []);
  const products = buildListLines(resolvedBusiness.menu?.products || []);
  const faqs = buildFaqLines(resolvedBusiness);
  const businessRules = buildListLines(resolvedBusiness.ai?.rules || []);
  const recommendationHints = buildListLines(resolvedBusiness.ai?.recommendationHints || []);
  const lines = [
    `Atiendes el WhatsApp de ${resolvedBusiness.name}, un ${resolvedBusiness.type}.`,
    resolvedBusiness.description ? `Contexto del negocio: ${resolvedBusiness.description}` : null,
    `Tono de conversacion: ${resolvedBusiness.tone}.`,
    "",
    "Informacion confirmada del negocio:",
    facts.length ? facts.join("\n") : null,
    resolvedBusiness.hours?.summary ? `- Horario: ${resolvedBusiness.hours.summary}` : null,
    phone ? `- Telefono principal: ${phone}` : null,
    "",
    `${capitalizeFirst(resolvedBusiness.menu?.label || "menu")} y productos confirmados:`,
    products.length ? products.join("\n") : "- No hay productos cargados en la configuracion.",
    faqs.length ? `\nPreguntas frecuentes confirmadas:\n${faqs.join("\n")}` : null,
    "",
    "Reglas importantes:",
    "- Nunca inventes informacion.",
    phone
      ? `- Si el usuario pide llamada, reserva por llamada o atencion humana, derivalo a ${resolvedBusiness.name} al ${phone}.`
      : `- Si el usuario pide atencion humana, indica el canal de contacto configurado de ${resolvedBusiness.name}.`,
    `- Si el usuario quiere ${resolvedBusiness.reservation.label}, guialo pidiendo nombre, cantidad de personas, fecha y hora.`,
    "- Mantener respuestas breves, utiles y conversacionales, ideales para WhatsApp.",
    businessRules.length ? businessRules.join("\n") : null,
    recommendationHints.length ? recommendationHints.join("\n") : null
  ].filter(Boolean);

  return lines.join("\n");
}

function buildContextMessage({ business, session, baseUrl }) {
  const resolvedBusiness = resolveBusiness(business);
  const menuPdfUrl = buildMenuPdfUrl(baseUrl, resolvedBusiness);
  const phone = getPrimaryPhone(resolvedBusiness);
  const lines = [
    "Esta llamada ocurre solo como fallback cuando el mensaje no coincidio con intents fijos.",
    "Responde solo con informacion confirmada del prompt del sistema y del contexto operativo.",
    "Este asistente no puede hacer llamadas telefonicas ni prometer que llamara al cliente.",
    phone
      ? `Si el cliente pide llamada, ${resolvedBusiness.reservation.label} por llamada o atencion humana, derivalo al ${phone}.`
      : "Si el cliente pide atencion humana, deriva al canal de contacto configurado.",
    menuPdfUrl ? `${capitalizeFirst(resolvedBusiness.menu.label)} PDF disponible: ${menuPdfUrl}` : "PDF no disponible en esta solicitud.",
    `Si el cliente quiere ${resolvedBusiness.reservation.label}, guia el proceso pidiendo nombre, cantidad de personas, fecha y hora.`,
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

async function generateAssistReply({ session, business, restaurant, baseUrl }) {
  const resolvedBusiness = resolveBusiness(business || restaurant);
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
        business: resolvedBusiness.slug,
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
          content: buildSystemPrompt(resolvedBusiness)
        },
        {
          role: "system",
          content: buildContextMessage({ business: resolvedBusiness, session, baseUrl })
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
    return buildFallbackReply(resolvedBusiness);
  }
}

module.exports = {
  DEFAULT_SYSTEM_PROMPT: buildSystemPrompt(defaultBusiness),
  buildSystemPrompt,
  generateAssistReply,
  hasAiConfig,
  hasOpenAiConfig: hasAiConfig
};
