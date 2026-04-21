const express = require("express");
const router = express.Router();

const {
  bootstrapAcademicHandler,
  createEnrollmentHandler,
  createOfferingHandler,
  createPolicyHandler,
  createSemesterHandler,
  createSubjectHandler,
  getStudentAcademicProfileHandler,
  getStudentGpaSummaryHandler,
  listOfferings,
  listSemesters,
  listSubjects,
  recalculateEnrollmentHandler,
  updateAssessmentHandler,
} = require("../controllers/academic.controller");
const { protect, requireAdmin, requireRole } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/subjects", listSubjects);
router.get("/semesters", listSemesters);
router.get("/offerings", listOfferings);
router.get("/students/:id/profile", getStudentAcademicProfileHandler);
router.get("/students/:id/gpa-summary", getStudentGpaSummaryHandler);

router.post("/bootstrap", requireAdmin, bootstrapAcademicHandler);
router.post("/subjects", requireAdmin, createSubjectHandler);
router.post("/semesters", requireAdmin, createSemesterHandler);
router.post("/policies", requireAdmin, createPolicyHandler);
router.post("/offerings", requireAdmin, createOfferingHandler);
router.post("/enrollments", requireAdmin, createEnrollmentHandler);
router.patch("/enrollments/:id/assessments/:code", requireRole("ADMIN", "TEACHER"), updateAssessmentHandler);
router.post("/enrollments/:id/recalculate", requireRole("ADMIN", "TEACHER"), recalculateEnrollmentHandler);

module.exports = router;
