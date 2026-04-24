const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

const normalizeRole = (role) => String(role || "").toUpperCase();

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication token is required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(decoded?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: "Invalid authentication token payload" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, name: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Session is no longer valid. Please sign in again." });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      name: user.name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const requireRole = (...roles) => {
  const allowedRoles = roles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication is required" });
    }

    if (!allowedRoles.includes(normalizeRole(req.user.role))) {
      return res.status(403).json({ message: "You do not have permission for this action" });
    }

    next();
  };
};

const requireAdmin = requireRole("ADMIN");

module.exports = { protect, requireRole, requireAdmin, normalizeRole };
