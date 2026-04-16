const express = require("express");
const router = express.Router();
const {
  getAllTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
} = require("../controllers/teachers.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getAllTeachers);
router.get("/:id", getTeacherById);
router.post("/", requireAdmin, createTeacher);
router.put("/:id", requireAdmin, updateTeacher);
router.delete("/:id", requireAdmin, deleteTeacher);

module.exports = router;
