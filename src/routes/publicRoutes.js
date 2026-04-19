const express = require("express");

const {
  buildFriendlyJsonError,
  buildSimulationPayload,
  logRouteError,
  resolveBaseUrl,
  sendPlainOk
} = require("../app/httpUtils");

function createPublicRouter({ business, bot, sessionStore, menuPdfAbsolutePath }) {
  const router = express.Router();

  async function handleBotMessage(req, { userId, text }) {
    return bot.handleIncomingMessage({
      userId,
      text,
      baseUrl: resolveBaseUrl(req)
    });
  }

  router.get("/", (req, res) => sendPlainOk(res));
  router.get("/health", (req, res) => sendPlainOk(res));

  if (business.menu.pdfPath && business.menu.pdfFilename && menuPdfAbsolutePath) {
    router.get(business.menu.pdfPath, (req, res) => {
      res.sendFile(menuPdfAbsolutePath);
    });
  }

  router.post("/api/test/message", async (req, res) => {
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

  router.get("/api/test/conversations/:userId", (req, res) => {
    const { userId } = req.params;

    if (!sessionStore.hasSession(userId)) {
      return res.status(404).json({
        ok: false,
        error: "No existe una conversacion para ese userId."
      });
    }

    return res.json({
      ok: true,
      session: sessionStore.getConversation(userId)
    });
  });

  return router;
}

module.exports = createPublicRouter;
