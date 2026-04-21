const prisma = require("../lib/prisma");

const createAuditLog = async (payload, prismaClient = prisma) => {
  const action = String(payload?.action || "").trim();
  const entityType = String(payload?.entityType || "").trim();
  const summary = String(payload?.summary || "").trim();

  if (!action || !entityType || !summary) {
    return null;
  }

  return prismaClient.auditLog.create({
    data: {
      actorUserId: payload.actorUserId ? Number(payload.actorUserId) : null,
      action,
      entityType,
      entityId: payload.entityId === undefined || payload.entityId === null ? null : String(payload.entityId),
      summary,
      metadata: payload.metadata ?? null,
    },
  });
};

module.exports = {
  createAuditLog,
};
