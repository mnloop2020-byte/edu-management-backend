const prisma = require("../lib/prisma");

const getAllPayments = async (req, res) => {
  try {
    const { status } = req.query;

    const payments = await prisma.payment.findMany({
      where: status ? { status } : undefined,
      include: { student: { select: { id: true, name: true, course: true } } },
      orderBy: { date: "desc" },
    });

    res.json({ payments });
  } catch (err) {
    console.error("getAllPayments error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const getPaymentsByStudent = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { studentId: Number(req.params.studentId) },
      orderBy: { date: "desc" },
    });
    res.json({ payments });
  } catch (err) {
    console.error("getPaymentsByStudent error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const createPayment = async (req, res) => {
  try {
    const { studentId, amount, status } = req.body;

    if (!studentId || !amount) {
      return res.status(400).json({ message: "studentId والمبلغ مطلوبان" });
    }

    const validStatuses = ["paid", "pending", "overdue"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: "الحالة غير صالحة" });
    }

    const payment = await prisma.payment.create({
      data: {
        studentId: Number(studentId),
        amount: Number(amount),
        status: status || "pending",
      },
      include: { student: { select: { id: true, name: true } } },
    });

    res.status(201).json({ message: "تم إضافة الدفعة", payment });
  } catch (err) {
    console.error("createPayment error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ["paid", "pending", "overdue"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "الحالة غير صالحة" });
    }

    const payment = await prisma.payment.update({
      where: { id: Number(req.params.id) },
      data: { status },
    });

    res.json({ message: "تم تحديث حالة الدفعة", payment });
  } catch (err) {
    console.error("updatePaymentStatus error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const getPaymentsSummary = async (req, res) => {
  try {
    const [all, paidRecords] = await Promise.all([
      prisma.payment.findMany({ select: { amount: true, status: true } }),
      prisma.payment.findMany({ where: { status: "paid" }, select: { amount: true } }),
    ]);

    const total = all.reduce((s, p) => s + p.amount, 0);
    const paid = paidRecords.reduce((s, p) => s + p.amount, 0);
    const pending = all.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
    const overdue = all.filter(p => p.status === "overdue").reduce((s, p) => s + p.amount, 0);

    res.json({ summary: { total, paid, pending, overdue } });
  } catch (err) {
    console.error("getPaymentsSummary error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

module.exports = { getAllPayments, getPaymentsByStudent, createPayment, updatePaymentStatus, getPaymentsSummary };
