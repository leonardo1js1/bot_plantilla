const crypto = require("crypto");

function cloneDeep(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function createRecordId(prefix = "rec") {
  const safePrefix = String(prefix || "rec")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "") || "rec";
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const randomSuffix = crypto.randomBytes(3).toString("hex");

  return `${safePrefix}_${timestamp}_${randomSuffix}`;
}

function sortByTimestampDesc(items = [], field = "createdAt") {
  return items.slice().sort((left, right) => {
    const leftValue = String(left?.[field] || "");
    const rightValue = String(right?.[field] || "");
    return rightValue.localeCompare(leftValue);
  });
}

module.exports = {
  cloneDeep,
  createRecordId,
  sortByTimestampDesc
};
