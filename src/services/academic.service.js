const prisma = require("../lib/prisma");

const DEFAULT_INSTITUTION_NAME = "Default Institution";
const DEFAULT_PASS_MIN_SCORE = 60;
const COMPLETE_CALC_STATUSES = new Set(["CALCULATED", "FINALIZED"]);
const LEGACY_SEMESTER_CODE = "LEGACY-CURRENT";
const LEGACY_SEMESTER_NAME = "Current Academic Term";

const DEFAULT_POLICY_COMPONENTS = [
  { code: "MIDTERM", label: "Midterm", weight: 40, maxScore: 100, isRequired: true, sortOrder: 1 },
  { code: "FINAL_EXAM", label: "Final Exam", weight: 60, maxScore: 100, isRequired: true, sortOrder: 2 },
  { code: "COURSEWORK", label: "Coursework", weight: 0, maxScore: 100, isRequired: false, sortOrder: 3 },
];

const DEFAULT_POLICY_BOUNDARIES = [
  { letterGrade: "AA", minScore: 90, maxScore: 100, gradePoint: 4.0, isPassing: true, includeInGpa: true, sortOrder: 1 },
  { letterGrade: "AB", minScore: 85, maxScore: 89.99, gradePoint: 3.5, isPassing: true, includeInGpa: true, sortOrder: 2 },
  { letterGrade: "BB", minScore: 80, maxScore: 84.99, gradePoint: 3.0, isPassing: true, includeInGpa: true, sortOrder: 3 },
  { letterGrade: "BC", minScore: 75, maxScore: 79.99, gradePoint: 2.5, isPassing: true, includeInGpa: true, sortOrder: 4 },
  { letterGrade: "CC", minScore: 70, maxScore: 74.99, gradePoint: 2.0, isPassing: true, includeInGpa: true, sortOrder: 5 },
  { letterGrade: "CD", minScore: 65, maxScore: 69.99, gradePoint: 1.5, isPassing: true, includeInGpa: true, sortOrder: 6 },
  { letterGrade: "DD", minScore: 60, maxScore: 64.99, gradePoint: 1.0, isPassing: true, includeInGpa: true, sortOrder: 7 },
  { letterGrade: "FF", minScore: 0, maxScore: 59.99, gradePoint: 0.0, isPassing: false, includeInGpa: true, sortOrder: 8 },
];

const createHttpError = (status, message) => Object.assign(new Error(message), { status });

