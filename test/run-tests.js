const assert = require("node:assert/strict");

const { loadAllBusinesses, loadBusiness } = require("../src/config/loadBusiness");
const { formatDateToDisplay, isPastDate, parseDateInput } = require("../src/utils/dateTime");
const { validateBusinessConfig } = require("../src/validators/businessConfigValidator");
const {
  createBotTestContext,
  sendMessage,
  sendConversation,
  getOutboundTexts,
  getLastOutboundText
} = require("./helpers");

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function assertParsedDate(rawText, expectedDate) {
  const parsedDate = parseDateInput(rawText);

  assert.equal(parsedDate.valid, true);
  assert.equal(parsedDate.formatted, formatDateToDisplay(expectedDate));

  return parsedDate;
}

const tests = [
  {
    name: "loadBusiness carga el negocio aviator con el esquema normalizado",
    async run() {
      const business = loadBusiness("aviator");

      assert.equal(business.id, "aviator");
      assert.equal(business.name, "Aviator");
      assert.equal(business.reservation.openingTime, "11:00");
      assert.equal(business.location.city, "Santa Cruz de la Sierra, Bolivia");
    }
  },
  {
    name: "validateBusinessConfig falla con error claro si faltan campos criticos",
    async run() {
      let capturedError = null;

      try {
        validateBusinessConfig(
          {
            name: "Negocio incompleto"
          },
          {
            sourceLabel: "test-invalid.json"
          }
        );
      } catch (error) {
        capturedError = error;
      }

      assert.ok(capturedError instanceof Error);
      assert.match(capturedError.message, /Configuracion invalida en "test-invalid.json"/);
      assert.match(capturedError.message, /"id"/);
      assert.match(capturedError.message, /"location"/);
      assert.match(capturedError.message, /"contact"/);
      assert.match(capturedError.message, /"hours"/);
    }
  },
  {
    name: "loadAllBusinesses valida ejemplos y template sin romper el arranque",
    async run() {
      const businesses = loadAllBusinesses({ includeTemplates: true });
      const ids = businesses.map((business) => business.id);

      assert.ok(ids.includes("aviator"));
      assert.ok(ids.includes("demo"));
      assert.ok(ids.includes("sample-business"));
    }
  },
  {
    name: "parseDateInput reconoce hoy como una fecha valida",
    async run() {
      const today = startOfDay(new Date());
      const parsedDate = assertParsedDate("quiero mi cita para hoy", today);

      assert.equal(isPastDate(parsedDate.date), false);
    }
  },
  {
    name: "parseDateInput reconoce ayer como una fecha valida y pasada",
    async run() {
      const yesterday = addDays(startOfDay(new Date()), -1);
      const parsedDate = assertParsedDate("quiero mi cita para ayer", yesterday);

      assert.equal(isPastDate(parsedDate.date), true);
    }
  },
  {
    name: "parseDateInput reconoce anteayer como una fecha valida y pasada",
    async run() {
      const twoDaysAgo = addDays(startOfDay(new Date()), -2);
      const parsedDate = assertParsedDate("quiero mi cita para anteayer", twoDaysAgo);

      assert.equal(isPastDate(parsedDate.date), true);
    }
  },
  {
    name: "parseDateInput reconoce mañana y pasado mañana como fechas validas",
    async run() {
      const today = startOfDay(new Date());

      assertParsedDate("quiero mi cita para mañana", addDays(today, 1));
      assertParsedDate("quiero mi cita para pasado mañana", addDays(today, 2));
    }
  },
  {
    name: "parseDateInput reconoce este viernes, el viernes y viernes",
    async run() {
      const today = startOfDay(new Date());
      const friday = addDays(today, (5 - today.getDay() + 7) % 7);

      assertParsedDate("este viernes", friday);
      assertParsedDate("quiero mi cita para el viernes", friday);
      assertParsedDate("viernes", friday);
    }
  },
  {
    name: "parseDateInput mantiene soporte para formatos explicitos de fecha",
    async run() {
      const expected = "12/06/2026";
      const inputs = ["12/06/2026", "12-6-2026", "2026-06-12"];

      for (const input of inputs) {
        const parsedDate = parseDateInput(input);

        assert.equal(parsedDate.valid, true);
        assert.equal(parsedDate.formatted, expected);
      }
    }
  },
  {
    name: "flujo basico de reserva crea una reserva persistente con id y estado pending",
    async run() {
      const { bot, reservationService } = createBotTestContext("aviator");
      const userId = "59170000002";

      await sendMessage(bot, userId, "hola");
      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Carlos Rojas");
      await sendMessage(bot, userId, "4");
      await sendMessage(bot, userId, "manana");
      await sendMessage(bot, userId, "19:00");
      const confirmation = await sendMessage(bot, userId, "si");

      assert.match(confirmation.outboundMessages[0].text, /ID de seguimiento:/);

      const reservations = reservationService.listReservations();

      assert.equal(reservations.length, 1);
      assert.ok(reservations[0].id);
      assert.equal(reservations[0].status, "pending");
      assert.equal(reservations[0].userId, userId);
      assert.equal(reservations[0].businessId, "aviator");
      assert.equal(reservations[0].data.name, "Carlos Rojas");
      assert.equal(reservations[0].data.partySize, 4);
    }
  },
  {
    name: "la validacion de horario evita reservas fuera de la ventana permitida",
    async run() {
      const { bot, reservationService } = createBotTestContext("aviator");
      const userId = "59170000003";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Ana");
      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "manana");
      const response = await sendMessage(bot, userId, "22:00");

      assert.match(response.outboundMessages[0].text, /Solo tomamos reservas/);
      assert.equal(reservationService.listReservations().length, 0);
    }
  },
  {
    name: "una solicitud de humano crea un handoff pendiente",
    async run() {
      const { bot, handoffService } = createBotTestContext("aviator");
      const userId = "59170000004";
      const message = "quiero hablar con un humano";

      const response = await sendMessage(bot, userId, message);
      const handoffs = handoffService.listHandoffs();

      assert.match(response.outboundMessages[0].text, /solicitud de atencion humana/i);
      assert.equal(handoffs.length, 1);
      assert.equal(handoffs[0].status, "pending");
      assert.equal(handoffs[0].userId, userId);
      assert.equal(handoffs[0].businessId, "aviator");
      assert.equal(handoffs[0].reason, message);
    }
  },
  {
    name: "quiero mi cita para ayer dispara la validacion de fecha pasada",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000011";
      const response = await sendMessage(bot, userId, "quiero mi cita para ayer");

      assert.match(response.outboundMessages[0].text, /La fecha no puede estar en el pasado/i);
      assert.equal(response.session.reservationDraft.name, undefined);
      assert.equal(response.session.reservationDraft.date, undefined);
    }
  },
  {
    name: "FAQ de pagos dentro de reserva responde y retoma el paso name",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000005";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Aceptan QR?");

      assert.ok(response.outboundMessages.length >= 2);
      assert.match(response.outboundMessages[0].text, /pagos|qr|nfc/i);
      assert.match(response.outboundMessages[response.outboundMessages.length - 1].text, /Ahora si, continuemos con tu reserva/i);
      assert.match(response.outboundMessages[response.outboundMessages.length - 1].text, /A nombre de quien/i);
      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "name");
      assert.equal(response.session.reservationDraft.name, undefined);
    }
  },
  {
    name: "un nombre corto valido con punto final se captura durante el paso name",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000008";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Leonardo.");

      assert.equal(response.session.reservationDraft.name, "Leonardo");
      assert.equal(response.session.reservationStep, "partySize");
      assert.match(response.outboundMessages[0].text, /Para cuantas personas/i);
    }
  },
  {
    name: "un nombre valido con coma final se captura durante el paso name",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000009";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Leonardo Jimenez,");

      assert.equal(response.session.reservationDraft.name, "Leonardo Jimenez");
      assert.equal(response.session.reservationStep, "partySize");
      assert.match(response.outboundMessages[0].text, /Para cuantas personas/i);
    }
  },
  {
    name: "una FAQ corta no se captura como nombre durante el paso name",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000026";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Que incluye?");

      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "name");
      assert.deepEqual(response.session.reservationDraft, {});
      assert.match(response.outboundMessages[0].text, /No pude identificar el nombre/i);
    }
  },
  {
    name: "FAQ de recomendacion dentro de reserva responde y retoma el paso name",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000010";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Que me recomiendas?");

      assert.ok(response.outboundMessages.length >= 2);
      assert.match(response.outboundMessages[0].text, /Bacon Airwolf|Black Box|alitas|ALL-ABOARD/i);
      assert.match(response.outboundMessages[response.outboundMessages.length - 1].text, /Ahora si, continuemos con tu reserva/i);
      assert.match(response.outboundMessages[response.outboundMessages.length - 1].text, /A nombre de quien/i);
      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "name");
      assert.equal(response.session.reservationDraft.name, undefined);
    }
  },
  {
    name: "un nombre corto valido se captura cuando el bot esta esperando el nombre",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000006";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Leonardo");

      assert.equal(response.session.reservationDraft.name, "Leonardo");
      assert.equal(response.session.reservationStep, "partySize");
      assert.match(response.outboundMessages[0].text, /Para cuantas personas/i);
    }
  },
  {
    name: "un patron explicito de nombre sigue capturandose en reservas",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000007";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "a nombre de Leonardo Jimenez");

      assert.equal(response.session.reservationDraft.name, "Leonardo Jimenez");
      assert.equal(response.session.reservationStep, "partySize");
      assert.match(response.outboundMessages[0].text, /Para cuantas personas/i);
    }
  },
  {
    name: "la opcion 2 inicia reservas sin capturar personas por adelantado",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000012";
      const response = await sendMessage(bot, userId, "2");

      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "name");
      assert.equal(response.session.reservationDraft.name, undefined);
      assert.equal(response.session.reservationDraft.partySize, undefined);
      assert.match(response.outboundMessages[0].text, /A nombre de quien/i);
    }
  },
  {
    name: "un mensaje irrelevante no cambia el paso partySize",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000013";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Ana");
      const response = await sendMessage(bot, userId, "no se");

      assert.equal(response.session.reservationStep, "partySize");
      assert.equal(response.session.reservationDraft.partySize, undefined);
      assert.match(response.outboundMessages[0].text, /cantidad de personas/i);
    }
  },
  {
    name: "una respuesta numerica simple no saca el flujo del paso date",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000014";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Ana");
      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "3");

      assert.equal(response.session.reservationStep, "date");
      assert.equal(response.session.reservationDraft.partySize, 2);
      assert.equal(response.session.reservationDraft.date, undefined);
      assert.match(response.outboundMessages[0].text, /No pude identificar la fecha/i);
    }
  },
  {
    name: "una pregunta frecuente con numeros no modifica el draft durante date",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000017";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Ana");
      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Hay disponibilidad para 4 personas?");

      assert.equal(response.session.reservationStep, "date");
      assert.equal(response.session.reservationDraft.name, "Ana");
      assert.equal(response.session.reservationDraft.partySize, 2);
      assert.equal(response.session.reservationDraft.date, undefined);
      assert.match(response.outboundMessages[0].text, /No pude identificar la fecha/i);
    }
  },
  {
    name: "una correccion util mantiene el paso actual si no resolvio la fecha",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000015";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Ana");
      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "somos 3");

      assert.equal(response.session.reservationStep, "date");
      assert.equal(response.session.reservationDraft.partySize, 3);
      assert.equal(response.session.reservationDraft.date, undefined);
      assert.match(response.outboundMessages[0].text, /Para que fecha deseas/i);
    }
  },
  {
    name: "una correccion explicita actualiza el nombre fuera de confirmation",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000018";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Ana");
      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "mejor a nombre de Leonardo");

      assert.equal(response.session.reservationStep, "date");
      assert.equal(response.session.reservationDraft.name, "Leonardo");
      assert.equal(response.session.reservationDraft.partySize, 2);
      assert.equal(response.session.reservationDraft.date, undefined);
      assert.match(response.outboundMessages[0].text, /Para que fecha deseas/i);
    }
  },
  {
    name: "el estado de la reserva se conserva tras una FAQ durante partySize",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000016";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Ana");
      const response = await sendMessage(bot, userId, "Donde estan?");

      assert.match(response.outboundMessages[0].text, /San Martin|ubicacion|contacto|horario/i);
      assert.match(response.outboundMessages[response.outboundMessages.length - 1].text, /Ahora si, continuemos con tu reserva/i);
      assert.match(response.outboundMessages[response.outboundMessages.length - 1].text, /Para cuantas personas/i);
      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "partySize");
      assert.equal(response.session.reservationDraft.name, "Ana");
      assert.equal(response.session.reservationDraft.partySize, undefined);
    }
  },
  {
    name: "confirmation permite corregir la hora y luego guardar la reserva",
    async run() {
      const { bot, reservationService } = createBotTestContext("aviator");
      const userId = "59170000019";

      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "Carlos");
      await sendMessage(bot, userId, "2");
      await sendMessage(bot, userId, "manana");
      await sendMessage(bot, userId, "18:00");

      const correction = await sendMessage(bot, userId, "mejor a las 7");

      assert.equal(correction.session.reservationStep, "confirmation");
      assert.equal(correction.session.reservationDraft.time, "19:00");
      assert.match(correction.outboundMessages[0].text, /Hora: 7:00 p\.m\./i);

      const confirmation = await sendMessage(bot, userId, "si");
      const reservations = reservationService.listReservations();

      assert.match(confirmation.outboundMessages[0].text, /ID de seguimiento:/i);
      assert.equal(reservations.length, 1);
      assert.equal(reservations[0].data.time, "19:00");
      assert.equal(confirmation.session.currentFlow, null);
      assert.deepEqual(confirmation.session.reservationDraft, {});
    }
  },
  {
    name: "una pregunta de pagos cuando el bot espera el nombre no contamina el draft",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000020";
      const transcript = await sendConversation(bot, userId, ["hola", "2", "Aceptan QR?"]);
      const startReservationResponse = transcript[1].response;
      const paymentsResponse = transcript[2].response;
      const paymentsTexts = getOutboundTexts(paymentsResponse);

      assert.match(startReservationResponse.outboundMessages[0].text, /A nombre de quien/i);
      assert.ok(paymentsTexts.length >= 2);
      assert.match(paymentsTexts[0], /pagos|qr|nfc/i);
      assert.match(getLastOutboundText(paymentsResponse), /A nombre de quien/i);
      assert.equal(paymentsResponse.session.currentFlow, "reservation");
      assert.equal(paymentsResponse.session.reservationStep, "name");
      assert.deepEqual(paymentsResponse.session.reservationDraft, {});
    }
  },
  {
    name: "una fecha pasada durante el paso name se rechaza sin avanzar la reserva",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000021";

      await sendMessage(bot, userId, "2");
      const response = await sendMessage(bot, userId, "Quiero mi cita para ayer");

      assert.match(response.outboundMessages[0].text, /La fecha no puede estar en el pasado/i);
      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "name");
      assert.deepEqual(response.session.reservationDraft, {});
    }
  },
  {
    name: "una recomendacion en el paso date responde y retoma la reserva con el draft intacto",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000022";

      await sendConversation(bot, userId, ["2", "Ana", "2"]);
      const response = await sendMessage(bot, userId, "Que me recomiendas?");
      const outboundTexts = getOutboundTexts(response);

      assert.ok(outboundTexts.length >= 2);
      assert.match(outboundTexts[0], /Bacon Airwolf|Black Box|alitas|ALL-ABOARD/i);
      assert.match(getLastOutboundText(response), /Para que fecha deseas/i);
      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "date");
      assert.deepEqual(response.session.reservationDraft, {
        name: "Ana",
        partySize: 2
      });
    }
  },
  {
    name: "un mensaje irrelevante en el paso time no mueve reservationStep ni borra datos ya capturados",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000023";
      const transcript = await sendConversation(bot, userId, ["2", "Ana", "2", "manana"]);
      const readyForTimeResponse = transcript[3].response;
      const capturedDate = readyForTimeResponse.session.reservationDraft.date;
      const response = await sendMessage(bot, userId, "te aviso despues");

      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "time");
      assert.equal(response.session.reservationDraft.name, "Ana");
      assert.equal(response.session.reservationDraft.partySize, 2);
      assert.equal(response.session.reservationDraft.date, capturedDate);
      assert.equal(response.session.reservationDraft.time, undefined);
      assert.match(response.outboundMessages[0].text, /No pude identificar la hora/i);
    }
  },
  {
    name: "el mensaje 2 dentro del paso date no reinicia ni cambia el draft de la reserva",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000024";

      await sendConversation(bot, userId, ["2", "Ana", "4"]);
      const response = await sendMessage(bot, userId, "2");

      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "date");
      assert.equal(response.session.reservationDraft.name, "Ana");
      assert.equal(response.session.reservationDraft.partySize, 4);
      assert.equal(response.session.reservationDraft.date, undefined);
      assert.match(response.outboundMessages[0].text, /No pude identificar la fecha/i);
    }
  },
  {
    name: "una pregunta con hora durante el paso date no contamina el campo time",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000027";

      await sendConversation(bot, userId, ["2", "Ana", "2"]);
      const response = await sendMessage(bot, userId, "Como a las 7 puedo llegar?");

      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "date");
      assert.equal(response.session.reservationDraft.name, "Ana");
      assert.equal(response.session.reservationDraft.partySize, 2);
      assert.equal(response.session.reservationDraft.date, undefined);
      assert.equal(response.session.reservationDraft.time, undefined);
      assert.match(response.outboundMessages[0].text, /No pude identificar la fecha/i);
    }
  },
  {
    name: "una correccion explicita de personas en confirmation actualiza el draft antes de guardar",
    async run() {
      const { bot, reservationService } = createBotTestContext("aviator");
      const userId = "59170000025";
      const transcript = await sendConversation(bot, userId, ["2", "Carlos", "2", "manana", "18:00"]);
      const readyForConfirmationResponse = transcript[4].response;
      const capturedDate = readyForConfirmationResponse.session.reservationDraft.date;
      const correction = await sendMessage(bot, userId, "mejor para 4 personas");

      assert.equal(correction.session.currentFlow, "reservation");
      assert.equal(correction.session.reservationStep, "confirmation");
      assert.equal(correction.session.reservationDraft.name, "Carlos");
      assert.equal(correction.session.reservationDraft.partySize, 4);
      assert.equal(correction.session.reservationDraft.date, capturedDate);
      assert.equal(correction.session.reservationDraft.time, "18:00");
      assert.match(correction.outboundMessages[0].text, /Personas: 4/i);

      const confirmation = await sendMessage(bot, userId, "si");
      const reservations = reservationService.listReservations();

      assert.match(confirmation.outboundMessages[0].text, /ID de seguimiento:/i);
      assert.equal(reservations.length, 1);
      assert.equal(reservations[0].data.partySize, 4);
      assert.equal(reservations[0].data.time, "18:00");
    }
  },
  {
    name: "confirmation acepta una correccion directa de nombre sin resetear el flujo",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000028";
      const transcript = await sendConversation(bot, userId, ["2", "Carlos", "2", "manana", "18:00"]);
      const readyForConfirmationResponse = transcript[4].response;

      const correction = await sendMessage(bot, userId, "Leonardo");

      assert.equal(correction.session.currentFlow, "reservation");
      assert.equal(correction.session.reservationStep, "confirmation");
      assert.equal(correction.session.reservationDraft.name, "Leonardo");
      assert.equal(correction.session.reservationDraft.partySize, 2);
      assert.equal(correction.session.reservationDraft.date, readyForConfirmationResponse.session.reservationDraft.date);
      assert.equal(correction.session.reservationDraft.time, "18:00");
      assert.match(correction.outboundMessages[0].text, /Nombre: Leonardo/i);
    }
  },
  {
    name: "confirmation no interpreta un numero suelto como correccion automatica",
    async run() {
      const { bot } = createBotTestContext("aviator");
      const userId = "59170000029";

      await sendConversation(bot, userId, ["2", "Carlos", "2", "manana", "18:00"]);
      const response = await sendMessage(bot, userId, "3");

      assert.equal(response.session.currentFlow, "reservation");
      assert.equal(response.session.reservationStep, "confirmation");
      assert.equal(response.session.reservationDraft.name, "Carlos");
      assert.equal(response.session.reservationDraft.partySize, 2);
      assert.equal(response.session.reservationDraft.time, "18:00");
      assert.match(response.outboundMessages[0].text, /Responde si para confirmar o dime que dato quieres corregir/i);
    }
  }
];

async function run() {
  let failures = 0;

  for (const currentTest of tests) {
    try {
      await currentTest.run();
      console.log(`PASS ${currentTest.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${currentTest.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }

  const passed = tests.length - failures;
  console.log(`\n${passed}/${tests.length} tests passing`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run();
