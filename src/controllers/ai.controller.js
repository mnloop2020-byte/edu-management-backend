const Groq = require("groq-sdk");
const prisma = require("../lib/prisma");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MAX_CHAT_MESSAGE_LENGTH = 1500;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_MESSAGE_LENGTH = 1200;
const MAX_AI_ROWS = 200;

const summarizePayment = (payment) => {
  const remaining = Math.max(0, payment.totalAmount - payment.paidAmount);
  let status = "pending";

  if (remaining <= 0 && payment.totalAmount > 0) status = "paid";
  else if (payment.paidAmount > 0) status = "partial";

  if (payment.dueDate && remaining > 0) {
    const dueDate = new Date(payment.dueDate);
    dueDate.setHours(23, 59, 59, 999);
    if (dueDate < new Date()) status = "overdue";
  }

  return {
    student: payment.student?.name,
    totalAmount: payment.totalAmount,
    paidAmount: payment.paidAmount,
    remaining,
    status,
    date: payment.date,
  };
};

const getStudentProfileIdByUserId = async (userId) => {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });
  return student?.id || null;
};

const getTeacherProfileIdByUserId = async (userId) => {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  });
  return teacher?.id || null;
};

const getTeacherStudentIdsByUserId = async (userId) => {
  const teacherId = await getTeacherProfileIdByUserId(userId);
  if (!teacherId) return [];

  const links = await prisma.studentClass.findMany({
    where: {
      class: { teacherId },
    },
    select: { studentId: true },
  });

  return [...new Set(links.map((item) => item.studentId))];
};

const getParentLinkedStudentIdsByUserId = async (userId) => {
  const parent = await prisma.parentProfile.findUnique({
    where: { userId },
    select: {
      studentLinks: {
        select: { studentId: true },
      },
    },
  });

  if (!parent) return [];
  return [...new Set((parent.studentLinks || []).map((item) => item.studentId))];
};

