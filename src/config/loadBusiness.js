const fs = require("fs");
const path = require("path");

const { validateBusinessConfig } = require("../validators/businessConfigValidator");

const BUSINESS_CONFIG_DIR = path.join(__dirname, "business");
const DEFAULT_BUSINESS_ID = "aviator";

function getRequestedBusinessId(explicitBusinessId) {
  return String(
    explicitBusinessId || process.env.BUSINESS_ID || process.env.BUSINESS_SLUG || DEFAULT_BUSINESS_ID
  )
    .trim()
    .toLowerCase();
}

function readBusinessFile(filePath) {
  try {
    const rawContent = fs.readFileSync(filePath, "utf8");
    return JSON.parse(rawContent);
  } catch (error) {
    if (error.name === "SyntaxError") {
      throw new Error(`El JSON del negocio en "${filePath}" no es valido: ${error.message}`);
    }

    throw error;
  }
}

function listBusinessConfigFiles() {
  return fs
    .readdirSync(BUSINESS_CONFIG_DIR)
    .filter((fileName) => fileName.toLowerCase().endsWith(".json"))
    .sort();
}

function loadBusiness(businessId = getRequestedBusinessId()) {
  const requestedBusinessId = getRequestedBusinessId(businessId);
  const businessFilePath = path.join(BUSINESS_CONFIG_DIR, `${requestedBusinessId}.json`);

  if (!fs.existsSync(businessFilePath)) {
    throw new Error(
      `No existe la configuracion "${requestedBusinessId}". Crea src/config/business/${requestedBusinessId}.json o usa src/config/business/_template.json como base.`
    );
  }

  return validateBusinessConfig(readBusinessFile(businessFilePath), {
    sourceLabel: path.relative(process.cwd(), businessFilePath),
    expectedId: requestedBusinessId
  });
}

function loadAllBusinesses(options = {}) {
  const includeTemplates = options.includeTemplates !== false;

  return listBusinessConfigFiles()
    .filter((fileName) => includeTemplates || !fileName.startsWith("_"))
    .map((fileName) => {
      const filePath = path.join(BUSINESS_CONFIG_DIR, fileName);
      const expectedId = fileName.replace(/\.json$/i, "");

      return validateBusinessConfig(readBusinessFile(filePath), {
        sourceLabel: path.relative(process.cwd(), filePath),
        expectedId: expectedId.startsWith("_") ? undefined : expectedId
      });
    });
}

function validateBusinessCatalog() {
  return loadAllBusinesses({ includeTemplates: true });
}

const business = loadBusiness();

module.exports = business;
module.exports.loadBusiness = loadBusiness;
module.exports.loadAllBusinesses = loadAllBusinesses;
module.exports.validateBusinessCatalog = validateBusinessCatalog;
module.exports.getRequestedBusinessId = getRequestedBusinessId;
module.exports.DEFAULT_BUSINESS_ID = DEFAULT_BUSINESS_ID;
module.exports.DEFAULT_BUSINESS_SLUG = DEFAULT_BUSINESS_ID;
module.exports.BUSINESS_CONFIG_DIR = BUSINESS_CONFIG_DIR;
