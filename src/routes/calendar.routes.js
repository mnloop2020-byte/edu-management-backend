const express = require("express");
const {
  getCalendarMeta,
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getClasses,
  createClass,
} = require("../controllers/calendar.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.get("/meta", getCalendarMeta);
router.get("/classes", getClasses);
router.get("/", getCalendarEvents);

router.post("/classes", requireAdmin, createClass);
router.post("/", requireAdmin, createCalendarEvent);
router.put("/:id", requireAdmin, updateCalendarEvent);
router.delete("/:id", requireAdmin, deleteCalendarEvent);

module.exports = router;
