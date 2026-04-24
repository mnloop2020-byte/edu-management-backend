const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  getRegistrationStatus,
  createUserByAdmin,
} = require("../controllers/auth.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

router.post("/register", register);
router.post("/login", login);
router.get("/registration-status", getRegistrationStatus);
router.get("/me", protect, getMe);
router.post("/users", protect, requireAdmin, createUserByAdmin);

module.exports = router;
