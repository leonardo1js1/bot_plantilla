const { loadBusiness } = require("./loadBusiness");

// Shim de compatibilidad: mantiene el import legado del negocio de ejemplo.
module.exports = loadBusiness("aviator");
