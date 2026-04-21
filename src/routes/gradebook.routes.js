const express = require("express");
const { protect, requireRole } = require("../middleware/auth.middleware");
const {
  bulkUpdateGradebook,
  getOfferingGradebook,
  listGradebookOfferings,
} = require("../controllers/gradebook.controller");

const router = express.Router();

router.use(protect);
router.use(requireRole("ADMIN", "TEACHER"));

router.get("/offerings", listGradebookOfferings);
router.get("/offerings/:id", getOfferingGradebook);
router.patch("/offerings/:id/bulk", bulkUpdateGradebook);

module.exports = router;
