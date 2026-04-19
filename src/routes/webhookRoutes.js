const express = require("express");

const {
  extractUltraMsgChatId,
  extractUltraMsgMessage,
  hasUltraMsgConfig,
  sendUltraMsgMessages
} = require("../integrations/ultramsg/ultraMsgService");
const {
  FRIENDLY_PROCESSING_ERROR,
  buildFriendlyJsonError,
  buildSimulationPayload,
  buildTwiml,
  extractCloudApiMessage,
  logRouteError,
  resolveBaseUrl,
  serializeForLog
} = require("../app/httpUtils");

function createWebhookRouter({ bot, business }) {
  const router = express.Router();

  async function handleBotMessage(req, { userId, text }) {
    return bot.handleIncomingMessage({
      userId,
      text,
      baseUrl: resolveBaseUrl(req)
    });
  }

  router.post("/webhooks/whatsapp/test", async (req, res) => {
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

  router.post("/webhooks/whatsapp/twilio", async (req, res) => {
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

      return res.type("text/xml").send(buildTwiml(result.outboundMessages));
    } catch (error) {
      logRouteError("Error en /webhooks/whatsapp/twilio", error);

      return res.type("text/xml").send(
        buildTwiml([
          {
            type: "text",
            text: FRIENDLY_PROCESSING_ERROR
          }
        ])
      );
    }
  });

  router.get("/webhooks/whatsapp/cloud-api", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || `${business.id}-demo-token`;

    if (mode === "subscribe" && token === expectedToken) {
      return res.status(200).send(challenge);
    }

    return res.status(403).json({
      ok: false,
      error: "Webhook verification failed."
    });
  });

  router.post("/webhooks/whatsapp/cloud-api", async (req, res) => {
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

  router.post("/webhook-ultramsg", async (req, res) => {
    console.log("[DEBUG][UltraMsg][webhook] Incoming request on /webhook-ultramsg");
    console.log(`[DEBUG][UltraMsg][webhook] Body received from UltraMsg: ${serializeForLog(req.body)}`);

    const chatId = extractUltraMsgChatId(req.body);

    if (!chatId) {
      console.log("[BOT] Ignorado: chatId invalido");
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

      console.log(
        `[DEBUG][UltraMsg][send] UltraMsg provider response: ${serializeForLog(providerResults)}`
      );

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

  return router;
}

module.exports = createWebhookRouter;
