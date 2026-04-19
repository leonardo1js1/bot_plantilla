function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureNonEmptyString(value, fieldName, errors, options = {}) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    errors.push(`El campo "${fieldName}" es obligatorio.`);
    return options.defaultValue || "";
  }

  return normalizedValue;
}

function ensureOptionalString(value, defaultValue = "") {
  return String(value || defaultValue).trim();
}

function ensureStringArray(value, fieldName, errors) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push(`El campo "${fieldName}" debe ser un arreglo de strings.`);
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function ensureQuestionAnswerArray(value, fieldName, errors) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push(`El campo "${fieldName}" debe ser un arreglo de objetos.`);
    return [];
  }

  return value
    .map((entry, index) => {
      if (!isPlainObject(entry)) {
        errors.push(`El item "${fieldName}[${index}]" debe ser un objeto.`);
        return null;
      }

      const question = ensureNonEmptyString(
        entry.question || entry.label || entry.trigger,
        `${fieldName}[${index}].question`,
        errors
      );
      const answer = ensureNonEmptyString(
        entry.answer || entry.response,
        `${fieldName}[${index}].answer`,
        errors
      );

      return {
        question,
        answer
      };
    })
    .filter(Boolean);
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function ensureTimeString(value, fieldName, errors, defaultValue) {
  const normalizedValue = ensureNonEmptyString(value || defaultValue, fieldName, errors);

  if (!/^\d{2}:\d{2}$/.test(normalizedValue)) {
    errors.push(`El campo "${fieldName}" debe tener formato HH:MM.`);
  }

  return normalizedValue;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function validateBusinessConfig(rawBusiness, options = {}) {
  const sourceLabel = options.sourceLabel || "business config";
  const errors = [];

  if (!isPlainObject(rawBusiness)) {
    throw new Error(`La configuracion "${sourceLabel}" debe ser un objeto JSON valido.`);
  }

  const resolvedId = ensureNonEmptyString(
    rawBusiness.id || rawBusiness.slug || options.expectedId,
    "id",
    errors
  ).toLowerCase();

  if (options.expectedId && !String(options.expectedId).startsWith("_") && resolvedId !== options.expectedId) {
    errors.push(`El campo "id" debe coincidir con el nombre del archivo "${options.expectedId}.json".`);
  }

  const name = ensureNonEmptyString(rawBusiness.name, "name", errors);
  const type = ensureOptionalString(rawBusiness.type, "negocio");
  const description = ensureOptionalString(rawBusiness.description);
  const tone = ensureOptionalString(rawBusiness.tone || rawBusiness.assistant?.style, "amable, claro y breve");

  const location = isPlainObject(rawBusiness.location) ? rawBusiness.location : {};
  const locationText = ensureOptionalString(location.text);
  const locationAddress = ensureOptionalString(location.address);
  const locationCity = ensureOptionalString(location.city);
  const locationMapsUrl = ensureOptionalString(location.mapsUrl);

  if (!locationText && !locationAddress) {
    errors.push('El campo "location" debe incluir al menos "text" o "address".');
  }

  if (locationMapsUrl && !isValidHttpUrl(locationMapsUrl)) {
    errors.push('El campo "location.mapsUrl" debe ser una URL http(s) valida.');
  }

  const contact = isPlainObject(rawBusiness.contact) ? rawBusiness.contact : {};
  const primaryPhone = ensureOptionalString(contact.primaryPhone);
  const contactText = ensureOptionalString(contact.text);

  if (!primaryPhone && !contactText) {
    errors.push('El campo "contact" debe incluir "primaryPhone" o "text".');
  }

  const hours = isPlainObject(rawBusiness.hours) ? rawBusiness.hours : {};
  const hoursSummary = ensureOptionalString(hours.summary);
  const hoursText = ensureOptionalString(hours.text);

  if (!hoursSummary && !hoursText) {
    errors.push('El campo "hours" debe incluir "summary" o "text".');
  }

  const menu = isPlainObject(rawBusiness.menu) ? rawBusiness.menu : {};
  const menuLabel = ensureNonEmptyString(menu.label, "menu.label", errors, {
    defaultValue: "menu"
  });
  const menuPdfFilename = menu.pdfFilename || null;
  const menuPdfPath = menu.pdfPath || null;
  const menuPdfTitle = menu.pdfTitle || null;
  const menuHighlightsTitle = ensureOptionalString(menu.highlightsTitle, "Categorias destacadas");
  const menuHighlights = ensureStringArray(menu.highlights, "menu.highlights", errors);
  const menuProducts = ensureStringArray(menu.products, "menu.products", errors);
  const menuLinks = Array.isArray(menu.links)
    ? menu.links
        .map((entry, index) => {
          if (!isPlainObject(entry)) {
            errors.push(`El item "menu.links[${index}]" debe ser un objeto.`);
            return null;
          }

          const label = ensureNonEmptyString(entry.label, `menu.links[${index}].label`, errors);
          const url = ensureNonEmptyString(entry.url, `menu.links[${index}].url`, errors);

          if (url && !isValidHttpUrl(url)) {
            errors.push(`El campo "menu.links[${index}].url" debe ser una URL http(s) valida.`);
          }

          return {
            label,
            url
          };
        })
        .filter(Boolean)
    : [];

  if ((menuPdfFilename && !menuPdfPath) || (!menuPdfFilename && menuPdfPath)) {
    errors.push('Los campos "menu.pdfFilename" y "menu.pdfPath" deben definirse juntos.');
  }

  if (menuPdfPath && !String(menuPdfPath).startsWith("/")) {
    errors.push('El campo "menu.pdfPath" debe empezar con "/".');
  }

  const faqs = ensureQuestionAnswerArray(rawBusiness.faqs, "faqs", errors);
  const quickAnswers = ensureQuestionAnswerArray(rawBusiness.quickAnswers, "quickAnswers", errors);

  const reservation = isPlainObject(rawBusiness.reservation) ? rawBusiness.reservation : {};
  const reservationLabel = ensureNonEmptyString(reservation.label, "reservation.label", errors, {
    defaultValue: "reserva"
  });
  const reservationLabelPlural = ensureOptionalString(
    reservation.labelPlural,
    `${reservationLabel}s`
  );
  const reservationOptionLabel = ensureNonEmptyString(
    reservation.optionLabel,
    "reservation.optionLabel",
    errors,
    {
      defaultValue: "Reservar"
    }
  );
  const reservationIntentExample = ensureOptionalString(
    reservation.intentExample,
    `quiero ${reservationLabel}`
  );
  const reservationDateExamples = ensureOptionalString(
    reservation.dateExamples,
    "12/06/2026, 12-6-2026, manana o este viernes"
  );
  const openingTime = ensureTimeString(
    reservation.openingTime,
    "reservation.openingTime",
    errors,
    "09:00"
  );
  const cutoffTime = ensureTimeString(
    reservation.cutoffTime,
    "reservation.cutoffTime",
    errors,
    "18:00"
  );
  const toleranceMinutes = Number(reservation.toleranceMinutes || 0);
  const reservationRules = ensureStringArray(reservation.rules, "reservation.rules", errors);
  const reservationSuccessMessage = ensureNonEmptyString(
    reservation.successMessage,
    "reservation.successMessage",
    errors,
    {
      defaultValue: "Perfecto. Tu reserva quedo registrada. Un encargado la confirmara en breve."
    }
  );
  const reservationDuplicateMessage = ensureOptionalString(reservation.duplicateMessage);

  if (timeToMinutes(openingTime) > timeToMinutes(cutoffTime)) {
    errors.push('"reservation.openingTime" no puede ser mayor que "reservation.cutoffTime".');
  }

  if (!Number.isFinite(toleranceMinutes) || toleranceMinutes < 0) {
    errors.push('El campo "reservation.toleranceMinutes" debe ser un numero mayor o igual a 0.');
  }

  const ai = isPlainObject(rawBusiness.ai) ? rawBusiness.ai : {};
  const aiFallbackReply = ensureOptionalString(ai.fallbackReply);
  const aiConfirmedFacts = ensureStringArray(ai.confirmedFacts, "ai.confirmedFacts", errors);
  const aiRules = ensureStringArray(ai.rules, "ai.rules", errors);
  const aiRecommendationHints = ensureStringArray(
    ai.recommendationHints,
    "ai.recommendationHints",
    errors
  );

  if (errors.length) {
    throw new Error(`Configuracion invalida en "${sourceLabel}":\n- ${errors.join("\n- ")}`);
  }

  return {
    id: resolvedId,
    slug: resolvedId,
    name,
    type,
    description,
    tone,
    assistant: {
      style: tone
    },
    location: {
      text: locationText || [locationAddress, locationCity].filter(Boolean).join(", "),
      address: locationAddress,
      city: locationCity,
      mapsUrl: locationMapsUrl
    },
    contact: {
      primaryPhone,
      text: contactText
    },
    hours: {
      summary: hoursSummary,
      text: hoursText
    },
    menu: {
      label: menuLabel,
      pdfFilename: menuPdfFilename,
      pdfPath: menuPdfPath,
      pdfTitle: menuPdfTitle,
      highlightsTitle: menuHighlightsTitle,
      highlights: menuHighlights,
      products: menuProducts,
      links: menuLinks
    },
    faqs,
    quickAnswers,
    reservation: {
      label: reservationLabel,
      labelPlural: reservationLabelPlural,
      optionLabel: reservationOptionLabel,
      intentExample: reservationIntentExample,
      dateExamples: reservationDateExamples,
      openingTime,
      cutoffTime,
      toleranceMinutes,
      rules: reservationRules,
      successMessage: reservationSuccessMessage,
      duplicateMessage: reservationDuplicateMessage
    },
    ai: {
      fallbackReply: aiFallbackReply,
      confirmedFacts: aiConfirmedFacts,
      rules: aiRules,
      recommendationHints: aiRecommendationHints
    }
  };
}

module.exports = {
  validateBusinessConfig
};
