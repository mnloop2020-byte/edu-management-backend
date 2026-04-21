const express = require("express");
const { protect, requireRole } = require("../middleware/auth.middleware");
const { getStudentTranscript } = require("../controllers/transcripts.controller");

const router = express.Router();

router.use(protect);
router.get("/student/:studentId", requireRole("ADMIN", "TEACHER"), getStudentTranscript);

module.exports = router;
