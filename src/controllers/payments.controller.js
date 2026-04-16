const prisma = require("../lib/prisma");

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isOverdue = (dueDate, remaining) => {
  if (!dueDate || remaining <= 0) return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
};

const getPaymentStatus = (paidAmount, totalAmount, dueDate) => {
  if (paidAmount >= totalAmount && totalAmount > 0) return "paid";
  if (paidAmount > 0) return isOverdue(dueDate, totalAmount - paidAmount) ? "overdue" : "partial";
  return isOverdue(dueDate, totalAmount) ? "overdue" : "pending";
};

const enrichPayment = (payment) => {
  const remaining = Math.max(0, payment.totalAmount - payment.paidAmount);
  const percentage = payment.totalAmount > 0
    ? Math.min(100, Math.round((payment.paidAmount / payment.totalAmount) * 100))
    : 0;

  return {
    ...payment,
    remaining,
    percentage,
    status: getPaymentStatus(payment.paidAmount, payment.totalAmount, payment.dueDate),
  };
};

const parsePositiveAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const getAnnualFee = async () => {
  const feeSetting = await prisma.setting.findUnique({ where: { key: "annual_fee" } });
  const annualFee = Number(feeSetting?.value ?? 0);
  return Number.isFinite(annualFee) && annualFee >= 0 ? annualFee : 0;
};

const getAllPayments = async (req, res) => {
  try {
    const { status } = req.query;

    const payments = await prisma.payment.findMany({
      include: {
        student: { select: { id: true, name: true, course: true } },
        transactions: { orderBy: { date: "desc" } },
      },
      orderBy: [{ status: "asc" }, { date: "desc" }],
    });

    let enriched = payments.map(enrichPayment);
    if (status) {
      enriched = enriched.filter((payment) => payment.status === status);
    }

    res.json({ payments: enriched });
  } catch (err) {
    console.error("getAllPayments error:", err);
    res.status(500).json({ message: "Failed to load payments" });
  }
};

const getPaymentsByStudent = async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);

    const payments = await prisma.payment.findMany({
      where: { studentId },
      include: { transactions: { orderBy: { date: "desc" } } },
      orderBy: { date: "desc" },
    });

    res.json({ payments: payments.map(enrichPayment) });
  } catch (err) {
    console.error("getPaymentsByStudent error:", err);
    res.status(500).json({ message: "Failed to load student payments" });
  }
};

const getPaymentTransactions = async (req, res) => {
  try {
    const paymentId = Number(req.params.id);

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true },
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const transactions = await prisma.paymentTransaction.findMany({
      where: { paymentId },
      orderBy: { date: "desc" },
    });

    res.json({ transactions });
  } catch (err) {
    console.error("getPaymentTransactions error:", err);
    res.status(500).json({ message: "Failed to load payment transactions" });
  }
};

const createPayment = async (req, res) => {
  try {
    const { studentId, paidAmount, dueDate, note, payDate } = req.body;
    const parsedStudentId = Number(studentId);
    const amount = parsePositiveAmount(paidAmount);

    if (!parsedStudentId || amount === null) {
      return res.status(400).json({ message: "studentId and paidAmount are required" });
    }

    const [student, annualFee] = await Promise.all([
      prisma.student.findUnique({
        where: { id: parsedStudentId },
        select: { id: true, name: true, course: true },
      }),
      getAnnualFee(),
    ]);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const transactionDate = normalizeDate(payDate) || new Date();
    const nextDueDate = dueDate === null ? null : normalizeDate(dueDate);
    if (dueDate && !nextDueDate) {
      return res.status(400).json({ message: "Invalid due date" });
    }
    if (payDate && !normalizeDate(payDate)) {
      return res.status(400).json({ message: "Invalid payment date" });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findFirst({
        where: { studentId: parsedStudentId },
        orderBy: { date: "desc" },
      });

      if (existing) {
        const nextPaidAmount = existing.paidAmount + amount;
        const resolvedDueDate = dueDate === undefined ? existing.dueDate : nextDueDate;
        const status = getPaymentStatus(nextPaidAmount, existing.totalAmount, resolvedDueDate);

       return tx.payment.update({
          where: { id: existing.id },
          data: {
            paidAmount: nextPaidAmount,
            totalAmount: annualFee,
            dueDate: resolvedDueDate,
            status,
            transactions: amount > 0
              ? { create: { amount, note: note || null, date: transactionDate } }
              : undefined,
          },
          include: {
            student: { select: { id: true, name: true, course: true } },
            transactions: { orderBy: { date: "desc" } },
          },
        });
      }

      const status = getPaymentStatus(amount, annualFee, nextDueDate);
      return tx.payment.create({
        data: {
          studentId: parsedStudentId,
          totalAmount: annualFee,
          paidAmount: amount,
          dueDate: nextDueDate,
          status,
          transactions: amount > 0
            ? { create: { amount, note: note || null, date: transactionDate } }
            : undefined,
        },
        include: {
          student: { select: { id: true, name: true, course: true } },
          transactions: { orderBy: { date: "desc" } },
        },
      });
    });

    res.status(201).json({
      message: "Payment saved successfully",
      payment: enrichPayment(payment),
    });
  } catch (err) {
    console.error("createPayment error:", err);
    res.status(500).json({ message: "Failed to save payment" });
  }
};