const slugifyCode = (value, fallback = "SUBJECT") => {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return normalized || fallback;
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const legacyLetterToScore = (letterGrade) => {
  const normalized = String(letterGrade || "").trim().toUpperCase();
  const mapping = {
    "AA": 95,
    "AB": 87,
    "BB": 82,
    "BC": 77,
    "CC": 72,
    "CD": 67,
    "DD": 62,
    "FF": 45,
    "A+": 98,
    "A": 95,
    "A-": 91,
    "B+": 88,
    "B": 85,
    "B-": 81,
    "C+": 78,
    "C": 75,
    "C-": 71,
    "D+": 68,
    "D": 65,
    "D-": 61,
    "F": 45,
  };

  return mapping[normalized] ?? null;
};

const scoreToLetter = (score) => {
  if (score === null || score === undefined) return "N/A";
  if (score >= 90) return "AA";
  if (score >= 85) return "AB";
  if (score >= 80) return "BB";
  if (score >= 75) return "BC";
  if (score >= 70) return "CC";
  if (score >= 65) return "CD";
  if (score >= 60) return "DD";
  return "FF";
};

const scoreToSummaryStatus = (score) => {
  if (score === null || score === undefined) return "No Academic Data";
  if (score >= 85) return "Excellent";
  if (score >= 70) return "On Track";
  if (score >= 60) return "Needs Support";
  return "Critical";
};

const buildDefaultPolicyPayload = () => ({
  name: "Default Academic Policy",
  isDefault: true,
  passMinScore: DEFAULT_PASS_MIN_SCORE,
  components: DEFAULT_POLICY_COMPONENTS.map((component) => ({ ...component })),
  boundaries: DEFAULT_POLICY_BOUNDARIES.map((boundary) => ({ ...boundary })),
});

const ensureLegacySemester = async (tx, institutionId) => {
  const existing = await tx.semester.findFirst({
    where: {
      institutionId,
      code: LEGACY_SEMESTER_CODE,
    },
  });

  if (existing) {
    return existing;
  }

  const now = new Date();
  const startDate = new Date(now.getFullYear(), 0, 1);
  const endDate = new Date(now.getFullYear(), 11, 31);

  return tx.semester.create({
    data: {
      institutionId,
      name: LEGACY_SEMESTER_NAME,
      code: LEGACY_SEMESTER_CODE,
      startDate,
      endDate,
      status: "ACTIVE",
    },
  });
};

const deriveLegacyScore = (student, gradedSubmissions = [], maxScore = 100) => {
  if (gradedSubmissions.length > 0) {
    const averagePercentage =
      gradedSubmissions.reduce((sum, submission) => {
        const submissionMaxScore = Number(submission.assignment?.maxScore || maxScore || 100);
        if (!submissionMaxScore) return sum;
        return sum + round((Number(submission.score || 0) / submissionMaxScore) * 100);
      }, 0) / gradedSubmissions.length;

    return round(averagePercentage);
  }

  return legacyLetterToScore(student.grade);
};

const prepareLegacyAssessmentSeed = (components, legacyScore, actorId = null) =>
  components.map((component) => ({
    componentId: component.id,
    rawScore:
      legacyScore === null || legacyScore === undefined
        ? null
        : Math.min(Number(component.maxScore || 100), Math.max(0, legacyScore)),
    enteredById: actorId,
  }));

const sortBoundariesByScore = (boundaries) =>
  [...boundaries].sort((left, right) => {
    const minGap = toNumber(right.minScore) - toNumber(left.minScore);
    if (minGap !== 0) return minGap;
    return (left.sortOrder || 0) - (right.sortOrder || 0);
  });

const validateComponents = (components) => {
  if (!Array.isArray(components) || components.length === 0) {
    throw createHttpError(400, "At least one grading component is required");
  }

  const seenCodes = new Set();
  let totalWeight = 0;
  let positiveWeightCount = 0;

  for (const component of components) {
    if (!component.code || !component.label) {
      throw createHttpError(400, "Each grading component must include code and label");
    }

    if (seenCodes.has(component.code)) {
      throw createHttpError(409, `Duplicate grading component code: ${component.code}`);
    }

    const weight = toNumber(component.weight);
    const maxScore = toNumber(component.maxScore);

    if (weight === null || weight < 0) {
      throw createHttpError(400, `Invalid weight for component ${component.code}`);
    }

    if (maxScore === null || maxScore <= 0) {
      throw createHttpError(400, `Invalid maxScore for component ${component.code}`);
    }

    seenCodes.add(component.code);
    totalWeight += weight;
    if (weight > 0) positiveWeightCount += 1;
  }

  if (positiveWeightCount === 0) {
    throw createHttpError(422, "At least one grading component must have a weight greater than 0");
  }

  if (Math.abs(round(totalWeight, 2) - 100) > 0.01) {
    throw createHttpError(422, "Grading component weights must sum to 100");
  }
};

const validateBoundaries = (boundaries) => {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    throw createHttpError(400, "At least one grade boundary is required");
  }

  const seenLetters = new Set();
  const ordered = sortBoundariesByScore(boundaries);
  let previousMin = 101;

  for (const boundary of ordered) {
    if (!boundary.letterGrade) {
      throw createHttpError(400, "Each grade boundary must include a letterGrade");
    }

    if (seenLetters.has(boundary.letterGrade)) {
      throw createHttpError(409, `Duplicate letter grade boundary: ${boundary.letterGrade}`);
    }

    const minScore = toNumber(boundary.minScore);
    const maxScore = boundary.maxScore === null || boundary.maxScore === undefined ? null : toNumber(boundary.maxScore);
    const gradePoint = toNumber(boundary.gradePoint);

    if (minScore === null || minScore < 0 || minScore > 100) {
      throw createHttpError(400, `Invalid minScore for boundary ${boundary.letterGrade}`);
    }

    if (maxScore !== null && (maxScore < 0 || maxScore > 100 || maxScore < minScore)) {
      throw createHttpError(400, `Invalid maxScore for boundary ${boundary.letterGrade}`);
    }

    if (gradePoint === null || gradePoint < 0 || gradePoint > 4) {
      throw createHttpError(400, `Invalid gradePoint for boundary ${boundary.letterGrade}`);
    }

    if (minScore > previousMin) {
      throw createHttpError(422, "Grade boundaries overlap or are not sorted correctly");
    }

    previousMin = minScore;
    seenLetters.add(boundary.letterGrade);
  }

  const lowestBoundary = ordered[ordered.length - 1];
  if (toNumber(lowestBoundary.minScore) > 0) {
    throw createHttpError(422, "Grade boundaries must cover scores down to 0");
  }
};

const normalizePolicyPayload = (payload = {}) => {
  const components = (payload.components || []).map((component, index) => ({
    code: String(component.code || "").trim(),
    label: String(component.label || "").trim(),
    weight: round(toNumber(component.weight) || 0),
    maxScore: round(toNumber(component.maxScore) || 0),
    isRequired: component.isRequired !== false,
    sortOrder: component.sortOrder ?? index + 1,
  }));

  const boundaries = (payload.boundaries || []).map((boundary, index) => ({
    letterGrade: String(boundary.letterGrade || "").trim().toUpperCase(),
    minScore: round(toNumber(boundary.minScore) || 0),
    maxScore:
      boundary.maxScore === null || boundary.maxScore === undefined
        ? null
        : round(toNumber(boundary.maxScore) || 0),
    gradePoint: round(toNumber(boundary.gradePoint) || 0),
    isPassing: boundary.isPassing !== false,
    includeInGpa: boundary.includeInGpa !== false,
    sortOrder: boundary.sortOrder ?? index + 1,
  }));

  validateComponents(components);
  validateBoundaries(boundaries);

  return {
    name: String(payload.name || "").trim(),
    isDefault: Boolean(payload.isDefault),
    passMinScore: round(toNumber(payload.passMinScore) ?? DEFAULT_PASS_MIN_SCORE),
    components,
    boundaries,
  };
};

