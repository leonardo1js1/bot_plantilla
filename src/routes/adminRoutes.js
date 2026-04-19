const express = require("express");

function createAdminRouter({ adminAuth, reservationService, handoffService, conversationService }) {
  const router = express.Router();

  router.use(adminAuth);

  router.get("/reservations", (req, res) => {
    const reservations = reservationService.listReservations({
      status: req.query.status,
      businessId: req.query.businessId,
      userId: req.query.userId
    });

    return res.json({
      ok: true,
      count: reservations.length,
      reservations
    });
  });

  router.get("/reservations/:id", (req, res) => {
    const reservation = reservationService.getReservationById(req.params.id);

    if (!reservation) {
      return res.status(404).json({
        ok: false,
        error: "No existe una reserva con ese id."
      });
    }

    return res.json({
      ok: true,
      reservation
    });
  });

  router.get("/handoffs", (req, res) => {
    const handoffs = handoffService.listHandoffs({
      status: req.query.status,
      businessId: req.query.businessId,
      userId: req.query.userId
    });

    return res.json({
      ok: true,
      count: handoffs.length,
      handoffs
    });
  });

  router.get("/conversations/:userId", (req, res) => {
    const conversation = conversationService.getConversationByUserId(req.params.userId);

    if (!conversation) {
      return res.status(404).json({
        ok: false,
        error: "No existe una conversacion para ese userId."
      });
    }

    return res.json({
      ok: true,
      conversation
    });
  });

  return router;
}

module.exports = createAdminRouter;
