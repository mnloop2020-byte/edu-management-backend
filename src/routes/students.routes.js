const express = require("express");
const router = express.Router();
const {
  getAllStudents,
  getStudentById,
  getMyStudentProfile,
  createStudent,
  createStudentAccount,
  updateStudentAccount,
  updateStudent,
  deleteStudent,
} = require("../controllers/students.controller");
const { protect, requireAdmin, requireRole } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/me", requireRole("STUDENT"), getMyStudentProfile);
router.get("/", requireRole("ADMIN", "TEACHER"), getAllStudents);
router.get("/:id", requireRole("ADMIN", "TEACHER"), getStudentById);
router.post("/", requireAdmin, createStudent);
router.post("/:id/account", requireAdmin, createStudentAccount);
router.put("/:id/account", requireAdmin, updateStudentAccount);
router.put("/:id", requireAdmin, updateStudent);
router.delete("/:id", requireAdmin, deleteStudent);

module.exports = router;
