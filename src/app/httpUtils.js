const { escapeXml } = require("../utils/text");

const FRIENDLY_PROCESSING_ERROR =
  "No pudimos procesar tu mensaje en este momento. Intenta nuevamente en unos segundos.";

function resolveBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function buildSimulationPayload(userId, inboundMessage, result) {
  return {
    ok: true,
    userId,
    inboundMessage,
    outboundMessages: result.outboundMessages,
    session: result.session
  };
}

function buildTwiml(outboundMessages) {
  const blocks = outboundMessages
    .map((message) => {
      if (message.type === "document") {
        return `<Message><Body>${escapeXml(message.text || "")}</Body><Media>${escapeXml(
          message.url || ""
        )}</Media></Message>`;
      }

      return `<Message>${escapeXml(message.text || "")}</Message>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><Response>${blocks}</Response>`;
}

function buildFriendlyJsonError() {
  return {
    ok: false,
    error: FRIENDLY_PROCESSING_ERROR
  };
}

function serializeForLog(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function logRouteError(context, error) {
  console.error(`[ERROR] ${context}`);

  if (error && error.stack) {
    console.error(error.stack);
    return;
  }

  console.error(error);
}

function sendPlainOk(res) {
  return res.status(200).type("text/plain").send("OK");
}

function extractCloudApiMessage(body) {
  const firstEntry = body?.entry?.[0];
  const firstChange = firstEntry?.changes?.[0];
  const value = firstChange?.value;
  const incomingMessage = value?.messages?.[0];

  if (!incomingMessage) {
    return null;
  }

  return {
    userId: incomingMessage.from,
    text: incomingMessage.text?.body || ""
  };
}

module.exports = {
  FRIENDLY_PROCESSING_ERROR,
  resolveBaseUrl,
  buildSimulationPayload,
  buildTwiml,
  buildFriendlyJsonError,
  serializeForLog,
  logRouteError,
  sendPlainOk,
  extractCloudApiMessage
};
