const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const {
  getAcademicOverviewMap,
  getStudentAcademicProfile,
} = require("../services/academic.service");
const { createAuditLog } = require("../services/audit.service");
const { canonicalizeAcademicLabel } = require("../utils/academicNormalization");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const isEnvEnabled = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

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
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true,
          },
        },
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
          account: student.user
            ? {
                id: student.user.id,
                email: student.user.email,
                createdAt: student.user.createdAt,
              }
            : null,
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
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true,
            role: true,
          },
        },
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
        account: student.user
          ? {
              id: student.user.id,
              email: student.user.email,
              role: student.user.role,
              createdAt: student.user.createdAt,
            }
          : null,
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

const getMyStudentProfile = async (req, res) => {
  try {
    let student = await prisma.student.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    const allowUnsafeNameAutoLink = isEnvEnabled(process.env.ALLOW_UNSAFE_NAME_AUTOLINK);

    if (!student && allowUnsafeNameAutoLink) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true },
      });

      const normalizedName = String(user?.name || "").trim();
      if (normalizedName) {
        const matches = await prisma.student.findMany({
          where: {
            userId: null,
            name: { equals: normalizedName, mode: "insensitive" },
          },
          select: { id: true },
          take: 2,
        });

        if (matches.length === 1) {
          await prisma.student.update({
            where: { id: matches[0].id },
            data: { userId: req.user.id },
          });

          await createAuditLog({
            actorUserId: req.user?.id,
            action: "STUDENT_ACCOUNT_AUTO_LINK",
            entityType: "Student",
            entityId: matches[0].id,
            summary: "Auto-linked student account to student profile",
            metadata: { reason: "matched_by_name_case_insensitive" },
          });

          student = { id: matches[0].id };
        } else if (matches.length > 1) {
          return res.status(409).json({
            message: "Multiple student profiles match this account name. Please link the account from admin panel.",
          });
        }
      }
    }

    if (!student) {
      return res.status(404).json({
        message: "Student profile not linked to this account yet. Please ask admin to link your account from Students page.",
      });
    }

    req.params.id = String(student.id);
    return getStudentById(req, res);
  } catch (err) {
    console.error("getMyStudentProfile error:", err);
    res.status(500).json({ message: "Failed to load student profile" });
  }
};

const createStudent = async (req, res) => {
  try {
    const { name, course, grade, status } = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedCourse = canonicalizeAcademicLabel(course);

    if (!normalizedName || !normalizedCourse) {
      return res.status(400).json({ message: "name and course are required" });
    }

    const student = await prisma.student.create({
      data: { name: normalizedName, course: normalizedCourse, grade: grade || null, status: status || "Active" },
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

const createStudentAccount = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { email, password, name } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");
    const normalizedName = String(name || "").trim();

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ message: "email and password are required" });
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (normalizedPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (student.userId || student.user) {
      return res.status(409).json({ message: "Student already has a linked account" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Email is already in use" });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const user = await prisma.user.create({
      data: {
        name: normalizedName || student.name,
        email: normalizedEmail,
        password: hashedPassword,
        role: "STUDENT",
        student: {
          connect: { id: student.id },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "STUDENT_ACCOUNT_CREATE",
      entityType: "Student",
      entityId: student.id,
      summary: `Created login account for ${student.name}`,
      metadata: { email: user.email, userId: user.id },
    });

    res.status(201).json({
      message: "Student account created successfully",
      user,
      studentId: student.id,
    });
  } catch (err) {
    console.error("createStudentAccount error:", err);
    res.status(500).json({ message: "Failed to create student account" });
  }
};

const updateStudentAccount = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { email, password, name } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (!student.userId || !student.user) {
      return res.status(404).json({ message: "Student does not have a linked account" });
    }

    const updateData = {};

    if (email !== undefined) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "email cannot be empty" });
      }
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      if (normalizedEmail !== student.user.email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email: normalizedEmail,
            NOT: { id: student.user.id },
          },
          select: { id: true },
        });
        if (existingUser) {
          return res.status(409).json({ message: "Email is already in use" });
        }
        updateData.email = normalizedEmail;
      }
    }

    if (name !== undefined) {
      const normalizedName = String(name || "").trim();
      if (!normalizedName) {
        return res.status(400).json({ message: "name cannot be empty" });
      }
      updateData.name = normalizedName;
    }

    if (password !== undefined) {
      const normalizedPassword = String(password || "");
      if (normalizedPassword.length > 0 && normalizedPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      if (normalizedPassword.length > 0) {
        updateData.password = await bcrypt.hash(normalizedPassword, 10);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No account changes provided" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: student.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "STUDENT_ACCOUNT_UPDATE",
      entityType: "Student",
      entityId: student.id,
      summary: `Updated login account for ${student.name}`,
      metadata: {
        userId: updatedUser.id,
        emailChanged: Boolean(updateData.email),
        nameChanged: Boolean(updateData.name),
        passwordChanged: Boolean(updateData.password),
      },
    });

    res.json({
      message: "Student account updated successfully",
      user: updatedUser,
      studentId: student.id,
    });
  } catch (err) {
    console.error("updateStudentAccount error:", err);
    res.status(500).json({ message: "Failed to update student account" });
  }
};

const updateStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { name, course, grade, status } = req.body;
    const normalizedName = name !== undefined ? String(name || "").trim() : undefined;
    const normalizedCourse = course !== undefined ? canonicalizeAcademicLabel(course) : undefined;

    const existing = await prisma.student.findUnique({ where: { id: studentId } });
    if (!existing) {
      return res.status(404).json({ message: "Student not found" });
    }

    const data = {};
    if (name !== undefined && !normalizedName) {
      return res.status(400).json({ message: "name cannot be empty" });
    }
    if (course !== undefined && !normalizedCourse) {
      return res.status(400).json({ message: "course cannot be empty" });
    }

    if (normalizedName !== undefined) data.name = normalizedName;
    if (normalizedCourse !== undefined) data.course = normalizedCourse;
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

module.exports = {
  getAllStudents,
  getStudentById,
  getMyStudentProfile,
  createStudent,
  createStudentAccount,
  updateStudentAccount,
  updateStudent,
  deleteStudent,
};