const addPartialPayment = async (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    const amount = parsePositiveAmount(req.body.amount);
    const paymentDate = req.body.date ? normalizeDate(req.body.date) : new Date();

    if (!paymentId || amount === null || amount <= 0) {
      return res.status(400).json({ message: "A positive payment amount is required" });
    }
    if (req.body.date && !paymentDate) {
      return res.status(400).json({ message: "Invalid payment date" });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          student: { select: { id: true, name: true, course: true } },
          transactions: { orderBy: { date: "desc" } },
        },
      });

      if (!existing) return null;

if (existing.paidAmount + amount > existing.totalAmount) {
  throw new Error(`OVERPAYMENT:${existing.totalAmount - existing.paidAmount}`);
}

      const nextPaidAmount = existing.paidAmount + amount;
      const status = getPaymentStatus(nextPaidAmount, existing.totalAmount, existing.dueDate);

      return tx.payment.update({
        where: { id: paymentId },
        data: {
          paidAmount: nextPaidAmount,
          status,
          transactions: {
            create: {
              amount,
              note: req.body.note || null,
              date: paymentDate || new Date(),
            },
          },
        },
        include: {
          student: { select: { id: true, name: true, course: true } },
          transactions: { orderBy: { date: "desc" } },
        },
      });
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({
      message: "Payment updated successfully",
      payment: enrichPayment(payment),
    });
} catch (err) {
    console.error("addPartialPayment error:", err);
    if (err.message?.startsWith('OVERPAYMENT:')) {
      const remaining = err.message.split(':')[1];
      return res.status(400).json({ message: `المبلغ يتجاوز المتبقي! المتبقي فقط ${remaining} ريال` });
    }
    res.status(500).json({ message: "Failed to add partial payment" });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    const { status } = req.body;
    const allowedStatuses = ["pending", "partial", "paid", "overdue"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status },
      include: {
        student: { select: { id: true, name: true, course: true } },
        transactions: { orderBy: { date: "desc" } },
      },
    });

    res.json({
      message: "Payment status updated",
      payment: enrichPayment(payment),
    });
  } catch (err) {
    console.error("updatePaymentStatus error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Payment not found" });
    }
    res.status(500).json({ message: "Failed to update payment status" });
  }
};

const deletePayment = async (req, res) => {
  try {
    const paymentId = Number(req.params.id);

    await prisma.payment.delete({
      where: { id: paymentId },
    });

    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    console.error("deletePayment error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Payment not found" });
    }
    res.status(500).json({ message: "Failed to delete payment" });
  }
};

const getPaymentsSummary = async (req, res) => {
  try {
    const [annualFee, payments] = await Promise.all([
      getAnnualFee(),
      prisma.payment.findMany(),
    ]);

    const enriched = payments.map(enrichPayment);
    const summary = enriched.reduce((acc, payment) => {
      acc.total += payment.totalAmount;
      acc.paid += payment.paidAmount;
      acc.remaining += payment.remaining;

      if (payment.status === "paid") acc.fullPaid += 1;
      if (payment.status === "partial") acc.partial += 1;
      if (payment.status === "pending") acc.pending += 1;
      if (payment.status === "overdue") acc.overdue += 1;

      return acc;
    }, {
      annualFee,
      total: 0,
      paid: 0,
      remaining: 0,
      fullPaid: 0,
      partial: 0,
      pending: 0,
      overdue: 0,
    });

    res.json({ summary });
  } catch (err) {
    console.error("getPaymentsSummary error:", err);
    res.status(500).json({ message: "Failed to load payments summary" });
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
