const express = require("express");
const {
  recalculateTeacherPerformance,
  getTeacherPerformance,
  getTopTeachers,
  getTeacherPerformanceHistory,
} = require("../controllers/teacherPerformance.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.get("/", requireRole("ADMIN", "TEACHER"), getTeacherPerformance);
router.get("/top", requireRole("ADMIN", "TEACHER"), getTopTeachers);
router.get("/:id/history", requireRole("ADMIN", "TEACHER"), getTeacherPerformanceHistory);
router.post("/recalculate", requireRole("ADMIN"), recalculateTeacherPerformance);

module.exports = router;
