const { cloneDeep, createRecordId, sortByTimestampDesc } = require("../utils/records");

class HandoffService {
  constructor({ storageAdapter, business }) {
    this.storageAdapter = storageAdapter;
    this.business = business;
  }

  getCollection() {
    return this.storageAdapter.getCollection("handoffs");
  }

  listHandoffs(filters = {}) {
    const normalizedStatus = String(filters.status || "pending").trim().toLowerCase();
    const normalizedBusinessId = String(filters.businessId || "").trim().toLowerCase();
    const normalizedUserId = String(filters.userId || "").trim();

    const handoffs = Object.values(this.getCollection()).filter((handoff) => {
      if (normalizedStatus && normalizedStatus !== "all" && handoff.status !== normalizedStatus) {
        return false;
      }

      if (normalizedBusinessId && handoff.businessId !== normalizedBusinessId) {
        return false;
      }

      if (normalizedUserId && handoff.userId !== normalizedUserId) {
        return false;
      }

      return true;
    });

    return cloneDeep(sortByTimestampDesc(handoffs, "requestedAt"));
  }

  findPendingHandoff({ userId, businessId }) {
    const normalizedUserId = String(userId || "").trim();
    const normalizedBusinessId = String(businessId || this.business?.id || "").trim().toLowerCase();

    return (
      Object.values(this.getCollection()).find(
        (handoff) =>
          handoff.userId === normalizedUserId &&
          handoff.businessId === normalizedBusinessId &&
          handoff.status === "pending"
      ) || null
    );
  }

  createHandoffRequest({ userId, businessId, reason, source = "bot" }) {
    const normalizedUserId = String(userId || "").trim();
    const normalizedBusinessId = String(businessId || this.business?.id || "").trim().toLowerCase();
    const normalizedReason = String(reason || "Solicitud de atencion humana").trim();
    const existingPendingHandoff = this.findPendingHandoff({
      userId: normalizedUserId,
      businessId: normalizedBusinessId
    });

    if (existingPendingHandoff) {
      return {
        created: false,
        existing: true,
        handoff: cloneDeep(existingPendingHandoff)
      };
    }

    const now = new Date().toISOString();
    const handoff = {
      id: createRecordId("handoff"),
      businessId: normalizedBusinessId,
      businessName: this.business?.name || "",
      userId: normalizedUserId,
      reason: normalizedReason,
      status: "pending",
      source,
      requestedAt: now,
      updatedAt: now
    };

    this.getCollection()[handoff.id] = handoff;
    this.storageAdapter.persist();

    return {
      created: true,
      existing: false,
      handoff: cloneDeep(handoff)
    };
  }
}

module.exports = HandoffService;
