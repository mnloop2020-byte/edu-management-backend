const express = require("express");
const { searchAll } = require("../controllers/search.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);
router.get("/", searchAll);

module.exports = router;
