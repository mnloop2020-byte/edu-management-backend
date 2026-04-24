const prisma = require("../lib/prisma");
const { createAuditLog } = require("../services/audit.service");
const {
  bootstrapAcademicDataFromLegacy,
  createEnrollment,
  createGradingPolicy,
  createSemester,
  createSubject,
  createSubjectOffering,
  getEnrollmentAccessContext,
  getStudentAcademicProfile,
  recalculateEnrollment,
  setAssessmentScore,
} = require("../services/academic.service");

const handleAcademicError = (res, error, fallbackMessage) => {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(fallbackMessage, error);
  }
  res.status(status).json({ message: error.message || fallbackMessage });
};

const normalizeAssessmentCode = (rawCode) => {
  const code = String(rawCode || "").trim().toUpperCase();
  if (code === "MIDTERM") return "MIDTERM";
  if (code === "FINAL" || code === "FINAL_EXAM") return "FINAL_EXAM";
  if (code === "COURSEWORK" || code === "COURSE_WORK") return "COURSEWORK";
  return null;
};

const canEditEnrollment = (user, enrollment) => {
  if (!user || !enrollment) return false;
  if (user.role === "ADMIN") return true;
  if (user.role !== "TEACHER") return false;
  return enrollment.subjectOffering?.teacher?.userId === user.id;
};

const listSubjects = async (_req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    res.json({ subjects });
  } catch (error) {
    handleAcademicError(res, error, "Failed to load subjects");
  }
};

const listSemesters = async (_req, res) => {
  try {
    const semesters = await prisma.semester.findMany({
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
    });

    res.json({ semesters });
  } catch (error) {
    handleAcademicError(res, error, "Failed to load semesters");
  }
};

const listOfferings = async (req, res) => {
  try {
    const where = {};
    if (req.query.semesterId) where.semesterId = Number(req.query.semesterId);
    if (req.query.subjectId) where.subjectId = Number(req.query.subjectId);
    if (req.query.teacherId) where.teacherId = Number(req.query.teacherId);

    const offerings = await prisma.subjectOffering.findMany({
      where,
      include: {
        subject: true,
        semester: true,
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
        gradingPolicy: {
          include: {
            components: {
              orderBy: { sortOrder: "asc" },
            },
            boundaries: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      orderBy: [{ semesterId: "desc" }, { subjectId: "asc" }, { section: "asc" }],
    });

    res.json({ offerings });
  } catch (error) {
    handleAcademicError(res, error, "Failed to load subject offerings");
  }
};

const listClassSubjectMap = async (req, res) => {
  try {
    const where = {};
    if (req.query.semesterId) where.semesterId = Number(req.query.semesterId);
    if (req.query.teacherId) where.teacherId = Number(req.query.teacherId);

    const enrollments = await prisma.studentEnrollment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            course: true,
          },
        },
        subjectOffering: {
          select: {
            id: true,
            section: true,
            subject: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            semester: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ semesterId: "desc" }, { subjectId: "asc" }, { studentId: "asc" }],
    });

    const classMap = new Map();

    for (const enrollment of enrollments) {
      const className = String(enrollment.student?.course || "").trim() || "Unassigned Class";
      if (!classMap.has(className)) {
        classMap.set(className, {
          className,
          subjectsByOfferingId: new Map(),
        });
      }

      const bucket = classMap.get(className);
      const offering = enrollment.subjectOffering;
      if (!offering) continue;

      if (!bucket.subjectsByOfferingId.has(offering.id)) {
        bucket.subjectsByOfferingId.set(offering.id, {
          offeringId: offering.id,
          section: offering.section,
          subject: offering.subject,
          semester: offering.semester,
          teacher: offering.teacher || null,
          students: [],
        });
      }

      const subjectNode = bucket.subjectsByOfferingId.get(offering.id);
      subjectNode.students.push({
        id: enrollment.student.id,
        name: enrollment.student.name,
      });
    }

    const classes = [...classMap.values()]
      .map((bucket) => ({
        className: bucket.className,
        subjects: [...bucket.subjectsByOfferingId.values()].map((subject) => ({
          offeringId: subject.offeringId,
          section: subject.section,
          subject: subject.subject,
          semester: subject.semester,
          teacher: subject.teacher,
          studentsCount: subject.students.length,
          students: subject.students,
        })),
      }))
      .sort((left, right) => left.className.localeCompare(right.className));

    res.json({ classes });
  } catch (error) {
    handleAcademicError(res, error, "Failed to load class-subject map");
  }
};

const createSubjectHandler = async (req, res) => {
  try {
    const subject = await createSubject(req.body);
    res.status(201).json({ message: "Subject created successfully", subject });
  } catch (error) {
    handleAcademicError(res, error, "Failed to create subject");
  }
};

const bootstrapAcademicHandler = async (_req, res) => {
  try {
    const result = await bootstrapAcademicDataFromLegacy();
    res.json({ message: "Academic data bootstrapped successfully", result });
  } catch (error) {
    handleAcademicError(res, error, "Failed to bootstrap academic data");
  }
};

