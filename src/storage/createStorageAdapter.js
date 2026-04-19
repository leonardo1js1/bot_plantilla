const path = require("path");

const MemoryStorageAdapter = require("./adapters/memoryStorageAdapter");
const JsonFileStorageAdapter = require("./adapters/jsonFileStorageAdapter");

const DEFAULT_STORAGE_DRIVER = "file";
const DEFAULT_STORAGE_FILE_PATH = path.resolve(__dirname, "..", "..", "data", "storage.json");

function normalizeStorageDriver(driver) {
  const normalizedDriver = String(driver || DEFAULT_STORAGE_DRIVER).trim().toLowerCase();
  return normalizedDriver === "memory" ? "memory" : "file";
}

function createStorageAdapter(options = {}) {
  const driver = normalizeStorageDriver(options.driver || process.env.STORAGE_DRIVER);

  if (driver === "memory") {
    return new MemoryStorageAdapter(options.initialState);
  }

  return new JsonFileStorageAdapter({
    filePath: options.filePath || process.env.STORAGE_FILE_PATH || DEFAULT_STORAGE_FILE_PATH
  });
}

module.exports = createStorageAdapter;
module.exports.DEFAULT_STORAGE_DRIVER = DEFAULT_STORAGE_DRIVER;
module.exports.DEFAULT_STORAGE_FILE_PATH = DEFAULT_STORAGE_FILE_PATH;
module.exports.normalizeStorageDriver = normalizeStorageDriver;
