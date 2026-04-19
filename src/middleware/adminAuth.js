function extractAdminApiKey(req) {
  const directHeader = String(req.get("x-admin-api-key") || "").trim();

  if (directHeader) {
    return directHeader;
  }

  const authorization = String(req.get("authorization") || "").trim();
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  return bearerMatch ? bearerMatch[1].trim() : "";
}

function createAdminAuth({ adminApiKey }) {
  const normalizedAdminApiKey = String(adminApiKey || "").trim();

  return function adminAuth(req, res, next) {
    if (!normalizedAdminApiKey) {
      return next();
    }

    const providedApiKey = extractAdminApiKey(req);

    if (providedApiKey === normalizedAdminApiKey) {
      return next();
    }

    return res.status(401).json({
      ok: false,
      error: "Admin API key invalida o ausente."
    });
  };
}

module.exports = createAdminAuth;
