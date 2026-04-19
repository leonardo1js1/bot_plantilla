const createBot = require("../src/bot/bot");
const { loadBusiness } = require("../src/config/loadBusiness");
const HandoffService = require("../src/services/handoffService");
const ReservationService = require("../src/services/reservationService");
const MemoryStorageAdapter = require("../src/storage/adapters/memoryStorageAdapter");
const SessionStore = require("../src/store/sessionStore");

function createBotTestContext(businessId = "aviator") {
  const business = loadBusiness(businessId);
  const storageAdapter = new MemoryStorageAdapter();
  const sessionStore = new SessionStore({ storageAdapter });
  const reservationService = new ReservationService({ storageAdapter, business });
  const handoffService = new HandoffService({ storageAdapter, business });
  const bot = createBot({
    sessionStore,
    business,
    reservationService,
    handoffService
  });

  return {
    business,
    storageAdapter,
    sessionStore,
    reservationService,
    handoffService,
    bot
  };
}

async function sendMessage(bot, userId, text) {
  return bot.handleIncomingMessage({
    userId,
    text,
    baseUrl: "http://localhost:3000"
  });
}

function getOutboundTexts(response) {
  return (response?.outboundMessages || []).map((message) => message.text || "");
}

function getLastOutboundText(response) {
  const outboundTexts = getOutboundTexts(response);
  return outboundTexts[outboundTexts.length - 1] || "";
}

async function sendConversation(bot, userId, messages = []) {
  const transcript = [];

  for (const text of messages) {
    const response = await sendMessage(bot, userId, text);
    transcript.push({
      inboundText: text,
      outboundTexts: getOutboundTexts(response),
      response
    });
  }

  return transcript;
}

module.exports = {
  createBotTestContext,
  sendMessage,
  sendConversation,
  getOutboundTexts,
  getLastOutboundText
};
