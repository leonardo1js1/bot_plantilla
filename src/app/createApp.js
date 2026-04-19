const path = require("path");

const express = require("express");

const { buildFriendlyJsonError, logRouteError } = require("./httpUtils");
const createAdminAuth = require("../middleware/adminAuth");
const createAdminRouter = require("../routes/adminRoutes");
const createPublicRouter = require("../routes/publicRoutes");
const createWebhookRouter = require("../routes/webhookRoutes");
const createDependencies = require("./createDependencies");

function createApp(options = {}) {
  const dependencies = options.dependencies || createDependencies(options);
  const app = express();
  const menuPdfAbsolutePath = dependencies.business.menu.pdfFilename
    ? path.resolve(__dirname, "..", "..", "assets", dependencies.business.menu.pdfFilename)
    : null;

  app.set("trust proxy", true);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    createPublicRouter({
      ...dependencies,
      menuPdfAbsolutePath
    })
  );
  app.use(createWebhookRouter(dependencies));
  app.use(
    "/api/admin",
    createAdminRouter({
      ...dependencies,
      adminAuth: createAdminAuth({
        adminApiKey: options.adminApiKey || process.env.ADMIN_API_KEY
      })
    })
  );

  app.use((error, req, res, next) => {
    logRouteError("Error no controlado del servidor", error);

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json(buildFriendlyJsonError());
  });

  return {
    app,
    dependencies
  };
}

module.exports = createApp;
