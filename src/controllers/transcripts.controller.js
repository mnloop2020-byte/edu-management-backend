const prisma = require("../lib/prisma");
const { getStudentAcademicProfile } = require("../services/academic.service");

const getStudentTranscript = async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        attendance: {
          orderBy: { date: "desc" },
        },
        payments: {
          orderBy: { date: "desc" },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const academic = await getStudentAcademicProfile(studentId, { ensureLegacySync: true });
    const presentCount = student.attendance.filter((item) => item.status === "present").length;
    const attendanceRate = student.attendance.length > 0
      ? Math.round((presentCount / student.attendance.length) * 10000) / 100
      : 0;
    const paidAmount = student.payments.reduce((sum, payment) => sum + payment.paidAmount, 0);
    const outstanding = student.payments.reduce((sum, payment) => sum + Math.max(0, payment.totalAmount - payment.paidAmount), 0);

    res.json({
      student: {
        id: student.id,
        name: student.name,
        course: student.course,
        status: student.status,
        joinedAt: student.joinedAt,
      },
      summary: {
        ...academic.summary,
        attendanceRate,
        paidAmount,
        outstanding,
      },
      subjects: academic.subjects,
    });
  } catch (error) {
    console.error("getStudentTranscript error:", error);
    res.status(500).json({ message: "Failed to load transcript" });
  }
};

module.exports = {
  getStudentTranscript,
};
