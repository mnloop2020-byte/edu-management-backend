const express = require("express");
const router = express.Router();
const { getSettings, updateSetting } = require("../controllers/settings.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getSettings);
router.post("/", updateSetting);

module.exports = router;