const findBoundaryForScore = (score, boundaries) => {
  const ordered = sortBoundariesByScore(boundaries);
  return ordered.find((boundary) => {
    const min = toNumber(boundary.minScore) ?? 0;
    const max = boundary.maxScore === null || boundary.maxScore === undefined ? 100 : toNumber(boundary.maxScore);
    return score >= min && score <= max;
  }) || null;
};

const ensureInstitution = async (tx) => {
  const existing = await tx.institution.findFirst({ orderBy: { id: "asc" } });
  if (existing) return existing;

  return tx.institution.create({
    data: {
      name: DEFAULT_INSTITUTION_NAME,
    },
  });
};

const createPolicyRecord = async (tx, payload, institutionId) => {
  const normalized = normalizePolicyPayload(payload);

  if (!normalized.name) {
    throw createHttpError(400, "Policy name is required");
  }

  if (normalized.passMinScore < 0 || normalized.passMinScore > 100) {
    throw createHttpError(400, "passMinScore must be between 0 and 100");
  }

  if (normalized.isDefault) {
    await tx.gradingPolicy.updateMany({
      where: { institutionId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return tx.gradingPolicy.create({
    data: {
      institutionId,
      name: normalized.name,
      isDefault: normalized.isDefault,
      passMinScore: normalized.passMinScore,
      components: {
        create: normalized.components,
      },
      boundaries: {
        create: normalized.boundaries,
      },
    },
    include: {
      components: { orderBy: { sortOrder: "asc" } },
      boundaries: { orderBy: { sortOrder: "asc" } },
    },
  });
};

const policyMatchesPayload = (policy, payload) => {
  if (!policy) return false;

  const normalized = normalizePolicyPayload(payload);
  const currentComponents = [...(policy.components || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));
  const currentBoundaries = [...(policy.boundaries || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));

  if (
    policy.name !== normalized.name ||
    Boolean(policy.isDefault) !== Boolean(normalized.isDefault) ||
    round(toNumber(policy.passMinScore) || 0) !== round(normalized.passMinScore)
  ) {
    return false;
  }

  if (currentComponents.length !== normalized.components.length || currentBoundaries.length !== normalized.boundaries.length) {
    return false;
  }

  const componentsMatch = currentComponents.every((component, index) => {
    const target = normalized.components[index];
    return (
      component.code === target.code &&
      component.label === target.label &&
      round(toNumber(component.weight) || 0) === round(target.weight) &&
      round(toNumber(component.maxScore) || 0) === round(target.maxScore) &&
      Boolean(component.isRequired) === Boolean(target.isRequired) &&
      (component.sortOrder || 0) === target.sortOrder
    );
  });

  if (!componentsMatch) return false;

  return currentBoundaries.every((boundary, index) => {
    const target = normalized.boundaries[index];
    return (
      boundary.letterGrade === target.letterGrade &&
      round(toNumber(boundary.minScore) || 0) === round(target.minScore) &&
      round(toNumber(boundary.maxScore) || 0) === round(target.maxScore) &&
      round(toNumber(boundary.gradePoint) || 0) === round(target.gradePoint) &&
      Boolean(boundary.isPassing) === Boolean(target.isPassing) &&
      Boolean(boundary.includeInGpa) === Boolean(target.includeInGpa) &&
      (boundary.sortOrder || 0) === target.sortOrder
    );
  });
};

const syncPolicyRecord = async (tx, policy, payload) => {
  const normalized = normalizePolicyPayload(payload);

  await tx.gradingPolicy.update({
    where: { id: policy.id },
    data: {
      name: normalized.name,
      isDefault: normalized.isDefault,
      passMinScore: normalized.passMinScore,
    },
  });

  const currentComponents = new Map((policy.components || []).map((component) => [component.code, component]));
  const currentBoundaries = new Map((policy.boundaries || []).map((boundary) => [boundary.letterGrade, boundary]));

  for (const component of normalized.components) {
    const existingComponent = currentComponents.get(component.code);

    if (existingComponent) {
      await tx.gradingPolicyComponent.update({
        where: { id: existingComponent.id },
        data: {
          label: component.label,
          weight: component.weight,
          maxScore: component.maxScore,
          isRequired: component.isRequired,
          sortOrder: component.sortOrder,
        },
      });
      currentComponents.delete(component.code);
      continue;
    }

    await tx.gradingPolicyComponent.create({
      data: {
        policyId: policy.id,
        ...component,
      },
    });
  }

  for (const leftoverComponent of currentComponents.values()) {
    await tx.gradingPolicyComponent.update({
      where: { id: leftoverComponent.id },
      data: {
        weight: 0,
        isRequired: false,
      },
    });
  }

  for (const boundary of normalized.boundaries) {
    const existingBoundary = currentBoundaries.get(boundary.letterGrade);

    if (existingBoundary) {
      await tx.gradingPolicyBoundary.update({
        where: { id: existingBoundary.id },
        data: {
          minScore: boundary.minScore,
          maxScore: boundary.maxScore,
          gradePoint: boundary.gradePoint,
          isPassing: boundary.isPassing,
          includeInGpa: boundary.includeInGpa,
          sortOrder: boundary.sortOrder,
        },
      });
      currentBoundaries.delete(boundary.letterGrade);
      continue;
    }

    await tx.gradingPolicyBoundary.create({
      data: {
        policyId: policy.id,
        ...boundary,
      },
    });
  }

  return tx.gradingPolicy.findUnique({
    where: { id: policy.id },
    include: {
      components: { orderBy: { sortOrder: "asc" } },
      boundaries: { orderBy: { sortOrder: "asc" } },
    },
  });
};

const ensureDefaultPolicy = async (tx, institutionId) => {
  const existing = await tx.gradingPolicy.findFirst({
    where: { institutionId, isDefault: true },
    include: {
      components: { orderBy: { sortOrder: "asc" } },
      boundaries: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (existing) {
    const defaultPayload = buildDefaultPolicyPayload();
    if (policyMatchesPayload(existing, defaultPayload)) {
      return existing;
    }

    const syncedPolicy = await syncPolicyRecord(tx, existing, defaultPayload);
    const linkedEnrollments = await tx.studentEnrollment.findMany({
      where: { gradingPolicyId: existing.id },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    for (const enrollment of linkedEnrollments) {
      await recalculateEnrollmentInTransaction(tx, enrollment.id);
    }

    return syncedPolicy;
  }

  return createPolicyRecord(tx, buildDefaultPolicyPayload(), institutionId);
};

const mapAssessmentsByCode = (assessments) => {
  const mapped = {};
  for (const assessment of assessments) {
    mapped[assessment.component.code] = {
      id: assessment.id,
      rawScore: toNumber(assessment.rawScore),
      weightedScore: toNumber(assessment.weightedScore),
    };
  }
  return mapped;
};

const loadEnrollmentForCalculation = async (tx, enrollmentId) =>
  tx.studentEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      subject: true,
      assessments: {
        include: {
          component: true,
        },
      },
      gradingPolicy: {
        include: {
          components: { orderBy: { sortOrder: "asc" } },
          boundaries: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

const recalculateEnrollmentInTransaction = async (tx, enrollmentId) => {
  const enrollment = await loadEnrollmentForCalculation(tx, enrollmentId);

  if (!enrollment) {
    throw createHttpError(404, "Enrollment not found");
  }

  validateComponents(enrollment.gradingPolicy.components);
  validateBoundaries(enrollment.gradingPolicy.boundaries);

  let totalScore = 0;
  let hasRequiredGap = false;

  for (const component of enrollment.gradingPolicy.components) {
    let assessment = enrollment.assessments.find((item) => item.componentId === component.id);

    if (!assessment) {
      assessment = await tx.enrollmentAssessment.create({
        data: {
          enrollmentId: enrollment.id,
          componentId: component.id,
        },
        include: {
          component: true,
        },
      });
    }

    const rawScore = toNumber(assessment.rawScore);
    const maxScore = toNumber(component.maxScore) || 100;
    const weight = toNumber(component.weight) || 0;

    if (rawScore !== null && (rawScore < 0 || rawScore > maxScore)) {
      throw createHttpError(422, `${component.label} score must be between 0 and ${maxScore}`);
    }

    if (rawScore === null && component.isRequired) {
      hasRequiredGap = true;
    }

    const weightedScore =
      rawScore === null ? null : round((rawScore / maxScore) * weight);

    if (toNumber(assessment.weightedScore) !== weightedScore) {
      await tx.enrollmentAssessment.update({
        where: { id: assessment.id },
        data: { weightedScore },
      });
    }

    if (weightedScore !== null) {
      totalScore += weightedScore;
    }
  }

  if (hasRequiredGap) {
    return tx.studentEnrollment.update({
      where: { id: enrollment.id },
      data: {
        totalScore: null,
        finalLetterGrade: null,
        gradePoint: null,
        countsTowardsGpa: false,
        passStatus: "INCOMPLETE",
        earnedCredits: 0,
        calculationStatus: "INCOMPLETE",
        calculatedAt: null,
        status: enrollment.status === "WITHDRAWN" ? "WITHDRAWN" : "REGISTERED",
      },
    });
  }

  const normalizedTotal = round(totalScore);
  const boundary = findBoundaryForScore(normalizedTotal, enrollment.gradingPolicy.boundaries);

  if (!boundary) {
    throw createHttpError(422, "No grade boundary matches the calculated score");
  }

  const gradePoint = toNumber(boundary.gradePoint);
  const isPassing = Boolean(boundary.isPassing) && normalizedTotal >= toNumber(enrollment.gradingPolicy.passMinScore);
  const countsTowardsGpa = Boolean(boundary.includeInGpa);
  const earnedCredits = isPassing ? enrollment.subject.creditHours : 0;

  return tx.studentEnrollment.update({
    where: { id: enrollment.id },
    data: {
      totalScore: normalizedTotal,
      finalLetterGrade: boundary.letterGrade,
      gradePoint,
      countsTowardsGpa,
      passStatus: isPassing ? "PASS" : "FAIL",
      earnedCredits,
      calculationStatus: enrollment.finalizedAt ? "FINALIZED" : "CALCULATED",
      calculatedAt: new Date(),
      status: enrollment.status === "WITHDRAWN" ? "WITHDRAWN" : "COMPLETED",
    },
  });
};

const recalculateEnrollment = async (enrollmentId, prismaClient = prisma) => {
  if (typeof prismaClient.$transaction === "function") {
    return prismaClient.$transaction((tx) => recalculateEnrollmentInTransaction(tx, enrollmentId));
  }

  return recalculateEnrollmentInTransaction(prismaClient, enrollmentId);
};

const buildAcademicView = (enrollments = []) => {
  const subjects = enrollments
    .map((enrollment) => {
      const mappedAssessments = mapAssessmentsByCode(enrollment.assessments || []);
      const totalScore = toNumber(enrollment.totalScore);
      const gradePoint = toNumber(enrollment.gradePoint);
      const status =
        enrollment.passStatus === "PASS"
          ? "Pass"
          : enrollment.passStatus === "FAIL"
            ? "Fail"
            : "Incomplete";

      return {
        id: enrollment.id,
        offeringId: enrollment.subjectOfferingId,
        semesterId: enrollment.semesterId,
        semesterName: enrollment.subjectOffering?.semester?.name || null,
        subjectId: enrollment.subjectId,
        name: enrollment.subject.name,
        code: enrollment.subject.code,
        credits: enrollment.subject.creditHours,
        teacher: enrollment.subjectOffering?.teacher?.name || null,
        section: enrollment.subjectOffering?.section || "A",
        policyName: enrollment.gradingPolicy?.name || null,
        midtermScore: mappedAssessments.MIDTERM?.rawScore ?? null,
        finalExamScore: mappedAssessments.FINAL_EXAM?.rawScore ?? null,
        courseworkScore: mappedAssessments.COURSEWORK?.rawScore ?? null,
        totalScore,
        score: totalScore,
        grade: enrollment.finalLetterGrade || "N/A",
        finalLetterGrade: enrollment.finalLetterGrade || "N/A",
        gpa: gradePoint ?? 0,
        gradePoint,
        passStatus: enrollment.passStatus,
        status,
        calculationStatus: enrollment.calculationStatus,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const registeredCredits = subjects.reduce((sum, subject) => sum + Number(subject.credits || 0), 0);
  const earnedCredits = enrollments.reduce((sum, enrollment) => sum + Number(enrollment.earnedCredits || 0), 0);
  const passedSubjects = enrollments.filter((enrollment) => enrollment.passStatus === "PASS").length;
  const failedSubjects = enrollments.filter((enrollment) => enrollment.passStatus === "FAIL").length;
  const incompleteSubjects = enrollments.filter((enrollment) => enrollment.passStatus === "INCOMPLETE").length;
  const completedSubjects = enrollments.filter((enrollment) => COMPLETE_CALC_STATUSES.has(enrollment.calculationStatus));
  const scoredSubjects = completedSubjects.filter((enrollment) => toNumber(enrollment.totalScore) !== null);
  const gpaEligible = completedSubjects.filter(
    (enrollment) =>
      enrollment.status !== "WITHDRAWN" &&
      enrollment.countsTowardsGpa &&
      toNumber(enrollment.gradePoint) !== null
  );

  const totalQualityPoints = gpaEligible.reduce(
    (sum, enrollment) => sum + Number(enrollment.subject.creditHours || 0) * Number(toNumber(enrollment.gradePoint) || 0),
    0
  );

  const totalGpaCredits = gpaEligible.reduce(
    (sum, enrollment) => sum + Number(enrollment.subject.creditHours || 0),
    0
  );

  const gpa = totalGpaCredits > 0 ? round(totalQualityPoints / totalGpaCredits) : null;
  const averageScore =
    scoredSubjects.length > 0
      ? round(
          scoredSubjects.reduce((sum, enrollment) => sum + Number(toNumber(enrollment.totalScore) || 0), 0) /
            scoredSubjects.length
        )
      : null;

  return {
    hasAcademicData: subjects.length > 0,
    subjects,
    summary: {
      gpa,
      averageScore,
      averagePercentage: averageScore,
      gradedAssignments: completedSubjects.length,
      totalSubjects: subjects.length,
      totalCredits: registeredCredits,
      totalRegisteredCredits: registeredCredits,
      totalEarnedCredits: earnedCredits,
      passedSubjects,
      failedSubjects,
      incompleteSubjects,
      letterGrade: scoreToLetter(averageScore),
      status: scoreToSummaryStatus(averageScore),
    },
  };
};

const enrollmentInclude = {
  subject: true,
  gradingPolicy: {
    select: {
      id: true,
      name: true,
    },
  },
  subjectOffering: {
    include: {
      teacher: {
        select: {
          id: true,
          userId: true,
          name: true,
        },
      },
      semester: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
  assessments: {
    include: {
      component: true,
    },
  },
};

const getStudentAcademicProfile = async (studentId, options = {}, prismaClient = prisma) => {
  const filters = { studentId: Number(studentId) };
  if (options.semesterId) filters.semesterId = Number(options.semesterId);

  const loadEnrollments = () =>
    prismaClient.studentEnrollment.findMany({
      where: filters,
      include: enrollmentInclude,
      orderBy: [
        { semesterId: "desc" },
        { createdAt: "desc" },
      ],
    });

  let enrollments = await loadEnrollments();

  if (enrollments.length === 0 && options.ensureLegacySync !== false) {
    try {
      await syncAcademicDataFromLegacy({ studentIds: [Number(studentId)] }, prismaClient);
      enrollments = await loadEnrollments();
    } catch (error) {
      console.error(`Academic sync failed for student ${studentId}:`, error.message);
    }
  }

  return buildAcademicView(enrollments);
};

const getAcademicOverviewMap = async (studentIds, prismaClient = prisma) => {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return new Map();
  }

  const normalizedStudentIds = studentIds.map(Number);
  const loadEnrollments = () =>
    prismaClient.studentEnrollment.findMany({
      where: {
        studentId: {
          in: normalizedStudentIds,
        },
      },
      include: enrollmentInclude,
    });

  let enrollments = await loadEnrollments();
  const studentsWithAcademicData = new Set(enrollments.map((enrollment) => enrollment.studentId));
  const missingStudentIds = normalizedStudentIds.filter((studentId) => !studentsWithAcademicData.has(studentId));

  if (missingStudentIds.length > 0) {
    try {
      await syncAcademicDataFromLegacy({ studentIds: missingStudentIds }, prismaClient);
      enrollments = await loadEnrollments();
    } catch (error) {
      console.error("Academic sync failed for student overview map:", error.message);
    }
  }

  const grouped = new Map();

  for (const enrollment of enrollments) {
    if (!grouped.has(enrollment.studentId)) {
      grouped.set(enrollment.studentId, []);
    }
    grouped.get(enrollment.studentId).push(enrollment);
  }

  const overview = new Map();

  for (const studentId of normalizedStudentIds) {
    const studentEnrollments = grouped.get(studentId) || [];
    overview.set(studentId, buildAcademicView(studentEnrollments));
  }

  return overview;
};

const createSubject = async (payload, prismaClient = prisma) =>
  prismaClient.$transaction(async (tx) => {
    const institution = await ensureInstitution(tx);
    const name = String(payload.name || "").trim();
    const code = String(payload.code || "").trim().toUpperCase();
    const creditHours = Number(payload.creditHours);

    if (!name || !code) {
      throw createHttpError(400, "name and code are required");
    }

    if (!Number.isInteger(creditHours) || creditHours <= 0) {
      throw createHttpError(400, "creditHours must be a positive integer");
    }

    return tx.subject.create({
      data: {
        institutionId: institution.id,
        name,
        code,
        creditHours,
        isActive: payload.isActive !== false,
      },
    });
  });

const createSemester = async (payload, prismaClient = prisma) =>
  prismaClient.$transaction(async (tx) => {
    const institution = await ensureInstitution(tx);
    const name = String(payload.name || "").trim();
    const code = String(payload.code || "").trim().toUpperCase();
    const startDate = payload.startDate ? new Date(payload.startDate) : null;
    const endDate = payload.endDate ? new Date(payload.endDate) : null;

    if (!name || !code || !startDate || !endDate || Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
      throw createHttpError(400, "name, code, startDate, and endDate are required");
    }

    if (endDate <= startDate) {
      throw createHttpError(400, "endDate must be after startDate");
    }

    return tx.semester.create({
      data: {
        institutionId: institution.id,
        name,
        code,
        startDate,
        endDate,
        status: payload.status || "PLANNED",
      },
    });
  });

const createGradingPolicy = async (payload, prismaClient = prisma) =>
  prismaClient.$transaction(async (tx) => {
    const institution = await ensureInstitution(tx);
    return createPolicyRecord(tx, payload, institution.id);
  });

const createSubjectOffering = async (payload, prismaClient = prisma) =>
  prismaClient.$transaction(async (tx) => {
    const subjectId = Number(payload.subjectId);
    const semesterId = Number(payload.semesterId);
    const teacherId = payload.teacherId ? Number(payload.teacherId) : null;
    const section = String(payload.section || "A").trim().toUpperCase();
    const capacity = payload.capacity === undefined || payload.capacity === null ? null : Number(payload.capacity);

    if (!subjectId || !semesterId) {
      throw createHttpError(400, "subjectId and semesterId are required");
    }

    const [subject, semester] = await Promise.all([
      tx.subject.findUnique({ where: { id: subjectId } }),
      tx.semester.findUnique({ where: { id: semesterId } }),
    ]);

    if (!subject || !semester) {
      throw createHttpError(404, "Subject or semester not found");
    }

    if (subject.institutionId !== semester.institutionId) {
      throw createHttpError(422, "Subject and semester must belong to the same institution");
    }

    if (teacherId) {
      const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
      if (!teacher) {
        throw createHttpError(404, "Teacher not found");
      }
    }

    let gradingPolicyId = payload.gradingPolicyId ? Number(payload.gradingPolicyId) : null;
    if (!gradingPolicyId) {
      const defaultPolicy = await ensureDefaultPolicy(tx, semester.institutionId);
      gradingPolicyId = defaultPolicy.id;
    }

    return tx.subjectOffering.create({
      data: {
        subjectId,
        semesterId,
        teacherId,
        gradingPolicyId,
        section: section || "A",
        capacity: Number.isFinite(capacity) ? capacity : null,
      },
      include: {
        subject: true,
        semester: true,
        teacher: true,
        gradingPolicy: true,
      },
    });
  });

const createEnrollment = async (payload, prismaClient = prisma) =>
  prismaClient.$transaction(async (tx) => {
    const studentId = Number(payload.studentId);
    const subjectOfferingId = Number(payload.subjectOfferingId);
    const initialScores = payload.scores || {};

    if (!studentId || !subjectOfferingId) {
      throw createHttpError(400, "studentId and subjectOfferingId are required");
    }

    const [student, offering] = await Promise.all([
      tx.student.findUnique({ where: { id: studentId } }),
      tx.subjectOffering.findUnique({
        where: { id: subjectOfferingId },
        include: {
          gradingPolicy: {
            include: {
              components: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      }),
    ]);

    if (!student || !offering) {
      throw createHttpError(404, "Student or subject offering not found");
    }

    const existing = await tx.studentEnrollment.findFirst({
      where: {
        studentId,
        OR: [
          { subjectOfferingId },
          { semesterId: offering.semesterId, subjectId: offering.subjectId },
        ],
      },
    });

    if (existing) {
      throw createHttpError(409, "Student is already enrolled in this subject for the semester");
    }

    const scoreByCode = {
      MIDTERM: initialScores.midterm,
      FINAL_EXAM: initialScores.finalExam,
      COURSEWORK: initialScores.coursework,
    };

    const enrollment = await tx.studentEnrollment.create({
      data: {
        studentId,
        subjectOfferingId,
        semesterId: offering.semesterId,
        subjectId: offering.subjectId,
        gradingPolicyId: offering.gradingPolicyId,
        assessments: {
          create: offering.gradingPolicy.components.map((component) => {
            const rawScore = scoreByCode[component.code];
            const numericScore =
              rawScore === null || rawScore === undefined || rawScore === ""
                ? null
                : Number(rawScore);

            if (
              numericScore !== null &&
              (!Number.isFinite(numericScore) ||
                numericScore < 0 ||
                numericScore > Number(component.maxScore))
            ) {
              throw createHttpError(
                422,
                `${component.label} score must be between 0 and ${component.maxScore}`
              );
            }

            return {
              componentId: component.id,
              rawScore: numericScore,
              enteredById: payload.actorId || null,
            };
          }),
        },
      },
      include: {
        subject: true,
      },
    });

    await recalculateEnrollmentInTransaction(tx, enrollment.id);

    return tx.studentEnrollment.findUnique({
      where: { id: enrollment.id },
      include: enrollmentInclude,
    });
  });

const setAssessmentScore = async ({ enrollmentId, code, rawScore, actorId }, prismaClient = prisma) =>
  prismaClient.$transaction(async (tx) => {
    const enrollment = await tx.studentEnrollment.findUnique({
      where: { id: Number(enrollmentId) },
      include: {
        subjectOffering: {
          include: {
            teacher: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
        gradingPolicy: {
          include: {
            components: true,
          },
        },
      },
    });

    if (!enrollment) {
      throw createHttpError(404, "Enrollment not found");
    }

    const component = enrollment.gradingPolicy.components.find((item) => item.code === code);
    if (!component) {
      throw createHttpError(404, `${code} component is not configured for this policy`);
    }

    const numericScore = rawScore === null || rawScore === undefined || rawScore === "" ? null : Number(rawScore);
    if (numericScore !== null && (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > Number(component.maxScore))) {
      throw createHttpError(422, `${component.label} score must be between 0 and ${component.maxScore}`);
    }

    await tx.enrollmentAssessment.upsert({
      where: {
        enrollmentId_componentId: {
          enrollmentId: enrollment.id,
          componentId: component.id,
        },
      },
      update: {
        rawScore: numericScore,
        enteredById: actorId || null,
      },
      create: {
        enrollmentId: enrollment.id,
        componentId: component.id,
        rawScore: numericScore,
        enteredById: actorId || null,
      },
    });

    await recalculateEnrollmentInTransaction(tx, enrollment.id);

    return tx.studentEnrollment.findUnique({
      where: { id: enrollment.id },
      include: enrollmentInclude,
    });
  });

const getEnrollmentAccessContext = async (enrollmentId, prismaClient = prisma) =>
  prismaClient.studentEnrollment.findUnique({
    where: { id: Number(enrollmentId) },
    include: {
      subjectOffering: {
        include: {
          teacher: {
            select: {
              id: true,
              userId: true,
              name: true,
            },
          },
        },
      },
    },
  });

const syncAcademicDataFromLegacyInTransaction = async (tx, options = {}) => {
    const institution = await ensureInstitution(tx);
    const semester = await ensureLegacySemester(tx, institution.id);
    const defaultPolicy = await ensureDefaultPolicy(tx, institution.id);
    const requestedStudentIds = Array.isArray(options.studentIds)
      ? [...new Set(options.studentIds.map((value) => Number(value)).filter(Boolean))]
      : null;
    const shouldFilterByStudent = Array.isArray(requestedStudentIds) && requestedStudentIds.length > 0;

    const legacyClasses = await tx.academicClass.findMany({
      where: shouldFilterByStudent
        ? {
            students: {
              some: {
                studentId: {
                  in: requestedStudentIds,
                },
              },
            },
          }
        : undefined,
      include: {
        teacher: true,
        assignments: {
          include: {
            submissions: {
              where: {
                score: {
                  not: null,
                },
              },
              include: {
                assignment: {
                  select: {
                    maxScore: true,
                  },
                },
              },
            },
          },
        },
        students: {
          include: {
            student: true,
          },
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    const standaloneStudents = await tx.student.findMany({
      where: {
        ...(shouldFilterByStudent
          ? {
              id: {
                in: requestedStudentIds,
              },
            }
          : {}),
        classes: {
          none: {},
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    const summary = {
      subjectsCreated: 0,
      offeringsCreated: 0,
      enrollmentsCreated: 0,
      enrollmentsUpdated: 0,
    };

    const ensureSubject = async ({ code, name, creditHours }) => {
      const existing = await tx.subject.findFirst({
        where: {
          institutionId: institution.id,
          code,
        },
      });

      if (existing) {
        return existing;
      }

      summary.subjectsCreated += 1;

      return tx.subject.create({
        data: {
          institutionId: institution.id,
          name,
          code,
          creditHours,
          isActive: true,
        },
      });
    };

    const ensureOffering = async ({ subjectId, teacherId, section }) => {
      const existing = await tx.subjectOffering.findFirst({
        where: {
          subjectId,
          semesterId: semester.id,
          section,
        },
      });

      if (existing) {
        return existing;
      }

      summary.offeringsCreated += 1;

      return tx.subjectOffering.create({
        data: {
          subjectId,
          semesterId: semester.id,
          teacherId,
          gradingPolicyId: defaultPolicy.id,
          section,
        },
      });
    };

    const syncEnrollment = async ({ student, subject, offering, legacyScore }) => {
      const existing = await tx.studentEnrollment.findFirst({
        where: {
          studentId: student.id,
          semesterId: semester.id,
          subjectId: subject.id,
        },
        include: {
          assessments: true,
        },
      });

      if (!existing) {
        const enrollment = await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            subjectOfferingId: offering.id,
            semesterId: semester.id,
            subjectId: subject.id,
            gradingPolicyId: defaultPolicy.id,
            assessments: {
              create: prepareLegacyAssessmentSeed(
                defaultPolicy.components,
                legacyScore,
                student.userId || null
              ),
            },
          },
        });

        await recalculateEnrollmentInTransaction(tx, enrollment.id);
        summary.enrollmentsCreated += 1;
        return;
      }

      if (legacyScore === null || legacyScore === undefined) {
        return;
      }

      const hasManualScores =
        existing.assessments.some((assessment) => assessment.rawScore !== null && assessment.rawScore !== undefined) ||
        existing.totalScore !== null ||
        existing.finalLetterGrade !== null;

      if (hasManualScores) {
        return;
      }

      for (const component of defaultPolicy.components) {
        const boundedScore = Math.min(
          Number(component.maxScore || 100),
          Math.max(0, legacyScore)
        );

        await tx.enrollmentAssessment.upsert({
          where: {
            enrollmentId_componentId: {
              enrollmentId: existing.id,
              componentId: component.id,
            },
          },
          update: {
            rawScore: boundedScore,
            enteredById: student.userId || null,
          },
          create: {
            enrollmentId: existing.id,
            componentId: component.id,
            rawScore: boundedScore,
            enteredById: student.userId || null,
          },
        });
      }

      await recalculateEnrollmentInTransaction(tx, existing.id);
      summary.enrollmentsUpdated += 1;
    };

    for (const legacyClass of legacyClasses) {
      const subject = await ensureSubject({
        code: legacyClass.code,
        name: legacyClass.name,
        creditHours: legacyClass.credits || 3,
      });

      const offering = await ensureOffering({
        subjectId: subject.id,
        teacherId: legacyClass.teacherId || null,
        section: "A",
      });

      for (const enrollment of legacyClass.students) {
        const student = enrollment.student;
        if (!student) continue;

        const gradedSubmissions = legacyClass.assignments.flatMap((assignment) =>
          assignment.submissions.filter((submission) => submission.studentId === student.id)
        );
        const legacyScore = deriveLegacyScore(student, gradedSubmissions);

        await syncEnrollment({ student, subject, offering, legacyScore });
      }
    }

    const standaloneCourseMap = new Map();

    for (const student of standaloneStudents) {
      const courseName = String(student.course || "").trim();
      if (!courseName) continue;

      const courseKey = slugifyCode(courseName, `COURSE-${student.id}`);

      if (!standaloneCourseMap.has(courseKey)) {
        const subject = await ensureSubject({
          code: `COURSE-${courseKey}`.slice(0, 30),
          name: courseName,
          creditHours: 3,
        });

        const offering = await ensureOffering({
          subjectId: subject.id,
          teacherId: null,
          section: "A",
        });

        standaloneCourseMap.set(courseKey, { subject, offering });
      }

      const { subject, offering } = standaloneCourseMap.get(courseKey);
      const legacyScore = deriveLegacyScore(student);
      await syncEnrollment({ student, subject, offering, legacyScore });
    }

    return summary;
  };

const syncAcademicDataFromLegacy = async (options = {}, prismaClient = prisma) =>
  syncAcademicDataFromLegacyInTransaction(prismaClient, options);

const bootstrapAcademicDataFromLegacy = async (prismaClient = prisma) =>
  syncAcademicDataFromLegacy({}, prismaClient);

module.exports = {
  buildAcademicView,
  buildDefaultPolicyPayload,
  bootstrapAcademicDataFromLegacy,
  createEnrollment,
  createGradingPolicy,
  createHttpError,
  createSemester,
  createSubject,
  createSubjectOffering,
  ensureDefaultPolicy,
  getAcademicOverviewMap,
  getEnrollmentAccessContext,
  getStudentAcademicProfile,
  recalculateEnrollment,
  setAssessmentScore,
  syncAcademicDataFromLegacy,
};
