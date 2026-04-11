const prisma = require("../lib/prisma");

const getAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.query;

    const start = date ? new Date(date) : new Date();
    start.setHours(0, 0, 0, 0);
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
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const markAttendance = async (req, res) => {
  try {
    const { studentId, status, date } = req.body;

    if (!studentId || !status) {
      return res.status(400).json({ message: "studentId والحالة مطلوبان" });
    }

    const validStatuses = ["present", "absent", "late"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "الحالة غير صالحة" });
    }

    const recordDate = date ? new Date(date) : new Date();
    recordDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(recordDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await prisma.attendance.findFirst({
      where: {
        studentId: Number(studentId),
        date: { gte: recordDate, lte: endOfDay },
      },
    });

    let record;
    if (existing) {
      record = await prisma.attendance.update({
        where: { id: existing.id },
        data: { status },
      });
    } else {
      record = await prisma.attendance.create({
        data: { studentId: Number(studentId), status, date: recordDate },
      });
    }

    res.json({ message: "تم تسجيل الحضور", record });
  } catch (err) {
    console.error("markAttendance error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const getAttendanceSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

module.exports = { getAttendanceByDate, markAttendance, getAttendanceSummary };
