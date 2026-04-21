const prisma = require("../lib/prisma");

const limitPerGroup = 6;

const reportCatalog = [
  { id: "attendance", title: "Attendance Report", subtitle: "Student attendance and risk indicators" },
  { id: "payments", title: "Payment Report", subtitle: "Fees, overdue balances, and collection" },
  { id: "teachers", title: "Teacher Performance Report", subtitle: "Monthly teacher ranking and insights" },
  { id: "students", title: "Student Report", subtitle: "Academic and attendance overview" },
];

const matchText = (value, query) => value.toLowerCase().includes(query.toLowerCase());

const searchAll = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) {
      return res.json({ query: "", results: { students: [], teachers: [], payments: [], assignments: [], reports: [] } });
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
