const prisma = require("../lib/prisma");

const eventInclude = {
  student: { select: { id: true, name: true, course: true } },
  teacher: { select: { id: true, name: true, subject: true } },
  class: { select: { id: true, name: true, code: true } },
};

const parseDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeEvent = (event) => ({
  ...event,
  student: event.student || null,
  teacher: event.teacher || null,
  class: event.class || null,
});

const getCalendarMeta = async (req, res) => {
  try {
    const [students, teachers, classes] = await Promise.all([
      prisma.student.findMany({ select: { id: true, name: true, course: true }, orderBy: { name: "asc" } }),
      prisma.teacher.findMany({ select: { id: true, name: true, subject: true }, orderBy: { name: "asc" } }),
      prisma.academicClass.findMany({
        select: { id: true, name: true, code: true, credits: true, teacherId: true },
        orderBy: { name: "asc" },
      }),
    ]);

    res.json({ students, teachers, classes });
  } catch (err) {
    console.error("getCalendarMeta error:", err);
    res.status(500).json({ message: "Failed to load calendar metadata" });
  }
};

const getCalendarEvents = async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    if (!from || !to) {
      return res.status(400).json({ message: "Valid from and to dates are required" });
    }

    const where = {
      startAt: { gte: from, lte: to },
    };

    if (req.query.type) where.type = req.query.type;
    if (req.query.studentId) where.relatedStudentId = Number(req.query.studentId);
    if (req.query.teacherId) where.relatedTeacherId = Number(req.query.teacherId);
    if (req.query.classId) where.relatedClassId = Number(req.query.classId);

    const events = await prisma.calendarEvent.findMany({
      where,
      include: eventInclude,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });

    res.json({ events: events.map(normalizeEvent) });
  } catch (err) {
    console.error("getCalendarEvents error:", err);
    res.status(500).json({ message: "Failed to load calendar events" });
  }
};

const createCalendarEvent = async (req, res) => {
  try {
    const { title, description, type, startAt, endAt, relatedStudentId, relatedTeacherId, relatedClassId } = req.body;

    if (!title || !type || !startAt) {
      return res.status(400).json({ message: "title, type, and startAt are required" });
    }

    const parsedStartAt = parseDate(startAt);
    const parsedEndAt = endAt ? parseDate(endAt) : null;

    if (!parsedStartAt || (endAt && !parsedEndAt)) {
      return res.status(400).json({ message: "Invalid event date" });
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title,
        description: description || null,
        type,
        startAt: parsedStartAt,
        endAt: parsedEndAt,
        relatedStudentId: relatedStudentId ? Number(relatedStudentId) : null,
        relatedTeacherId: relatedTeacherId ? Number(relatedTeacherId) : null,
        relatedClassId: relatedClassId ? Number(relatedClassId) : null,
      },
      include: eventInclude,
    });

    res.status(201).json({ message: "Calendar event created successfully", event: normalizeEvent(event) });
  } catch (err) {
    console.error("createCalendarEvent error:", err);
    res.status(500).json({ message: "Failed to create calendar event" });
  }
};

const updateCalendarEvent = async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    const { title, description, type, startAt, endAt, relatedStudentId, relatedTeacherId, relatedClassId } = req.body;

    const existing = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (!existing) {
      return res.status(404).json({ message: "Calendar event not found" });
    }

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description || null;
    if (type !== undefined) data.type = type;
    if (startAt !== undefined) {
      const parsed = parseDate(startAt);
      if (!parsed) return res.status(400).json({ message: "Invalid startAt date" });
      data.startAt = parsed;
    }
    if (endAt !== undefined) {
      if (endAt === null || endAt === "") data.endAt = null;
      else {
        const parsed = parseDate(endAt);
        if (!parsed) return res.status(400).json({ message: "Invalid endAt date" });
        data.endAt = parsed;
      }
    }
    if (relatedStudentId !== undefined) data.relatedStudentId = relatedStudentId ? Number(relatedStudentId) : null;
    if (relatedTeacherId !== undefined) data.relatedTeacherId = relatedTeacherId ? Number(relatedTeacherId) : null;
    if (relatedClassId !== undefined) data.relatedClassId = relatedClassId ? Number(relatedClassId) : null;

    const event = await prisma.calendarEvent.update({
      where: { id: eventId },
      data,
      include: eventInclude,
    });

    res.json({ message: "Calendar event updated successfully", event: normalizeEvent(event) });
  } catch (err) {
    console.error("updateCalendarEvent error:", err);
    res.status(500).json({ message: "Failed to update calendar event" });
  }
};

const deleteCalendarEvent = async (req, res) => {
  try {
    await prisma.calendarEvent.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Calendar event deleted successfully" });
  } catch (err) {
    console.error("deleteCalendarEvent error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Calendar event not found" });
    }
    res.status(500).json({ message: "Failed to delete calendar event" });
  }
};

const getClasses = async (req, res) => {
  try {
    const classes = await prisma.academicClass.findMany({
      include: { teacher: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    res.json({ classes });
  } catch (err) {
    console.error("getClasses error:", err);
    res.status(500).json({ message: "Failed to load classes" });
  }
};

const createClass = async (req, res) => {
  try {
    const { name, code, credits, teacherId, studentIds } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: "name and code are required" });
    }

    const academicClass = await prisma.academicClass.create({
      data: {
        name,
        code,
        credits: credits ? Number(credits) : 3,
        teacherId: teacherId ? Number(teacherId) : null,
        students: Array.isArray(studentIds) && studentIds.length > 0
          ? { create: studentIds.map((studentId) => ({ studentId: Number(studentId) })) }
          : undefined,
      },
      include: {
        teacher: { select: { id: true, name: true } },
        students: { include: { student: { select: { id: true, name: true } } } },
      },
    });

    res.status(201).json({ message: "Class created successfully", class: academicClass });
  } catch (err) {
    console.error("createClass error:", err);
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Class code is already in use" });
    }
    res.status(500).json({ message: "Failed to create class" });
  }
};

module.exports = {
  getCalendarMeta,
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getClasses,
  createClass,
};
