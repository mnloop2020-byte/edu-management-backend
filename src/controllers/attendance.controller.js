const prisma = require("../lib/prisma");

const normalizeDay = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getAttendanceByDate = async (req, res) => {
  try {
    const start = normalizeDay(req.query.date);
    if (!start) {
      return res.status(400).json({ message: "Invalid attendance date" });
    }

    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const records = await prisma.attendance.findMany({
      where: { date: { gte: start, lte: end } },
      include: { student: { select: { id: true, name: true, course: true } } },
      orderBy: { id: "asc" },
    });

    res.json({ records });
  } catch (err) {
    console.error("getAttendanceByDate error:", err);
    res.status(500).json({ message: "Failed to load attendance" });
  }
};

const markAttendance = async (req, res) => {
  try {
    const { studentId, status, date } = req.body;
    const parsedStudentId = Number(studentId);

    if (!parsedStudentId || !status) {
      return res.status(400).json({ message: "studentId and status are required" });
    }

    const validStatuses = ["present", "absent", "late"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid attendance status" });
    }

    const recordDate = normalizeDay(date);
    if (!recordDate) {
      return res.status(400).json({ message: "Invalid attendance date" });
    }

    const endOfDay = new Date(recordDate);
    endOfDay.setHours(23, 59, 59, 999);

    const student = await prisma.student.findUnique({
      where: { id: parsedStudentId },
      select: { id: true },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findFirst({
        where: {
          studentId: parsedStudentId,
          date: { gte: recordDate, lte: endOfDay },
        },
        orderBy: { id: "asc" },
      });

      if (existing) {
        return tx.attendance.update({
          where: { id: existing.id },
          data: { status },
        });
      }

      return tx.attendance.create({
        data: { studentId: parsedStudentId, status, date: recordDate },
      });
    });

    res.json({ message: "Attendance saved successfully", record });
  } catch (err) {
    console.error("markAttendance error:", err);
    res.status(500).json({ message: "Failed to save attendance" });
  }
};

const getAttendanceSummary = async (req, res) => {
  try {
    const today = normalizeDay();
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [present, absent, late, totalStudents] = await Promise.all([
      prisma.attendance.count({ where: { status: "present", date: { gte: today, lte: endOfDay } } }),
      prisma.attendance.count({ where: { status: "absent", date: { gte: today, lte: endOfDay } } }),
      prisma.attendance.count({ where: { status: "late", date: { gte: today, lte: endOfDay } } }),
      prisma.student.count(),
    ]);

    res.json({ summary: { present, absent, late, totalStudents } });
  } catch (err) {
    console.error("getAttendanceSummary error:", err);
    res.status(500).json({ message: "Failed to load attendance summary" });
  }
};

const getWeeklyAttendance = async (req, res) => {
  try {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const promises = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);

      return prisma.attendance.count({
        where: { status: "present", date: { gte: day, lte: end } },
      }).then((count) => ({
        day: days[day.getDay()],
        students: count,
      }));
    });

    const weekly = await Promise.all(promises);
    res.json({ weekly });
  } catch (err) {
    console.error("getWeeklyAttendance error:", err);
    res.status(500).json({ message: "Failed to load weekly attendance" });
  }
};

module.exports = { getAttendanceByDate, markAttendance, getAttendanceSummary, getWeeklyAttendance };
