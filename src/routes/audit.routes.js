const express = require("express");
const { protect, requireAdmin } = require("../middleware/auth.middleware");
const { listAuditLogs } = require("../controllers/audit.controller");

const router = express.Router();

router.use(protect);
router.get("/", requireAdmin, listAuditLogs);

module.exports = router;
