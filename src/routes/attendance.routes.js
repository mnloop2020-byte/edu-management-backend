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
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.use(protect);


router.get("/weekly", getWeeklyAttendance);
router.get("/risk", getRiskStudents);
router.get("/", getAttendanceByDate);
router.get("/summary", getAttendanceSummary);
router.get("/student/:id/stats", getStudentAttendanceStats);
router.post("/", requireAdmin, markAttendance);

module.exports = router;
