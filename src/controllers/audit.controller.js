const prisma = require("../lib/prisma");

const listAuditLogs = async (req, res) => {
  try {
    const where = {};
    if (req.query.entityType) where.entityType = String(req.query.entityType);
    if (req.query.entityId) where.entityId = String(req.query.entityId);

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json({ logs });
  } catch (error) {
    console.error("listAuditLogs error:", error);
    res.status(500).json({ message: "Failed to load audit logs" });
  }
};

module.exports = {
  listAuditLogs,
};
