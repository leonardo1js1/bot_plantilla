const MemoryStorageAdapter = require("../storage/adapters/memoryStorageAdapter");
const { cloneDeep } = require("../utils/records");

function createInitialSession(userId) {
  const now = new Date().toISOString();

  return {
    userId,
    isFirstContact: true,
    currentFlow: null,
    reservationStep: null,
    reservationDraft: {},
    lastReservation: null,
    history: [],
    createdAt: now,
    updatedAt: now
  };
}

class SessionStore {
  constructor({ storageAdapter } = {}) {
    this.storageAdapter = storageAdapter || new MemoryStorageAdapter();
  }

  get sessions() {
    return this.storageAdapter.getCollection("sessions");
  }

  hasSession(userId) {
    return Boolean(this.sessions[String(userId || "").trim()]);
  }

  getSession(userId) {
    const normalizedUserId = String(userId || "").trim();

    if (!this.sessions[normalizedUserId]) {
      this.sessions[normalizedUserId] = createInitialSession(normalizedUserId);
      this.storageAdapter.persist();
    }

    return this.sessions[normalizedUserId];
  }

  saveSession(userId) {
    this.getSession(userId).updatedAt = new Date().toISOString();
    this.storageAdapter.persist();
    return this.getSession(userId);
  }

  appendHistory(userId, entry) {
    const session = this.getSession(userId);

    session.history.push({
      ...entry,
      createdAt: new Date().toISOString()
    });
    session.history = session.history.slice(-100);
    session.updatedAt = new Date().toISOString();
    this.storageAdapter.persist();
    return session;
  }

  getRecentHistory(userId, limit = 10) {
    const session = this.getSession(userId);
    return session.history.slice(-Math.max(0, limit));
  }

  appendBotMessages(userId, messages) {
    messages.forEach((message) => {
      this.appendHistory(userId, {
        role: "assistant",
        type: message.type,
        text: message.text || "",
        filename: message.filename || null,
        url: message.url || null
      });
    });
  }

  resetReservationState(userId) {
    const session = this.getSession(userId);
    session.currentFlow = null;
    session.reservationStep = null;
    session.reservationDraft = {};
    session.updatedAt = new Date().toISOString();
    this.storageAdapter.persist();
    return session;
  }

  getConversation(userId) {
    return cloneDeep(this.getSession(userId));
  }
}

module.exports = SessionStore;
module.exports.createInitialSession = createInitialSession;
