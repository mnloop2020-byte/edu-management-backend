const express = require("express");
const { protect, requireAdmin } = require("../middleware/auth.middleware");
const {
  createParent,
  getParentOverview,
  linkParentToStudent,
  listParents,
} = require("../controllers/parents.controller");

const router = express.Router();

router.use(protect);

router.get("/", requireAdmin, listParents);
router.get("/:id", requireAdmin, getParentOverview);
router.post("/", requireAdmin, createParent);
router.post("/:id/link-student", requireAdmin, linkParentToStudent);

module.exports = router;
