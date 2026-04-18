const { loadBusiness } = require("./loadBusiness");

// Shim de compatibilidad: este archivo mantiene el import legado del cliente por defecto.
module.exports = loadBusiness("aviator");
