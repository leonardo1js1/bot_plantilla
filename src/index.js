const loadEnv = require("./config/loadEnv");

loadEnv();

const { validateBusinessCatalog } = require("./config/loadBusiness");
const createApp = require("./app/createApp");

validateBusinessCatalog();

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const { app, dependencies } = createApp();
const serviceName = process.env.SERVICE_NAME || `whatsapp-backend-${dependencies.business.id}`;

app.listen(port, host, () => {
  console.log(
    `${serviceName} listo en http://${host}:${port} | negocio: ${dependencies.business.id} | storage: ${dependencies.storageAdapter.getDriverName()}`
  );

  if (!process.env.ADMIN_API_KEY) {
    console.log("[WARN] ADMIN_API_KEY no configurada. Los endpoints /api/admin quedan sin autenticacion.");
  }
});
