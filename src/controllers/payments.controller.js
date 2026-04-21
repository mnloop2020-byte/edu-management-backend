const prisma = require("../lib/prisma");
const { createAuditLog } = require("../services/audit.service");

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

const isDueDateOverdue = (dueDate, remaining) => {
  if (!dueDate || remaining <= 0) return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
};

const computeInstallmentStatus = (installment) => {
  const remaining = Math.max(0, installment.amount - installment.paidAmount);
  if (remaining <= 0) return "paid";
  return isDueDateOverdue(installment.dueDate, remaining) ? "overdue" : "pending";
};

const computePaymentStatus = (payment) => {
  const installments = payment.installments || [];
  if (installments.length > 0) {
    const normalized = installments.map((item) => ({ ...item, status: computeInstallmentStatus(item) }));
    const totalAmount = normalized.reduce((sum, item) => sum + item.amount, 0);
    const paidAmount = normalized.reduce((sum, item) => sum + item.paidAmount, 0);
    const remaining = Math.max(0, totalAmount - paidAmount);
    let status = "pending";
    if (remaining <= 0 && totalAmount > 0) status = "paid";
    else if (normalized.some((item) => item.status === "overdue")) status = "overdue";
    else if (paidAmount > 0) status = "partial";

    return { status, totalAmount, paidAmount, installments: normalized };
  }

  const remaining = Math.max(0, payment.totalAmount - payment.paidAmount);
  let status = "pending";
  if (payment.paidAmount >= payment.totalAmount && payment.totalAmount > 0) status = "paid";
  else if (payment.paidAmount > 0) status = isDueDateOverdue(payment.dueDate, remaining) ? "overdue" : "partial";
  else status = isDueDateOverdue(payment.dueDate, payment.totalAmount) ? "overdue" : "pending";

  return { status, totalAmount: payment.totalAmount, paidAmount: payment.paidAmount, installments: [] };
};

const enrichPayment = (payment) => {
  const computed = computePaymentStatus(payment);
  const remaining = Math.max(0, computed.totalAmount - computed.paidAmount);
  const percentage = computed.totalAmount > 0
    ? Math.min(100, Math.round((computed.paidAmount / computed.totalAmount) * 100))
    : 0;

  return {
    ...payment,
    totalAmount: computed.totalAmount,
    paidAmount: computed.paidAmount,
    remaining,
    percentage,
    status: computed.status,
    installments: computed.installments,
  };
};

const paymentInclude = {
  student: { select: { id: true, name: true, course: true } },
  transactions: { orderBy: { date: "desc" } },
  installments: { orderBy: { dueDate: "asc" } },
};

const getAllPayments = async (req, res) => {
  try {
    const { status } = req.query;
    const payments = await prisma.payment.findMany({
      include: paymentInclude,
      orderBy: { date: "desc" },
    });

    let enriched = payments.map(enrichPayment);
    if (status) enriched = enriched.filter((payment) => payment.status === status);
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
      include: paymentInclude,
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
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true } });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

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

const createInstallmentsData = (installments) => {
  if (!Array.isArray(installments) || installments.length === 0) return null;
  const normalized = installments
    .map((item) => ({
      amount: parsePositiveAmount(item.amount),
      dueDate: normalizeDate(item.dueDate),
    }))
    .filter((item) => item.amount !== null && item.dueDate);

  return normalized.length > 0 ? normalized : null;
};

const createPayment = async (req, res) => {
  try {
    const { studentId, paidAmount, dueDate, note, payDate, installments } = req.body;
    const parsedStudentId = Number(studentId);
    const amount = parsePositiveAmount(paidAmount);

    if (!parsedStudentId || amount === null) {
      return res.status(400).json({ message: "studentId and paidAmount are required" });
    }

    const [student, annualFee] = await Promise.all([
      prisma.student.findUnique({ where: { id: parsedStudentId }, select: { id: true, name: true, course: true } }),
      getAnnualFee(),
    ]);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const transactionDate = normalizeDate(payDate) || new Date();
    const nextDueDate = dueDate === null ? null : normalizeDate(dueDate);
    const normalizedInstallments = createInstallmentsData(installments);
    if (dueDate && !nextDueDate) return res.status(400).json({ message: "Invalid due date" });

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          studentId: parsedStudentId,
          totalAmount: annualFee,
          paidAmount: amount,
          dueDate: nextDueDate,
          transactions: amount > 0 ? { create: { amount, note: note || null, date: transactionDate } } : undefined,
          installments: normalizedInstallments
            ? {
                create: normalizedInstallments.map((item) => ({
                  amount: item.amount,
                  dueDate: item.dueDate,
                })),
              }
            : undefined,
        },
        include: paymentInclude,
      });

      if (normalizedInstallments && amount > 0) {
        let remainingPayment = amount;
        for (const installment of created.installments) {
          if (remainingPayment <= 0) break;
          const applyAmount = Math.min(remainingPayment, installment.amount);
          await tx.paymentInstallment.update({
            where: { id: installment.id },
            data: { paidAmount: applyAmount },
          });
          remainingPayment -= applyAmount;
        }
      }

      if (nextDueDate) {
        await tx.calendarEvent.create({
          data: {
            title: `Payment Due - ${student.name}`,
            description: note || "Payment deadline",
            type: "PAYMENT_DEADLINE",
            startAt: nextDueDate,
            relatedStudentId: parsedStudentId,
          },
        });
      }

      return tx.payment.findUnique({
        where: { id: created.id },
        include: paymentInclude,
      });
    });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "PAYMENT_CREATE",
      entityType: "Payment",
      entityId: payment.id,
      summary: `Created payment record for ${payment.student?.name || "student"}`,
      metadata: { totalAmount: payment.totalAmount, paidAmount: payment.paidAmount },
    });

    res.status(201).json({ message: "Payment saved successfully", payment: enrichPayment(payment) });
  } catch (err) {
    console.error("createPayment error:", err);
    res.status(500).json({ message: "Failed to save payment" });
  }
};

