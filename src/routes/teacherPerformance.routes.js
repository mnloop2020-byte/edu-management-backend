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

router.get("/", getTeacherPerformance);
router.get("/top", getTopTeachers);
router.get("/:id/history", getTeacherPerformanceHistory);
router.post("/recalculate", requireRole("ADMIN"), recalculateTeacherPerformance);

module.exports = router;
