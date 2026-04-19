const assert = require("node:assert/strict");

const { loadAllBusinesses, loadBusiness } = require("../src/config/loadBusiness");
const { validateBusinessConfig } = require("../src/validators/businessConfigValidator");
const { createBotTestContext, sendMessage } = require("./helpers");

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