const createSemesterHandler = async (req, res) => {
  try {
    const semester = await createSemester(req.body);
    res.status(201).json({ message: "Semester created successfully", semester });
  } catch (error) {
    handleAcademicError(res, error, "Failed to create semester");
  }
};

const createPolicyHandler = async (req, res) => {
  try {
    const policy = await createGradingPolicy(req.body);
    res.status(201).json({ message: "Grading policy created successfully", policy });
  } catch (error) {
    handleAcademicError(res, error, "Failed to create grading policy");
  }
};

const createOfferingHandler = async (req, res) => {
  try {
    const offering = await createSubjectOffering(req.body);
    res.status(201).json({ message: "Subject offering created successfully", offering });
  } catch (error) {
    handleAcademicError(res, error, "Failed to create subject offering");
  }
};

const createEnrollmentHandler = async (req, res) => {
  try {
    const enrollment = await createEnrollment({
      ...req.body,
      actorId: req.user?.id,
    });
    await createAuditLog({
      actorUserId: req.user?.id,
      action: "ENROLLMENT_CREATE",
      entityType: "StudentEnrollment",
      entityId: enrollment.id,
      summary: `Assigned subject ${enrollment.subject?.name || ""} to student enrollment ${enrollment.id}`.trim(),
    });
    res.status(201).json({ message: "Student enrolled successfully", enrollment });
  } catch (error) {
    handleAcademicError(res, error, "Failed to enroll student");
  }
};

const updateAssessmentHandler = async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);
    const code = normalizeAssessmentCode(req.params.code);

    if (!code) {
      return res.status(400).json({ message: "Unsupported assessment code" });
    }

    const accessContext = await getEnrollmentAccessContext(enrollmentId);
    if (!accessContext) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    if (!canEditEnrollment(req.user, accessContext)) {
      return res.status(403).json({ message: "You do not have permission to update this grade" });
    }

    const enrollment = await setAssessmentScore({
      enrollmentId,
      code,
      rawScore: req.body.rawScore,
      actorId: req.user.id,
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "ASSESSMENT_UPDATE",
      entityType: "StudentEnrollment",
      entityId: enrollment.id,
      summary: `Updated ${code} score for enrollment ${enrollment.id}`,
      metadata: { code, rawScore: req.body.rawScore },
    });

    res.json({ message: "Assessment updated successfully", enrollment });
  } catch (error) {
    handleAcademicError(res, error, "Failed to update assessment");
  }
};

const recalculateEnrollmentHandler = async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);
    const accessContext = await getEnrollmentAccessContext(enrollmentId);

    if (!accessContext) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    if (!canEditEnrollment(req.user, accessContext)) {
      return res.status(403).json({ message: "You do not have permission to recalculate this grade" });
    }

    const enrollment = await recalculateEnrollment(enrollmentId);
    res.json({ message: "Enrollment recalculated successfully", enrollment });
  } catch (error) {
    handleAcademicError(res, error, "Failed to recalculate enrollment");
  }
};

const getStudentAcademicProfileHandler = async (req, res) => {
  try {
    const studentId = Number(req.params.id);

    if (req.user.role === "STUDENT") {
      const ownStudent = await prisma.student.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
      });
      if (!ownStudent) {
        return res.status(404).json({ message: "Student profile not found" });
      }
      if (ownStudent.id !== studentId) {
        return res.status(403).json({ message: "You can only access your own academic profile" });
      }
    }

    const profile = await getStudentAcademicProfile(studentId, {
      semesterId: req.query.semesterId ? Number(req.query.semesterId) : undefined,
    });

    res.json(profile);
  } catch (error) {
    handleAcademicError(res, error, "Failed to load academic profile");
  }
};

const getStudentGpaSummaryHandler = async (req, res) => {
  try {
    const studentId = Number(req.params.id);

    if (req.user.role === "STUDENT") {
      const ownStudent = await prisma.student.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
      });
      if (!ownStudent) {
        return res.status(404).json({ message: "Student profile not found" });
      }
      if (ownStudent.id !== studentId) {
        return res.status(403).json({ message: "You can only access your own GPA summary" });
      }
    }

    const profile = await getStudentAcademicProfile(studentId, {
      semesterId: req.query.semesterId ? Number(req.query.semesterId) : undefined,
    });

    res.json(profile.summary);
  } catch (error) {
    handleAcademicError(res, error, "Failed to load GPA summary");
  }
};

module.exports = {
  bootstrapAcademicHandler,
  createEnrollmentHandler,
  createOfferingHandler,
  createPolicyHandler,
  createSemesterHandler,
  createSubjectHandler,
  getStudentAcademicProfileHandler,
  getStudentGpaSummaryHandler,
  listClassSubjectMap,
  listOfferings,
  listSemesters,
  listSubjects,
  recalculateEnrollmentHandler,
  updateAssessmentHandler,
};
