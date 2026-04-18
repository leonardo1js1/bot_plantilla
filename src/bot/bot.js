const defaultBusinessConfig = require("../config/loadBusiness");
const { generateAssistReply } = require("../integrations/openai/openaiService");
const {
  parseDateInput,
  parseTimeInput,
  parseTimeInputWithRange,
  isPastDate,
  isTimeWithinRange
} = require("../utils/dateTime");
const { normalizeText } = require("../utils/text");

const BOT_AGENT_ICON = "💬";
const MENU_ICON = "🍽️";
const DEFAULT_RESERVATION_DATE_EXAMPLES = "12/06/2026, 12-6-2026, manana o este viernes";

const GREETING_KEYWORDS = [
  "hola",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "hey",
  "hello"
];
const INFO_KEYWORDS = [
  "ubicacion",
  "direccion",
  "horario",
  "horarios",
  "hora",
  "horas",
  "informacion",
  "info",
  "contacto",
  "telefono",
  "donde",
  "abren",
  "cierran",
  "sucursal"
];
const CONDITIONS_KEYWORDS = ["condiciones", "reglas", "terminos", "tolerancia", "politicas", "requisitos"];
const HANDOFF_KEYWORDS = [
  "encargado",
  "asesor",
  "humano",
  "administrador",
  "agente",
  "hablar con alguien",
  "hablar con una persona",
  "atencion humana"
];
const CALL_REQUEST_KEYWORDS = [
  "puedes llamarme",
  "llamame",
  "llamarme",
  "quiero por llamada",
  "quiero una llamada",
  "quiero llamada",
  "prefiero una llamada",
  "prefiero llamada",
  "mejor por llamada",
  "por llamada"
];
const PAYMENT_KEYWORDS = ["pago", "pagos", "tarjeta", "efectivo", "qr"];
const CANCEL_KEYWORDS = ["cancelar", "cancel", "salir", "volver", "mejor no", "luego seguimos", "pausa", "pausar"];

let activeBusinessConfig = defaultBusinessConfig;

function getBusinessConfig() {
  return activeBusinessConfig;
}

function createTextMessage(text) {
  return {
    type: "text",
    text
  };
}

function createDocumentMessage({ text, filename, url }) {
  return {
    type: "document",
    text,
    filename,
    url
  };
}

function uniqueNormalizedKeywords(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(String(value || "").trim()).replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  );
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordAlternation(keywords = []) {
  return uniqueNormalizedKeywords(keywords)
    .map((keyword) => escapeRegex(keyword).replace(/\s+/g, "\\s+"))
    .join("|");
}

function getMenuLabel() {
  return String(getBusinessConfig().menu?.label || "menu").trim();
}

function getBookingLabel() {
  return String(getBusinessConfig().reservation?.label || "reserva").trim();
}

function getBookingLabelPlural() {
  const configuredPlural = String(getBusinessConfig().reservation?.labelPlural || "").trim();
  return configuredPlural || `${getBookingLabel()}s`;
}

function getReservationDateExamples() {
  return String(
    getBusinessConfig().reservation?.dateExamples || DEFAULT_RESERVATION_DATE_EXAMPLES
  ).trim();
}

function getPrimaryPhone() {
  return String(getBusinessConfig().contact?.primaryPhone || "").trim();
}

function getMenuKeywords() {
  return uniqueNormalizedKeywords([
    getMenuLabel(),
    "menu",
    "carta",
    "catalogo",
    "servicios",
    "productos",
    "comida",
    "platos",
    "plato",
    "bebidas",
    "postres"
  ]);
}

function getBookingKeywords() {
  return uniqueNormalizedKeywords([
    getBookingLabel(),
    getBookingLabelPlural(),
    "reservar",
    "reserva",
    "reservas",
    "reservacion",
    "reservaciones",
    "cita",
    "citas",
    "turno",
    "turnos",
    "mesa",
    "agendar",
    "quiero reservar",
    "quiero agendar",
    "booking",
    "apartar",
    "separar"
  ]);
}

function buildMainMenuText() {
  return `Hola, te doy la bienvenida a ${getBusinessConfig().name} ${BOT_AGENT_ICON}

Puedo ayudarte con:
1. Ver ${getMenuLabel()}
2. ${getBusinessConfig().reservation.optionLabel}
3. Ubicacion, horarios y contacto
4. Condiciones de ${getBookingLabel()}
5. Hablar con un encargado

Escribe el numero de la opcion que prefieras o cuentame que necesitas.`;
}

function buildMenuHighlightsText() {
  const businessConfig = getBusinessConfig();
  const highlights = businessConfig.menu.highlights.length
    ? businessConfig.menu.highlights
    : businessConfig.menu.products.slice(0, 6);

  if (!highlights.length) {
    return `${getMenuLabel()} disponible a pedido.`;
  }

  return `${businessConfig.menu.highlightsTitle}:
- ${highlights.join("\n- ")}`;
}

function buildContactText() {
  return [getBusinessConfig().contact.text, getBusinessConfig().hours.text].filter(Boolean).join("\n\n");
}

function buildConditionsText() {
  const rules = getBusinessConfig().reservation.rules || [];

  if (!rules.length) {
    return `No hay condiciones cargadas para ${getBookingLabel()} en ${getBusinessConfig().name}.`;
  }

  return `Condiciones de ${getBookingLabel()} en ${getBusinessConfig().name}

- ${rules.join("\n- ")}`;
}

