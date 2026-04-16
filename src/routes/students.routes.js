const express = require("express");
const router = express.Router();
const {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
} = require("../controllers/students.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getAllStudents);
router.get("/:id", getStudentById);
router.post("/", requireAdmin, createStudent);
router.put("/:id", requireAdmin, updateStudent);
router.delete("/:id", requireAdmin, deleteStudent);

module.exports = router;
