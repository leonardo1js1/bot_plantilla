const { cloneDeep } = require("../../utils/records");
const { normalizeStorageState } = require("../defaultState");

class MemoryStorageAdapter {
  constructor(initialState) {
    this.state = normalizeStorageState(initialState);
    this.driverName = "memory";
  }

  getCollection(collectionName) {
    if (!Object.prototype.hasOwnProperty.call(this.state, collectionName)) {
      this.state[collectionName] = {};
    }

    return this.state[collectionName];
  }

  snapshot() {
    return cloneDeep(this.state);
  }

  persist() {
    return null;
  }

  getDriverName() {
    return this.driverName;
  }
}

module.exports = MemoryStorageAdapter;
