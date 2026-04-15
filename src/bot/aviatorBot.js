const aviatorConfig = require("../config/aviatorConfig");
const { generateAssistReply } = require("../integrations/openai/openaiService");
const {
  parseDateInput,
  parseTimeInput,
  parseTimeInputWithRange,
  isPastDate,
  isTimeWithinRange
} = require("../utils/dateTime");
const { normalizeText } = require("../utils/text");

const AVIATOR_AGENT = "\u{1F468}\u{1F3FB}\u200D\u2708\uFE0F";
const PLANE = "\u2708\uFE0F";
const DINNER = "\u{1F37D}\uFE0F";
const AVIATOR_PHONE = "75552233";

const GREETING_KEYWORDS = [
  "hola",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "hey",
  "hello"
];
const MENU_KEYWORDS = ["menu", "carta", "comida", "platos", "plato", "bebidas", "postres"];
const RESERVATION_KEYWORDS = [
  "reservar",
  "reserva",
  "reservacion",
  "mesa",
  "quiero reservar",
  "agendar",
  "apartar",
  "separar",
  "booking"
];
const INFO_KEYWORDS = [
  "ubicacion",
  "direccion",
  "horario",
  "horarios",
  "hora",
  "horas",
  "contacto",
  "telefono",
  "donde",
  "abren",
  "cierran",
  "sucursal"
];
const CONDITIONS_KEYWORDS = ["condiciones", "reglas", "terminos", "tolerancia"];
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
const RESERVATION_DATE_EXAMPLES = "12/06/2026, 12-6-2026, mañana o este viernes";

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

function buildMainMenuText() {
  return `Hola, soy el asistente virtual de Aviator ${AVIATOR_AGENT}

Puedo ayudarte con:
1. Ver menu
2. Reservar mesa
3. Ubicacion, horarios y contacto
4. Condiciones de reserva
5. Hablar con un encargado

Escribe el numero de la opcion que prefieras o cuentame que necesitas.`;
}

function buildMenuHighlightsText() {
  return `Categorias destacadas:
- ${aviatorConfig.menuHighlights.join("\n- ")}`;
}

function buildContactText() {
  return `${aviatorConfig.contactText}

Horarios:
${aviatorConfig.hoursText}`;
}

function buildConditionsText() {
  return `Condiciones de reserva Aviator ${PLANE}

- ${aviatorConfig.reservationConditions.join("\n- ")}`;
}

function buildCallRedirectText() {
  return `Por ahora puedo ayudarte por este chat con informacion y reservas. Si prefieres una llamada, te recomiendo comunicarte directamente con Aviator al ${AVIATOR_PHONE}.`;
}

function buildReservationDirectContactText() {
  return `Si prefieres hacer tu reserva por llamada o con atencion directa, puedes comunicarte directamente con Aviator al ${AVIATOR_PHONE}.`;
}

function buildHumanSupportText() {
  return `Si prefieres atencion directa, puedes comunicarte con Aviator al ${AVIATOR_PHONE}.`;
}

function buildPaymentsText() {
  return `Para consultas sobre pagos te puedo derivar al contacto de Aviator.

${buildHumanSupportText()}`;
}

function buildInvalidOptionText() {
  return "Puedo ayudarte con reservas, menu, ubicacion y preguntas frecuentes. Si deseas reservar, escribe por ejemplo: quiero reservar.";
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
    openingTime: aviatorConfig.reservation.openingTime,
    cutoffTime: aviatorConfig.reservation.cutoffTime
  };
}

function buildReservationTimeWindowText() {
  const { openingTime, cutoffTime } = getReservationTimeBounds();
  return `entre las ${formatReservationTimeForDisplay(openingTime)} y las ${formatReservationTimeForDisplay(cutoffTime)}`;
}

