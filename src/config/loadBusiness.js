const path = require("path");

const DEFAULT_BUSINESS_SLUG = "aviator";

function normalizeBusiness(rawBusiness, requestedSlug) {
  if (!rawBusiness || typeof rawBusiness !== "object") {
    throw new Error(`La configuracion del negocio "${requestedSlug}" no es valida.`);
  }

  const business = {
    ...rawBusiness,
    slug: String(rawBusiness.slug || requestedSlug || DEFAULT_BUSINESS_SLUG).trim().toLowerCase(),
    name: String(rawBusiness.name || "").trim(),
    type: String(rawBusiness.type || "negocio").trim(),
    description: String(rawBusiness.description || "").trim(),
    tone: String(rawBusiness.tone || "amable, claro y breve").trim(),
    contact: {
      primaryPhone: String(rawBusiness.contact?.primaryPhone || "").trim(),
      text: String(rawBusiness.contact?.text || "").trim()
    },
    hours: {
      summary: String(rawBusiness.hours?.summary || "").trim(),
      text: String(rawBusiness.hours?.text || "").trim()
    },
    menu: {
      label: String(rawBusiness.menu?.label || "menu").trim(),
      pdfFilename: rawBusiness.menu?.pdfFilename || null,
      pdfPath: rawBusiness.menu?.pdfPath || null,
      pdfTitle: rawBusiness.menu?.pdfTitle || null,
      highlightsTitle: String(rawBusiness.menu?.highlightsTitle || "Categorias destacadas").trim(),
      highlights: Array.isArray(rawBusiness.menu?.highlights) ? rawBusiness.menu.highlights : [],
      products: Array.isArray(rawBusiness.menu?.products) ? rawBusiness.menu.products : []
    },
    faqs: Array.isArray(rawBusiness.faqs) ? rawBusiness.faqs : [],
    reservation: {
      label: String(rawBusiness.reservation?.label || "reserva").trim(),
      labelPlural: String(rawBusiness.reservation?.labelPlural || "reservas").trim(),
      optionLabel: String(rawBusiness.reservation?.optionLabel || "Reservar").trim(),
      intentExample: String(rawBusiness.reservation?.intentExample || "quiero reservar").trim(),
      dateExamples: String(
        rawBusiness.reservation?.dateExamples || "12/06/2026, 12-6-2026, manana o este viernes"
      ).trim(),
      openingTime: String(rawBusiness.reservation?.openingTime || "09:00").trim(),
      cutoffTime: String(rawBusiness.reservation?.cutoffTime || "18:00").trim(),
      toleranceMinutes: Number(rawBusiness.reservation?.toleranceMinutes || 0),
      rules: Array.isArray(rawBusiness.reservation?.rules) ? rawBusiness.reservation.rules : [],
      successMessage: String(
        rawBusiness.reservation?.successMessage ||
          "Perfecto. Tu reserva quedo registrada. Un encargado la confirmara en breve."
      ).trim()
    },
    ai: {
      fallbackReply: String(rawBusiness.ai?.fallbackReply || "").trim(),
      confirmedFacts: Array.isArray(rawBusiness.ai?.confirmedFacts) ? rawBusiness.ai.confirmedFacts : [],
      rules: Array.isArray(rawBusiness.ai?.rules) ? rawBusiness.ai.rules : [],
      recommendationHints: Array.isArray(rawBusiness.ai?.recommendationHints)
        ? rawBusiness.ai.recommendationHints
        : []
    }
  };

  if (!business.name) {
    throw new Error(`La configuracion del negocio "${business.slug}" debe incluir "name".`);
  }

  return business;
}

function loadBusiness(slug = process.env.BUSINESS_SLUG || DEFAULT_BUSINESS_SLUG) {
  const requestedSlug = String(slug || DEFAULT_BUSINESS_SLUG).trim().toLowerCase();
  const businessPath = path.join(__dirname, "business", `${requestedSlug}.json`);

  try {
    const rawBusiness = require(businessPath);
    return normalizeBusiness(rawBusiness, requestedSlug);
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error(
        `No existe la configuracion "${requestedSlug}". Crea src/config/business/${requestedSlug}.json para agregar un nuevo cliente.`
      );
    }

    throw error;
  }
}

// Negocio activo: para cambiar de cliente, crea otro JSON en src/config/business
// y cambia BUSINESS_SLUG en .env o carga otro slug explicitamente.
const business = loadBusiness();

module.exports = business;
module.exports.loadBusiness = loadBusiness;
module.exports.DEFAULT_BUSINESS_SLUG = DEFAULT_BUSINESS_SLUG;
