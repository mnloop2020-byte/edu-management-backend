const Groq = require("groq-sdk");
const prisma = require("../lib/prisma");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

const analyzeStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.id);

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
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    const [students, payments, attendanceRecords] = await Promise.all([
      prisma.student.findMany({ orderBy: { id: "asc" } }),
      prisma.payment.findMany({
        include: { student: { select: { name: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.attendance.findMany({
        include: { student: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 100,
      }),
    ]);

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

أجب دائمًا بالعربية، واعتمد فقط على البيانات التالية:

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

كن واضحًا، واستخدم الأرقام والأسماء الحقيقية من البيانات، ولا تخمّن معلومات غير موجودة.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...(history || []),
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content || "عذرًا، لم أتمكن من الإجابة.";
    res.json({ reply });
  } catch (err) {
    console.error("chatbot error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { analyzeStudent, chatbot };