const applyAmountToInstallments = async (tx, paymentId, amount) => {
  let remaining = amount;
  const installments = await tx.paymentInstallment.findMany({
    where: { paymentId },
    orderBy: { dueDate: "asc" },
  });

  for (const installment of installments) {
    if (remaining <= 0) break;
    const due = Math.max(0, installment.amount - installment.paidAmount);
    if (due <= 0) continue;
    const applied = Math.min(remaining, due);
    await tx.paymentInstallment.update({
      where: { id: installment.id },
      data: { paidAmount: installment.paidAmount + applied },
    });
    remaining -= applied;
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
      const existing = await tx.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
      if (!existing) return null;

      const enriched = enrichPayment(existing);
      if (amount > enriched.remaining) {
        throw new Error(`OVERPAYMENT:${enriched.remaining}`);
      }

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          paidAmount: existing.paidAmount + amount,
          transactions: { create: { amount, note: req.body.note || null, date: paymentDate || new Date() } },
        },
        include: paymentInclude,
      });

      if (updated.installments.length > 0) {
        await applyAmountToInstallments(tx, paymentId, amount);
      }

      return tx.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    });

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    await createAuditLog({
      actorUserId: req.user?.id,
      action: "PAYMENT_PARTIAL_ADD",
      entityType: "Payment",
      entityId: payment.id,
      summary: `Recorded partial payment on payment #${payment.id}`,
      metadata: { amount },
    });

    res.json({ message: "Payment updated successfully", payment: enrichPayment(payment) });
  } catch (err) {
    console.error("addPartialPayment error:", err);
    if (err.message?.startsWith("OVERPAYMENT:")) {
      const remaining = err.message.split(":")[1];
      return res.status(400).json({ message: `Amount exceeds the remaining balance. Remaining only ${remaining} SAR` });
    }
    res.status(500).json({ message: "Failed to add partial payment" });
  }
};

const createInstallments = async (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    const installments = createInstallmentsData(req.body.installments);
    if (!installments) return res.status(400).json({ message: "Valid installments are required" });

    await prisma.$transaction(async (tx) => {
      await tx.paymentInstallment.deleteMany({ where: { paymentId } });
      await tx.paymentInstallment.createMany({
        data: installments.map((item) => ({
          paymentId,
          amount: item.amount,
          dueDate: item.dueDate,
        })),
      });
    });

    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    res.json({ message: "Installments updated successfully", payment: enrichPayment(payment) });
  } catch (err) {
    console.error("createInstallments error:", err);
    res.status(500).json({ message: "Failed to update installments" });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: Number(req.params.id) },
      include: paymentInclude,
    });
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.json({ payment: enrichPayment(payment) });
  } catch (err) {
    console.error("updatePaymentStatus error:", err);
    res.status(500).json({ message: "Failed to refresh payment status" });
  }
};

const deletePayment = async (req, res) => {
  try {
    await prisma.payment.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    console.error("deletePayment error:", err);
    if (err.code === "P2025") return res.status(404).json({ message: "Payment not found" });
    res.status(500).json({ message: "Failed to delete payment" });
  }
};

const getPaymentsSummary = async (req, res) => {
  try {
    const [annualFee, payments] = await Promise.all([
      getAnnualFee(),
      prisma.payment.findMany({ include: { installments: true } }),
    ]);

    const summary = payments.map(enrichPayment).reduce((acc, payment) => {
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

const getStudentPaymentHistory = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { studentId: Number(req.params.id) },
      include: paymentInclude,
      orderBy: { date: "desc" },
    });
    res.json({ history: payments.map(enrichPayment) });
  } catch (err) {
    console.error("getStudentPaymentHistory error:", err);
    res.status(500).json({ message: "Failed to load payment history" });
  }
};

const getOverduePayments = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: paymentInclude,
      orderBy: { date: "desc" },
    });

    const overdue = payments.map(enrichPayment).filter((item) => item.status === "overdue");
    res.json({ reminders: overdue });
  } catch (err) {
    console.error("getOverduePayments error:", err);
    res.status(500).json({ message: "Failed to load overdue payments" });
  }
};

module.exports = {
  getAllPayments,
  getPaymentsByStudent,
  getPaymentTransactions,
  createPayment,
  addPartialPayment,
  createInstallments,
  deletePayment,
  updatePaymentStatus,
  getPaymentsSummary,
  getStudentPaymentHistory,
  getOverduePayments,
};
