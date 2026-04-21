const express = require("express");
const {
  createAssignment,
  getAssignments,
  getAssignmentSubmissions,
  getMyAssignments,
  submitAssignment,
  gradeSubmission,
} = require("../controllers/assignments.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.get("/", getAssignments);
router.get("/my", requireRole("STUDENT", "ADMIN"), getMyAssignments);
router.get("/:id/submissions", requireRole("TEACHER", "ADMIN"), getAssignmentSubmissions);
router.post("/", requireRole("TEACHER", "ADMIN"), createAssignment);
router.post("/:id/submit", requireRole("STUDENT", "ADMIN"), submitAssignment);
router.patch("/submissions/:submissionId/grade", requireRole("TEACHER", "ADMIN"), gradeSubmission);

module.exports = router;
