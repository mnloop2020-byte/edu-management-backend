const express = require("express");
const { getDashboardOverview } = require("../controllers/dashboard.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.get("/", getDashboardOverview);

module.exports = router;
