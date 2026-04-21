const prisma = require("../lib/prisma");
const {
  getAcademicOverviewMap,
  getStudentAcademicProfile,
} = require("../services/academic.service");
const { createAuditLog } = require("../services/audit.service");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toLetterGrade = (percentage) => {
  if (percentage >= 97) return "A+";
  if (percentage >= 93) return "A";
  if (percentage >= 90) return "A-";
  if (percentage >= 87) return "B+";
  if (percentage >= 83) return "B";
  if (percentage >= 80) return "B-";
  if (percentage >= 77) return "C+";
  if (percentage >= 73) return "C";
  if (percentage >= 70) return "C-";
  if (percentage >= 67) return "D+";
  if (percentage >= 63) return "D";
  if (percentage >= 60) return "D-";
  return "F";
};

const toStatus = (percentage) => {
  if (percentage >= 85) return "Excellent";
  if (percentage >= 70) return "On Track";
  if (percentage >= 60) return "Needs Support";
  return "Critical";
};

const buildAcademicMetrics = (submissions = []) => {
  const graded = submissions.filter(
    (item) => item.score !== null && item.assignment?.maxScore
  );

  if (graded.length === 0) {
    return {
      gradedAssignments: 0,
      averageScore: null,
      averagePercentage: null,
      gpa: null,
      letterGrade: "N/A",
      status: "No Academic Data",
    };
  }

  const averagePercentage =
    graded.reduce((sum, item) => {
      const ratio = Number(item.score) / Number(item.assignment.maxScore || 1);
      return sum + clamp(ratio, 0, 1);
    }, 0) / graded.length;

  const percentage = Math.round(averagePercentage * 10000) / 100;
  const gpa = Math.round(clamp(averagePercentage * 4, 0, 4) * 100) / 100;

  return {
    gradedAssignments: graded.length,
    averageScore:
      Math.round(
        (graded.reduce((sum, item) => sum + Number(item.score || 0), 0) / graded.length) * 100
      ) / 100,
    averagePercentage: percentage,
    gpa,
    letterGrade: toLetterGrade(percentage),
    status: toStatus(percentage),
  };
};

