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
    const { studentId, paidAmount, dueDate, note, payDate } = req.body;

    if (!studentId || paidAmount === undefined) {
      return res.status(400).json({ message: "studentId والمبلغ المدفوع مطلوبان" });
    }

    const feeSetting = await prisma.setting.findUnique({ where: { key: "annual_fee" } });
    const totalAmount = feeSetting ? Number(feeSetting.value) : 0;
    const paid = Number(paidAmount);
    const txDate = payDate ? new Date(payDate) : new Date();

    // هل عنده payment موجود؟
    const existing = await prisma.payment.findFirst({
      where: { studentId: Number(studentId) },
    });

    let payment;

    if (existing) {
      // أضف على الموجود
      const newPaid = existing.paidAmount + paid;
      const newStatus = newPaid >= existing.totalAmount ? "paid" : newPaid > 0 ? "partial" : "pending";

      payment = await prisma.payment.update({
        where: { id: existing.id },
        data: {
          paidAmount: newPaid,
          status: newStatus,
          dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
          transactions: paid > 0 ? {
            create: { amount: paid, note: note || null, date: txDate }
          } : undefined,
        },
        include: {
          student: { select: { id: true, name: true, course: true } },
          transactions: true,
        },
      });
    } else {
      // أنشئ جديد
      let status = "pending";
      if (paid >= totalAmount) status = "paid";
      else if (paid > 0) status = "partial";

      payment = await prisma.payment.create({
        data: {
          studentId: Number(studentId),
          totalAmount,
          paidAmount: paid,
          dueDate: dueDate ? new Date(dueDate) : null,
          status,
          transactions: paid > 0 ? {
            create: { amount: paid, note: note || null, date: txDate }
          } : undefined,
        },
        include: {
          student: { select: { id: true, name: true, course: true } },
          transactions: true,
        },
      });
    }

    res.status(201).json({
      message: "تم إضافة الدفعة",
      payment: {
        ...payment,
        remaining: payment.totalAmount - payment.paidAmount,
        percentage: payment.totalAmount > 0 ? Math.round((payment.paidAmount / payment.totalAmount) * 100) : 0,
      },
    });
  } catch (err) {
    console.error("createPayment error:", err);
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