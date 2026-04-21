const prisma = require("../lib/prisma");

const round = (value) => Math.round(value * 100) / 100;

const recalculateTeacherPerformance = async (req, res) => {
  try {
    const month = Number(req.query.month || req.body.month || new Date().getMonth() + 1);
    const year = Number(req.query.year || req.body.year || new Date().getFullYear());

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const teachers = await prisma.teacher.findMany({
      include: {
        academicClasses: {
          include: {
            students: { select: { studentId: true } },
          },
        },
        assignments: {
          where: { dueAt: { gte: start, lt: end } },
          include: { submissions: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const snapshots = [];

    for (const teacher of teachers) {
      const studentIds = [...new Set(teacher.academicClasses.flatMap((item) => item.students.map((student) => student.studentId)))];
      const gradedSubmissions = teacher.assignments.flatMap((assignment) =>
        assignment.submissions.filter((submission) => submission.score !== null && submission.score !== undefined)
      );

      const avgStudentScore = gradedSubmissions.length > 0
        ? gradedSubmissions.reduce((sum, item) => sum + (item.score || 0), 0) / gradedSubmissions.length
        : 0;

      const successfulSubmissions = gradedSubmissions.filter((item) => (item.score || 0) >= 60).length;
      const successRate = gradedSubmissions.length > 0 ? (successfulSubmissions / gradedSubmissions.length) * 100 : 0;

      const attendanceRate = studentIds.length > 0
        ? await prisma.attendance.findMany({
            where: {
              studentId: { in: studentIds },
              date: { gte: start, lt: end },
            },
            select: { status: true },
          }).then((records) => {
            if (records.length === 0) return 0;
            const present = records.filter((item) => item.status === "present").length;
            return (present / records.length) * 100;
          })
        : 0;

      const performanceScore = round(
        Math.max(0, Math.min(100, (avgStudentScore * 0.5) + (attendanceRate * 0.2) + (successRate * 0.3)))
      );

      const snapshot = await prisma.teacherPerformanceSnapshot.upsert({
        where: { teacherId_month_year: { teacherId: teacher.id, month, year } },
        update: {
          avgStudentScore: round(avgStudentScore),
          attendanceRate: round(attendanceRate),
          successRate: round(successRate),
          performanceScore,
        },
        create: {
          teacherId: teacher.id,
          month,
          year,
          avgStudentScore: round(avgStudentScore),
          attendanceRate: round(attendanceRate),
          successRate: round(successRate),
          performanceScore,
        },
        include: { teacher: { select: { id: true, name: true, subject: true } } },
      });

      snapshots.push(snapshot);
    }

    res.json({ month, year, items: snapshots });
  } catch (err) {
    console.error("recalculateTeacherPerformance error:", err);
    res.status(500).json({ message: "Failed to recalculate teacher performance" });
  }
};

const getTeacherPerformance = async (req, res) => {
  try {
    const month = Number(req.query.month || new Date().getMonth() + 1);
    const year = Number(req.query.year || new Date().getFullYear());

    const items = await prisma.teacherPerformanceSnapshot.findMany({
      where: { month, year },
      include: { teacher: { select: { id: true, name: true, subject: true } } },
      orderBy: [{ performanceScore: "desc" }, { teacherId: "asc" }],
    });

    res.json({
      month,
      year,
      items: items.map((item, index) => ({
        ...item,
        rank: index + 1,
      })),
    });
  } catch (err) {
    console.error("getTeacherPerformance error:", err);
    res.status(500).json({ message: "Failed to load teacher performance" });
  }
};

const getTopTeachers = async (req, res) => {
  try {
    const month = Number(req.query.month || new Date().getMonth() + 1);
    const year = Number(req.query.year || new Date().getFullYear());
    const limit = Math.min(20, Number(req.query.limit || 5));

    const items = await prisma.teacherPerformanceSnapshot.findMany({
      where: { month, year },
      include: { teacher: { select: { id: true, name: true, subject: true } } },
      orderBy: [{ performanceScore: "desc" }, { teacherId: "asc" }],
      take: limit,
    });

    res.json({ month, year, items });
  } catch (err) {
    console.error("getTopTeachers error:", err);
    res.status(500).json({ message: "Failed to load top teachers" });
  }
};

const getTeacherPerformanceHistory = async (req, res) => {
  try {
    const teacherId = Number(req.params.id);
    const history = await prisma.teacherPerformanceSnapshot.findMany({
      where: { teacherId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    res.json({ history });
  } catch (err) {
    console.error("getTeacherPerformanceHistory error:", err);
    res.status(500).json({ message: "Failed to load teacher performance history" });
  }
};

module.exports = {
  recalculateTeacherPerformance,
  getTeacherPerformance,
  getTopTeachers,
  getTeacherPerformanceHistory,
};
