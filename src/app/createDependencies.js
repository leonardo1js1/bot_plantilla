const createBot = require("../bot/bot");
const { loadBusiness } = require("../config/loadBusiness");
const ConversationService = require("../services/conversationService");
const HandoffService = require("../services/handoffService");
const ReservationService = require("../services/reservationService");
const createStorageAdapter = require("../storage/createStorageAdapter");
const SessionStore = require("../store/sessionStore");

function createDependencies(options = {}) {
  const business = options.business || loadBusiness(options.businessId);
  const storageAdapter =
    options.storageAdapter ||
    createStorageAdapter({
      driver: options.storage?.driver,
      filePath: options.storage?.filePath,
      initialState: options.storage?.initialState
    });
  const sessionStore = options.sessionStore || new SessionStore({ storageAdapter });
  const reservationService =
    options.reservationService || new ReservationService({ storageAdapter, business });
  const handoffService = options.handoffService || new HandoffService({ storageAdapter, business });
  const conversationService =
    options.conversationService || new ConversationService({ sessionStore });
  const bot =
    options.bot ||
    createBot({
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
    conversationService,
    bot
  };
}

module.exports = createDependencies;
