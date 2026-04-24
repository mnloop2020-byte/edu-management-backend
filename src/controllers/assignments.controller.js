const prisma = require("../lib/prisma");

const assignmentInclude = {
  teacher: { select: { id: true, name: true, subject: true } },
  class: { select: { id: true, name: true, code: true } },
};

const submissionInclude = {
  student: { select: { id: true, name: true, course: true } },
  assignment: {
    select: {
      id: true,
      title: true,
      dueAt: true,
      maxScore: true,
      teacher: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, code: true } },
    },
  },
};

const parseDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseOptionalUrl = (value) => {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = new URL(String(value));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const buildOfferingClassCode = (offeringId) => `OFF-${offeringId}`;

const buildOfferingClassName = (offering) => {
  const subjectName = offering.subject?.name || "Subject";
  const semesterName = offering.semester?.name || "Semester";
  const section = offering.section || "A";
  return `${subjectName} - ${semesterName} (${section})`;
};

const ensureClassForOffering = async (tx, offering) => {
  const code = buildOfferingClassCode(offering.id);
  const name = buildOfferingClassName(offering);
  const studentIds = [...new Set((offering.enrollments || []).map((item) => item.studentId))];

  const existing = await tx.academicClass.findUnique({
    where: { code },
    include: { students: { select: { id: true, studentId: true } } },
  });

  if (!existing) {
    return tx.academicClass.create({
      data: {
        name,
        code,
        credits: offering.subject?.creditHours || 3,
        teacherId: offering.teacherId || null,
        students: studentIds.length > 0
          ? { create: studentIds.map((studentId) => ({ studentId })) }
          : undefined,
      },
    });
  }

  const existingStudentIds = new Set(existing.students.map((item) => item.studentId));
  const missingStudentIds = studentIds.filter((studentId) => !existingStudentIds.has(studentId));
  const staleLinks = existing.students.filter((item) => !studentIds.includes(item.studentId));

  await tx.academicClass.update({
    where: { id: existing.id },
    data: {
      name,
      credits: offering.subject?.creditHours || existing.credits,
      teacherId: offering.teacherId || null,
    },
  });

  if (missingStudentIds.length > 0) {
    await tx.studentClass.createMany({
      data: missingStudentIds.map((studentId) => ({ studentId, classId: existing.id })),
      skipDuplicates: true,
    });
  }

  if (staleLinks.length > 0) {
    await tx.studentClass.deleteMany({
      where: { id: { in: staleLinks.map((item) => item.id) } },
    });
  }

  return { ...existing, name, teacherId: offering.teacherId || null };
};

const normalizeSubmissionStatus = (submission, dueAt) => {
  if (submission.score !== null && submission.score !== undefined) return "graded";
  if (!submission.submittedAt) return "pending";
  return new Date(submission.submittedAt) > new Date(dueAt) ? "late" : "submitted";
};

const getTeacherProfileId = async (userId) => {
  const teacher = await prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
  return teacher?.id || null;
};

const getStudentProfileId = async (userId) => {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  return student?.id || null;
};

const createAssignment = async (req, res) => {
  try {
    const { title, description, classId, subjectOfferingId, teacherId, dueAt, maxScore, attachmentUrl } = req.body;
    const resolvedOfferingId = subjectOfferingId ? Number(subjectOfferingId) : null;
    const resolvedClassId = classId ? Number(classId) : null;

    if (!title || (!resolvedClassId && !resolvedOfferingId) || !dueAt) {
      return res.status(400).json({ message: "title, subjectOfferingId or classId, and dueAt are required" });
    }

    const parsedDueAt = parseDate(dueAt);
    if (!parsedDueAt) {
      return res.status(400).json({ message: "Invalid due date" });
    }

    const normalizedAttachmentUrl = parseOptionalUrl(attachmentUrl);
    if (attachmentUrl && !normalizedAttachmentUrl) {
      return res.status(400).json({ message: "attachmentUrl must be a valid http/https URL" });
    }

    let academicClass = null;
    let resolvedTeacherId = null;
    let calendarClassId = resolvedClassId;

    if (resolvedOfferingId) {
      const offering = await prisma.subjectOffering.findUnique({
        where: { id: resolvedOfferingId },
        include: {
          subject: { select: { name: true, code: true, creditHours: true } },
          semester: { select: { name: true, code: true } },
          enrollments: { select: { studentId: true } },
        },
      });

      if (!offering) {
        return res.status(404).json({ message: "Subject offering not found" });
      }

      resolvedTeacherId = req.user.role === "TEACHER"
        ? await getTeacherProfileId(req.user.id)
        : teacherId ? Number(teacherId) : offering.teacherId || null;

      if (!resolvedTeacherId) {
        return res.status(400).json({ message: "The selected subject must be linked to a teacher first" });
      }

      if (req.user.role === "TEACHER" && offering.teacherId !== resolvedTeacherId) {
        return res.status(403).json({ message: "You can only create assignments for your own subject offerings" });
      }

      academicClass = await prisma.$transaction((tx) => ensureClassForOffering(tx, offering));
      calendarClassId = academicClass.id;
    } else {
      resolvedTeacherId = req.user.role === "TEACHER"
        ? await getTeacherProfileId(req.user.id)
        : teacherId ? Number(teacherId) : null;

      if (!resolvedTeacherId) {
        return res.status(400).json({ message: "teacherId is required" });
      }

      academicClass = await prisma.academicClass.findUnique({
        where: { id: resolvedClassId },
        include: { students: { select: { studentId: true } } },
      });

      if (!academicClass) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (req.user.role === "TEACHER" && academicClass.teacherId !== resolvedTeacherId) {
        return res.status(403).json({ message: "You can only create assignments for your own classes" });
      }
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          title,
          description: description || null,
          classId: academicClass.id,
          teacherId: resolvedTeacherId,
          dueAt: parsedDueAt,
          maxScore: Number.isFinite(Number(maxScore)) ? Number(maxScore) : 100,
          attachmentUrl: normalizedAttachmentUrl,
          submissions: academicClass.students.length > 0
            ? { create: academicClass.students.map((item) => ({ studentId: item.studentId })) }
            : undefined,
        },
        include: assignmentInclude,
      });

      await tx.calendarEvent.create({
        data: {
          title,
          description: description || "Assignment deadline",
          type: "ASSIGNMENT_DEADLINE",
          startAt: parsedDueAt,
          relatedTeacherId: resolvedTeacherId,
          relatedClassId: calendarClassId,
        },
      });

      return created;
    });

    res.status(201).json({ message: "Assignment created successfully", assignment });
  } catch (err) {
    console.error("createAssignment error:", err);
    res.status(500).json({ message: "Failed to create assignment" });
  }
};

