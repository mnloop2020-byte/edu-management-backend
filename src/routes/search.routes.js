const express = require("express");
const { searchAll } = require("../controllers/search.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.get("/", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), searchAll);

module.exports = router;
