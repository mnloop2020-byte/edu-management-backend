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
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getAllPayments);
router.get("/summary", getPaymentsSummary);
router.get("/overdue", getOverduePayments);
router.get("/student/:studentId", getPaymentsByStudent);
router.get("/:id/transactions", getPaymentTransactions);
router.post("/", requireAdmin, createPayment);
router.post("/:id/installments", requireAdmin, createInstallments);
router.patch("/:id/pay", requireAdmin, addPartialPayment);
router.patch("/:id/status", requireAdmin, updatePaymentStatus);
router.delete("/:id", requireAdmin, deletePayment);
router.get("/history/student/:id", getStudentPaymentHistory);

module.exports = router;
