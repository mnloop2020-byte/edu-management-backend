const prisma = require("../lib/prisma");

const getAllPayments = async (req, res) => {
  try {
    const { status } = req.query;

    const payments = await prisma.payment.findMany({
      where: status ? { status } : undefined,
      include: { student: { select: { id: true, name: true, course: true } } },
      orderBy: [
        { status: "asc" },
        { date: "desc" },
      ],
    });

    // حساب الحالة تلقائياً بناءً على المبلغ المدفوع
    const enriched = payments.map(p => ({
      ...p,
      remaining: p.totalAmount - p.paidAmount,
      percentage: Math.round((p.paidAmount / p.totalAmount) * 100),
    }));

    // ترتيب: مدفوع كاملاً أولاً، ثم جزئي، ثم لم يدفع
    enriched.sort((a, b) => b.percentage - a.percentage);

    res.json({ payments: enriched });
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
    const { studentId, paidAmount, dueDate } = req.body;

    if (!studentId || paidAmount === undefined) {
      return res.status(400).json({ message: "studentId والمبلغ المدفوع مطلوبان" });
    }

    // جيب الرسوم السنوية من Settings
    const feeSetting = await prisma.setting.findUnique({ where: { key: "annual_fee" } });
    const totalAmount = feeSetting ? Number(feeSetting.value) : 0;

    const paid = Number(paidAmount);
    const remaining = totalAmount - paid;

    let status = "pending";
    if (paid >= totalAmount) status = "paid";
    else if (paid > 0) status = "partial";
    else status = "pending";

    const payment = await prisma.payment.create({
      data: {
        studentId: Number(studentId),
        totalAmount,
        paidAmount: paid,
        dueDate: dueDate ? new Date(dueDate) : null,
        status,
      },
      include: { student: { select: { id: true, name: true, course: true } } },
    });

    res.status(201).json({
      message: "تم إضافة الدفعة",
      payment: {
        ...payment,
        remaining,
        percentage: Math.round((paid / totalAmount) * 100),
      },
    });
  } catch (err) {
    console.error("createPayment error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const addPartialPayment = async (req, res) => {
  try {
    const { amount } = req.body;
    const paymentId = Number(req.params.id);

    if (!amount) {
      return res.status(400).json({ message: "المبلغ مطلوب" });
    }

    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) return res.status(404).json({ message: "الدفعة غير موجودة" });

    const newPaid = existing.paidAmount + Number(amount);
    const newStatus = newPaid >= existing.totalAmount ? "paid" : "partial";

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { paidAmount: newPaid, status: newStatus },
      include: { student: { select: { id: true, name: true, course: true } } },
    });

    res.json({
      message: "تم إضافة الدفع",
      payment: {
        ...payment,
        remaining: payment.totalAmount - payment.paidAmount,
        percentage: Math.round((payment.paidAmount / payment.totalAmount) * 100),
      },
    });
  } catch (err) {
    console.error("addPartialPayment error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ["paid", "pending", "overdue", "partial"];
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
    const feeSetting = await prisma.setting.findUnique({ where: { key: "annual_fee" } });
    const annualFee = feeSetting ? Number(feeSetting.value) : 0;

    const payments = await prisma.payment.findMany({
      select: { totalAmount: true, paidAmount: true, status: true },
    });

    const total = payments.reduce((s, p) => s + p.totalAmount, 0);
    const paid = payments.reduce((s, p) => s + p.paidAmount, 0);
    const remaining = total - paid;
    const fullPaid = payments.filter(p => p.status === "paid").length;
    const partial = payments.filter(p => p.status === "partial").length;
    const pending = payments.filter(p => p.status === "pending").length;
    const overdue = payments.filter(p => p.status === "overdue").length;

    res.json({
      summary: {
        annualFee,
        total,
        paid,
        remaining,
        fullPaid,
        partial,
        pending,
        overdue,
      },
    });
  } catch (err) {
    console.error("getPaymentsSummary error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

module.exports = {
  getAllPayments,
  getPaymentsByStudent,
  createPayment,
  addPartialPayment,
  updatePaymentStatus,
  getPaymentsSummary,
};