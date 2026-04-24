const express = require("express");
const router = express.Router();
const {
  getAttendanceByDate,
  markAttendance,
  getAttendanceSummary,
  getWeeklyAttendance,
  getStudentAttendanceStats,
  getRiskStudents,
} = require("../controllers/attendance.controller");
const { protect, requireAdmin, requireRole } = require("../middleware/auth.middleware");

router.use(protect);


router.get("/weekly", requireRole("ADMIN", "TEACHER"), getWeeklyAttendance);
router.get("/risk", requireRole("ADMIN", "TEACHER"), getRiskStudents);
router.get("/", requireRole("ADMIN", "TEACHER"), getAttendanceByDate);
router.get("/summary", requireRole("ADMIN", "TEACHER"), getAttendanceSummary);
router.get("/student/:id/stats", requireRole("ADMIN", "TEACHER", "STUDENT"), getStudentAttendanceStats);
router.post("/", requireAdmin, markAttendance);

module.exports = router;
