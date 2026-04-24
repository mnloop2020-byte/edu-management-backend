require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.routes");
const studentsRoutes = require("./routes/students.routes");
const teachersRoutes = require("./routes/teachers.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const paymentsRoutes = require("./routes/payments.routes");
const aiRoutes = require("./routes/ai.routes");
const settingsRoutes = require("./routes/settings.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const calendarRoutes = require("./routes/calendar.routes");
const assignmentsRoutes = require("./routes/assignments.routes");
const teacherPerformanceRoutes = require("./routes/teacherPerformance.routes");
const searchRoutes = require("./routes/search.routes");
const academicRoutes = require("./routes/academic.routes");
const gradebookRoutes = require("./routes/gradebook.routes");
const communicationsRoutes = require("./routes/communications.routes");
const auditRoutes = require("./routes/audit.routes");
const parentsRoutes = require("./routes/parents.routes");
const transcriptsRoutes = require("./routes/transcripts.routes");
const { bootstrapAcademicDataFromLegacy } = require("./services/academic.service");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "120kb";

if (!process.env.JWT_SECRET) {
  throw new Error("Missing JWT_SECRET environment variable");
}

if (isProduction && String(process.env.JWT_SECRET).length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "https://edu-management-system.vercel.app",
  "https://edu-management-system-virid.vercel.app",
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

const vercelPreviewPattern = /^https:\/\/edu-management-system(?:-[a-z0-9]+)?-mnloop2020-bytes-projects\.vercel\.app$/i;
const generalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});

const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 25),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again later." },
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || vercelPreviewPattern.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: jsonBodyLimit }));
app.use("/api", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/teachers/performance", teacherPerformanceRoutes);
app.use("/api/teachers", teachersRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/academic", academicRoutes);
app.use("/api/gradebook", gradebookRoutes);
app.use("/api/communications", communicationsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/parents", parentsRoutes);
app.use("/api/transcripts", transcriptsRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "EduSystem API is running" });
});

app.use((err, req, res, next) => {
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin is not allowed by CORS policy" });
  }

  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request payload is too large" });
  }

  if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, "body")) {
    return res.status(400).json({ message: "Invalid JSON payload" });
  }

  console.error("Unhandled server error:", err);
  return res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    const bootstrapResult = await bootstrapAcademicDataFromLegacy();
    console.log("Academic bootstrap completed", bootstrapResult);
  } catch (error) {
    console.error("Academic bootstrap failed:", error.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
