const prisma = require("../lib/prisma");

const limitPerGroup = 6;

const reportCatalog = [
  { id: "attendance", title: "Attendance Report", subtitle: "Student attendance and risk indicators" },
  { id: "payments", title: "Payment Report", subtitle: "Fees, overdue balances, and collection" },
  { id: "teachers", title: "Teacher Performance Report", subtitle: "Monthly teacher ranking and insights" },
  { id: "students", title: "Student Report", subtitle: "Academic and attendance overview" },
];

const matchText = (value, query) => value.toLowerCase().includes(query.toLowerCase());

const getStudentProfileIdByUserId = async (userId) => {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true, name: true, course: true },
  });
  return student || null;
};

const getParentLinkedStudents = async (userId) => {
  const parent = await prisma.parentProfile.findUnique({
    where: { userId },
    select: {
      studentLinks: {
        select: {
          student: {
            select: { id: true, name: true, course: true },
          },
        },
      },
    },
  });

  if (!parent) return [];
  return (parent.studentLinks || []).map((link) => link.student).filter(Boolean);
};

const searchAll = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) {
      return res.json({ query: "", results: { students: [], teachers: [], payments: [], assignments: [], reports: [] } });
    }

    if (req.user.role === "STUDENT") {
      const student = await getStudentProfileIdByUserId(req.user.id);
      if (!student) {
        return res.json({ query, results: { students: [], teachers: [], payments: [], assignments: [], reports: [] } });
      }

      const pattern = query;
      const [payments, submissions] = await Promise.all([
        prisma.payment.findMany({
          where: {
            studentId: student.id,
            OR: [
              { status: { contains: pattern, mode: "insensitive" } },
              { student: { name: { contains: pattern, mode: "insensitive" } } },
            ],
          },
          include: { student: { select: { id: true, name: true, course: true } } },
          take: limitPerGroup,
        }),
        prisma.assignmentSubmission.findMany({
          where: {
            studentId: student.id,
            assignment: {
              OR: [
                { title: { contains: pattern, mode: "insensitive" } },
                { description: { contains: pattern, mode: "insensitive" } },
              ],
            },
          },
          include: {
            assignment: {
              include: {
                class: { select: { id: true, name: true } },
                teacher: { select: { id: true, name: true } },
              },
            },
          },
          take: limitPerGroup,
        }),
      ]);

      const studentMatches = [
        student.name,
        student.course,
        `#${student.id}`,
      ].some((value) => matchText(String(value || ""), query));

      return res.json({
        query,
        results: {
          students: studentMatches
            ? [{ id: student.id, title: student.name, subtitle: student.course, matched: [query] }]
            : [],
          teachers: [],
          payments: payments.map((item) => ({
            id: item.id,
            title: item.student.name,
            subtitle: `${item.status} • ${item.paidAmount}/${item.totalAmount}`,
            matched: [query],
          })),
          assignments: submissions.map((item) => ({
            id: item.assignment.id,
            title: item.assignment.title,
            subtitle: `${item.assignment.class?.name || "Class"} • ${item.assignment.teacher?.name || "Teacher"}`,
            matched: [query],
          })),
          reports: [],
        },
      });
    }

    if (req.user.role === "PARENT") {
      const linkedStudents = await getParentLinkedStudents(req.user.id);
      if (linkedStudents.length === 0) {
        return res.json({ query, results: { students: [], teachers: [], payments: [], assignments: [], reports: [] } });
      }

      const linkedStudentIds = linkedStudents.map((student) => student.id);
      const pattern = query;

      const [payments, submissions] = await Promise.all([
        prisma.payment.findMany({
          where: {
            studentId: { in: linkedStudentIds },
            OR: [
              { status: { contains: pattern, mode: "insensitive" } },
              { student: { name: { contains: pattern, mode: "insensitive" } } },
            ],
          },
          include: { student: { select: { id: true, name: true, course: true } } },
          take: limitPerGroup,
        }),
        prisma.assignmentSubmission.findMany({
          where: {
            studentId: { in: linkedStudentIds },
            assignment: {
              OR: [
                { title: { contains: pattern, mode: "insensitive" } },
                { description: { contains: pattern, mode: "insensitive" } },
              ],
            },
          },
          include: {
            assignment: {
              include: {
                class: { select: { id: true, name: true } },
                teacher: { select: { id: true, name: true } },
              },
            },
            student: { select: { id: true, name: true, course: true } },
          },
          take: limitPerGroup,
        }),
      ]);

      const students = linkedStudents
        .filter((student) => [student.name, student.course, `#${student.id}`]
          .some((value) => matchText(String(value || ""), query)))
        .slice(0, limitPerGroup);

      return res.json({
        query,
        results: {
          students: students.map((item) => ({ id: item.id, title: item.name, subtitle: item.course, matched: [query] })),
          teachers: [],
          payments: payments.map((item) => ({
            id: item.id,
            title: item.student.name,
            subtitle: `${item.status} • ${item.paidAmount}/${item.totalAmount}`,
            matched: [query],
          })),
          assignments: submissions.map((item) => ({
            id: item.assignment.id,
            title: item.assignment.title,
            subtitle: `${item.student?.name || "Student"} • ${item.assignment.class?.name || "Class"}`,
            matched: [query],
          })),
          reports: [],
        },
      });
    }

    const pattern = query;
    const [students, teachers, payments, assignments] = await Promise.all([
      prisma.student.findMany({
        where: {
          OR: [
            { name: { contains: pattern, mode: "insensitive" } },
            { course: { contains: pattern, mode: "insensitive" } },
            { grade: { contains: pattern, mode: "insensitive" } },
          ],
        },
        take: limitPerGroup,
      }),
      prisma.teacher.findMany({
        where: {
          OR: [
            { name: { contains: pattern, mode: "insensitive" } },
            { subject: { contains: pattern, mode: "insensitive" } },
          ],
        },
        take: limitPerGroup,
      }),
      prisma.payment.findMany({
        where: {
          OR: [
            { status: { contains: pattern, mode: "insensitive" } },
            { student: { name: { contains: pattern, mode: "insensitive" } } },
          ],
        },
        include: { student: { select: { id: true, name: true, course: true } } },
        take: limitPerGroup,
      }),
      prisma.assignment.findMany({
        where: {
          OR: [
            { title: { contains: pattern, mode: "insensitive" } },
            { description: { contains: pattern, mode: "insensitive" } },
          ],
        },
        include: { class: { select: { id: true, name: true } }, teacher: { select: { id: true, name: true } } },
        take: limitPerGroup,
      }),
    ]);

    const reports = reportCatalog
      .filter((item) => matchText(item.title, query) || matchText(item.subtitle, query))
      .slice(0, limitPerGroup);

    res.json({
      query,
      results: {
        students: students.map((item) => ({ id: item.id, title: item.name, subtitle: item.course, matched: [query] })),
        teachers: teachers.map((item) => ({ id: item.id, title: item.name, subtitle: item.subject, matched: [query] })),
        payments: payments.map((item) => ({ id: item.id, title: item.student.name, subtitle: `${item.status} • ${item.paidAmount}/${item.totalAmount}`, matched: [query] })),
        assignments: assignments.map((item) => ({ id: item.id, title: item.title, subtitle: `${item.class.name} • ${item.teacher.name}`, matched: [query] })),
        reports,
      },
    });
  } catch (err) {
    console.error("searchAll error:", err);
    res.status(500).json({ message: "Failed to search" });
  }
};

module.exports = { searchAll };
