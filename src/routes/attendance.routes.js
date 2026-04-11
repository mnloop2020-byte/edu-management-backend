const express = require("express");
const router = express.Router();
const {
  getAttendanceByDate,
  markAttendance,
  getAttendanceSummary,
} = require("../controllers/attendance.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getAttendanceByDate);
router.get("/summary", getAttendanceSummary);
router.post("/", markAttendance);

module.exports = router;
