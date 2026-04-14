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
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getAllPayments);
router.get("/summary", getPaymentsSummary);
router.get("/student/:studentId", getPaymentsByStudent);
router.get("/:id/transactions", getPaymentTransactions);
router.post("/", createPayment);
router.patch("/:id/pay", addPartialPayment);
router.patch("/:id/status", updatePaymentStatus);
router.delete("/:id", deletePayment);

module.exports = router;