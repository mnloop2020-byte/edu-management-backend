const express = require("express");
const { protect, requireRole } = require("../middleware/auth.middleware");
const {
  createCommunication,
  createTemplate,
  listCommunications,
  listTemplates,
  renderTemplate,
  seedDefaultTemplates,
  updateCommunicationStatus,
  updateTemplate,
} = require("../controllers/communications.controller");

const router = express.Router();

router.use(protect);

router.get("/", listCommunications);
router.get("/templates", listTemplates);
router.post("/templates", requireRole("ADMIN", "TEACHER"), createTemplate);
router.put("/templates/:id", requireRole("ADMIN", "TEACHER"), updateTemplate);
router.post("/templates/:id/render", requireRole("ADMIN", "TEACHER"), renderTemplate);
router.post("/templates/seed/defaults", requireRole("ADMIN", "TEACHER"), seedDefaultTemplates);
router.post("/", requireRole("ADMIN", "TEACHER"), createCommunication);
router.patch("/:id/status", requireRole("ADMIN", "TEACHER"), updateCommunicationStatus);

module.exports = router;