function buildReservationTimeOutOfRangeText() {
  return `Lo siento \u{1F64C} Solo tomamos reservas ${buildReservationTimeWindowText()} \u00BFQuieres elegir una hora dentro de ese horario?`;
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
  return `Perfecto \u{1F64C} Tengo esto para tu reserva:
- Nombre: ${reservationDraft.name}
- Personas: ${reservationDraft.partySize}
- Fecha: ${reservationDraft.date}
- Hora: ${formatReservationTimeForDisplay(reservationDraft.time)}

¿Esta correcto?`;
}

function buildReservationSummary() {
  return "Perfecto \u{1F64C} Tu reserva quedo registrada. Un encargado la confirmara en breve.";
}

function resolveMenuPdfUrl(baseUrl) {
  return `${baseUrl.replace(/\/$/, "")}${aviatorConfig.menuPdfPath}`;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  return matchesAnyWholeKeyword(normalizedText, RESERVATION_KEYWORDS);
}

function isNegatedReservationMessage(normalizedText) {
  return [
    /\bno\s+(?:quiero|deseo|busco|pienso|voy\s+a)?\s*reserv(?:ar|a|acion)\b/,
    /\bno\s+quiero\s+hacer\s+una\s+reserv(?:a|acion)\b/,
    /\bno\s+deseo\s+hacer\s+una\s+reserv(?:a|acion)\b/
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
  if (isReservationIntent(normalizedText)) {
    return true;
  }

  if (isReservationDirectContactIntent(normalizedText)) {
    return false;
  }

  if (isNegatedReservationMessage(normalizedText) || isReservationManagementIntent(normalizedText)) {
    return false;
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

  if (isReservationIntent(normalizedText)) {
    return "reservation";
  }

  if (isInfoIntent(normalizedText)) {
    return "info";
  }

  if (isConditionsIntent(normalizedText)) {
    return "conditions";
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
  return normalizedText === "1" || isShortDirectKeywordIntent(normalizedText, MENU_KEYWORDS);
}

function isMenuIntent(message) {
  const normalizedText = normalizeText(String(message || ""))
    .replace(/[,.;:!?¿¡]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText) {
    return false;
  }

  if (isStrictMenuIntent(normalizedText)) {
    return true;
  }

  if (!matchesAnyWholeKeyword(normalizedText, ["menu", "carta"])) {
    return false;
  }

  const negativePatterns = [
    /\bno\s+me\s+gust\w*\b.*\b(?:menu|carta)\b/,
    /\b(?:menu|carta)\b.*\b(?:estaba|esta|fue|era|salio|parece|parecia)\b/,
    /\b(?:menu|carta)\b.*\b(?:caro|cara|rico|rica|malo|mala|bueno|buena|feo|fea)\b/,
    /\b(?:menu|carta)\b.*\b(?:tiene|trae|incluye|ofrece|lleva)\b/
  ];

  if (negativePatterns.some((pattern) => pattern.test(normalizedText))) {
    return false;
  }

  const requestPatterns = [
    /\b(?:me\s+pasas|pasame|pasar|me\s+manda|me\s+mandas|mandame|mandar|mostrarme|muestrame|mostrar|enviame|enviar|me\s+envias|dame|dar|me\s+das|comparteme|compartir)\b.*\b(?:menu|carta)\b/,
    /\b(?:quiero|quisiera)\s+(?:ver|revisar)\b.*\b(?:menu|carta)\b/,
    /\b(?:puedes|me\s+puedes|podrias|me\s+podrias)\b.*\b(?:pasar|mandar|mostrar|mostrarme|enviar|enviarme|dar|compartir)\b.*\b(?:menu|carta)\b/,
    /\b(?:menu|carta)\b.*\b(?:porfa|por\s+favor|porfis|pls)\b/,
    /\bque\s+(?:hay|tienen|tienes)\s+en\s+(?:el|la)?\s*(?:menu|carta)\b/
  ];

  return requestPatterns.some((pattern) => pattern.test(normalizedText));
}

function isReservationIntent(normalizedText) {
  if (normalizedText === "2") {
    return true;
  }

  if (isNegatedReservationMessage(normalizedText) || isReservationManagementIntent(normalizedText)) {
    return false;
  }

  return isShortDirectKeywordIntent(normalizedText, RESERVATION_KEYWORDS, 4);
}

function isInfoIntent(normalizedText) {
  return normalizedText === "3" || isShortDirectKeywordIntent(normalizedText, INFO_KEYWORDS);
}

function isConditionsIntent(normalizedText) {
  return normalizedText === "4" || isShortDirectKeywordIntent(normalizedText, CONDITIONS_KEYWORDS);
}

function isHumanRequest(normalizedText) {
  return (
    isShortDirectKeywordIntent(normalizedText, HANDOFF_KEYWORDS, 4) ||
    matchesAnyWholeKeyword(normalizedText, [
      "hablar con alguien",
      "hablar con una persona",
      "atencion humana"
    ])
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
  return normalizedText === "menu" || (isShortDirectMessage(normalizedText, 4) && matchesAnyWholeKeyword(normalizedText, CANCEL_KEYWORDS));
}

function buildReservationExitText() {
  return "Claro. Salimos del proceso de reserva. Si quieres, puedo ayudarte con menu, horarios o informacion del restaurante.";
}

function buildReservationNamePrompt(includeIntro = false) {
  const question = "¿A nombre de quien quedaria la reserva?";

  if (!includeIntro) {
    return question;
  }

  return `Con gusto te ayudo con tu reserva en Aviator ${PLANE}

${question}`;
}

function buildReservationPartySizePrompt() {
  return "¿Para cuantas personas sera la reserva?";
}

function buildReservationDatePrompt() {
  return `¿Para que fecha deseas la reserva? Puedes escribirla como ${RESERVATION_DATE_EXAMPLES}.`;
}

function buildReservationTimePrompt() {
  return "¿A que hora llegarian? Puedes escribir 19:00 o 7:00 pm.";
}

function buildReservationNameErrorText() {
  return "No pude identificar el nombre de la reserva. Puedes enviarlo como: Leonardo o a nombre de Leonardo.";
}

function buildReservationPartySizeErrorText() {
  return "No pude identificar la cantidad de personas \u{1F64C} Puedes escribir algo como: 2, para 4, o somos 3.";
}

function buildReservationDateErrorText() {
  return `No pude identificar la fecha. Puedes enviarla como ${RESERVATION_DATE_EXAMPLES}.`;
}

function buildReservationTimeErrorText() {
  return "No pude identificar la hora. Puedes enviarla como 8 pm, 20:00 o a las 8.";
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
  return [
    /^si\b/,
    /^ok\b/,
    /^correcto\b/,
    /^esta bien\b/,
    /^confirmo\b/
  ].some((pattern) => pattern.test(normalizedText));
}

function isReservationCorrectionReply(normalizedText) {
  return [
    /\bno\b/,
    /\bmejor\b/,
    /\bcambiar\b/,
    /\bcorregir\b/,
    /\bmodificar\b/
  ].some((pattern) => pattern.test(normalizedText));
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

  if (/\d/.test(name) || !/^[a-z' -]+$/.test(normalizedName)) {
    return false;
  }

  const blockedWords = new Set([
    "reserva",
    "mesa",
    "persona",
    "personas",
    "cantidad",
    "fecha",
    "hora",
    "nombre",
    "quiero",
    "reservar",
    "reservacion",
    "agendar",
    "apartar",
    "separar",
    "booking",
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
  ]);
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
    /\s+para\s+pasado\s+ma(?:ñ|n)ana\b/i,
    /\s+para\s+ma(?:ñ|n)ana\b/i,
    /\s+para\s+(?:este|el)\s+(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/i,
    /\s+pasado\s+ma(?:ñ|n)ana\b/i,
    /\s+ma(?:ñ|n)ana\b/i,
    /\s+(?:este|el)\s+(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/i,
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

  if (!text) {
    return null;
  }

  const patterns = [
    /\ba\s+nombre\s+de\s+(.+)$/i,
    /\bla\s+reserva\s+es\s+para\s+(.+)$/i,
    /\bla\s+reserva\s+ser(?:i|\u00ED)a\s+para\s+(.+)$/i,
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

function beginReservationFlow(session) {
  session.currentFlow = "reservation";
  session.reservationStep = "name";
  session.reservationDraft = {};

  return [
    createTextMessage(`Con gusto te ayudo con tu reserva en Aviator ${PLANE}

¿A nombre de quien quedaria la reserva?`)
  ];
}

function handleNameStep(session, rawText) {
  const name = extractReservationName(rawText);

  if (!name) {
    return [
      createTextMessage(
        "No pude identificar el nombre de la reserva. Puedes enviarlo como: Leonardo o a nombre de Leonardo."
      )
    ];
  }

  session.reservationDraft.name = name;
  session.reservationStep = "partySize";

  return [createTextMessage("¿Para cuantas personas sera la reserva?")];
}

function handlePartySizeStep(session, rawText) {
  const partySize = extractReservationPartySize(rawText);

  if (!partySize) {
    return [
      createTextMessage(
        "No pude identificar la cantidad de personas \u{1F64C} Puedes escribir algo como: 2, para 4, o somos 3."
      )
    ];
  }

  session.reservationDraft.partySize = partySize;
  session.reservationStep = "date";

  return [
    createTextMessage(`¿Para que fecha deseas la reserva? Puedes escribirla como ${RESERVATION_DATE_EXAMPLES}.`)
  ];
}

function handleDateStep(session, rawText) {
  const parsedDate = parseDateInput(rawText);

  if (!parsedDate.valid) {
    return [createTextMessage(`No pude identificar la fecha. Puedes enviarla como ${RESERVATION_DATE_EXAMPLES}.`)];
  }

  if (isPastDate(parsedDate.date)) {
    return [createTextMessage("La fecha no puede estar en el pasado. Enviame una fecha valida, por favor.")];
  }

  session.reservationDraft.date = parsedDate.formatted;
  session.reservationStep = "time";

  return [createTextMessage("¿A que hora llegarian? Puedes escribir 19:00 o 7:00 pm.")];
}

function handleTimeStep(session, rawText) {
  const parsedTime = parseTimeInput(rawText);

  if (!parsedTime.valid) {
    return [createTextMessage("No pude identificar la hora. Puedes enviarla como 8 pm, 20:00 o a las 8.")];
  }

  if (isTimeAfterCutoff(parsedTime.formatted, aviatorConfig.reservation.cutoffTime)) {
    return [
      createTextMessage("No aceptamos reservas pasadas las 19:30. Si deseas, indicame otro horario hasta las 19:30.")
    ];
  }

  session.reservationDraft.time = parsedTime.formatted;
  session.currentFlow = null;
  session.reservationStep = null;
  session.lastReservation = { ...session.reservationDraft };

  const summary = buildReservationSummary(session.reservationDraft);
  session.reservationDraft = {};

  return [createTextMessage(summary)];
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
    const parsedTime = parseTimeInput(rawText);

    if (parsedTime.valid) {
      if (isTimeAfterCutoff(parsedTime.formatted, aviatorConfig.reservation.cutoffTime)) {
        captureResult.invalid.time = "afterCutoff";
      } else {
        session.reservationDraft.time = parsedTime.formatted;
        captureResult.capturedAny = true;
      }
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
    const parsedTime = parseTimeInput(rawText);

    if (parsedTime.valid) {
      if (isTimeAfterCutoff(parsedTime.formatted, aviatorConfig.reservation.cutoffTime)) {
        correctionResult.invalid.time = "afterCutoff";
      } else if (parsedTime.formatted !== session.reservationDraft.time) {
        session.reservationDraft.time = parsedTime.formatted;
        correctionResult.updatedAny = true;
      }
    }
  }

  return correctionResult;
}

function finalizeReservationWithCapture(session) {
  session.currentFlow = null;
  session.reservationStep = null;
  session.lastReservation = { ...session.reservationDraft };

  const summary = buildReservationSummary(session.reservationDraft);
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

  if (correctionResult.invalid.time === "afterCutoff") {
    return [
      createTextMessage("No aceptamos reservas pasadas las 19:30. Si deseas, indicame otro horario hasta las 19:30.")
    ];
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
  const nextStep = getNextReservationStep(session.reservationDraft);

  session.reservationStep = nextStep;

  if (captureResult.invalid.date === "past" || correctionResult.invalid.date === "past") {
    return [createTextMessage("La fecha no puede estar en el pasado. Enviame una fecha valida, por favor.")];
  }

  if (captureResult.invalid.time === "afterCutoff" || correctionResult.invalid.time === "afterCutoff") {
    return [
      createTextMessage("No aceptamos reservas pasadas las 19:30. Si deseas, indicame otro horario hasta las 19:30.")
    ];
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

function buildReservationConfirmationText(reservationDraft) {
  const lines = [
    `- Nombre: ${reservationDraft.name}`,
    `- Personas: ${reservationDraft.partySize}`,
    `- Fecha: ${reservationDraft.date}`
  ];

  if (isStoredReservationTimeValid(reservationDraft.time)) {
    lines.push(`- Hora: ${formatReservationTimeForDisplay(reservationDraft.time)}`);
  }

  return `Perfecto \u{1F64C} Tengo esto para tu reserva:
${lines.join("\n")}

Â¿Esta correcto?`;
}

function buildReservationTimePrompt() {
  return `Â¿A que hora llegarian? Solo tomamos reservas ${buildReservationTimeWindowText()}. Puedes escribir 11 am, 7 pm o 19:30.`;
}

function buildReservationTimeErrorText() {
  return `No pude identificar la hora. Solo tomamos reservas ${buildReservationTimeWindowText()}. Puedes enviarla como 11 am, 7 pm o 19:30.`;
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

  return `Perfecto \u{1F64C} Tengo esto para tu reserva:
${lines.join("\n")}

\u00BFEsta correcto?`;
}

function buildReservationTimePrompt() {
  return `\u00BFA que hora llegarian? Solo tomamos reservas ${buildReservationTimeWindowText()} Puedes escribir 11 am, 7 pm o 19:30.`;
}

function buildReservationTimeErrorText() {
  return `No pude identificar la hora. Solo tomamos reservas ${buildReservationTimeWindowText()} Puedes enviarla como 11 am, 7 pm o 19:30.`;
}

function handleDateStep(session, rawText) {
  const parsedDate = parseDateInput(rawText);

  if (!parsedDate.valid) {
    return [createTextMessage(`No pude identificar la fecha. Puedes enviarla como ${RESERVATION_DATE_EXAMPLES}.`)];
  }

  if (isPastDate(parsedDate.date)) {
    return [createTextMessage("La fecha no puede estar en el pasado. Enviame una fecha valida, por favor.")];
  }

  session.reservationDraft.date = parsedDate.formatted;
  session.reservationStep = "time";

  return [createTextMessage(buildReservationTimePrompt())];
}

function handleTimeStep(session, rawText) {
  const parsedTime = parseReservationTime(rawText);

  if (!parsedTime.valid) {
    return [
      createTextMessage(
        parsedTime.reason === "out_of_range" ? buildReservationTimeOutOfRangeText() : buildReservationTimeErrorText()
      )
    ];
  }

  session.reservationDraft.time = parsedTime.formatted;
  session.currentFlow = null;
  session.reservationStep = null;
  session.lastReservation = { ...session.reservationDraft };

  const summary = buildReservationSummary(session.reservationDraft);
  session.reservationDraft = {};

  return [createTextMessage(summary)];
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

  const summary = buildReservationSummary(session.reservationDraft);
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
  return [
    createTextMessage(`Aqui tienes nuestro menu en PDF ${PLANE}${DINNER}`),
    createDocumentMessage({
      text: "Menu AVIATOR 2026.pdf",
      filename: aviatorConfig.menuPdfFilename,
      url: resolveMenuPdfUrl(baseUrl)
    }),
    createTextMessage(buildMenuHighlightsText())
  ];
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
      restaurant: aviatorConfig,
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

function createAviatorBot({ sessionStore }) {
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

module.exports = createAviatorBot;
