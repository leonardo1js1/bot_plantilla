class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  hasSession(userId) {
    return this.sessions.has(userId);
  }

  getSession(userId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        userId,
        isFirstContact: true,
        currentFlow: null,
        reservationStep: null,
        reservationDraft: {},
        lastReservation: null,
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return this.sessions.get(userId);
  }

  appendHistory(userId, entry) {
    const session = this.getSession(userId);

    session.history.push({
      ...entry,
      createdAt: new Date().toISOString()
    });
    session.history = session.history.slice(-50);
    session.updatedAt = new Date().toISOString();
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
    return session;
  }
}

module.exports = SessionStore;