function buildCallRedirectText() {
  const phone = getPrimaryPhone();

  if (!phone) {
    return `Por ahora puedo ayudarte por este chat con informacion y ${getBookingLabelPlural()}. Si prefieres una llamada, te recomiendo comunicarte directamente con ${getBusinessConfig().name}.`;
  }

  return `Por ahora puedo ayudarte por este chat con informacion y ${getBookingLabelPlural()}. Si prefieres una llamada, te recomiendo comunicarte directamente con ${getBusinessConfig().name} al ${phone}.`;
}

function buildReservationDirectContactText() {
  const phone = getPrimaryPhone();

  if (!phone) {
    return `Si prefieres atencion directa, puedes comunicarte con ${getBusinessConfig().name}.`;
  }

  return `Si prefieres gestionar tu ${getBookingLabel()} por llamada o con atencion directa, puedes comunicarte directamente con ${getBusinessConfig().name} al ${phone}.`;
}

function buildHumanSupportText() {
  const phone = getPrimaryPhone();

  if (!phone) {
    return `Si prefieres atencion directa, puedes comunicarte con ${getBusinessConfig().name}.`;
  }

  return `Si prefieres atencion directa, puedes comunicarte con ${getBusinessConfig().name} al ${phone}.`;
}

function buildPaymentsText() {
  return `Para consultas sobre pagos te puedo derivar al contacto de ${getBusinessConfig().name}.

${buildHumanSupportText()}`;
}

function buildInvalidOptionText() {
  return `Puedo ayudarte con ${getBookingLabelPlural()}, ${getMenuLabel()}, ubicacion y preguntas frecuentes. Si deseas ${getBookingLabel()}, escribe por ejemplo: ${getBusinessConfig().reservation.intentExample}.`;
}

