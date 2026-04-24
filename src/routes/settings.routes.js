const express = require("express");
const router = express.Router();
const { getSettings, updateSetting } = require("../controllers/settings.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", requireAdmin, getSettings);
router.post("/", requireAdmin, updateSetting);

module.exports = router;
