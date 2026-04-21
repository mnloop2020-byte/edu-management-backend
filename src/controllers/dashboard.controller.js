const prisma = require("../lib/prisma");

const getPaymentState = (payment) => {
  const remaining = Math.max(0, payment.totalAmount - payment.paidAmount);
  if (remaining <= 0) return "paid";

  if (!payment.dueDate) return payment.paidAmount > 0 ? "partial" : "pending";

  const dueDate = new Date(payment.dueDate);
  dueDate.setHours(23, 59, 59, 999);
  if (dueDate < new Date()) return "overdue";
  return payment.paidAmount > 0 ? "partial" : "pending";
};

const buildAttendanceIndicator = (records) => {
  const totalClasses = records.length;
  const presentCount = records.filter((item) => item.status === "present").length;
  const absentCount = records.filter((item) => item.status === "absent").length;
  const attendanceRate = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

  let indicator = "SAFE";
  if (absentCount >= 3 && absentCount <= 4) indicator = "WARNING";
  else if (absentCount > 4) indicator = "RISK";

  return { totalClasses, absentCount, attendanceRate, indicator };
};

const getDashboardOverview = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyRange = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);

      return { day, end, label: weekdays[day.getDay()] };
    });

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const trendRange = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
      const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return {
        month: months[date.getMonth()],
        start: date,
        end: next,
      };
    });

    const [
      studentsCount,
      teachersCount,
      totalStudents,
      presentToday,
      recentStudents,
      payments,
      weeklyCounts,
      trendCounts,
      studentsWithAttendance,
      recentAttendance,
      recentTransactions,
      recentAssignments,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.student.count(),
      prisma.attendance.count({
        where: { status: "present", date: { gte: today, lte: endOfDay } },
      }),
      prisma.student.findMany({
        orderBy: { joinedAt: "desc" },
        take: 4,
        select: { id: true, name: true, course: true, grade: true, status: true, joinedAt: true },
      }),
      prisma.payment.findMany({
        select: { totalAmount: true, paidAmount: true, dueDate: true },
      }),
      Promise.all(
        weeklyRange.map((range) =>
          prisma.attendance.count({
            where: {
              status: "present",
              date: { gte: range.day, lte: range.end },
            },
          })
        )
      ),
      Promise.all(
        trendRange.map((range) =>
          prisma.student.count({
            where: { joinedAt: { gte: range.start, lt: range.end } },
          })
        )
      ),
      prisma.student.findMany({
        select: {
          id: true,
          name: true,
          course: true,
          grade: true,
          attendance: {
            where: { date: { gte: trendRange[0].start } },
            select: { status: true },
          },
        },
      }),
      prisma.attendance.findMany({
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: 5,
        include: { student: { select: { id: true, name: true } } },
      }),
      prisma.paymentTransaction.findMany({
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: 5,
        include: { payment: { select: { id: true, student: { select: { id: true, name: true } } } } },
      }),
      prisma.assignment.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
    ]);

    const paymentStatus = payments.reduce((acc, payment) => {
      const state = getPaymentState(payment);
      if (state === "paid") acc.paid += 1;
      if (state === "partial") acc.partial += 1;
      if (state === "pending") acc.pending += 1;
      if (state === "overdue") acc.overdue += 1;
      return acc;
    }, { paid: 0, partial: 0, pending: 0, overdue: 0 });

    const pendingPayments = paymentStatus.pending + paymentStatus.partial + paymentStatus.overdue;
    const weekly = weeklyRange.map((range, index) => ({
      day: range.label,
      students: weeklyCounts[index],
    }));
    const trend = trendRange.map((range, index) => ({
      month: range.month,
      value: trendCounts[index],
    }));

    const gradeBuckets = studentsWithAttendance.reduce((acc, student) => {
      const grade = (student.grade || "Unknown").trim();
      acc[grade] = (acc[grade] || 0) + 1;
      return acc;
    }, {});

    const gradeDistribution = Object.entries(gradeBuckets).map(([grade, count]) => ({ grade, count }));

    const riskStudents = studentsWithAttendance
      .map((student) => {
        const stats = buildAttendanceIndicator(student.attendance);
        return {
          id: student.id,
          name: student.name,
          course: student.course,
          absentCount: stats.absentCount,
          attendanceRate: stats.attendanceRate,
          indicator: stats.indicator,
        };
      })
      .filter((student) => student.indicator !== "SAFE")
      .sort((a, b) => b.absentCount - a.absentCount)
      .slice(0, 5);

    const insights = [];
    if (riskStudents.length > 0) insights.push(`${riskStudents.length} students are close to the absence limit`);
    if (statsFromWeekly(weekly) < 0) insights.push("Attendance dropped compared with the previous days");
    if (paymentStatus.overdue > 0) insights.push(`${paymentStatus.overdue} overdue payments need follow-up`);
    if (insights.length === 0) insights.push("Daily operations look healthy today");

    const notifications = [
      ...riskStudents.map((student) => ({
        type: student.indicator === "RISK" ? "danger" : "warning",
        icon: student.indicator === "RISK" ? "risk" : "warning",
        title: `${student.name} is ${student.indicator === "RISK" ? "over the absence limit" : "near the absence limit"}`,
        description: `${student.absentCount} absences recorded this semester`,
        path: `/students?status=at-risk&studentId=${student.id}`,
        createdAt: new Date().toISOString(),
      })),
      ...(paymentStatus.overdue > 0 ? [{
        type: "danger",
        icon: "payment",
        title: `${paymentStatus.overdue} overdue payments need follow-up`,
        description: "Open payments to review overdue balances",
        path: "/payments?status=overdue",
        createdAt: new Date().toISOString(),
      }] : []),
      ...(statsFromWeekly(weekly) < 0 ? [{
        type: "warning",
        icon: "attendance",
        title: "Attendance dropped this week",
        description: "Review daily attendance trends and at-risk students",
        path: "/students?status=at-risk",
        createdAt: new Date().toISOString(),
      }] : []),
      ...(trend.length > 1 && trend[trend.length - 1].value < trend[trend.length - 2].value ? [{
        type: "info",
        icon: "performance",
        title: "Enrollment slowed this month",
        description: "Student registrations are down compared with last month",
        path: "/reports",
        createdAt: new Date().toISOString(),
      }] : []),
    ].slice(0, 8);

    const activityFeed = [
      ...recentStudents.map((student) => ({
        type: "student",
        title: "Student added",
        description: `${student.name} joined ${student.course}`,
        path: `/students/${student.id}`,
        createdAt: student.joinedAt,
      })),
      ...recentAttendance.map((record) => ({
        type: "attendance",
        title: "Attendance recorded",
        description: `${record.student.name} marked ${record.status}`,
        path: "/attendance",
        createdAt: record.date,
      })),
      ...recentTransactions.map((transaction) => ({
        type: "payment",
        title: "Payment received",
        description: `${transaction.payment.student.name} paid ${transaction.amount} SAR`,
        path: "/payments",
        createdAt: transaction.date,
      })),
      ...recentAssignments.map((assignment) => ({
        type: "assignment",
        title: "Assignment created",
        description: assignment.title,
        path: "/assignments",
        createdAt: assignment.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    res.json({
      stats: {
        students: studentsCount,
        teachers: teachersCount,
        attendanceRate: totalStudents ? Math.round((presentToday / totalStudents) * 100) : 0,
        pendingPayments,
      },
      recentStudents,
      weekly,
      trend,
      riskStudents,
      paymentStatus,
      gradeDistribution,
      insights,
      notifications,
      activityFeed,
    });
  } catch (err) {
    console.error("getDashboardOverview error:", err);
    res.status(500).json({ message: "Failed to load dashboard data" });
  }
};

function statsFromWeekly(weekly) {
  if (weekly.length < 2) return 0;
  const firstHalf = weekly.slice(0, Math.floor(weekly.length / 2)).reduce((sum, item) => sum + item.students, 0);
  const secondHalf = weekly.slice(Math.floor(weekly.length / 2)).reduce((sum, item) => sum + item.students, 0);
  return secondHalf - firstHalf;
}

module.exports = { getDashboardOverview };
