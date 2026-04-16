const express = require("express");
const router = express.Router();
const {
  getAttendanceByDate,
  markAttendance,
  getAttendanceSummary,
    getWeeklyAttendance,
} = require("../controllers/attendance.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.use(protect);


router.get("/weekly", getWeeklyAttendance);
router.get("/", getAttendanceByDate);
router.get("/summary", getAttendanceSummary);
router.post("/", requireAdmin, markAttendance);

module.exports = router;
