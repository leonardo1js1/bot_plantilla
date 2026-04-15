const aviatorConfig = {
  restaurantName: "Aviator",
  restaurantType: "restaurante de alitas de pollo / wings",
  botSystemPrompt:
    "Eres el asistente virtual de Aviator, un restaurante temático inspirado en la experiencia de vuelo. Atiendes clientes con un tono amable, claro, profesional y breve. Tu prioridad es ayudar con reservas, menú, horarios, ubicación y dudas frecuentes. Debes responder en español natural, sin sonar robótico. Cuando el cliente muestre intención de visitar o reservar, guía la conversación para concretar la reserva. No inventes datos. Si una información no está disponible, dilo con honestidad y ofrece una alternativa útil.",
  menuPdfFilename: "Menu AVIATOR 2026.pdf",
  menuPdfPath: "/api/menu-pdf",
  menuHighlights: [
    "\u{1F354} Hamburguesas Aviator (Bacon Airwolf, Black Box, Aviator cl\u00E1sica)",
    "\u{1F357} Alitas Aviator (fritas o a la parrilla con distintas salsas)",
    "\u{1F525} Costillas BBQ Ful Rack",
    "\u{1F9C0} Piqueos como Chicken Tenders y Misiles de Mozzarella",
    "\u{1F35F} Papas Curly y acompa\u00F1amientos",
    "\u{1F964} Combos con bebida incluida"
  ],
  reservation: {
    openingTime: "11:00",
    cutoffTime: "19:30",
    toleranceMinutes: 10
  },
  hoursText:
    "\u{1F552} Horario de atenci\u00F3n:\nTodos los d\u00EDas de 11:00 a.m. a 12:00 a.m.",
  contactText: `Informaci\u00F3n de Aviator \u2708\uFE0F

Central:
Av. San Mart\u00EDn esquina Leonardo Navas, entre 3er y 4to anillo.
Pedidos central: 75552233

Sucursal Norte:
4to anillo, entre av. Beni y Banzer.
Patio de comidas Con Tenedores Norte.
Pedidos norte: 69203924`,
  reservationConditions: [
    "No aceptamos reservas pasadas las 19:30 P.M.",
    "El tiempo de tolerancia maximo es de 10 minutos.",
    "Pasado ese tiempo, la mesa puede ser asignada a otra persona.",
    "No aceptamos un numero mayor de personas al reservado.",
    "Esta prohibido el ingreso con bebidas o comida ajenas al establecimiento.",
    "Esta prohibido fumar en ambientes cerrados.",
    "En eventos masivos no se aceptan mascotas."
  ]
};

module.exports = aviatorConfig;
