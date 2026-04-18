const path = require("path");
const express = require("express");
const loadEnv = require("./config/loadEnv");

loadEnv();

const SessionStore = require("./store/sessionStore");
const createBot = require("./bot/bot");
// La data del cliente activo vive en src/config/business/<slug>.json.
const business = require("./config/loadBusiness");
const {
  extractUltraMsgChatId,
  extractUltraMsgMessage,
  hasUltraMsgConfig,
  sendUltraMsgMessages
} = require("./integrations/ultramsg/ultraMsgService");
const { escapeXml } = require("./utils/text");

const app = express();
app.set("trust proxy", true);
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const serviceName = process.env.SERVICE_NAME || `bottt-${business.slug}`;
const menuPdfAbsolutePath = business.menu.pdfFilename
  ? path.resolve(__dirname, "..", "assets", business.menu.pdfFilename)
  : null;

const sessionStore = new SessionStore();
// El bot recibe el negocio activo para que la misma base sirva para otros clientes.
const bot = createBot({ sessionStore, business });
const FRIENDLY_PROCESSING_ERROR =
  "No pudimos procesar tu mensaje en este momento. Intenta nuevamente en unos segundos.";

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
        return `<Message><Body>${escapeXml(message.text || "")}</Body><Media>${escapeXml(message.url || "")}</Media></Message>`;
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

async function handleBotMessage(req, { userId, text }) {
  return bot.handleIncomingMessage({
    userId,
    text,
    baseUrl: resolveBaseUrl(req)
  });
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

app.get("/", (req, res) => {
  return sendPlainOk(res);
});

app.get("/health", (req, res) => {
  return sendPlainOk(res);
});

if (business.menu.pdfPath && business.menu.pdfFilename) {
  app.get(business.menu.pdfPath, (req, res) => {
    res.sendFile(menuPdfAbsolutePath);
  });
}

app.post("/api/test/message", async (req, res) => {
  const userId = String(req.body.userId || "").trim();
  const message = String(req.body.message || "").trim();

  if (!userId || !message) {
    return res.status(400).json({
      ok: false,
      error: "Debes enviar userId y message."
    });
  }

  try {
    const result = await handleBotMessage(req, {
      userId,
      text: message
    });

    return res.json(buildSimulationPayload(userId, message, result));
  } catch (error) {
    logRouteError("Error en /api/test/message", error);
    return res.status(500).json(buildFriendlyJsonError());
  }
});

app.get("/api/test/conversations/:userId", (req, res) => {
  const { userId } = req.params;

  if (!sessionStore.hasSession(userId)) {
    return res.status(404).json({
      ok: false,
      error: "No existe una conversacion para ese userId."
    });
  }

  return res.json({
    ok: true,
    session: sessionStore.getSession(userId)
  });
});

app.post("/webhooks/whatsapp/test", async (req, res) => {
  const userId = String(req.body.userId || req.body.from || "").trim();
  const message = String(req.body.message || req.body.text || "").trim();

  if (!userId || !message) {
    return res.status(400).json({
      ok: false,
      error: "Debes enviar userId/from y message/text."
    });
  }

  try {
    const result = await handleBotMessage(req, {
      userId,
      text: message
    });

    return res.json(buildSimulationPayload(userId, message, result));
  } catch (error) {
    logRouteError("Error en /webhooks/whatsapp/test", error);
    return res.status(500).json(buildFriendlyJsonError());
  }
});

app.post("/webhooks/whatsapp/twilio", async (req, res) => {
  const from = String(req.body.From || req.body.WaId || "").trim();
  const message = String(req.body.Body || "").trim();

  if (!from || !message) {
    return res.status(400).type("text/plain").send("Missing From or Body");
  }

  try {
    const result = await handleBotMessage(req, {
      userId: from,
      text: message
    });

    res.type("text/xml").send(buildTwiml(result.outboundMessages));
  } catch (error) {
    logRouteError("Error en /webhooks/whatsapp/twilio", error);
    res.type("text/xml").send(
      buildTwiml([
        {
          type: "text",
          text: FRIENDLY_PROCESSING_ERROR
        }
      ])
    );
  }
});

app.get("/webhooks/whatsapp/cloud-api", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || `${business.slug}-demo-token`;

  if (mode === "subscribe" && token === expectedToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({
    ok: false,
    error: "Webhook verification failed."
  });
});

app.post("/webhooks/whatsapp/cloud-api", async (req, res) => {
  const incoming = extractCloudApiMessage(req.body);

  if (!incoming) {
    return res.json({
      ok: true,
      status: "ignored"
    });
  }

  try {
    const result = await handleBotMessage(req, {
      userId: incoming.userId,
      text: incoming.text
    });

    return res.json({
      ok: true,
      status: "received",
      outboundMessages: result.outboundMessages
    });
  } catch (error) {
    logRouteError("Error en /webhooks/whatsapp/cloud-api", error);

    return res.status(200).json({
      ok: false,
      status: "failed",
      error: FRIENDLY_PROCESSING_ERROR
    });
  }
});

app.post("/webhook-ultramsg", async (req, res) => {
  console.log("[DEBUG][UltraMsg][webhook] Incoming request on /webhook-ultramsg");
  console.log(`[DEBUG][UltraMsg][webhook] Body received from UltraMsg: ${serializeForLog(req.body)}`);

  const chatId = extractUltraMsgChatId(req.body);

  if (!chatId) {
    console.log("[BOT] Ignorado: chatId inválido");
    return res.json({
      ok: true,
      status: "ignored"
    });
  }

  if (chatId.endsWith("@g.us")) {
    console.log("[BOT] Ignorado: mensaje de grupo");
    return res.json({
      ok: true,
      status: "ignored"
    });
  }

  const incoming = extractUltraMsgMessage(req.body);

  if (!incoming) {
    console.log("[DEBUG][UltraMsg][webhook] No inbound chat message could be extracted.");
    return res.json({
      ok: true,
      status: "ignored"
    });
  }

  if (!hasUltraMsgConfig()) {
    return res.status(500).json({
      ok: false,
      error: "Debes configurar ULTRAMSG_INSTANCE_ID y ULTRAMSG_TOKEN."
    });
  }

  try {
    const result = await handleBotMessage(req, {
      userId: incoming.userId,
      text: incoming.text
    });

    console.log(
      `[DEBUG][UltraMsg][send] Sending outbound messages to UltraMsg: ${serializeForLog({
        to: incoming.userId,
        outboundMessages: result.outboundMessages
      })}`
    );

    const providerResults = await sendUltraMsgMessages({
      to: incoming.userId,
      outboundMessages: result.outboundMessages
    });

    console.log(`[DEBUG][UltraMsg][send] UltraMsg provider response: ${serializeForLog(providerResults)}`);

    return res.json({
      ok: true,
      status: "sent",
      userId: incoming.userId,
      inboundMessage: incoming.text,
      outboundMessages: result.outboundMessages,
      providerResults
    });
  } catch (error) {
    logRouteError("Error en webhook UltraMsg", error);

    return res.status(200).json({
      ok: false,
      status: "send_failed",
      error: FRIENDLY_PROCESSING_ERROR
    });
  }
});

app.use((error, req, res, next) => {
  logRouteError("Error no controlado del servidor", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json(buildFriendlyJsonError());
});

app.listen(port, host, () => {
  console.log(`${serviceName} listo en http://${host}:${port}`);
});
