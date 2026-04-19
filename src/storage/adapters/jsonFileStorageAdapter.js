const fs = require("fs");
const path = require("path");

const MemoryStorageAdapter = require("./memoryStorageAdapter");
const { createDefaultStorageState, normalizeStorageState } = require("../defaultState");

function readStateFromDisk(filePath) {
  if (!fs.existsSync(filePath)) {
    return createDefaultStorageState();
  }

  try {
    const rawContent = fs.readFileSync(filePath, "utf8");

    if (!rawContent.trim()) {
      return createDefaultStorageState();
    }

    return normalizeStorageState(JSON.parse(rawContent));
  } catch (error) {
    throw new Error(`No se pudo leer el storage local en "${filePath}": ${error.message}`);
  }
}

class JsonFileStorageAdapter extends MemoryStorageAdapter {
  constructor({ filePath }) {
    const resolvedFilePath = path.resolve(filePath);
    super(readStateFromDisk(resolvedFilePath));
    this.driverName = "file";
    this.filePath = resolvedFilePath;
    this.persist();
  }

  persist() {
    const directoryPath = path.dirname(this.filePath);

    fs.mkdirSync(directoryPath, { recursive: true });

    const temporaryFilePath = `${this.filePath}.tmp`;
    const serializedState = JSON.stringify(this.state, null, 2);

    fs.writeFileSync(temporaryFilePath, serializedState, "utf8");

    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }

    fs.renameSync(temporaryFilePath, this.filePath);

    return this.filePath;
  }
}

module.exports = JsonFileStorageAdapter;