const analyzeStudent = async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ message: "AI service is not configured" });
    }

    const studentId = Number(req.params.id);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    if (req.user.role === "STUDENT") {
      const ownStudentId = await getStudentProfileIdByUserId(req.user.id);
      if (!ownStudentId) {
        return res.status(404).json({ message: "Student profile not found" });
      }
      if (studentId !== ownStudentId) {
        return res.status(403).json({ message: "You can only analyze your own profile" });
      }
    } else if (req.user.role === "TEACHER") {
      const teacherStudentIds = await getTeacherStudentIdsByUserId(req.user.id);
      if (!teacherStudentIds.includes(studentId)) {
        return res.status(403).json({ message: "You can only analyze students assigned to your classes" });
      }
    } else if (req.user.role === "PARENT") {
      const linkedStudentIds = await getParentLinkedStudentIdsByUserId(req.user.id);
      if (!linkedStudentIds.includes(studentId)) {
        return res.status(403).json({ message: "You can only analyze linked students" });
      }
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        attendance: true,
        payments: true,
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const totalAttendance = student.attendance.length;
    const presentCount = student.attendance.filter((item) => item.status === "present").length;
    const absentCount = student.attendance.filter((item) => item.status === "absent").length;
    const lateCount = student.attendance.filter((item) => item.status === "late").length;
    const attendanceRate = totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : 0;

    const normalizedPayments = student.payments.map(summarizePayment);
    const paidPayments = normalizedPayments.filter((item) => item.status === "paid").length;
    const pendingPayments = normalizedPayments.filter((item) => item.status === "pending").length;
    const overduePayments = normalizedPayments.filter((item) => item.status === "overdue").length;

    const prompt = `
You are an education assistant. Write a concise Arabic report about this student.

Student:
- Name: ${student.name}
- Course: ${student.course}
- Grade: ${student.grade || "غير محدد"}
- Status: ${student.status}

Attendance:
- Rate: ${attendanceRate}%
- Present: ${presentCount}
- Absent: ${absentCount}
- Late: ${lateCount}

Payments:
- Paid: ${paidPayments}
- Pending: ${pendingPayments}
- Overdue: ${overduePayments}

Return the report in Arabic with:
1. تقييم عام
2. نقاط القوة
3. نقاط تحتاج متابعة
4. توصيات عملية
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
    });

    const analysis = completion.choices[0]?.message?.content || "لا يوجد تحليل";

    res.json({
      student: {
        id: student.id,
        name: student.name,
        course: student.course,
        grade: student.grade,
        status: student.status,
      },
      stats: {
        attendanceRate,
        presentCount,
        absentCount,
        lateCount,
        paidPayments,
        pendingPayments,
        overduePayments,
      },
      analysis,
    });
  } catch (err) {
    console.error("analyzeStudent error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const chatbot = async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ message: "AI service is not configured" });
    }

    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "message is required" });
    }
    if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
      return res.status(400).json({ message: "message is too long" });
    }

    const normalizedHistory = Array.isArray(history)
      ? history
          .slice(-MAX_HISTORY_ITEMS)
          .map((item) => ({
            role: item?.role === "assistant" ? "assistant" : "user",
            content: String(item?.content || "").slice(0, MAX_HISTORY_MESSAGE_LENGTH),
          }))
          .filter((item) => item.content.trim().length > 0)
      : [];

    let students = [];
    let payments = [];
    let attendanceRecords = [];

    if (req.user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: req.user.id },
        select: { id: true, name: true, course: true, grade: true, status: true },
      });

      if (!student) {
        return res.status(404).json({ message: "Student profile not found" });
      }

      const scopedData = await Promise.all([
        prisma.payment.findMany({
          where: { studentId: student.id },
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
        prisma.attendance.findMany({
          where: { studentId: student.id },
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
      ]);

      students = [student];
      payments = scopedData[0];
      attendanceRecords = scopedData[1];
    } else if (req.user.role === "TEACHER") {
      const teacherStudentIds = await getTeacherStudentIdsByUserId(req.user.id);
      if (teacherStudentIds.length === 0) {
        return res.status(403).json({ message: "No students are assigned to this teacher account" });
      }

      const scopedData = await Promise.all([
        prisma.student.findMany({
          where: { id: { in: teacherStudentIds } },
          orderBy: { id: "asc" },
          take: MAX_AI_ROWS,
        }),
        prisma.payment.findMany({
          where: { studentId: { in: teacherStudentIds } },
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
        prisma.attendance.findMany({
          where: { studentId: { in: teacherStudentIds } },
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
      ]);

      students = scopedData[0];
      payments = scopedData[1];
      attendanceRecords = scopedData[2];
    } else if (req.user.role === "PARENT") {
      const linkedStudentIds = await getParentLinkedStudentIdsByUserId(req.user.id);
      if (linkedStudentIds.length === 0) {
        return res.status(403).json({ message: "No linked students found for this parent account" });
      }

      const scopedData = await Promise.all([
        prisma.student.findMany({
          where: { id: { in: linkedStudentIds } },
          orderBy: { id: "asc" },
          take: MAX_AI_ROWS,
        }),
        prisma.payment.findMany({
          where: { studentId: { in: linkedStudentIds } },
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
        prisma.attendance.findMany({
          where: { studentId: { in: linkedStudentIds } },
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
      ]);

      students = scopedData[0];
      payments = scopedData[1];
      attendanceRecords = scopedData[2];
    } else if (req.user.role === "ADMIN") {
      const fullData = await Promise.all([
        prisma.student.findMany({ orderBy: { id: "asc" }, take: MAX_AI_ROWS }),
        prisma.payment.findMany({
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
        prisma.attendance.findMany({
          include: { student: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: MAX_AI_ROWS,
        }),
      ]);
      students = fullData[0];
      payments = fullData[1];
      attendanceRecords = fullData[2];
    } else {
      return res.status(403).json({ message: "You do not have permission to use AI chat" });
    }

    const normalizedPayments = payments.map(summarizePayment);
    const totalPayments = normalizedPayments.reduce((sum, item) => sum + item.totalAmount, 0);
    const paidPayments = normalizedPayments.reduce((sum, item) => sum + item.paidAmount, 0);
    const pendingPayments = normalizedPayments
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + item.remaining, 0);
    const overduePayments = normalizedPayments
      .filter((item) => item.status === "overdue")
      .reduce((sum, item) => sum + item.remaining, 0);

    const systemPrompt = `أنت مساعد ذكي لنظام إدارة تعليمية.

أجب دائماً بالعربية، واعتمد فقط على البيانات التالية:

الطلاب (${students.length}):
${JSON.stringify(students.map((student) => ({
  id: student.id,
  name: student.name,
  course: student.course,
  grade: student.grade,
  status: student.status,
})))}

ملخص المدفوعات:
- إجمالي الرسوم: ${totalPayments}
- المدفوع: ${paidPayments}
- المعلّق: ${pendingPayments}
- المتأخر: ${overduePayments}

سجلات المدفوعات (${normalizedPayments.length}):
${JSON.stringify(normalizedPayments)}

سجلات الحضور (آخر ${attendanceRecords.length} سجل):
${JSON.stringify(attendanceRecords.map((record) => ({
  student: record.student?.name,
  status: record.status,
  date: record.date,
})))}

كن واضحاً، واستخدم الأرقام والأسماء الحقيقية من البيانات، ولا تخمّن معلومات غير موجودة.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...normalizedHistory,
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content || "عذراً، لم أتمكن من الإجابة.";
    res.json({ reply });
  } catch (err) {
    console.error("chatbot error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { analyzeStudent, chatbot };
