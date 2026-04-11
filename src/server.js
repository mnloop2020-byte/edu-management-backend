require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const studentsRoutes = require("./routes/students.routes");
const teachersRoutes = require("./routes/teachers.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const paymentsRoutes = require("./routes/payments.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/teachers", teachersRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/payments", paymentsRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "EduSystem API is running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
