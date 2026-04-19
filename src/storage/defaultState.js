function createDefaultStorageState() {
  return {
    version: 1,
    sessions: {},
    reservations: {},
    handoffs: {}
  };
}

function normalizeRecordMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStorageState(rawState) {
  const baseState = createDefaultStorageState();

  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return baseState;
  }

  return {
    version: Number(rawState.version) || baseState.version,
    sessions: normalizeRecordMap(rawState.sessions),
    reservations: normalizeRecordMap(rawState.reservations),
    handoffs: normalizeRecordMap(rawState.handoffs)
  };
}

module.exports = {
  createDefaultStorageState,
  normalizeStorageState
};
