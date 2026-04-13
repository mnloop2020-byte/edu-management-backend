const express = require("express");
const router = express.Router();
const {
  getAllPayments,
  getPaymentsByStudent,
  createPayment,
  addPartialPayment,
  updatePaymentStatus,
  getPaymentsSummary,
} = require("../controllers/payments.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getAllPayments);
router.get("/summary", getPaymentsSummary);
router.get("/student/:studentId", getPaymentsByStudent);
router.post("/", createPayment);
router.patch("/:id/pay", addPartialPayment);
router.patch("/:id/status", updatePaymentStatus);

module.exports = router;