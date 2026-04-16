const express = require("express");
const router = express.Router();
const {
  getAllPayments,
  getPaymentsByStudent,
  getPaymentTransactions,
  createPayment,
  addPartialPayment,
  deletePayment,
  updatePaymentStatus,
  getPaymentsSummary,
} = require("../controllers/payments.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getAllPayments);
router.get("/summary", getPaymentsSummary);
router.get("/student/:studentId", getPaymentsByStudent);
router.get("/:id/transactions", getPaymentTransactions);
router.post("/", requireAdmin, createPayment);
router.patch("/:id/pay", requireAdmin, addPartialPayment);
router.patch("/:id/status", requireAdmin, updatePaymentStatus);
router.delete("/:id", requireAdmin, deletePayment);

module.exports = router;
