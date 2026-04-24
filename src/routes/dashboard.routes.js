const express = require("express");
const { getDashboardOverview } = require("../controllers/dashboard.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.get("/", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), getDashboardOverview);

module.exports = router;
