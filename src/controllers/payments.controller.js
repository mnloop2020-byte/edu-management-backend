const prisma = require("../lib/prisma");

const getAllPayments = async (req, res) => {
  try {
    const { status } = req.query;

    const payments = await prisma.payment.findMany({
      where: status ? { status } : undefined,
      include: {
        student: { select: { id: true, name: true, course: true } },
        transactions: { orderBy: { date: "desc" } },
      },
      orderBy: { date: "desc" },
    });

    const enriched = payments.map(p => ({
      ...p,
      remaining: p.totalAmount - p.paidAmount,
      percentage: p.totalAmount > 0 ? Math.round((p.paidAmount / p.totalAmount) * 100) : 0,
    }));

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
      include: { transactions: { orderBy: { date: "desc" } } },
      orderBy: { date: "desc" },
    });
    res.json({ payments });
  } catch (err) {
    console.error("getPaymentsByStudent error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const getPaymentTransactions = async (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    const transactions = await prisma.paymentTransaction.findMany({
      where: { paymentId },
      orderBy: { date: "desc" },
    });
    res.json({ transactions });
  } catch (err) {
    console.error("getPaymentTransactions error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const createPayment = async (req, res) => {
  try {
    const { studentId, paidAmount, dueDate, note } = req.body;

    if (!studentId || paidAmount === undefined) {
      return res.status(400).json({ message: "studentId والمبلغ المدفوع مطلوبان" });
    }

    const feeSetting = await prisma.setting.findUnique({ where: { key: "annual_fee" } });
    const totalAmount = feeSetting ? Number(feeSetting.value) : 0;

    const paid = Number(paidAmount);
    let status = "pending";
    if (paid >= totalAmount) status = "paid";
    else if (paid > 0) status = "partial";

    const payment = await prisma.payment.create({
      data: {
        studentId: Number(studentId),
        totalAmount,
        paidAmount: paid,
        dueDate: dueDate ? new Date(dueDate) : null,
        status,
        transactions: paid > 0 ? {
          create: { amount: paid, note: note || null, date: new Date() }
        } : undefined,
      },
      include: {
        student: { select: { id: true, name: true, course: true } },
        transactions: true,
      },
    });

    res.status(201).json({
      message: "تم إضافة الدفعة",
      payment: {
        ...payment,
        remaining: totalAmount - paid,
        percentage: totalAmount > 0 ? Math.round((paid / totalAmount) * 100) : 0,
      },
    });
  } catch (err) {
    console.error("createPayment error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const addPartialPayment = async (req, res) => {
  try {
    const { amount, note } = req.body;
    const paymentId = Number(req.params.id);

    if (!amount) return res.status(400).json({ message: "المبلغ مطلوب" });

    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) return res.status(404).json({ message: "الدفعة غير موجودة" });

    const newPaid = existing.paidAmount + Number(amount);
    const newStatus = newPaid >= existing.totalAmount ? "paid" : "partial";

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        paidAmount: newPaid,
        status: newStatus,
        transactions: {
          create: { amount: Number(amount), note: note || null, date: new Date() }
        },
      },
      include: {
        student: { select: { id: true, name: true, course: true } },
        transactions: { orderBy: { date: "desc" } },
      },
    });

    res.json({
      message: "تم إضافة الدفع",
      payment: {
        ...payment,
        remaining: payment.totalAmount - payment.paidAmount,
        percentage: payment.totalAmount > 0 ? Math.round((payment.paidAmount / payment.totalAmount) * 100) : 0,
      },
    });
  } catch (err) {
    console.error("addPartialPayment error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

const deletePayment = async (req, res) => {
  try {
    await prisma.payment.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "تم حذف سجل الدفع" });
  } catch (err) {
    console.error("deletePayment error:", err);
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

    res.json({ summary: { annualFee, total, paid, remaining, fullPaid, partial, pending, overdue } });
  } catch (err) {
    console.error("getPaymentsSummary error:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

module.exports = {
  getAllPayments,
  getPaymentsByStudent,
  getPaymentTransactions,
  createPayment,
  addPartialPayment,
  deletePayment,
  updatePaymentStatus,
  getPaymentsSummary,
};