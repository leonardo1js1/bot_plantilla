const { normalizeText } = require("../utils/text");
const { cloneDeep, createRecordId, sortByTimestampDesc } = require("../utils/records");

function normalizePartySize(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function normalizeReservationData(data = {}) {
  return {
    name: String(data.name || "").trim(),
    partySize: normalizePartySize(data.partySize),
    date: String(data.date || "").trim(),
    time: String(data.time || "").trim(),
    notes: String(data.notes || "").trim() || null
  };
}

function buildDuplicateKey({ businessId, userId, data }) {
  const normalizedData = normalizeReservationData(data);

  return [
    String(businessId || "").trim().toLowerCase(),
    String(userId || "").trim(),
    normalizeText(normalizedData.name),
    String(normalizedData.partySize || ""),
    normalizedData.date,
    normalizedData.time
  ].join("|");
}

class ReservationService {
  constructor({ storageAdapter, business }) {
    this.storageAdapter = storageAdapter;
    this.business = business;
  }

  getCollection() {
    return this.storageAdapter.getCollection("reservations");
  }

  listReservations(filters = {}) {
    const normalizedStatus = String(filters.status || "").trim().toLowerCase();
    const normalizedBusinessId = String(filters.businessId || "").trim().toLowerCase();
    const normalizedUserId = String(filters.userId || "").trim();

    const reservations = Object.values(this.getCollection()).filter((reservation) => {
      if (normalizedStatus && normalizedStatus !== "all" && reservation.status !== normalizedStatus) {
        return false;
      }

      if (normalizedBusinessId && reservation.businessId !== normalizedBusinessId) {
        return false;
      }

      if (normalizedUserId && reservation.userId !== normalizedUserId) {
        return false;
      }

      return true;
    });

    return cloneDeep(sortByTimestampDesc(reservations));
  }

  getReservationById(reservationId) {
    const reservation = this.getCollection()[reservationId];
    return reservation ? cloneDeep(reservation) : null;
  }

  findDuplicateReservation({ businessId, userId, data }) {
    const duplicateKey = buildDuplicateKey({ businessId, userId, data });

    return (
      Object.values(this.getCollection()).find((reservation) => {
        if (!["pending", "confirmed"].includes(reservation.status)) {
          return false;
        }

        return buildDuplicateKey({
          businessId: reservation.businessId,
          userId: reservation.userId,
          data: reservation.data
        }) === duplicateKey;
      }) || null
    );
  }

  createReservation({ userId, businessId, data, source = "bot" }) {
    const normalizedBusinessId = String(businessId || this.business?.id || "").trim().toLowerCase();
    const normalizedUserId = String(userId || "").trim();
    const normalizedData = normalizeReservationData(data);
    const duplicate = this.findDuplicateReservation({
      businessId: normalizedBusinessId,
      userId: normalizedUserId,
      data: normalizedData
    });

    if (duplicate) {
      return {
        created: false,
        duplicate: true,
        reservation: cloneDeep(duplicate)
      };
    }

    const now = new Date().toISOString();
    const reservation = {
      id: createRecordId("rsv"),
      businessId: normalizedBusinessId,
      businessName: this.business?.name || "",
      userId: normalizedUserId,
      status: "pending",
      source,
      createdAt: now,
      updatedAt: now,
      data: normalizedData
    };

    this.getCollection()[reservation.id] = reservation;
    this.storageAdapter.persist();

    return {
      created: true,
      duplicate: false,
      reservation: cloneDeep(reservation)
    };
  }
}

module.exports = ReservationService;
