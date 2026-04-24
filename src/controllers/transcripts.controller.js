const prisma = require("../lib/prisma");
const { getStudentAcademicProfile } = require("../services/academic.service");

const buildTranscriptResponse = async (studentId) => {
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
    return null;
  }

  const academic = await getStudentAcademicProfile(studentId, { ensureLegacySync: true });
  const presentCount = student.attendance.filter((item) => item.status === "present").length;
  const attendanceRate = student.attendance.length > 0
    ? Math.round((presentCount / student.attendance.length) * 10000) / 100
    : 0;
  const paidAmount = student.payments.reduce((sum, payment) => sum + payment.paidAmount, 0);
  const outstanding = student.payments.reduce((sum, payment) => sum + Math.max(0, payment.totalAmount - payment.paidAmount), 0);

  return {
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
  };
};

const listTranscriptStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      select: {
        id: true,
        name: true,
        course: true,
        status: true,
        joinedAt: true,
        _count: {
          select: {
            academicEnrollments: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    res.json({
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        course: student.course,
        studentNumber: String(student.id).padStart(4, "0"),
        status: student.status,
        joinedAt: student.joinedAt,
        subjectsCount: student._count.academicEnrollments,
      })),
    });
  } catch (error) {
    console.error("listTranscriptStudents error:", error);
    res.status(500).json({ message: "Failed to load transcript students" });
  }
};

const getStudentTranscript = async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const transcript = await buildTranscriptResponse(studentId);

    if (!transcript) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(transcript);
  } catch (error) {
    console.error("getStudentTranscript error:", error);
    res.status(500).json({ message: "Failed to load transcript" });
  }
};

const getMyTranscript = async (req, res) => {
  try {
    const ownStudent = await prisma.student.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!ownStudent) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    const transcript = await buildTranscriptResponse(ownStudent.id);
    if (!transcript) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(transcript);
  } catch (error) {
    console.error("getMyTranscript error:", error);
    res.status(500).json({ message: "Failed to load transcript" });
  }
};

module.exports = {
  listTranscriptStudents,
  getStudentTranscript,
  getMyTranscript,
};