const getAssignments = async (req, res) => {
  try {
    const where = {};
    if (req.query.classId) where.classId = Number(req.query.classId);
    if (req.query.teacherId) where.teacherId = Number(req.query.teacherId);
    if (req.query.status) where.status = String(req.query.status);

    if (req.user.role === "TEACHER") {
      const teacherId = await getTeacherProfileId(req.user.id);
      if (!teacherId) return res.json({ assignments: [] });
      where.teacherId = teacherId;
    }

    const assignments = await prisma.assignment.findMany({
      where,
      include: assignmentInclude,
      orderBy: { dueAt: "asc" },
    });

    res.json({ assignments });
  } catch (err) {
    console.error("getAssignments error:", err);
    res.status(500).json({ message: "Failed to load assignments" });
  }
};

const getAssignmentSubmissions = async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        ...assignmentInclude,
        submissions: { include: { student: { select: { id: true, name: true, course: true } } }, orderBy: { studentId: "asc" } },
      },
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (req.user.role === "TEACHER") {
      const teacherId = await getTeacherProfileId(req.user.id);
      if (!teacherId || assignment.teacherId !== teacherId) {
        return res.status(403).json({ message: "You can only view submissions for your own assignments" });
      }
    }

    const submissions = assignment.submissions.map((item) => ({
      ...item,
      status: normalizeSubmissionStatus(item, assignment.dueAt),
    }));

    res.json({ assignment: { ...assignment, submissions } });
  } catch (err) {
    console.error("getAssignmentSubmissions error:", err);
    res.status(500).json({ message: "Failed to load assignment submissions" });
  }
};

const getMyAssignments = async (req, res) => {
  try {
    const studentId = await getStudentProfileId(req.user.id);
    if (!studentId) return res.json({ assignments: [] });

    const submissions = await prisma.assignmentSubmission.findMany({
      where: { studentId },
      include: submissionInclude,
      orderBy: { assignment: { dueAt: "asc" } },
    });

    const assignments = submissions.map((submission) => ({
      ...submission.assignment,
      submission: {
        id: submission.id,
        submittedAt: submission.submittedAt,
        fileUrl: submission.fileUrl,
        note: submission.note,
        score: submission.score,
        feedback: submission.feedback,
        status: normalizeSubmissionStatus(submission, submission.assignment.dueAt),
      },
    }));

    res.json({ assignments });
  } catch (err) {
    console.error("getMyAssignments error:", err);
    res.status(500).json({ message: "Failed to load assignments" });
  }
};

const submitAssignment = async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    const studentId = req.user.role === "STUDENT"
      ? await getStudentProfileId(req.user.id)
      : req.body.studentId ? Number(req.body.studentId) : null;

    if (!studentId) {
      return res.status(400).json({ message: "Student profile is required" });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, dueAt: true },
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const submittedAt = new Date();
    const status = submittedAt > new Date(assignment.dueAt) ? "late" : "submitted";
    const normalizedFileUrl = parseOptionalUrl(req.body.fileUrl);
    if (req.body.fileUrl && !normalizedFileUrl) {
      return res.status(400).json({ message: "fileUrl must be a valid http/https URL" });
    }

    const submission = await prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      update: {
        submittedAt,
        fileUrl: normalizedFileUrl,
        note: req.body.note || null,
        status,
      },
      create: {
        assignmentId,
        studentId,
        submittedAt,
        fileUrl: normalizedFileUrl,
        note: req.body.note || null,
        status,
      },
      include: submissionInclude,
    });

    res.json({ message: "Assignment submitted successfully", submission });
  } catch (err) {
    console.error("submitAssignment error:", err);
    res.status(500).json({ message: "Failed to submit assignment" });
  }
};

const gradeSubmission = async (req, res) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const { score, feedback } = req.body;

    const existing = await prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: { select: { id: true, teacherId: true, maxScore: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (req.user.role === "TEACHER") {
      const teacherId = await getTeacherProfileId(req.user.id);
      if (!teacherId || existing.assignment.teacherId !== teacherId) {
        return res.status(403).json({ message: "You can only grade submissions for your own assignments" });
      }
    }

    const parsedScore = Number(score);
    if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > Number(existing.assignment.maxScore || 100)) {
      return res.status(400).json({ message: "Score is out of allowed range" });
    }

    const submission = await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: parsedScore,
        feedback: feedback || null,
        status: "graded",
      },
      include: submissionInclude,
    });

    res.json({ message: "Submission graded successfully", submission });
  } catch (err) {
    console.error("gradeSubmission error:", err);
    res.status(500).json({ message: "Failed to grade submission" });
  }
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentSubmissions,
  getMyAssignments,
  submitAssignment,
  gradeSubmission,
};
