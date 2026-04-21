const prisma = require("../lib/prisma");
const { setAssessmentScore } = require("../services/academic.service");
const { createAuditLog } = require("../services/audit.service");

const normalizeAssessmentMap = (assessments = []) => {
  const mapped = {};
  for (const assessment of assessments) {
    mapped[assessment.component.code] = assessment.rawScore === null || assessment.rawScore === undefined
      ? null
      : Number(assessment.rawScore);
  }
  return mapped;
};

const canAccessOffering = (user, offering) => {
  if (!user || !offering) return false;
  if (user.role === "ADMIN") return true;
  if (user.role !== "TEACHER") return false;
  return offering.teacher?.userId === user.id;
};

const buildGradebookRow = (enrollment) => {
  const scores = normalizeAssessmentMap(enrollment.assessments);
  return {
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    studentName: enrollment.student.name,
    studentStatus: enrollment.student.status,
    midterm: scores.MIDTERM,
    finalExam: scores.FINAL_EXAM,
    coursework: scores.COURSEWORK,
    totalScore: enrollment.totalScore === null || enrollment.totalScore === undefined ? null : Number(enrollment.totalScore),
    finalLetterGrade: enrollment.finalLetterGrade || "N/A",
    passStatus: enrollment.passStatus,
    calculationStatus: enrollment.calculationStatus,
  };
};

const listGradebookOfferings = async (req, res) => {
  try {
    const where = {};
    if (req.user.role === "TEACHER") {
      where.teacher = { userId: req.user.id };
    }

    const offerings = await prisma.subjectOffering.findMany({
      where,
      include: {
        subject: true,
        semester: true,
        teacher: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
      orderBy: [{ semesterId: "desc" }, { subjectId: "asc" }, { section: "asc" }],
    });

    res.json({
      offerings: offerings.map((offering) => ({
        id: offering.id,
        section: offering.section,
        subject: offering.subject,
        semester: offering.semester,
        teacher: offering.teacher,
        studentsCount: offering._count.enrollments,
      })),
    });
  } catch (error) {
    console.error("listGradebookOfferings error:", error);
    res.status(500).json({ message: "Failed to load gradebook offerings" });
  }
};

const getOfferingGradebook = async (req, res) => {
  try {
    const offeringId = Number(req.params.id);
    const offering = await prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: {
        subject: true,
        semester: true,
        teacher: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        gradingPolicy: {
          include: {
            components: { orderBy: { sortOrder: "asc" } },
            boundaries: { orderBy: { sortOrder: "asc" } },
          },
        },
        enrollments: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
            assessments: {
              include: {
                component: true,
              },
            },
          },
          orderBy: {
            student: {
              name: "asc",
            },
          },
        },
      },
    });

    if (!offering) {
      return res.status(404).json({ message: "Offering not found" });
    }

    if (!canAccessOffering(req.user, offering)) {
      return res.status(403).json({ message: "You do not have permission to access this gradebook" });
    }

    res.json({
      offering: {
        id: offering.id,
        section: offering.section,
        subject: offering.subject,
        semester: offering.semester,
        teacher: offering.teacher,
        gradingPolicy: offering.gradingPolicy,
      },
      rows: offering.enrollments.map(buildGradebookRow),
    });
  } catch (error) {
    console.error("getOfferingGradebook error:", error);
    res.status(500).json({ message: "Failed to load gradebook" });
  }
};

const bulkUpdateGradebook = async (req, res) => {
  try {
    const offeringId = Number(req.params.id);
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    const offering = await prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: {
        subject: true,
        teacher: {
          select: {
            id: true,
            userId: true,
            name: true,
          },
        },
      },
    });

    if (!offering) {
      return res.status(404).json({ message: "Offering not found" });
    }

    if (!canAccessOffering(req.user, offering)) {
      return res.status(403).json({ message: "You do not have permission to update this gradebook" });
    }

    const enrollmentIds = entries
      .map((entry) => Number(entry.enrollmentId))
      .filter(Boolean);

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        subjectOfferingId: offeringId,
        id: {
          in: enrollmentIds,
        },
      },
      select: {
        id: true,
        studentId: true,
      },
    });

    const allowedEnrollmentIds = new Set(enrollments.map((item) => item.id));

    for (const entry of entries) {
      const enrollmentId = Number(entry.enrollmentId);
      if (!allowedEnrollmentIds.has(enrollmentId)) continue;

      await setAssessmentScore({
        enrollmentId,
        code: "MIDTERM",
        rawScore: entry.midterm,
        actorId: req.user.id,
      });
      await setAssessmentScore({
        enrollmentId,
        code: "FINAL_EXAM",
        rawScore: entry.finalExam,
        actorId: req.user.id,
      });
      await setAssessmentScore({
        enrollmentId,
        code: "COURSEWORK",
        rawScore: entry.coursework,
        actorId: req.user.id,
      });
    }

    await createAuditLog({
      actorUserId: req.user.id,
      action: "GRADEBOOK_BULK_UPDATE",
      entityType: "SubjectOffering",
      entityId: offeringId,
      summary: `Bulk updated gradebook for ${offering.subject.name} ${offering.section}`,
      metadata: { entries: entries.length },
    });

    res.json({ message: "Gradebook updated successfully" });
  } catch (error) {
    console.error("bulkUpdateGradebook error:", error);
    res.status(500).json({ message: "Failed to update gradebook" });
  }
};

module.exports = {
  bulkUpdateGradebook,
  getOfferingGradebook,
  listGradebookOfferings,
};
