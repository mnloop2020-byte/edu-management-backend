const express = require("express");
const router = express.Router();
const {
  getAllPayments,
  getPaymentsByStudent,
  getPaymentTransactions,
  createPayment,
  addPartialPayment,
  createInstallments,
  deletePayment,
  updatePaymentStatus,
  getPaymentsSummary,
  getStudentPaymentHistory,
  getOverduePayments,
} = require("../controllers/payments.controller");
const { protect, requireAdmin, requireRole } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), getAllPayments);
router.get("/summary", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), getPaymentsSummary);
router.get("/overdue", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), getOverduePayments);
router.get("/student/:studentId", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), getPaymentsByStudent);
router.get("/:id/transactions", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), getPaymentTransactions);
router.post("/", requireAdmin, createPayment);
router.post("/:id/installments", requireAdmin, createInstallments);
router.patch("/:id/pay", requireAdmin, addPartialPayment);
router.patch("/:id/status", requireAdmin, updatePaymentStatus);
router.delete("/:id", requireAdmin, deletePayment);
router.get("/history/student/:id", requireRole("ADMIN", "TEACHER", "STUDENT", "PARENT"), getStudentPaymentHistory);

module.exports = router;
