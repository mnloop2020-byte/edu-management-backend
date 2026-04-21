require("dotenv").config();
const express = require("express");
const cors = require("cors");

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

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || vercelPreviewPattern.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(express.json());

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
