const prisma = require("../lib/prisma");

const normalizeDay = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getSemesterRange = (value) => {
  const base = value ? new Date(value) : new Date();
  const year = base.getFullYear();
  const firstHalf = base.getMonth() < 6;
  const start = new Date(year, firstHalf ? 0 : 6, 1);
  const end = new Date(year, firstHalf ? 6 : 12, 1);
  return { start, end };
};

const buildAttendanceIndicator = (records) => {
  const totalClasses = records.length;
  const presentCount = records.filter((item) => item.status === "present").length;
  const absentCount = records.filter((item) => item.status === "absent").length;
  const lateCount = records.filter((item) => item.status === "late").length;
  const attendancePercentage = totalClasses > 0 ? (presentCount / totalClasses) * 100 : 0;
  const absencePercentage = totalClasses > 0 ? (absentCount / totalClasses) * 100 : 0;

  let indicator = "SAFE";
  let indicatorLabel = "Good";
  if (absentCount >= 3 && absentCount <= 4) {
    indicator = "WARNING";
    indicatorLabel = "Near limit";
  } else if (absentCount > 4) {
    indicator = "RISK";
    indicatorLabel = "Exceeded";
  }

  return {
    totalClasses,
    presentCount,
    absentCount,
    lateCount,
    attendancePercentage: Math.round(attendancePercentage * 100) / 100,
    absencePercentage: Math.round(absencePercentage * 100) / 100,
    indicator,
    indicatorLabel,
  };
};

const getStudentIdForUser = async (userId) => {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });
  return student?.id || null;
};

const getAttendanceByDate = async (req, res) => {
  try {
    const start = normalizeDay(req.query.date);
    if (!start) return res.status(400).json({ message: "Invalid attendance date" });
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
    if (!parsedStudentId || !status) return res.status(400).json({ message: "studentId and status are required" });
    if (!["present", "absent", "late"].includes(status)) return res.status(400).json({ message: "Invalid attendance status" });

    const recordDate = normalizeDay(date);
    if (!recordDate) return res.status(400).json({ message: "Invalid attendance date" });

    const endOfDay = new Date(recordDate);
    endOfDay.setHours(23, 59, 59, 999);

    const student = await prisma.student.findUnique({ where: { id: parsedStudentId }, select: { id: true } });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findFirst({
        where: { studentId: parsedStudentId, date: { gte: recordDate, lte: endOfDay } },
        orderBy: { id: "asc" },
      });

      if (existing) {
        return tx.attendance.update({ where: { id: existing.id }, data: { status } });
      }

      return tx.attendance.create({ data: { studentId: parsedStudentId, status, date: recordDate } });
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
    const weekly = await Promise.all(Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);

      return prisma.attendance.count({
        where: { status: "present", date: { gte: day, lte: end } },
      }).then((count) => ({ day: days[day.getDay()], students: count }));
    }));

    res.json({ weekly });
  } catch (err) {
    console.error("getWeeklyAttendance error:", err);
    res.status(500).json({ message: "Failed to load weekly attendance" });
  }
};

const getStudentAttendanceStats = async (req, res) => {
  try {
    let studentId = Number(req.params.id);

    if (req.user.role === "STUDENT") {
      const ownStudentId = await getStudentIdForUser(req.user.id);
      if (!ownStudentId) {
        return res.status(404).json({ message: "Student profile not found" });
      }

      if (studentId !== ownStudentId) {
        return res.status(403).json({ message: "You can only access your own attendance stats" });
      }
      studentId = ownStudentId;
    }

    const { start, end } = getSemesterRange(req.query.date);
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true } });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const records = await prisma.attendance.findMany({
      where: { studentId, date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
    });

    res.json({
      studentId,
      studentName: student.name,
      range: { start, end },
      ...buildAttendanceIndicator(records),
    });
  } catch (err) {
    console.error("getStudentAttendanceStats error:", err);
    res.status(500).json({ message: "Failed to load attendance stats" });
  }
};

const getRiskStudents = async (req, res) => {
  try {
    const { start, end } = getSemesterRange(req.query.date);
    const students = await prisma.student.findMany({
      include: {
        attendance: {
          where: { date: { gte: start, lt: end } },
        },
      },
      orderBy: { name: "asc" },
    });

    const items = students
      .map((student) => ({
        student: { id: student.id, name: student.name, course: student.course },
        ...buildAttendanceIndicator(student.attendance),
      }))
      .filter((item) => item.indicator !== "SAFE");

    res.json({ range: { start, end }, items });
  } catch (err) {
    console.error("getRiskStudents error:", err);
    res.status(500).json({ message: "Failed to load risk students" });
  }
};

module.exports = {
  getAttendanceByDate,
  markAttendance,
  getAttendanceSummary,
  getWeeklyAttendance,
  getStudentAttendanceStats,
  getRiskStudents,
};
