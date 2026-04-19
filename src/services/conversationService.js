const { cloneDeep } = require("../utils/records");

class ConversationService {
  constructor({ sessionStore }) {
    this.sessionStore = sessionStore;
  }

  getConversationByUserId(userId) {
    const normalizedUserId = String(userId || "").trim();

    if (!this.sessionStore.hasSession(normalizedUserId)) {
      return null;
    }

    const session = this.sessionStore.getSession(normalizedUserId);

    return {
      userId: normalizedUserId,
      session: cloneDeep(session),
      history: cloneDeep(session.history || [])
    };
  }
}

module.exports = ConversationService;