const buildSubjectSnapshots = (student) => {
  const subjectMap = new Map();

  for (const enrollment of student.classes || []) {
    const academicClass = enrollment.class;
    if (!academicClass) continue;

    subjectMap.set(academicClass.id, {
      id: academicClass.id,
        name: academicClass.name,
        code: academicClass.code,
        credits: academicClass.credits || 3,
        teacher: academicClass.teacher?.name || null,
        submissions: [],
      });
  }

  for (const submission of student.submissions || []) {
    const academicClass = submission.assignment?.class;
    if (!academicClass) continue;

    const current = subjectMap.get(academicClass.id) || {
      id: academicClass.id,
      name: academicClass.name,
      code: academicClass.code,
      credits: academicClass.credits || 3,
      teacher: academicClass.teacher?.name || null,
      submissions: [],
    };

    current.submissions.push(submission);
    subjectMap.set(academicClass.id, current);
  }

  return [...subjectMap.values()]
    .map((subject) => {
      const metrics = buildAcademicMetrics(subject.submissions);

      return {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        credits: subject.credits,
        teacher: subject.teacher,
        assignments: subject.submissions.length,
        gradedAssignments: metrics.gradedAssignments,
        score: metrics.averagePercentage,
        gpa: metrics.gpa,
        grade: metrics.letterGrade,
        status: subject.submissions.length === 0 ? "In Progress" : metrics.status,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

const buildAttendanceIndicator = (records) => {
  const totalClasses = records.length;
  const presentCount = records.filter((item) => item.status === "present").length;
  const absentCount = records.filter((item) => item.status === "absent").length;
  const attendanceRate = totalClasses > 0 ? (presentCount / totalClasses) * 100 : 0;

  let indicator = "SAFE";
  if (absentCount >= 3 && absentCount <= 4) indicator = "WARNING";
  else if (absentCount > 4) indicator = "RISK";

  return {
    totalClasses,
    presentCount,
    absentCount,
    attendanceRate: Math.round(attendanceRate * 100) / 100,
    indicator,
  };
};

const getAllStudents = async (req, res) => {
  try {
    const today = new Date();
    const semesterStart = today.getMonth() < 6
      ? new Date(today.getFullYear(), 0, 1)
      : new Date(today.getFullYear(), 6, 1);

    const students = await prisma.student.findMany({
      include: {
        attendance: {
          where: { date: { gte: semesterStart } },
          select: { status: true },
        },
        classes: {
          select: { id: true },
        },
        submissions: {
          where: { score: { not: null } },
          select: {
            score: true,
            assignment: {
              select: {
                maxScore: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const academicOverviewMap = await getAcademicOverviewMap(students.map((student) => student.id));

    res.json({
      students: students.map((student) => {
        const stats = buildAttendanceIndicator(student.attendance);
        const academicOverview = academicOverviewMap.get(student.id);
        const academic = academicOverview?.hasAcademicData
          ? academicOverview.summary
          : buildAcademicMetrics(student.submissions);

        return {
          id: student.id,
          name: student.name,
          course: student.course,
          grade: academicOverview?.hasAcademicData ? academic.letterGrade : student.grade,
          status: student.status,
          joinedAt: student.joinedAt,
          subjectsCount: academicOverview?.hasAcademicData ? academic.totalSubjects : student.classes.length,
          gpa: academic.gpa ?? null,
          attendanceRate: stats.attendanceRate,
          absentCount: stats.absentCount,
          indicator: stats.indicator,
        };
      }),
    });
  } catch (err) {
    console.error("getAllStudents error:", err);
    res.status(500).json({ message: "Failed to load students" });
  }
};

const getStudentById = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        attendance: { orderBy: { date: "desc" } },
        payments: {
          include: { transactions: { orderBy: { date: "desc" } }, installments: true },
          orderBy: { date: "desc" },
        },
        classes: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                code: true,
                credits: true,
                teacher: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        submissions: {
          include: {
            assignment: {
              select: {
                id: true,
                title: true,
                dueAt: true,
                maxScore: true,
                class: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    credits: true,
                    teacher: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { id: "desc" },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const academicProfile = await getStudentAcademicProfile(studentId);
    const hasAcademicData = academicProfile.hasAcademicData;
    const academic = hasAcademicData ? academicProfile.summary : buildAcademicMetrics(student.submissions);
    const subjects = hasAcademicData ? academicProfile.subjects : buildSubjectSnapshots(student);
    const totalCredits = hasAcademicData
      ? academic.totalRegisteredCredits
      : subjects.reduce((sum, subject) => sum + subject.credits, 0);

    res.json({
      student: {
        ...student,
        subjects,
        academicSummary: {
          gpa: academic.gpa ?? null,
          averageScore: academic.averageScore ?? null,
          averagePercentage: academic.averagePercentage ?? null,
          gradedAssignments: academic.gradedAssignments ?? 0,
          totalSubjects: academic.totalSubjects ?? subjects.length,
          totalCredits,
          totalRegisteredCredits: academic.totalRegisteredCredits ?? totalCredits,
          totalEarnedCredits: academic.totalEarnedCredits ?? 0,
          passedSubjects: academic.passedSubjects ?? 0,
          failedSubjects: academic.failedSubjects ?? 0,
          incompleteSubjects: academic.incompleteSubjects ?? 0,
          letterGrade: academic.letterGrade || "N/A",
          status: academic.status || "In Progress",
        },
      },
    });
  } catch (err) {
    console.error("getStudentById error:", err);
    res.status(500).json({ message: "Failed to load student" });
  }
};

const createStudent = async (req, res) => {
  try {
    const { name, course, grade, status } = req.body;

    if (!name || !course) {
      return res.status(400).json({ message: "name and course are required" });
    }

    const student = await prisma.student.create({
      data: { name, course, grade: grade || null, status: status || "Active" },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "STUDENT_CREATE",
      entityType: "Student",
      entityId: student.id,
      summary: `Created student ${student.name}`,
      metadata: { course: student.course, status: student.status },
    });

    res.status(201).json({ message: "Student created successfully", student });
  } catch (err) {
    console.error("createStudent error:", err);
    res.status(500).json({ message: "Failed to create student" });
  }
};

const updateStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { name, course, grade, status } = req.body;

    const existing = await prisma.student.findUnique({ where: { id: studentId } });
    if (!existing) {
      return res.status(404).json({ message: "Student not found" });
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (course !== undefined) data.course = course;
    if (grade !== undefined) data.grade = grade;
    if (status !== undefined) data.status = status;

    const student = await prisma.student.update({
      where: { id: studentId },
      data,
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "STUDENT_UPDATE",
      entityType: "Student",
      entityId: student.id,
      summary: `Updated student ${student.name}`,
      metadata: data,
    });

    res.json({ message: "Student updated successfully", student });
  } catch (err) {
    console.error("updateStudent error:", err);
    res.status(500).json({ message: "Failed to update student" });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const existing = await prisma.student.findUnique({ where: { id: studentId } });

    if (!existing) {
      return res.status(404).json({ message: "Student not found" });
    }

    await prisma.$transaction(async (tx) => {
      const payments = await tx.payment.findMany({
        where: { studentId },
        select: { id: true },
      });

      if (payments.length > 0) {
        await tx.paymentTransaction.deleteMany({
          where: { paymentId: { in: payments.map((payment) => payment.id) } },
        });
      }

      await tx.attendance.deleteMany({ where: { studentId } });
      await tx.payment.deleteMany({ where: { studentId } });
      await tx.student.delete({ where: { id: studentId } });
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "STUDENT_DELETE",
      entityType: "Student",
      entityId: studentId,
      summary: `Deleted student ${existing.name}`,
    });

    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    console.error("deleteStudent error:", err);
    res.status(500).json({ message: "Failed to delete student" });
  }
};

module.exports = { getAllStudents, getStudentById, createStudent, updateStudent, deleteStudent };