function formatReservationTimeForDisplay(time) {
  const [rawHours, rawMinutes] = String(time || "00:00").split(":").map(Number);
  const hours = Number.isInteger(rawHours) ? rawHours : 0;
  const minutes = Number.isInteger(rawMinutes) ? rawMinutes : 0;
  const meridiem = hours >= 12 ? "p.m." : "a.m.";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function getReservationTimeBounds() {
  return {
    openingTime: getBusinessConfig().reservation.openingTime,
    cutoffTime: getBusinessConfig().reservation.cutoffTime
  };
}

function buildReservationTimeWindowText() {
  const { openingTime, cutoffTime } = getReservationTimeBounds();
  return `entre las ${formatReservationTimeForDisplay(openingTime)} y las ${formatReservationTimeForDisplay(cutoffTime)}`;
}

function buildReservationTimePrompt() {
  return `A que hora llegarian? Solo tomamos ${getBookingLabelPlural()} ${buildReservationTimeWindowText()}. Puedes escribir 11 am, 7 pm o 19:30.`;
}

function buildReservationTimeErrorText() {
  return `No pude identificar la hora. Solo tomamos ${getBookingLabelPlural()} ${buildReservationTimeWindowText()}. Puedes enviarla como 11 am, 7 pm o 19:30.`;
}

function buildReservationTimeOutOfRangeText() {
  return `Lo siento. Solo tomamos ${getBookingLabelPlural()} ${buildReservationTimeWindowText()}. Quieres elegir una hora dentro de ese horario?`;
}

function parseReservationTime(rawText) {
  const { openingTime, cutoffTime } = getReservationTimeBounds();
  return parseTimeInputWithRange(rawText, openingTime, cutoffTime);
}

function isStoredReservationTimeValid(time) {
  if (!time) {
    return false;
  }

  const { openingTime, cutoffTime } = getReservationTimeBounds();
  return isTimeWithinRange(time, openingTime, cutoffTime);
}

function clearReservationDraftTime(session) {
  if (session.reservationDraft && Object.prototype.hasOwnProperty.call(session.reservationDraft, "time")) {
    delete session.reservationDraft.time;
  }
}

function sanitizeReservationDraftTime(session) {
  const currentTime = session.reservationDraft?.time;

  if (!currentTime) {
    return { valid: false, reason: "missing" };
  }

  if (isStoredReservationTimeValid(currentTime)) {
    return { valid: true };
  }

  clearReservationDraftTime(session);

  return {
    valid: false,
    reason: "out_of_range",
    cleared: true
  };
}

function buildReservationConfirmationText(reservationDraft) {
  const lines = [
    `- Nombre: ${reservationDraft.name}`,
    `- Personas: ${reservationDraft.partySize}`,
    `- Fecha: ${reservationDraft.date}`
  ];

  if (isStoredReservationTimeValid(reservationDraft.time)) {
    lines.push(`- Hora: ${formatReservationTimeForDisplay(reservationDraft.time)}`);
  }

  return `Perfecto. Tengo esto para tu ${getBookingLabel()}:
${lines.join("\n")}

Esta correcto?`;
}

function buildReservationSummary() {
  return getBusinessConfig().reservation.successMessage;
}

function resolveMenuPdfUrl(baseUrl) {
  if (!baseUrl || !getBusinessConfig().menu?.pdfPath) {
    return null;
  }

  return `${baseUrl.replace(/\/$/, "")}${getBusinessConfig().menu.pdfPath}`;
}

function getNormalizedTokens(normalizedText) {
  return String(normalizedText || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hasAmbiguousConnector(normalizedText) {
  return /\b(y|pero|solo|aunque|ademas|tambien)\b/.test(normalizedText);
}

function isShortDirectMessage(normalizedText, maxTokens = 3) {
  const tokens = getNormalizedTokens(normalizedText);

  if (!tokens.length || tokens.length > maxTokens) {
    return false;
  }

  return !hasAmbiguousConnector(normalizedText);
}

function buildWholeKeywordPattern(keyword) {
  const normalizedKeyword = normalizeText(String(keyword || "").trim()).replace(/\s+/g, " ");
  const escapedKeyword = escapeRegex(normalizedKeyword).replace(/\s+/g, "\\s+");

  return new RegExp(`(?:^|\\b)${escapedKeyword}(?:\\b|$)`);
}

function matchesAnyWholeKeyword(normalizedText, keywords) {
  return keywords.some((keyword) => buildWholeKeywordPattern(keyword).test(normalizedText));
}

function isShortDirectKeywordIntent(normalizedText, keywords, maxTokens = 3) {
  return isShortDirectMessage(normalizedText, maxTokens) && matchesAnyWholeKeyword(normalizedText, keywords);
}

function hasReservationKeyword(normalizedText) {
  return matchesAnyWholeKeyword(normalizedText, getBookingKeywords());
}

function isLongFormConditionsIntent(normalizedText) {
  if (!matchesAnyWholeKeyword(normalizedText, CONDITIONS_KEYWORDS)) {
    return false;
  }

  const conditionsAlternation = buildKeywordAlternation(CONDITIONS_KEYWORDS);
  const bookingAlternation = buildKeywordAlternation(getBookingKeywords());

  return [
    new RegExp(
      `\\b(?:quiero|quisiera|necesito|prefiero|solo\\s+quiero|solo\\s+necesito|puedes|podrias|me\\s+puedes|me\\s+podrias)\\b.*\\b(?:${conditionsAlternation})\\b`
    ),
    new RegExp(
      `\\b(?:ver|leer|saber|conocer|consultar|revisar|mostrar|mostrarme|muestrame|pasame|mandame|dame|enviame|explicame)\\b.*\\b(?:${conditionsAlternation})\\b`
    ),
    new RegExp(`\\b(?:cual(?:es)?\\s+son|que)\\b.*\\b(?:${conditionsAlternation})\\b`),
    new RegExp(`\\b(?:${conditionsAlternation})\\b.*\\b(?:de|para)\\s+(?:la\\s+)?(?:${bookingAlternation})\\b`)
  ].some((pattern) => pattern.test(normalizedText));
}

function isLongFormInfoIntent(normalizedText) {
  const directInfoAlternation = buildKeywordAlternation([
    "ubicacion",
    "direccion",
    "informacion",
    "info",
    "contacto",
    "telefono"
  ]);

  return [
    new RegExp(
      `\\b(?:quiero|quisiera|necesito|prefiero|solo\\s+quiero|solo\\s+necesito)\\s+(?:ver\\s+|saber\\s+|conocer\\s+|tener\\s+)?(?:el\\s+|la\\s+|los\\s+)?(?:${directInfoAlternation}|horarios?)\\b`
    ),
    new RegExp(`\\b(?:ver|saber|conocer|consultar|revisar)\\b.*\\b(?:${directInfoAlternation}|horarios?)\\b`),
    new RegExp(
      `\\b(?:me\\s+pasas|pasame|mandame|dame|comparteme|enviame|mostrar|mostrarme|muestrame|decime|dime)\\b.*\\b(?:${directInfoAlternation}|horarios?)\\b`
    ),
    /\bsolo\s+quiero\s+(?:informacion|info)\b/,
    /\b(?:cual(?:es)?\s+son|que)\b.*\b(?:horarios?|contacto|telefono|ubicacion|direccion)\b/,
    /\bdonde\s+(?:queda|quedan|estan|estan\s+ubicados|se\s+ubican)\b/,
    /\b(?:abren|cierran)\b/
  ].some((pattern) => pattern.test(normalizedText));
}

function hasPriorityIntentBeforeReservation(normalizedText) {
  return (
    isReservationDirectContactIntent(normalizedText) ||
    isCallIntent(normalizedText) ||
    isHumanMenuOption(normalizedText) ||
    isHumanRequest(normalizedText) ||
    isConditionsIntent(normalizedText) ||
    isInfoIntent(normalizedText)
  );
}

function isNegatedReservationMessage(normalizedText) {
  const reservationAlternation = buildKeywordAlternation(getBookingKeywords());

  return [
    new RegExp(`\\bno\\s+(?:quiero|deseo|busco|pienso|voy\\s+a)?\\s*(?:${reservationAlternation})\\b`),
    new RegExp(`\\bno\\s+quiero\\s+hacer\\s+una\\s+(?:${reservationAlternation})\\b`),
    new RegExp(`\\bno\\s+deseo\\s+hacer\\s+una\\s+(?:${reservationAlternation})\\b`)
  ].some((pattern) => pattern.test(normalizedText));
}

function isReservationManagementIntent(normalizedText) {
  if (!hasReservationKeyword(normalizedText)) {
    return false;
  }

  return matchesAnyWholeKeyword(normalizedText, [
    "cancelar",
    "cancel",
    "anular",
    "modificar",
    "cambiar",
    "mover",
    "reprogramar"
  ]);
}

function hasReservationDetails(rawText) {
  const parsedDate = parseDateInput(rawText);
  const parsedTime = shouldAttemptTimeExtraction(rawText, null) ? parseTimeInput(rawText) : { valid: false };

  return Boolean(extractReservationPartySize(rawText) || parsedDate.valid || parsedTime.valid);
}

function shouldStartReservationFlow(rawText, normalizedText) {
  if (
    hasPriorityIntentBeforeReservation(normalizedText) ||
    isNegatedReservationMessage(normalizedText) ||
    isReservationManagementIntent(normalizedText)
  ) {
    return false;
  }

  if (isReservationIntent(normalizedText)) {
    return true;
  }

  if (!hasReservationKeyword(normalizedText)) {
    return false;
  }

  return hasReservationDetails(rawText);
}

function looksLikeNaturalMessage(rawText, normalizedText) {
  const tokenCount = getNormalizedTokens(normalizedText).length;

  if (tokenCount >= 6) {
    return true;
  }

  if (/[?,]/.test(rawText)) {
    return true;
  }

  return /\b(quiero|prefiero|mejor|quisiera|preguntar|saber)\b/.test(normalizedText) && tokenCount > 3;
}

function matchStrictIntent(normalizedText) {
  if (isReservationDirectContactIntent(normalizedText)) {
    return "reservationDirectContact";
  }

  if (isCallIntent(normalizedText)) {
    return "call";
  }

  if (isHumanMenuOption(normalizedText) || isHumanRequest(normalizedText)) {
    return "human";
  }

  if (isStrictMenuIntent(normalizedText)) {
    return "menu";
  }

  if (isConditionsIntent(normalizedText)) {
    return "conditions";
  }

  if (isInfoIntent(normalizedText)) {
    return "info";
  }

  if (isReservationIntent(normalizedText)) {
    return "reservation";
  }

  if (isPaymentsIntent(normalizedText)) {
    return "payments";
  }

  if (isGreetingOnly(normalizedText)) {
    return "greeting";
  }

  return null;
}

function shouldUseAiFallback(rawText, normalizedText) {
  if (!normalizedText) {
    return false;
  }

  if (matchStrictIntent(normalizedText) || shouldStartReservationFlow(rawText, normalizedText)) {
    return false;
  }

  return (
    isReservationManagementIntent(normalizedText) ||
    isNegatedReservationMessage(normalizedText) ||
    looksLikeNaturalMessage(rawText, normalizedText) ||
    Boolean(normalizedText)
  );
}

function isGreetingOnly(normalizedText) {
  return GREETING_KEYWORDS.includes(normalizedText);
}

function isStrictMenuIntent(normalizedText) {
  return normalizedText === "1" || isShortDirectKeywordIntent(normalizedText, getMenuKeywords(), 4);
}

function isMenuIntent(message) {
  const normalizedText = normalizeText(String(message || ""))
    .replace(/[,.;:!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText) {
    return false;
  }

  if (isStrictMenuIntent(normalizedText)) {
    return true;
  }

  if (!matchesAnyWholeKeyword(normalizedText, getMenuKeywords())) {
    return false;
  }

  const menuAlternation = buildKeywordAlternation(getMenuKeywords());
  const negativePatterns = [
    new RegExp(`\\bno\\s+me\\s+gust\\w*\\b.*\\b(?:${menuAlternation})\\b`),
    new RegExp(`\\b(?:${menuAlternation})\\b.*\\b(?:estaba|esta|fue|era|salio|parece|parecia)\\b`),
    new RegExp(`\\b(?:${menuAlternation})\\b.*\\b(?:caro|cara|rico|rica|malo|mala|bueno|buena|feo|fea)\\b`),
    new RegExp(`\\b(?:${menuAlternation})\\b.*\\b(?:tiene|trae|incluye|ofrece|lleva)\\b`)
  ];

  if (negativePatterns.some((pattern) => pattern.test(normalizedText))) {
    return false;
  }

  const requestPatterns = [
    new RegExp(
      `\\b(?:me\\s+pasas|pasame|pasar|me\\s+manda|me\\s+mandas|mandame|mandar|mostrarme|muestrame|mostrar|enviame|enviar|me\\s+envias|dame|dar|me\\s+das|comparteme|compartir)\\b.*\\b(?:${menuAlternation})\\b`
    ),
    new RegExp(`\\b(?:quiero|quisiera)\\s+(?:ver|revisar)\\b.*\\b(?:${menuAlternation})\\b`),
    new RegExp(
      `\\b(?:puedes|me\\s+puedes|podrias|me\\s+podrias)\\b.*\\b(?:pasar|mandar|mostrar|mostrarme|enviar|enviarme|dar|compartir)\\b.*\\b(?:${menuAlternation})\\b`
    ),
    new RegExp(`\\b(?:${menuAlternation})\\b.*\\b(?:porfa|por\\s+favor|porfis|pls)\\b`),
    new RegExp(`\\bque\\s+(?:hay|tienen|tienes)\\s+en\\s+(?:el|la)?\\s*(?:${menuAlternation})\\b`)
  ];

  return requestPatterns.some((pattern) => pattern.test(normalizedText));
}

function isReservationIntent(normalizedText) {
  if (normalizedText === "2") {
    return true;
  }

  if (
    hasPriorityIntentBeforeReservation(normalizedText) ||
    isNegatedReservationMessage(normalizedText) ||
    isReservationManagementIntent(normalizedText)
  ) {
    return false;
  }

  return isShortDirectKeywordIntent(normalizedText, getBookingKeywords(), 5);
}

function isInfoIntent(normalizedText) {
  return normalizedText === "3" || isShortDirectKeywordIntent(normalizedText, INFO_KEYWORDS) || isLongFormInfoIntent(normalizedText);
}

function isConditionsIntent(normalizedText) {
  return (
    normalizedText === "4" ||
    isShortDirectKeywordIntent(normalizedText, CONDITIONS_KEYWORDS, 5) ||
    isLongFormConditionsIntent(normalizedText)
  );
}

function isHumanRequest(normalizedText) {
  return (
    isShortDirectKeywordIntent(normalizedText, HANDOFF_KEYWORDS, 4) ||
    matchesAnyWholeKeyword(normalizedText, ["hablar con alguien", "hablar con una persona", "atencion humana"]) ||
    /\b(?:quiero|quisiera|necesito|prefiero|puedes|podrias|me\s+puedes|me\s+podrias)\b.*\b(?:hablar|comunicarme|contactarme)\b.*\b(?:encargado|asesor|humano|administrador|agente|persona|alguien)\b/.test(
      normalizedText
    ) ||
    /\bhablar\s+con\s+(?:un|una|el|la)?\s*(?:encargado|asesor|humano|administrador|agente|persona|alguien)\b/.test(
      normalizedText
    )
  );
}

function isHumanMenuOption(normalizedText) {
  return normalizedText === "5";
}

function isCallIntent(normalizedText) {
  return matchesAnyWholeKeyword(normalizedText, CALL_REQUEST_KEYWORDS);
}

function isReservationDirectContactIntent(normalizedText) {
  return hasReservationKeyword(normalizedText) && (isCallIntent(normalizedText) || isHumanRequest(normalizedText));
}

function isPaymentsIntent(normalizedText) {
  return isShortDirectKeywordIntent(normalizedText, PAYMENT_KEYWORDS);
}

function isReservationExitIntent(normalizedText) {
  const cancelAlternation = buildKeywordAlternation(CANCEL_KEYWORDS);

  return (
    normalizedText === "menu" ||
    (isShortDirectMessage(normalizedText, 4) && matchesAnyWholeKeyword(normalizedText, CANCEL_KEYWORDS)) ||
    new RegExp(`\\b(?:quiero|quisiera|prefiero|mejor|podemos|puedes|podrias)\\b.*\\b(?:${cancelAlternation})\\b`).test(
      normalizedText
    ) ||
    /\b(?:ya\s+no|no\s+quiero\s+seguir|no\s+quiero\s+continuar)\b/.test(normalizedText)
  );
}

function buildReservationExitText() {
  return `Claro. Salimos del proceso de ${getBookingLabel()}. Si quieres, puedo ayudarte con ${getMenuLabel()}, horarios o informacion del negocio.`;
}

function buildReservationNamePrompt(includeIntro = false) {
  const question = `A nombre de quien quedaria la ${getBookingLabel()}?`;

  if (!includeIntro) {
    return question;
  }

  return `Con gusto te ayudo con tu ${getBookingLabel()} en ${getBusinessConfig().name}.

${question}`;
}

function buildReservationPartySizePrompt() {
  return `Para cuantas personas sera la ${getBookingLabel()}?`;
}

function buildReservationDatePrompt() {
  return `Para que fecha deseas la ${getBookingLabel()}? Puedes escribirla como ${getReservationDateExamples()}.`;
}

function buildReservationNameErrorText() {
  return `No pude identificar el nombre de la ${getBookingLabel()}. Puedes enviarlo como: Leonardo o a nombre de Leonardo.`;
}

function buildReservationPartySizeErrorText() {
  return "No pude identificar la cantidad de personas. Puedes escribir algo como: 2, para 4, o somos 3.";
}

function buildReservationDateErrorText() {
  return `No pude identificar la fecha. Puedes enviarla como ${getReservationDateExamples()}.`;
}

function buildReservationConfirmationErrorText() {
  return "Responde si para confirmar o dime que dato quieres corregir.";
}

function buildReservationCorrectionPromptText() {
  return "Claro, dime que dato quieres corregir: nombre, personas, fecha u hora.";
}

function shouldAttemptTimeExtraction(rawText, currentStep) {
  if (currentStep === "time") {
    return true;
  }

  const normalizedText = normalizeText(cleanReservationInput(rawText));
  return /(?:\d:\d|am\b|pm\b|\ba las\b|\bcomo a las\b|\btipo\b)/.test(normalizedText);
}

function isReservationConfirmationReply(normalizedText) {
  return [/^si\b/, /^ok\b/, /^correcto\b/, /^esta bien\b/, /^confirmo\b/].some((pattern) =>
    pattern.test(normalizedText)
  );
}

function isReservationCorrectionReply(normalizedText) {
  return [/\bno\b/, /\bmejor\b/, /\bcambiar\b/, /\bcorregir\b/, /\bmodificar\b/].some((pattern) =>
    pattern.test(normalizedText)
  );
}

function getNextReservationStep(reservationDraft = {}) {
  if (!reservationDraft.name) {
    return "name";
  }

  if (!reservationDraft.partySize) {
    return "partySize";
  }

  if (!reservationDraft.date) {
    return "date";
  }

  if (!reservationDraft.time) {
    return "time";
  }

  return "confirmation";
}

function buildReservationPromptForStep(step, options = {}) {
  switch (step) {
    case "name":
      return buildReservationNamePrompt(options.includeIntro);
    case "partySize":
      return buildReservationPartySizePrompt();
    case "date":
      return buildReservationDatePrompt();
    case "time":
      return buildReservationTimePrompt();
    case "confirmation":
      return buildReservationConfirmationText(options.reservationDraft || {});
    default:
      return buildMainMenuText();
  }
}

function buildReservationErrorForStep(step) {
  switch (step) {
    case "name":
      return buildReservationNameErrorText();
    case "partySize":
      return buildReservationPartySizeErrorText();
    case "date":
      return buildReservationDateErrorText();
    case "time":
      return buildReservationTimeErrorText();
    case "confirmation":
      return buildReservationConfirmationErrorText();
    default:
      return buildInvalidOptionText();
  }
}

function cleanReservationInput(value) {
  return String(value || "")
    .trim()
    .replace(/\s*,?\s*(?:por favor|gracias)\s*[.!?]*$/i, "")
    .replace(/^[,.:;\-\s]+/, "")
    .replace(/[,.:;!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function formatReservationName(name) {
  return name
    .split(/\s+/)
    .map((part) =>
      part
        .split(/([-'])/)
        .map((segment) => {
          if (segment === "-" || segment === "'") {
            return segment;
          }

          return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
        })
        .join("")
    )
    .join(" ");
}

function isLikelyReservationName(name) {
  if (!name || name.length < 2 || name.length > 60) {
    return false;
  }

  const normalizedName = normalizeText(name);
  const blockedWords = new Set(
    uniqueNormalizedKeywords([
      ...getBookingKeywords(),
      "persona",
      "personas",
      "cantidad",
      "fecha",
      "hora",
      "nombre",
      "quiero",
      "para",
      "como",
      "tipo",
      "si",
      "no",
      "ok",
      "mejor",
      "cambio",
      "cambiar",
      "corregir",
      "modificar",
      "correcto",
      "confirmo",
      "manana",
      "hoy",
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sabado",
      "domingo",
      "mi",
      "tu",
      "su",
      "esposa",
      "esposo",
      "novia",
      "novio"
    ])
  );

  if (/\d/.test(name) || !/^[a-z' -]+$/.test(normalizedName)) {
    return false;
  }

  const tokens = normalizedName.split(/\s+/).filter(Boolean);

  if (tokens.length === 0 || tokens.length > 5) {
    return false;
  }

  return !tokens.some((token) => blockedWords.has(token));
}

function trimReservationNameCandidate(value) {
  let candidate = cleanReservationInput(value).split(/[;,.\n]/)[0].trim();

  const cutoffPatterns = [
    /\s+(?:somos|seriamos|seremos)\b/i,
    /\s+mesa\s+para\b/i,
    /\s+para\s+\d{1,2}(?:\s+personas?)?\b/i,
    /\s+para\s+pasado\s+manana\b/i,
    /\s+para\s+manana\b/i,
    /\s+para\s+(?:este|el)\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/i,
    /\s+pasado\s+manana\b/i,
    /\s+manana\b/i,
    /\s+(?:este|el)\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/i,
    /\s+(?:a\s+las|como\s+a\s+las|tipo)\b/i
  ];

  for (const pattern of cutoffPatterns) {
    const match = candidate.match(pattern);

    if (match) {
      candidate = candidate.slice(0, match.index).trim();
    }
  }

  return cleanReservationInput(candidate);
}

function extractReservationName(rawText) {
  const text = cleanReservationInput(rawText);
  const bookingAlternation = buildKeywordAlternation(getBookingKeywords());

  if (!text) {
    return null;
  }

  const patterns = [
    /\ba\s+nombre\s+de\s+(.+)$/i,
    new RegExp(`\\bla\\s+(?:${bookingAlternation})\\s+es\\s+para\\s+(.+)$`, "i"),
    new RegExp(`\\bla\\s+(?:${bookingAlternation})\\s+ser(?:i|ia)\\s+para\\s+(.+)$`, "i"),
    /\b(?:el\s+)?nombre\s+es\s+(.+)$/i,
    /\bmi\s+nombre\s+es\s+(.+)$/i,
    /\bsoy\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const candidate = trimReservationNameCandidate(match[1]);

    if (isLikelyReservationName(candidate)) {
      return formatReservationName(candidate);
    }
  }

  const leadingCandidate = trimReservationNameCandidate(text);

  if (isLikelyReservationName(leadingCandidate)) {
    return formatReservationName(leadingCandidate);
  }

  return null;
}

function extractReservationPartySize(rawText) {
  const normalizedText = normalizeText(cleanReservationInput(rawText));

  if (!normalizedText) {
    return null;
  }

  const patterns = [
    /^(\d{1,2})(?:\s+personas?)?$/,
    /\bson\s+(\d{1,2})(?:\s+personas?)?\b/,
    /\b(?:somos|seriamos|seremos)\s+(\d{1,2})(?:\s+personas?)?\b/,
    /\bmesa\s+para\s+(\d{1,2})(?:\s+personas?)?\b/,
    /\bpara\s+(\d{1,2})\s+personas?\b/,
    /\bpara\s+(\d{1,2})(?!\s*:)\b/
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);

    if (!match) {
      continue;
    }

    const partySize = Number(match[1]);

    if (Number.isInteger(partySize) && partySize > 0) {
      return partySize;
    }
  }

  return null;
}

function captureReservationDetails(session, rawText, currentStep) {
  const captureResult = {
    capturedAny: false,
    invalid: {
      date: null,
      time: null
    }
  };

  if (!session.reservationDraft.name) {
    const name = extractReservationName(rawText);

    if (name) {
      session.reservationDraft.name = name;
      captureResult.capturedAny = true;
    }
  }

  if (!session.reservationDraft.partySize) {
    const partySize = extractReservationPartySize(rawText);

    if (partySize) {
      session.reservationDraft.partySize = partySize;
      captureResult.capturedAny = true;
    }
  }

  if (!session.reservationDraft.date) {
    const parsedDate = parseDateInput(rawText);

    if (parsedDate.valid) {
      if (isPastDate(parsedDate.date)) {
        captureResult.invalid.date = "past";
      } else {
        session.reservationDraft.date = parsedDate.formatted;
        captureResult.capturedAny = true;
      }
    }
  }

  if (!session.reservationDraft.time && shouldAttemptTimeExtraction(rawText, currentStep)) {
    const parsedTime = parseReservationTime(rawText);

    if (parsedTime.valid) {
      session.reservationDraft.time = parsedTime.formatted;
      captureResult.capturedAny = true;
    } else if (parsedTime.reason === "out_of_range") {
      captureResult.invalid.time = "outOfRange";
    }
  }

  return captureResult;
}

function applyReservationCorrections(session, rawText) {
  const correctionResult = {
    updatedAny: false,
    invalid: {
      date: null,
      time: null
    }
  };

  const name = extractReservationName(rawText);

  if (name && name !== session.reservationDraft.name) {
    session.reservationDraft.name = name;
    correctionResult.updatedAny = true;
  }

  const partySize = extractReservationPartySize(rawText);

  if (partySize && partySize !== session.reservationDraft.partySize) {
    session.reservationDraft.partySize = partySize;
    correctionResult.updatedAny = true;
  }

  const parsedDate = parseDateInput(rawText);

  if (parsedDate.valid) {
    if (isPastDate(parsedDate.date)) {
      correctionResult.invalid.date = "past";
    } else if (parsedDate.formatted !== session.reservationDraft.date) {
      session.reservationDraft.date = parsedDate.formatted;
      correctionResult.updatedAny = true;
    }
  }

  if (shouldAttemptTimeExtraction(rawText, "confirmation")) {
    const parsedTime = parseReservationTime(rawText);

    if (parsedTime.valid) {
      if (parsedTime.formatted !== session.reservationDraft.time) {
        session.reservationDraft.time = parsedTime.formatted;
        correctionResult.updatedAny = true;
      }
    } else if (parsedTime.reason === "out_of_range") {
      clearReservationDraftTime(session);
      correctionResult.invalid.time = "outOfRange";
    }
  }

  return correctionResult;
}

function finalizeReservationWithCapture(session) {
  const timeState = sanitizeReservationDraftTime(session);

  if (!timeState.valid) {
    session.currentFlow = "reservation";
    session.reservationStep = "time";

    return [
      createTextMessage(
        timeState.reason === "out_of_range" ? buildReservationTimeOutOfRangeText() : buildReservationTimePrompt()
      )
    ];
  }

  session.currentFlow = null;
  session.reservationStep = null;
  session.lastReservation = { ...session.reservationDraft };

  const summary = buildReservationSummary();
  session.reservationDraft = {};

  return [createTextMessage(summary)];
}

function handleReservationConfirmationStep(session, rawText, normalizedText) {
  if (isReservationConfirmationReply(normalizedText)) {
    return finalizeReservationWithCapture(session);
  }

  const correctionResult = applyReservationCorrections(session, rawText);

  if (correctionResult.invalid.date === "past") {
    return [createTextMessage("La fecha no puede estar en el pasado. Enviame una fecha valida, por favor.")];
  }

  if (correctionResult.invalid.time === "outOfRange") {
    session.currentFlow = "reservation";
    session.reservationStep = "time";
    return [createTextMessage(buildReservationTimeOutOfRangeText())];
  }

  const timeState = sanitizeReservationDraftTime(session);

  if (timeState.cleared) {
    session.currentFlow = "reservation";
    session.reservationStep = "time";
    return [createTextMessage(buildReservationTimeOutOfRangeText())];
  }

  if (correctionResult.updatedAny) {
    session.reservationStep = "confirmation";
    return [createTextMessage(buildReservationConfirmationText(session.reservationDraft))];
  }

  if (isReservationCorrectionReply(normalizedText)) {
    session.reservationStep = "confirmation";
    return [createTextMessage(buildReservationCorrectionPromptText())];
  }

  session.reservationStep = "confirmation";
  return [createTextMessage(buildReservationConfirmationErrorText())];
}

function handleReservationStepWithCapture(session, rawText, currentStep, options = {}) {
  const captureResult = captureReservationDetails(session, rawText, currentStep);
  const correctionResult = applyReservationCorrections(session, rawText);
  const timeState = sanitizeReservationDraftTime(session);
  const nextStep = getNextReservationStep(session.reservationDraft);

  session.reservationStep = nextStep;

  if (captureResult.invalid.date === "past" || correctionResult.invalid.date === "past") {
    return [createTextMessage("La fecha no puede estar en el pasado. Enviame una fecha valida, por favor.")];
  }

  if (captureResult.invalid.time === "outOfRange" || correctionResult.invalid.time === "outOfRange" || timeState.cleared) {
    session.currentFlow = "reservation";
    session.reservationStep = "time";
    return [createTextMessage(buildReservationTimeOutOfRangeText())];
  }

  if (!captureResult.capturedAny && !correctionResult.updatedAny && currentStep === nextStep && !options.preferPromptOnCurrentStep) {
    return [createTextMessage(buildReservationErrorForStep(nextStep))];
  }

  return [
    createTextMessage(
      buildReservationPromptForStep(nextStep, {
        reservationDraft: session.reservationDraft,
        includeIntro: options.includeIntroOnNamePrompt && nextStep === "name"
      })
    )
  ];
}

function beginReservationFlowWithCapture(session, rawText) {
  session.currentFlow = "reservation";
  session.reservationStep = "name";
  session.reservationDraft = {};

  return handleReservationStepWithCapture(session, rawText, "name", {
    preferPromptOnCurrentStep: true,
    includeIntroOnNamePrompt: true
  });
}

function matchReservationFlowAction(normalizedText) {
  if (isCallIntent(normalizedText)) {
    return "call";
  }

  if (isHumanRequest(normalizedText)) {
    return "human";
  }

  if (isReservationExitIntent(normalizedText)) {
    return "exit";
  }

  if (isConditionsIntent(normalizedText)) {
    return "conditions";
  }

  if (isInfoIntent(normalizedText)) {
    return "info";
  }

  if (isNegatedReservationMessage(normalizedText)) {
    return "exit";
  }

  return null;
}

async function handleReservationFlow(sessionStore, session, rawText, normalizedText) {
  const flowAction = matchReservationFlowAction(normalizedText);

  if (flowAction === "call") {
    sessionStore.resetReservationState(session.userId);
    return [createTextMessage(buildReservationDirectContactText())];
  }

  if (flowAction === "human") {
    sessionStore.resetReservationState(session.userId);
    return [createTextMessage(buildHumanSupportText())];
  }

  if (flowAction === "exit") {
    sessionStore.resetReservationState(session.userId);
    return [createTextMessage(buildReservationExitText())];
  }

  if (flowAction === "conditions") {
    sessionStore.resetReservationState(session.userId);
    return [createTextMessage(buildConditionsText())];
  }

  if (flowAction === "info") {
    sessionStore.resetReservationState(session.userId);
    return [createTextMessage(buildContactText())];
  }

  switch (session.reservationStep) {
    case "name":
      return handleReservationStepWithCapture(session, rawText, "name");
    case "partySize":
      return handleReservationStepWithCapture(session, rawText, "partySize");
    case "date":
      return handleReservationStepWithCapture(session, rawText, "date");
    case "time":
      return handleReservationStepWithCapture(session, rawText, "time");
    case "confirmation":
      return handleReservationConfirmationStep(session, rawText, normalizedText);
    default:
      sessionStore.resetReservationState(session.userId);
      return [createTextMessage(buildMainMenuText())];
  }
}

function buildMenuMessages(baseUrl) {
  const businessConfig = getBusinessConfig();
  const pdfFilename = businessConfig.menu.pdfFilename;
  const pdfUrl = pdfFilename && businessConfig.menu.pdfPath ? resolveMenuPdfUrl(baseUrl) : null;
  const outboundMessages = [];

  if (pdfFilename && pdfUrl) {
    outboundMessages.push(createTextMessage(`Aqui tienes nuestro ${getMenuLabel()} en PDF ${MENU_ICON}`));
    outboundMessages.push(
      createDocumentMessage({
        text: businessConfig.menu.pdfTitle || pdfFilename,
        filename: pdfFilename,
        url: pdfUrl
      })
    );
  } else {
    outboundMessages.push(createTextMessage(`Aqui tienes nuestro ${getMenuLabel()}.`));
  }

  outboundMessages.push(createTextMessage(buildMenuHighlightsText()));

  return outboundMessages;
}

async function handleTopLevelMessage(session, rawText, normalizedText, baseUrl) {
  const strictIntent = matchStrictIntent(normalizedText);

  switch (strictIntent) {
    case "reservationDirectContact":
      return [createTextMessage(buildReservationDirectContactText())];
    case "call":
      return [createTextMessage(buildCallRedirectText())];
    case "human":
      return [createTextMessage(buildHumanSupportText())];
    case "menu":
      return buildMenuMessages(baseUrl);
    case "reservation":
      return beginReservationFlowWithCapture(session, rawText);
    case "info":
      return [createTextMessage(buildContactText())];
    case "conditions":
      return [createTextMessage(buildConditionsText())];
    case "payments":
      return [createTextMessage(buildPaymentsText())];
    case "greeting":
      return [createTextMessage(buildMainMenuText())];
    default:
      break;
  }

  if (isMenuIntent(rawText)) {
    return buildMenuMessages(baseUrl);
  }

  if (shouldStartReservationFlow(rawText, normalizedText)) {
    return beginReservationFlowWithCapture(session, rawText);
  }

  if (shouldUseAiFallback(rawText, normalizedText)) {
    const aiReply = await generateAssistReply({
      session,
      business: getBusinessConfig(),
      baseUrl
    });

    if (aiReply) {
      console.log("[BOT] Ruta: groq_fallback");
      return [createTextMessage(aiReply)];
    }
  }

  return [createTextMessage(buildInvalidOptionText())];
}

function sanitizeSession(session) {
  return {
    userId: session.userId,
    isFirstContact: session.isFirstContact,
    currentFlow: session.currentFlow,
    reservationStep: session.reservationStep,
    reservationDraft: session.reservationDraft,
    lastReservation: session.lastReservation,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    history: session.history
  };
}

// Bot reusable: para cambiar de negocio solo cambia BUSINESS_SLUG o el JSON del cliente.
function createBot({ sessionStore, business = defaultBusinessConfig }) {
  activeBusinessConfig = business;

  return {
    async handleIncomingMessage({ userId, text, baseUrl }) {
      const session = sessionStore.getSession(userId);
      const rawText = String(text || "").trim();
      const normalizedText = normalizeText(rawText);

      sessionStore.appendHistory(userId, {
        role: "user",
        type: "text",
        text: rawText
      });

      let outboundMessages;

      if (session.currentFlow === "reservation") {
        outboundMessages = await handleReservationFlow(sessionStore, session, rawText, normalizedText);
      } else if (session.isFirstContact && (!rawText || isGreetingOnly(normalizedText))) {
        session.isFirstContact = false;
        outboundMessages = [createTextMessage(buildMainMenuText())];
      } else {
        session.isFirstContact = false;
        outboundMessages = await handleTopLevelMessage(session, rawText, normalizedText, baseUrl);
      }

      sessionStore.appendBotMessages(userId, outboundMessages);

      return {
        outboundMessages,
        session: sanitizeSession(sessionStore.getSession(userId))
      };
    }
  };
}

module.exports = createBot;
