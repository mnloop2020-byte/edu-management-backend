const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { normalizeRole } = require("../middleware/auth.middleware");

const ALLOWED_ROLES = new Set(["ADMIN", "TEACHER", "STUDENT", "PARENT"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const isEnvEnabled = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const isPublicRegistrationEnabled = () =>
  isEnvEnabled(process.env.PUBLIC_REGISTRATION_ENABLED) ||
  isEnvEnabled(process.env.ALLOW_PUBLIC_REGISTRATION);

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: normalizeRole(user.role),
  createdAt: user.createdAt,
});

const getRegistrationStatus = async (_req, res) => {
  try {
    const usersCount = await prisma.user.count();
    const bootstrapRegistration = usersCount === 0;
    const publicRegistration = isPublicRegistrationEnabled();

    res.json({
      registrationEnabled: bootstrapRegistration || publicRegistration,
      bootstrapRegistration,
      publicRegistration,
    });
  } catch (err) {
    console.error("getRegistrationStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const usersCount = await prisma.user.count();
    const bootstrapRegistration = usersCount === 0;

    if (!bootstrapRegistration && !isPublicRegistrationEnabled()) {
      return res.status(403).json({
        message: "Public registration is disabled. Please contact an administrator.",
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const assignedRole = bootstrapRegistration ? "ADMIN" : "STUDENT";

    const user = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
          role: assignedRole,
        },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    const safeUser = sanitizeUser(user);
    const token = generateToken({ id: safeUser.id, email: safeUser.email, role: safeUser.role });

    res.status(201).json({ message: "Account created successfully", user: safeUser, token });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const createUserByAdmin = async (req, res) => {
  try {
    const { name, email, password, role, studentId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const normalizedRole = normalizeRole(role || "STUDENT");
    if (!ALLOWED_ROLES.has(normalizedRole)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already in use" });
    }

    let linkedStudent = null;
    if (normalizedRole === "STUDENT") {
      const parsedStudentId = Number(studentId);
      if (!Number.isInteger(parsedStudentId) || parsedStudentId <= 0) {
        return res.status(400).json({ message: "studentId is required when creating a STUDENT account" });
      }

      linkedStudent = await prisma.student.findUnique({
        where: { id: parsedStudentId },
        select: { id: true, name: true, userId: true },
      });

      if (!linkedStudent) {
        return res.status(404).json({ message: "Student not found" });
      }

      if (linkedStudent.userId) {
        return res.status(409).json({ message: "Student already has a linked account" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
          role: normalizedRole,
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      if (linkedStudent) {
        const linkResult = await tx.student.updateMany({
          where: { id: linkedStudent.id, userId: null },
          data: { userId: createdUser.id },
        });

        if (linkResult.count !== 1) {
          throw Object.assign(new Error("Student already has a linked account"), { status: 409 });
        }
      }

      return createdUser;
    });

    res.status(201).json({
      message: "User created successfully",
      user: sanitizeUser(user),
      studentId: linkedStudent ? linkedStudent.id : null,
    });
  } catch (err) {
    console.error("createUserByAdmin error:", err);
    if (err && err.status) {
      return res.status(err.status).json({ message: err.message || "Request failed" });
    }
    if (err && err.code === "P2002") {
      return res.status(409).json({ message: "Email is already in use" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      user = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      });
    }
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const safeUser = sanitizeUser(user);
    const token = generateToken({ id: safeUser.id, email: safeUser.email, role: safeUser.role });

    res.json({
      message: "Logged in successfully",
      user: safeUser,
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { register, login, getMe, getRegistrationStatus, createUserByAdmin };
